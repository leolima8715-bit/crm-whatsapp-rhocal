import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { evolutionFetch } from "@/lib/evolution";
import { normalizePhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Admin } from "@/lib/users";

export const dynamic = "force-dynamic";

const DAILY_LIMIT = 30;
const MIN_INTERVAL_MS = 15_000;
const DAY_MS = 24 * 60 * 60 * 1000;

// Conversas iniciadas pelo CRM neste chip nas últimas 24h: a primeira mensagem é nossa (out).
async function crmStartedRecently(admin: Admin, instanceId: string): Promise<number[]> {
  const since = new Date(Date.now() - DAY_MS).toISOString();
  const { data: convs } = await admin
    .from("conversations")
    .select("id, created_at")
    .eq("instance_id", instanceId)
    .gte("created_at", since)
    .limit(500);
  if (!convs?.length) return [];

  const { data: msgs } = await admin
    .from("messages")
    .select("conversation_id, direction, created_at")
    .in(
      "conversation_id",
      convs.map((c) => c.id)
    )
    .order("created_at", { ascending: true })
    .limit(5000);

  const first = new Map<string, string>();
  for (const m of msgs ?? []) {
    if (!first.has(m.conversation_id)) first.set(m.conversation_id, m.direction);
  }
  return convs
    .filter((c) => first.get(c.id) === "out")
    .map((c) => Date.parse(c.created_at as string));
}

type ContactRow = { id: string; name: string | null; owner_id: string | null };

async function findContact(admin: Admin, orgId: string, phone: string) {
  const { data } = await admin
    .from("contacts")
    .select("id, name, owner_id")
    .eq("org_id", orgId)
    .eq("phone", phone)
    .maybeSingle();
  return (data as ContactRow | null) ?? null;
}

