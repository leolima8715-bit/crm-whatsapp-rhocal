import { randomUUID } from "crypto";
import { evolutionFetch } from "@/lib/evolution";
import { BUCKET, MAX_BYTES, extFromMime, sanitizeFileName } from "@/lib/media";
import { createAdminClient } from "@/lib/supabase/admin";

type Admin = ReturnType<typeof createAdminClient>;

export function buildStoragePath(orgId: string, conversationId: string, fileName: string) {
  return `${orgId}/${conversationId}/${randomUUID()}-${sanitizeFileName(fileName)}`;
}

export const MEDIA_TYPES = ["image", "video", "audio", "document", "sticker"];

// Baixa a mídia na Evolution, grava no Storage e atualiza a mensagem.
// Retorna true se gravou. Nunca lança por falha de download (só retorna false).
export async function downloadAndStoreMedia(
  admin: Admin,
  args: {
    instanceName: string;
    orgId: string;
    conversationId: string;
    messageId: string;
    externalId: string;
    type: string;
    fileName?: string | null;
  }
): Promise<boolean> {
  try {
    const res = await evolutionFetch(
      `/chat/getBase64FromMediaMessage/${encodeURIComponent(args.instanceName)}`,
      {
        method: "POST",
        body: JSON.stringify({ message: { key: { id: args.externalId } }, convertToMp4: false }),
      }
    );

    let b64: string | undefined = res?.base64;
    const mime: string = res?.mimetype ?? res?.mimeType ?? "application/octet-stream";
    if (!b64 || typeof b64 !== "string") {
      console.warn(`[media] sem base64 para a mensagem ${args.messageId}`);
      return false;
    }
    if (b64.startsWith("data:")) b64 = b64.slice(b64.indexOf(",") + 1);

    // Tamanho estimado antes de decodificar.
    if ((b64.length * 3) / 4 > MAX_BYTES) {
      console.warn(`[media] mídia da mensagem ${args.messageId} passa de 20 MB, ignorada`);
      return false;
    }
    const buffer = Buffer.from(b64, "base64");
    if (buffer.length === 0 || buffer.length > MAX_BYTES) return false;

    const name =
      args.fileName || res?.fileName || `${args.type}.${extFromMime(mime)}`;
    const path = buildStoragePath(args.orgId, args.conversationId, name);

    const up = await admin.storage.from(BUCKET).upload(path, buffer, {
      contentType: mime.split(";")[0].trim() || "application/octet-stream",
      upsert: false,
    });
    if (up.error) {
      console.warn(`[media] upload falhou (${args.messageId}): ${up.error.message}`);
      return false;
    }

    const { error } = await admin
      .from("messages")
      .update({ media_path: path, media_mime: mime.split(";")[0].trim() })
      .eq("id", args.messageId);
    if (error) {
      console.warn(`[media] não atualizou a mensagem ${args.messageId}: ${error.message}`);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[media] download falhou (${args.messageId}): ${(e as Error).message}`);
    return false;
  }
}
