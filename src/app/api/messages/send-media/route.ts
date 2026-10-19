import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireUser } from "@/lib/auth";
import { evolutionFetch } from "@/lib/evolution";
import { MESSAGE_SELECT } from "@/lib/inbox-queries";
import { BUCKET, MAX_BYTES, baseMime, isAllowedMime } from "@/lib/media";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS = ["image", "video", "audio", "document"] as const;
type Kind = (typeof KINDS)[number];

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await req.json().catch(() => ({}));

    const conversationId = body?.conversation_id;
    const path = typeof body?.path === "string" ? body.path : "";
    const mime = typeof body?.mime === "string" ? baseMime(body.mime) : "";
    const filename = typeof body?.filename === "string" ? body.filename.slice(0, 200) : "arquivo";
    const caption = typeof body?.caption === "string" ? body.caption.trim().slice(0, 1024) : "";
    const kind = body?.kind as Kind;

    if (!isUuid(conversationId)) throw new HttpError("Conversa inválida.", 400);
    if (!KINDS.includes(kind)) throw new HttpError("Tipo de mídia inválido.", 400);
    if (!mime || !isAllowedMime(mime)) throw new HttpError("Tipo de arquivo não suportado.", 400);

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

    // O arquivo precisa estar na pasta desta conversa, sem truques de caminho.
    const dir = `${conv.org_id}/${conv.id}`;
    if (!path.startsWith(`${dir}/`) || path.includes("..") || path.slice(dir.length + 1).includes("/")) {
      throw new HttpError("Arquivo inválido para esta conversa.", 400);
    }

    const admin = createAdminClient();
    const objectName = path.slice(dir.length + 1);
    const { data: listed } = await admin.storage.from(BUCKET).list(dir, { search: objectName, limit: 10 });
    const obj = (listed ?? []).find((o) => o.name === objectName);
    if (!obj) throw new HttpError("O arquivo não foi encontrado. Envie novamente.", 400);
    const realSize = Number((obj.metadata as { size?: number } | null)?.size ?? 0);
    if (realSize > MAX_BYTES) {
      await admin.storage.from(BUCKET).remove([path]); // limpa só o upload rejeitado
      throw new HttpError("O arquivo passa do limite de 20 MB.", 413);
    }

    const { data: signed, error: signErr } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, 1800);
    if (signErr || !signed?.signedUrl) throw new HttpError("Erro ao preparar o arquivo.", 500);

    const base = {
      org_id: conv.org_id,
      conversation_id: conv.id,
      direction: "out",
      type: kind,
      body: caption || null,
      media_path: path,
      media_mime: mime,
      sent_by: user.id,
    };

    const evo = encodeURIComponent(instance.evolution_instance);
    let externalId: string | null = null;
    try {
      const res =
        kind === "audio"
          ? await evolutionFetch(`/message/sendWhatsAppAudio/${evo}`, {
              method: "POST",
              body: JSON.stringify({ number: contact.phone, audio: signed.signedUrl, encoding: true }),
            })
          : await evolutionFetch(`/message/sendMedia/${evo}`, {
              method: "POST",
              body: JSON.stringify({
                number: contact.phone,
                mediatype: kind,
                mimetype: mime,
                caption,
                media: signed.signedUrl,
                fileName: filename,
              }),
            });
      externalId = res?.key?.id ?? null;
    } catch (e) {
      console.error("[send-media] Evolution falhou:", (e as Error).message);
      const { data: failed } = await admin
        .from("messages")
        .insert({ ...base, status: "failed" })
        .select(MESSAGE_SELECT)
        .single();
      return NextResponse.json(
        { error: "Não foi possível enviar o arquivo pelo WhatsApp.", message: failed ?? null },
        { status: 502 }
      );
    }

    const { data: inserted, error } = await admin
      .from("messages")
      .insert({ ...base, status: "sent", external_id: externalId })
      .select(MESSAGE_SELECT)
      .single();
    if (!error) return NextResponse.json({ message: inserted });

    // O webhook (fromMe) pode ter gravado antes: completa autor e arquivo.
    if (error.code === "23505" && externalId) {
      const { data: existing, error: updErr } = await admin
        .from("messages")
        .update({ sent_by: user.id, media_path: path, media_mime: mime })
        .eq("org_id", conv.org_id)
        .eq("external_id", externalId)
        .select(MESSAGE_SELECT)
        .single();
      if (!updErr) return NextResponse.json({ message: existing });
    }

    console.error("[send-media] erro ao gravar mensagem:", error.message);
    throw new HttpError("Arquivo enviado, mas houve erro ao registrá-lo.", 500);
  } catch (e) {
    return errorResponse(e);
  }
}
