/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { evolutionFetch } from "@/lib/evolution";
import { jidToPhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 500;
const IN_CHUNK = 200;

type Existing = {
  id: string;
  phone: string;
  name: string | null;
  push_name: string | null;
  owner_id: string | null;
  source_instance_id: string | null;
};

function clean(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, 120);
  return t || null;
}

// POST { offset?: number }  -> importa uma página (500) da agenda do chip.
// A Evolution devolve a agenda inteira numa chamada; a lista é filtrada, ordenada e paginada aqui,
// e a tela chama de novo com nextOffset até terminar.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, profile } = await requireProfile();
    if (!isUuid(params.id)) throw new HttpError("Número não encontrado.", 404);

    const body = await req.json().catch(() => ({}));
    const offset = Number.isInteger(body?.offset) && body.offset > 0 ? body.offset : 0;

    const admin = createAdminClient();
    const { data: inst } = await admin
      .from("whatsapp_instances")
      .select("id, org_id, owner_id, phone, status, evolution_instance, archived")
      .eq("id", params.id)
      .eq("org_id", profile.org_id)
      .maybeSingle();
    if (!inst || inst.archived) throw new HttpError("Número não encontrado.", 404);
    if (profile.role !== "gestor" && inst.owner_id !== user.id) {
      throw new HttpError("Você só pode importar os contatos do seu próprio número.", 403);
    }
    if (inst.status !== "connected") {
      throw new HttpError("Conecte o número antes de importar os contatos.", 409);
    }

    const raw = await evolutionFetch<any>(
      `/chat/findContacts/${encodeURIComponent(inst.evolution_instance)}`,
      { method: "POST", body: JSON.stringify({ where: {} }) }
    );
    const list: any[] = Array.isArray(raw) ? raw : Array.isArray(raw?.contacts) ? raw.contacts : [];

    const ownDigits = String(inst.phone ?? "").replace(/\D/g, "");
    const byPhone = new Map<string, { phone: string; pushName: string | null }>();
    let ignored = 0;
    for (const c of list) {
      const jid = typeof c?.remoteJid === "string" ? c.remoteJid : "";
      if (!jid.endsWith("@s.whatsapp.net")) {
        ignored++; // grupos, listas/status, @lid
        continue;
      }
      const phone = jidToPhone(jid);
      if (phone.length < 8 || phone.length > 15 || (ownDigits && phone === ownDigits)) {
        ignored++;
        continue;
      }
      const pushName = clean(c?.pushName);
      const prev = byPhone.get(phone);
      if (prev) {
        ignored++; // duplicado na própria agenda
        if (!prev.pushName && pushName) prev.pushName = pushName;
      } else {
        byPhone.set(phone, { phone, pushName });
      }
    }

    const eligible = Array.from(byPhone.values()).sort((a, b) => a.phone.localeCompare(b.phone));
    const page = eligible.slice(offset, offset + PAGE_SIZE);

    // Contatos que já existem nesta página.
    const existing = new Map<string, Existing>();
    for (let i = 0; i < page.length; i += IN_CHUNK) {
      const { data, error } = await admin
        .from("contacts")
        .select("id, phone, name, push_name, owner_id, source_instance_id")
        .eq("org_id", inst.org_id)
        .in("phone", page.slice(i, i + IN_CHUNK).map((p) => p.phone));
      if (error) throw new HttpError("Erro ao consultar os contatos.", 500);
      for (const r of (data ?? []) as Existing[]) existing.set(r.phone, r);
    }

    const toInsert: Record<string, unknown>[] = [];
    const toUpdate: Existing[] = [];
    for (const p of page) {
      const cur = existing.get(p.phone);
      if (!cur) {
        toInsert.push({
          org_id: inst.org_id,
          phone: p.phone,
          name: p.pushName,
          push_name: p.pushName,
          owner_id: inst.owner_id,
          source_instance_id: inst.id,
        });
        continue;
      }
      // Só completa o que está vazio; nada é sobrescrito nem apagado.
      const next: Existing = { ...cur };
      if (!cur.name && p.pushName) next.name = p.pushName;
      if (!cur.push_name && p.pushName) next.push_name = p.pushName;
      if (!cur.owner_id && inst.owner_id) next.owner_id = inst.owner_id;
      if (!cur.source_instance_id) next.source_instance_id = inst.id;
      if (
        next.name !== cur.name ||
        next.push_name !== cur.push_name ||
        next.owner_id !== cur.owner_id ||
        next.source_instance_id !== cur.source_instance_id
      ) {
        toUpdate.push(next);
      }
    }

    let created = 0;
    let errors = 0;
    if (toInsert.length) {
      const { error } = await admin
        .from("contacts")
        .upsert(toInsert, { onConflict: "org_id,phone", ignoreDuplicates: true });
      if (error) {
        console.error("[import-contacts] insert:", error.message);
        errors += toInsert.length;
      } else {
        created = toInsert.length;
      }
    }
    if (toUpdate.length) {
      const { error } = await admin
        .from("contacts")
        .upsert(
          toUpdate.map((u) => ({
            id: u.id,
            org_id: inst.org_id,
            phone: u.phone,
            name: u.name,
            push_name: u.push_name,
            owner_id: u.owner_id,
            source_instance_id: u.source_instance_id,
          })),
          { onConflict: "id" }
        );
      if (error) {
        console.error("[import-contacts] update:", error.message);
        errors += toUpdate.length;
      }
    }

    const nextOffset = offset + PAGE_SIZE < eligible.length ? offset + PAGE_SIZE : null;
    return NextResponse.json({
      total: list.length,
      eligible: eligible.length,
      ignored,
      offset,
      nextOffset,
      processed: page.length,
      created,
      existing: page.length - toInsert.length,
      errors,
    });
  } catch (e) {
    return errorResponse(e);
  }
}
