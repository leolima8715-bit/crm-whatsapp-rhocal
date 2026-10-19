import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSectorNameFree, validateSectorName } from "@/lib/sectors";
import { isUuid } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { orgId } = await requireGestor();
    if (!isUuid(params.id)) throw new HttpError("Setor não encontrado.", 404);

    const admin = createAdminClient();
    const { data: sector } = await admin
      .from("sectors")
      .select("id, name, archived")
      .eq("id", params.id)
      .eq("org_id", orgId)
      .maybeSingle();
    if (!sector) throw new HttpError("Setor não encontrado.", 404);

    const body = await req.json().catch(() => ({}));
    const update: { name?: string; archived?: boolean } = {};

    if (body?.name !== undefined) {
      const name = validateSectorName(body.name);
      if (name !== sector.name) await assertSectorNameFree(admin, orgId, name, sector.id);
      update.name = name;
    }
    if (body?.archived !== undefined) {
      // Nada é apagado: o setor só é arquivado.
      if (body.archived !== true) throw new HttpError("Valor inválido.", 400);
      update.archived = true;
    }
    if (Object.keys(update).length === 0) throw new HttpError("Nada para atualizar.", 400);

    const { error } = await admin
      .from("sectors")
      .update(update)
      .eq("id", sector.id)
      .eq("org_id", orgId);
    if (error) {
      if (error.code === "23505") {
        throw new HttpError("Já existe um setor com este nome.", 409);
      }
      throw new HttpError("Erro ao atualizar o setor.", 500);
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
