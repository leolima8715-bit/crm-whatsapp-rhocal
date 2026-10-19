import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";
import { SHORTCUT_RE, text } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, profile } = await requireProfile();
    if (!isUuid(params.id)) throw new HttpError("Resposta não encontrada.", 404);

    const admin = createAdminClient();
    const { data: reply } = await admin
      .from("quick_replies")
      .select("id, shortcut, created_by")
      .eq("id", params.id)
      .eq("org_id", profile.org_id)
      .maybeSingle();
    if (!reply) throw new HttpError("Resposta não encontrada.", 404);

    if (profile.role !== "gestor" && reply.created_by !== user.id) {
      throw new HttpError("Só o gestor ou quem criou pode alterar esta resposta.", 403);
    }

    const body = await req.json().catch(() => ({}));
    const update: { shortcut?: string; body?: string; archived?: boolean } = {};

    if (body?.shortcut !== undefined) {
      const shortcut = typeof body.shortcut === "string" ? body.shortcut.trim().toLowerCase() : "";
      if (!SHORTCUT_RE.test(shortcut)) {
        throw new HttpError(
          "O atalho deve começar com / e ter de 2 a 20 caracteres (letras minúsculas, números e hífen).",
          400
        );
      }
      if (shortcut !== reply.shortcut) {
        const { data: dup } = await admin
          .from("quick_replies")
          .select("id")
          .eq("org_id", profile.org_id)
          .eq("shortcut", shortcut)
          .maybeSingle();
        if (dup) throw new HttpError("Já existe uma resposta com este atalho.", 409);
      }
      update.shortcut = shortcut;
    }
    if (body?.body !== undefined) update.body = text(body.body, "Texto", 1, 4096);
    if (body?.archived !== undefined) {
      if (body.archived !== true) throw new HttpError("Valor inválido.", 400);
      update.archived = true;
    }
    if (Object.keys(update).length === 0) throw new HttpError("Nada para atualizar.", 400);

    const { data, error } = await admin
      .from("quick_replies")
      .update(update)
      .eq("id", reply.id)
      .eq("org_id", profile.org_id)
      .select("id, shortcut, body, created_by")
      .single();
    if (error) {
      if (error.code === "23505") throw new HttpError("Já existe uma resposta com este atalho.", 409);
      throw new HttpError("Erro ao atualizar a resposta.", 500);
    }
    return NextResponse.json({ quick_reply: data });
  } catch (e) {
    return errorResponse(e);
  }
}
