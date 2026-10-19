import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireUser } from "@/lib/auth";
import { BUCKET, fileNameFromPath } from "@/lib/media";
import { MEDIA_TYPES, downloadAndStoreMedia } from "@/lib/media-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request, { params }: { params: { messageId: string } }) {
  try {
    const { supabase } = await requireUser();
    if (!isUuid(params.messageId)) throw new HttpError("Mídia não encontrada.", 404);

    // Client do usuário: a RLS garante que ele só acessa mensagens que enxerga.
    const { data: msg } = await supabase
      .from("messages")
      .select("id, org_id, conversation_id, direction, type, body, media_path, external_id")
      .eq("id", params.messageId)
      .maybeSingle();
    if (!msg || !MEDIA_TYPES.includes(msg.type)) throw new HttpError("Mídia não encontrada.", 404);

    const admin = createAdminClient();
    let path: string | null = msg.media_path;

    // Download sob demanda de mídia recebida que ainda não foi guardada.
    if (!path && msg.direction === "in" && msg.external_id) {
      const { data: conv } = await supabase
        .from("conversations")
        .select("instance:whatsapp_instances(evolution_instance)")
        .eq("id", msg.conversation_id)
        .maybeSingle();
      const inst = conv?.instance as
        | { evolution_instance: string }
        | { evolution_instance: string }[]
        | null
        | undefined;
      const instanceName = Array.isArray(inst) ? inst[0]?.evolution_instance : inst?.evolution_instance;

      if (instanceName) {
        const ok = await downloadAndStoreMedia(admin, {
          instanceName,
          orgId: msg.org_id,
          conversationId: msg.conversation_id,
          messageId: msg.id,
          externalId: msg.external_id,
          type: msg.type,
          fileName: msg.type === "document" ? msg.body : null,
        });
        if (ok) {
          const { data: fresh } = await admin
            .from("messages")
            .select("media_path")
            .eq("id", msg.id)
            .maybeSingle();
          path = fresh?.media_path ?? null;
        }
      }
    }

    if (!path) throw new HttpError("Mídia indisponível.", 404);

    const wantsDownload = new URL(req.url).searchParams.get("download") === "1";
    const { data: signed, error } = await admin.storage
      .from(BUCKET)
      .createSignedUrl(path, 3600, wantsDownload ? { download: fileNameFromPath(path) ?? true } : undefined);
    if (error || !signed?.signedUrl) throw new HttpError("Mídia indisponível.", 404);

    const res = NextResponse.redirect(signed.signedUrl, 307);
    res.headers.set("Cache-Control", "private, max-age=300");
    return res;
  } catch (e) {
    return errorResponse(e);
  }
}
