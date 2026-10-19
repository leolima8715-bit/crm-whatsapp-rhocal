import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  countOtherActiveGestores,
  getOrgProfile,
  validateName,
  validateRole,
  validateSectorIds,
} from "@/lib/users";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, orgId } = await requireGestor();
    const admin = createAdminClient();
    const target = await getOrgProfile(admin, params.id, orgId);
    const body = await req.json().catch(() => ({}));

    const update: { full_name?: string; role?: string; active?: boolean } = {};
    if (body?.full_name !== undefined) update.full_name = validateName(body.full_name);
    if (body?.role !== undefined) update.role = validateRole(body.role);
    if (body?.active !== undefined) {
      if (typeof body.active !== "boolean") throw new HttpError("Valor de status inválido.", 400);
      update.active = body.active;
    }
    const sectorIds =
      body?.sector_ids !== undefined ? await validateSectorIds(admin, orgId, body.sector_ids) : null;

    if (Object.keys(update).length === 0 && sectorIds === null) {
      throw new HttpError("Nada para atualizar.", 400);
    }

    const self = target.id === user.id;
    if (self && update.active === false) {
      throw new HttpError("Você não pode desativar o seu próprio usuário.", 400);
    }
    if (self && update.role !== undefined && update.role !== "gestor") {
      throw new HttpError("Você não pode rebaixar o seu próprio papel.", 400);
    }

    // Sempre deve sobrar pelo menos 1 gestor ativo.
    const loseGestor =
      target.role === "gestor" &&
      target.active &&
      (update.active === false || (update.role !== undefined && update.role !== "gestor"));
    if (loseGestor && (await countOtherActiveGestores(admin, orgId, target.id)) === 0) {
      throw new HttpError("A organização precisa ter pelo menos 1 gestor ativo.", 400);
    }

    if (Object.keys(update).length > 0) {
      const { error } = await admin
        .from("profiles")
        .update(update)
        .eq("id", target.id)
        .eq("org_id", orgId);
      if (error) throw new HttpError("Erro ao atualizar o usuário.", 500);
    }

    if (sectorIds !== null) {
      const { data: current, error: curErr } = await admin
        .from("profile_sectors")
        .select("sector_id")
        .eq("profile_id", target.id);
      if (curErr) throw new HttpError("Erro ao ler os setores atuais.", 500);

      const have = new Set((current ?? []).map((r) => r.sector_id as string));
      const want = new Set(sectorIds);
      const toAdd = sectorIds.filter((id) => !have.has(id));
      const toRemove = Array.from(have).filter((id) => !want.has(id));

      if (toAdd.length > 0) {
        const { error } = await admin
          .from("profile_sectors")
          .insert(toAdd.map((sector_id) => ({ profile_id: target.id, sector_id })));
        if (error) throw new HttpError("Erro ao vincular os setores.", 500);
      }
      if (toRemove.length > 0) {
        const { error } = await admin
          .from("profile_sectors")
          .delete()
          .eq("profile_id", target.id)
          .in("sector_id", toRemove);
        if (error) throw new HttpError("Erro ao desvincular os setores.", 500);
      }
    }

    // Desativar também bloqueia o login; reativar libera.
    if (update.active !== undefined && update.active !== target.active) {
      const { error } = await admin.auth.admin.updateUserById(target.id, {
        ban_duration: update.active ? "none" : "876000h",
      });
      if (error) {
        throw new HttpError(
          update.active
            ? "Usuário reativado no CRM, mas não foi possível liberar o login. Tente reativar de novo."
            : "Usuário desativado no CRM, mas não foi possível bloquear o login. Tente desativar de novo.",
          500
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
