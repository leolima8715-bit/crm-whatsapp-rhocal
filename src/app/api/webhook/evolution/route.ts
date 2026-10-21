/* eslint-disable @typescript-eslint/no-explicit-any */
import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { MEDIA_TYPES, downloadAndStoreMedia } from "@/lib/media-server";
import { applyMessageAutomation } from "@/lib/stages";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Admin = ReturnType<typeof createAdminClient>;
type Instance = {
  id: string;
  evolution_instance: string;
  org_id: string;
  owner_id: string | null;
  sector_id: string | null;
};

class DbError extends Error {}

const MSG_STATUS_RANK = { pending: 0, sent: 1, delivered: 2, read: 3 } as const;

// ---------- autenticação ----------

function secretOk(received: string | null) {
  const expected = process.env.WEBHOOK_SECRET;
  if (!expected || !received) return false;
  // Hash dos dois lados: timingSafeEqual exige buffers de mesmo tamanho.
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// ---------- helpers de payload ----------

function normalizeEvent(ev: unknown) {
  return String(ev ?? "").toLowerCase().replace(/_/g, ".");
}

function toArray(data: any): any[] {
  if (Array.isArray(data)) return data;
  return data ? [data] : [];
}

function jidDigits(jid: unknown) {
  if (typeof jid !== "string") return "";
  return jid.split("@")[0].split(":")[0].replace(/\D/g, "");
}

function resolvePhone(key: any): string | null {
  const jid: string = key?.remoteJid ?? "";
  let source = jid;
  if (jid.endsWith("@lid")) {
    source = key.remoteJidAlt ?? key.senderPn ?? "";
    if (!source) {
      console.warn("[webhook] @lid sem remoteJidAlt/senderPn, mensagem ignorada");
      return null;
    }
  }
  const digits = jidDigits(source);
  return digits || null;
}

function unwrap(message: any): any {
  let m = message ?? {};
  for (let i = 0; i < 4; i++) {
    const inner =
      m.ephemeralMessage?.message ??
      m.viewOnceMessage?.message ??
      m.viewOnceMessageV2?.message ??
      m.documentWithCaptionMessage?.message ??
      null;
    if (!inner) break;
    m = inner;
  }
  return m;
}

function parseContent(message: any): {
  type: string;
  body: string | null;
  mime: string | null;
} {
  const m = unwrap(message);
  if (typeof m.conversation === "string") return { type: "text", body: m.conversation, mime: null };
  if (m.extendedTextMessage)
    return { type: "text", body: m.extendedTextMessage.text ?? null, mime: null };
  if (m.imageMessage)
    return { type: "image", body: m.imageMessage.caption ?? null, mime: m.imageMessage.mimetype ?? null };
  if (m.videoMessage)
    return { type: "video", body: m.videoMessage.caption ?? null, mime: m.videoMessage.mimetype ?? null };
  if (m.audioMessage) return { type: "audio", body: null, mime: m.audioMessage.mimetype ?? null };
  if (m.documentMessage)
    return {
      type: "document",
      body: m.documentMessage.fileName ?? m.documentMessage.caption ?? null,
      mime: m.documentMessage.mimetype ?? null,
    };
  if (m.stickerMessage) return { type: "sticker", body: null, mime: m.stickerMessage.mimetype ?? null };
  if (m.locationMessage) return { type: "location", body: null, mime: null };
  if (m.contactMessage || m.contactsArrayMessage) return { type: "contact", body: null, mime: null };
  return { type: "other", body: null, mime: null };
}

function toIso(ts: unknown): string | undefined {
  // messageTimestamp vem em segundos (número, string ou objeto Long).
  const n =
    typeof ts === "object" && ts !== null ? Number((ts as any).low ?? NaN) : Number(ts);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  return new Date(n * 1000).toISOString();
}

// ---------- handlers ----------

async function ensureContact(
  admin: Admin,
  orgId: string,
  phone: string,
  pushName: string | null
): Promise<string> {
  const find = () =>
    admin
      .from("contacts")
      .select("id, push_name")
      .eq("org_id", orgId)
      .eq("phone", phone)
      .maybeSingle();

  const first = await find();
  if (first.error) throw new DbError("contacts select");
  let contact = first.data;

  if (!contact) {
    const ins = await admin
      .from("contacts")
      .insert({ org_id: orgId, phone, push_name: pushName })
      .select("id, push_name")
      .single();
    if (ins.error) {
      // Corrida com outro evento criando o mesmo contato: busca de novo.
      if (ins.error.code !== "23505") throw new DbError("contacts insert");
      const again = await find();
      if (again.error || !again.data) throw new DbError("contacts select retry");
      contact = again.data;
    } else {
      contact = ins.data;
    }
  } else if (pushName && contact.push_name !== pushName) {
    const upd = await admin.from("contacts").update({ push_name: pushName }).eq("id", contact.id);
    if (upd.error) throw new DbError("contacts update");
  }

  return contact.id as string;
}

async function ensureConversation(
  admin: Admin,
  inst: Instance,
  contactId: string
): Promise<string> {
  const find = () =>
    admin
      .from("conversations")
      .select("id")
      .eq("instance_id", inst.id)
      .eq("contact_id", contactId)
      .maybeSingle();

  const { data: existing, error } = await find();
  if (error) throw new DbError("conversations select");
  if (existing) return existing.id as string;

  const ins = await admin
    .from("conversations")
    .insert({
      org_id: inst.org_id,
      contact_id: contactId,
      instance_id: inst.id,
      assigned_to: inst.owner_id,
      sector_id: inst.sector_id,
    })
    .select("id")
    .single();

  if (ins.error) {
    if (ins.error.code !== "23505") throw new DbError("conversations insert");
    const again = await find();
    if (again.error || !again.data) throw new DbError("conversations select retry");
    return again.data.id as string;
  }
  return ins.data.id as string;
}

async function handleUpsert(admin: Admin, inst: Instance, item: any) {
  const key = item?.key;
  const jid: string = key?.remoteJid ?? "";
  if (!key?.id || !jid) return;
  if (jid.endsWith("@g.us") || jid === "status@broadcast") return;

  const phone = resolvePhone(key);
  if (!phone) return;

  const direction = key.fromMe ? "out" : "in";
  const { type, body, mime } = parseContent(item.message);
  const pushName =
    direction === "in" && typeof item.pushName === "string" && item.pushName.trim()
      ? item.pushName.trim()
      : null;

  const contactId = await ensureContact(admin, inst.org_id, phone, pushName);
  const conversationId = await ensureConversation(admin, inst, contactId);

  // O trigger do banco atualiza last_message_at, preview e unread_count.
  const row: Record<string, unknown> = {
    org_id: inst.org_id,
    conversation_id: conversationId,
    direction,
    type,
    body,
    media_mime: mime,
    external_id: key.id,
    status: direction === "out" ? "sent" : "delivered",
    raw: item,
  };
  const createdAt = toIso(item.messageTimestamp);
  if (createdAt) row.created_at = createdAt;

  const { data: inserted, error } = await admin
    .from("messages")
    .insert(row)
    .select("id")
    .single();
  // 23505 = mensagem já registrada (reenvio da Evolution ou envio pelo CRM): sem novo download.
  if (error) {
    if (error.code === "23505") return;
    throw new DbError("messages insert");
  }

  // Mensagem recebida reabre/avança a etapa da conversa (não bloqueia o webhook se falhar).
  if (direction === "in") {
    await applyMessageAutomation(admin, { conversationId, orgId: inst.org_id, event: "in" });
  }

  // Mídia: baixa só quando a mensagem é nova. Falha aqui nunca derruba o webhook.
  if (inserted && MEDIA_TYPES.includes(type)) {
    await downloadAndStoreMedia(admin, {
      instanceName: inst.evolution_instance,
      orgId: inst.org_id,
      conversationId,
      messageId: inserted.id,
      externalId: key.id,
      type,
      fileName: type === "document" ? body : null,
    });
  }
}

function mapAckStatus(raw: unknown): keyof typeof MSG_STATUS_RANK | "failed" | null {
  switch (String(raw ?? "").toUpperCase()) {
    case "PENDING":
      return "pending";
    case "SERVER_ACK":
    case "SENT":
      return "sent";
    case "DELIVERY_ACK":
    case "DELIVERED":
      return "delivered";
    case "READ":
    case "PLAYED":
      return "read";
    case "ERROR":
    case "FAILED":
      return "failed";
    default:
      return null;
  }
}

async function handleMessageUpdate(admin: Admin, inst: Instance, item: any) {
  const externalId = item?.keyId ?? item?.key?.id;
  const next = mapAckStatus(item?.status ?? item?.update?.status);
  if (!externalId || !next) return;

  const { data: msg, error } = await admin
    .from("messages")
    .select("id, status")
    .eq("org_id", inst.org_id)
    .eq("external_id", externalId)
    .maybeSingle();
  if (error) throw new DbError("messages select");
  if (!msg) return;

  // Status só avança (um ack atrasado não rebaixa 'read' para 'delivered').
  const cur = msg.status as keyof typeof MSG_STATUS_RANK | "failed";
  if (next !== "failed") {
    if (cur === "failed") return;
    if (MSG_STATUS_RANK[next] <= (MSG_STATUS_RANK[cur as keyof typeof MSG_STATUS_RANK] ?? -1))
      return;
  }

  const upd = await admin.from("messages").update({ status: next }).eq("id", msg.id);
  if (upd.error) throw new DbError("messages update");
}

async function handleConnection(admin: Admin, inst: Instance, item: any) {
  const state = String(item?.state ?? "").toLowerCase();
  if (!state) return;
  const status =
    state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";
  const upd = await admin.from("whatsapp_instances").update({ status }).eq("id", inst.id);
  if (upd.error) throw new DbError("instances update");
}

// ---------- rota ----------

export async function POST(req: Request) {
  if (!secretOk(req.headers.get("x-webhook-secret"))) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const event = normalizeEvent(payload?.event);
  const instanceName: string | undefined = payload?.instance;
  if (!instanceName || !["messages.upsert", "messages.update", "connection.update"].includes(event)) {
    return NextResponse.json({ ok: true, ignored: true });
  }

  const admin = createAdminClient();

  try {
    const { data: inst, error } = await admin
      .from("whatsapp_instances")
      .select("id, org_id, evolution_instance, owner_id, sector_id")
      .eq("evolution_instance", instanceName)
      .maybeSingle();
    if (error) throw new DbError("instances select");
    if (!inst) return NextResponse.json({ ok: true, ignored: true });

    let dbFailed = false;
    for (const item of toArray(payload.data)) {
      try {
        if (event === "messages.upsert") await handleUpsert(admin, inst, item);
        else if (event === "messages.update") await handleMessageUpdate(admin, inst, item);
        else await handleConnection(admin, inst, item);
      } catch (e) {
        if (e instanceof DbError) dbFailed = true;
        console.error(`[webhook] ${event} (${instanceName}):`, (e as Error).message);
      }
    }

    // 500 só para falha de banco: a Evolution tenta entregar de novo.
    if (dbFailed) return NextResponse.json({ error: "Falha ao gravar." }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(`[webhook] ${event} (${instanceName}):`, (e as Error).message);
    const status = e instanceof DbError ? 500 : 200;
    return NextResponse.json({ ok: status === 200 }, { status });
  }
}
