import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireUser } from "@/lib/auth";
import { BUCKET, MAX_BYTES, formatBytes, isAllowedMime } from "@/lib/media";
import { buildStoragePath } from "@/lib/media-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { supabase } = await requireUser();
    const body = await req.json().catch(() => ({}));

    const conversationId = body?.conversation_id;
    const filename = typeof body?.filename === "string" ? body.filename : "";
    const mime = typeof body?.mime === "string" ? body.mime : "";
    const size = typeof body?.size === "number" ? body.size : NaN;

    if (!isUuid(conversationId)) throw new HttpError("Conversa inválida.", 400);
    if (!filename) throw new HttpError("Arquivo sem nome.", 400);
    if (!mime || !isAllowedMime(mime)) {
      throw new HttpError("Tipo de arquivo não suportado.", 400);
    }
    if (!Number.isFinite(size) || size <= 0) throw new HttpError("Tamanho inválido.", 400);
    if (size > MAX_BYTES) {
      throw new HttpError(`O arquivo passa do limite de ${formatBytes(MAX_BYTES)}.`, 413);
    }

    const { data: conv } = await supabase
      .from("conversations")
      .select("id, org_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv) throw new HttpError("Conversa não encontrada.", 404);

    const path = buildStoragePath(conv.org_id, conv.id, filename);
    const admin = createAdminClient();
    const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(path);
    if (error || !data) throw new HttpError("Não foi possível preparar o envio do arquivo.", 500);

    return NextResponse.json({ path: data.path ?? path, token: data.token, signedUrl: data.signedUrl });
  } catch (e) {
    return errorResponse(e);
  }
}
