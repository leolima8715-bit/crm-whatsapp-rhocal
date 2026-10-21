import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireUser } from "@/lib/auth";
import { evolutionFetch } from "@/lib/evolution";
import { MESSAGE_SELECT } from "@/lib/inbox-queries";
import { applyMessageAutomation } from "@/lib/stages";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();

    const body = await req.json().catch(() => ({}));
    const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id : "";
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!conversationId) throw new HttpError("Conversa inválida.", 400);
    if (!text) throw new HttpError("Digite uma mensagem.", 400);
    if (text.length > 4096) throw new HttpError("A mensagem passa de 4096 caracteres.", 400);

    // Client do usuário: a RLS garante que ele só envia em conversas que enxerga.
    const { data: conv } = await supabase
      .from("conversations")
      .select("id, org_id, contact:contacts(phone), instance:whatsapp_instances(evolution_instance)")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv) throw new HttpError("Conversa não encontrada.", 404);

    const contact = one(conv.contact as { phone: string } | { phone: string }[] | null);
    const instance = one(
      conv.instance as { evolution_instance: string } | { evolution_instance: string }[] | null
    );
    if (!contact?.phone || !instance?.evolution_instance) {
      throw new HttpError("Conversa sem contato ou número de origem.", 422);
    }

    const admin = createAdminClient();
    const base = {
      org_id: conv.org_id,
      conversation_id: conv.id,
      direction: "out",
      type: "text",
      body: text,
      sent_by: user.id,
    };

    let externalId: string | null = null;
    try {
      const res = await evolutionFetch(
        `/message/sendText/${encodeURIComponent(instance.evolution_instance)}`,
        { method: "POST", body: JSON.stringify({ number: contact.phone, text }) }
      );
      externalId = res?.key?.id ?? null;
    } catch (e) {
      console.error("[send] Evolution falhou:", (e as Error).message);
      const { data: failed } = await admin
        .from("messages")
        .insert({ ...base, status: "failed" })
        .select(MESSAGE_SELECT)
        .single();
      return NextResponse.json(
        { error: "Não foi possível enviar a mensagem pelo WhatsApp.", message: failed ?? null },
        { status: 502 }
      );
    }

    const { data: inserted, error } = await admin
      .from("messages")
      .insert({ ...base, status: "sent", external_id: externalId })
      .select(MESSAGE_SELECT)
      .single();

    if (!error || error.code === "23505") {
    await applyMessageAutomation(admin, { conversationId: conv.id, orgId: conv.org_id, event: "out" });
  }
  if (!error) return NextResponse.json({ message: inserted });

    // O webhook (fromMe) pode ter gravado antes: só atribui o autor.
    if (error.code === "23505" && externalId) {
      const { data: existing, error: updErr } = await admin
        .from("messages")
        .update({ sent_by: user.id })
        .eq("org_id", conv.org_id)
        .eq("external_id", externalId)
        .select(MESSAGE_SELECT)
        .single();
      if (!updErr) return NextResponse.json({ message: existing });
    }

    console.error("[send] erro ao gravar mensagem:", error.message);
    throw new HttpError("Mensagem enviada, mas houve erro ao registrá-la.", 500);
  } catch (e) {
    return errorResponse(e);
  }
}
