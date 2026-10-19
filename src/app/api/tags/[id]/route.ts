import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";
import { hexColor, text } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { orgId } = await requireGestor();
    if (!isUuid(params.id)) throw new HttpError("Tag não encontrada.", 404);

    const admin = createAdminClient();
    const { data: tag } = await admin
      .from("tags")
      .select("id, name")
      .eq("id", params.id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!tag) throw new HttpError("Tag não encontrada.", 404);

    const body = await req.json().catch(() => ({}));
    const update: { name?: string; color?: string } = {};
    if (body?.name !== undefined) update.name = text(body.name, "Nome da tag", 1, 30);
    if (body?.color !== undefined) update.color = hexColor(body.color);
    if (Object.keys(update).length === 0) throw new HttpError("Nada para atualizar.", 400);

    if (update.name && update.name.toLowerCase() !== tag.name.trim().toLowerCase()) {
      const { data: all } = await admin.from("tags").select("id, name").eq("org_id", orgId);
      if ((all ?? []).some((t) => t.id !== tag.id && t.name.trim().toLowerCase() === update.name!.toLowerCase())) {
        throw new HttpError("Já existe uma tag com este nome.", 409);
      }
    }

    const { data, error } = await admin
      .from("tags")
      .update(update)
      .eq("id", tag.id)
      .eq("org_id", orgId)
      .select("id, name, color")
      .single();
    if (error) {
      if (error.code === "23505") throw new HttpError("Já existe uma tag com este nome.", 409);
      throw new HttpError("Erro ao atualizar a tag.", 500);
    }
    return NextResponse.json({ tag: data });
  } catch (e) {
    return errorResponse(e);
  }
}