async function findConversation(admin: Admin, instanceId: string, contactId: string) {
  const { data } = await admin
    .from("conversations")
    .select("id")
    .eq("instance_id", instanceId)
    .eq("contact_id", contactId)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

export async function POST(req: Request) {
  try {
    const { supabase, user, profile } = await requireProfile();
    const body = await req.json().catch(() => ({}));

    const phoneIn = typeof body?.phone === "string" ? normalizePhone(body.phone) : null;
    if (!phoneIn) {
      throw new HttpError("Telefone inválido. Informe DDD + número (mínimo 12 dígitos com o 55).", 400);
    }
    const name = typeof body?.name === "string" ? body.name.trim().replace(/\s+/g, " ") : "";
    if (name.length > 120) throw new HttpError("O nome passa de 120 caracteres.", 400);
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) throw new HttpError("Digite a primeira mensagem.", 400);
    if (text.length > 4096) throw new HttpError("A mensagem passa de 4096 caracteres.", 400);
    const instanceId = typeof body?.instance_id === "string" ? body.instance_id : "";
    if (!instanceId) throw new HttpError("Escolha o número de envio.", 400);

    // Client do usuário: a RLS decide se ele pode usar este número.
    const { data: inst } = await supabase
      .from("whatsapp_instances")
      .select("id, org_id, status, archived, evolution_instance, sector_id")
      .eq("id", instanceId)
      .maybeSingle();
    if (!inst || inst.archived || inst.org_id !== profile.org_id) {
      throw new HttpError("Número não encontrado ou sem permissão de uso.", 404);
    }
    if (inst.status !== "connected") throw new HttpError("Este número não está conectado.", 409);

    const admin = createAdminClient();

    // Já existe contato com conversa neste número? Não duplica: só abre a existente.
    const existingContact = await findContact(admin, profile.org_id, phoneIn);
    if (existingContact) {
      const existingConv = await findConversation(admin, inst.id, existingContact.id);
      if (existingConv) {
        const { data: visible } = await supabase
          .from("conversations")
          .select("id")
          .eq("id", existingConv)
          .maybeSingle();
        if (!visible) {
          throw new HttpError("Este contato já tem conversa neste número com outro atendente.", 403);
        }
        return NextResponse.json({ conversation_id: existingConv, existing: true });
      }
    }

    // O número tem WhatsApp? O jid devolvido é o telefone canônico (igual ao do webhook).
    let phone = phoneIn;
    try {
      const res = await evolutionFetch<{ exists?: boolean; jid?: string }[]>(
        `/chat/whatsappNumbers/${encodeURIComponent(inst.evolution_instance)}`,
        { method: "POST", body: JSON.stringify({ numbers: [phoneIn] }) }
      );
      const hit = Array.isArray(res) ? res[0] : null;
      if (!hit?.exists) throw new HttpError("Este número não tem WhatsApp.", 422);
      const canon = (hit.jid ?? "").split("@")[0].replace(/\D/g, "");
      if (canon.length >= 12) phone = canon;
    } catch (e) {
      if (e instanceof HttpError) throw e;
      console.error("[new-conv] whatsappNumbers falhou:", (e as Error).message);
      throw new HttpError("Não foi possível verificar o número no WhatsApp. Tente novamente.", 502);
    }

    // Proteções contra bloqueio: intervalo mínimo e limite diário por chip.
    const started = await crmStartedRecently(admin, inst.id);
    const last = started.length ? Math.max(...started) : 0;
    const wait = Math.ceil((last + MIN_INTERVAL_MS - Date.now()) / 1000);
    if (wait > 0) {
      throw new HttpError(`Aguarde ${wait}s antes de iniciar outra conversa por este número.`, 429);
    }
    if (started.length >= DAILY_LIMIT) {
      throw new HttpError(
        `Limite de ${DAILY_LIMIT} conversas novas por dia atingido neste número. Tente amanhã ou use outro número.`,
        429
      );
    }

    // Contato: cria ou reaproveita (responsável = quem iniciou, se estiver sem).
    let contact: ContactRow | null =
      phone === phoneIn ? existingContact : await findContact(admin, profile.org_id, phone);
    if (!contact) {
      const ins = await admin
        .from("contacts")
        .insert({ org_id: profile.org_id, phone, name: name || null, owner_id: user.id })
        .select("id, name, owner_id")
        .single();
      if (ins.error) {
        if (ins.error.code !== "23505") throw new HttpError("Erro ao salvar o contato.", 500);
        contact = await findContact(admin, profile.org_id, phone);
      } else {
        contact = ins.data as ContactRow;
      }
    }
    if (!contact) throw new HttpError("Erro ao salvar o contato.", 500);

    const patch: { name?: string; owner_id?: string } = {};
    if (name && !contact.name) patch.name = name;
    if (!contact.owner_id) patch.owner_id = user.id;
    if (Object.keys(patch).length) {
      const { error } = await admin.from("contacts").update(patch).eq("id", contact.id);
      if (error) throw new HttpError("Erro ao atualizar o contato.", 500);
      contact = { ...contact, ...patch };
    }

    // Conversa: reaproveita (ex.: criada entre as verificações) ou cria.
    let convId = await findConversation(admin, inst.id, contact.id);
    if (!convId) {
      const ins = await admin
        .from("conversations")
        .insert({
          org_id: profile.org_id,
          contact_id: contact.id,
          instance_id: inst.id,
          assigned_to: contact.owner_id,
          sector_id: inst.sector_id,
        })
        .select("id")
        .single();
      if (ins.error) {
        if (ins.error.code !== "23505") throw new HttpError("Erro ao criar a conversa.", 500);
        convId = await findConversation(admin, inst.id, contact.id);
      } else {
        convId = ins.data.id as string;
      }
    }
    if (!convId) throw new HttpError("Erro ao criar a conversa.", 500);

    // Envio pelo mesmo caminho de /api/messages/send.
    const base = {
      org_id: profile.org_id,
      conversation_id: convId,
      direction: "out",
      type: "text",
      body: text,
      sent_by: user.id,
    };
    let externalId: string | null = null;
    try {
      const res = await evolutionFetch(
        `/message/sendText/${encodeURIComponent(inst.evolution_instance)}`,
        { method: "POST", body: JSON.stringify({ number: phone, text }) }
      );
      externalId = res?.key?.id ?? null;
    } catch (e) {
      console.error("[new-conv] Evolution falhou:", (e as Error).message);
      await admin.from("messages").insert({ ...base, status: "failed" });
      return NextResponse.json(
        {
          error: "A conversa foi criada, mas não foi possível enviar a mensagem pelo WhatsApp.",
          conversation_id: convId,
        },
        { status: 502 }
      );
    }

    const { error } = await admin
      .from("messages")
      .insert({ ...base, status: "sent", external_id: externalId });
    if (error) {
      // O webhook (fromMe) pode ter gravado antes: só atribui o autor.
      if (error.code === "23505" && externalId) {
        await admin
          .from("messages")
          .update({ sent_by: user.id })
          .eq("org_id", profile.org_id)
          .eq("external_id", externalId);
      } else {
        console.error("[new-conv] erro ao gravar mensagem:", error.message);
        throw new HttpError("Mensagem enviada, mas houve erro ao registrá-la.", 500);
      }
    }

    return NextResponse.json({ conversation_id: convId, existing: false });
  } catch (e) {
    return errorResponse(e);
  }
}
