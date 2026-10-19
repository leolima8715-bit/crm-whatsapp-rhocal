import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";
import { hexColor, text } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { orgId } = await requireGestor();
    if (!isUuid(params.id)) throw new HttpError("Etapa não encontrada.", 404);

    const admin = createAdminClient();
    const { data: stage } = await admin
      .from("pipeline_stages")
      .select("id")
      .eq("id", params.id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!stage) throw new HttpError("Etapa não encontrada.", 404);

    const body = await req.json().catch(() => ({}));
    const update: { name?: string; color?: string; archived?: boolean } = {};
    if (body?.name !== undefined) update.name = text(body.name, "Nome da etapa", 1, 40);
    if (body?.color !== undefined) update.color = hexColor(body.color);
    if (body?.archived !== undefined) {
      if (body.archived !== true) throw new HttpError("Valor inválido.", 400);

      // Não arquiva etapa com negócios abertos nem a última etapa ativa.
      const { count } = await admin
        .from("deals")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("stage_id", stage.id)
        .eq("status", "open");
      if ((count ?? 0) > 0) {
        throw new HttpError("Mova os negócios abertos desta etapa antes de arquivá-la.", 409);
      }
      const { count: active } = await admin
        .from("pipeline_stages")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("archived", false);
      if ((active ?? 0) <= 1) throw new HttpError("O funil precisa ter pelo menos uma etapa.", 409);
      update.archived = true;
    }
    if (Object.keys(update).length === 0) throw new HttpError("Nada para atualizar.", 400);

    const { data, error } = await admin
      .from("pipeline_stages")
      .update(update)
      .eq("id", stage.id)
      .eq("org_id", orgId)
      .select("id, name, position, color")
      .single();
    if (error) throw new HttpError("Erro ao atualizar a etapa.", 500);
    return NextResponse.json({ stage: data });
  } catch (e) {
    return errorResponse(e);
  }
}
