import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";
import { money, text, uuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { user, profile } = await requireProfile();
    const isGestor = profile.role === "gestor";
    if (!isUuid(params.id)) throw new HttpError("Negócio não encontrado.", 404);

    const admin = createAdminClient();
    const { data: deal } = await admin
      .from("deals")
      .select("id, stage_id, owner_id, status")
      .eq("id", params.id)
      .eq("org_id", profile.org_id)
      .maybeSingle();
    // Quem não é gestor só enxerga os próprios negócios.
    if (!deal || (!isGestor && deal.owner_id !== user.id)) {
      throw new HttpError("Negócio não encontrado.", 404);
    }

    const body = await req.json().catch(() => ({}));
    const update: Record<string, unknown> = {};

    if (body?.title !== undefined) update.title = text(body.title, "Título", 1, 120);
    if (body?.value !== undefined) update.value = money(body.value);

    if (body?.owner_id !== undefined) {
      if (!isGestor) throw new HttpError("Só o gestor pode reatribuir o negócio.", 403);
      const ownerId = uuid(body.owner_id, "Responsável");
      const { data } = await admin
        .from("profiles")
        .select("id")
        .eq("id", ownerId)
        .eq("org_id", profile.org_id)
        .eq("active", true)
        .maybeSingle();
      if (!data) throw new HttpError("Responsável inválido.", 400);
      update.owner_id = ownerId;
    }

    if (body?.status !== undefined) {
      if (!["open", "won", "lost"].includes(body.status)) throw new HttpError("Status inválido.", 400);
      update.status = body.status;
      if (body.status === "lost") {
        update.lost_reason = text(body.lost_reason, "Motivo da perda", 1, 300);
      } else {
        update.lost_reason = null;
      }
    }

    // Mover entre colunas / reordenar: reescreve as posições da coluna de destino.
    const moving = body?.stage_id !== undefined || body?.before_id !== undefined;
    if (moving) {
      const targetStage = body?.stage_id !== undefined ? uuid(body.stage_id, "Etapa") : deal.stage_id;
      const beforeId = body?.before_id === undefined || body.before_id === null ? null : uuid(body.before_id, "Posição");

      const { data: stage } = await admin
        .from("pipeline_stages")
        .select("id")
        .eq("id", targetStage)
        .eq("org_id", profile.org_id)
        .eq("archived", false)
        .maybeSingle();
      if (!stage) throw new HttpError("Etapa inválida.", 400);

      const { data: column, error: colErr } = await admin
        .from("deals")
        .select("id, position")
        .eq("org_id", profile.org_id)
        .eq("stage_id", targetStage)
        .eq("status", "open")
        .neq("id", deal.id)
        .order("position", { ascending: true });
      if (colErr) throw new HttpError("Erro ao mover o negócio.", 500);

      const order = (column ?? []).map((d) => d.id as string);
      const at = beforeId ? order.indexOf(beforeId) : -1;
      if (at >= 0) order.splice(at, 0, deal.id);
      else order.push(deal.id);

      const current = new Map((column ?? []).map((d) => [d.id as string, d.position as number]));
      const writes = order
        .map((id, index) => ({ id, index }))
        .filter(({ id, index }) => id === deal.id || current.get(id) !== index);

      for (const w of writes) {
        const patch =
          w.id === deal.id
            ? { ...update, stage_id: targetStage, position: w.index, updated_at: new Date().toISOString() }
            : { position: w.index };
        const { error } = await admin.from("deals").update(patch).eq("id", w.id).eq("org_id", profile.org_id);
        if (error) throw new HttpError("Erro ao mover o negócio.", 500);
      }
      return NextResponse.json({ ok: true });
    }

    if (Object.keys(update).length === 0) throw new HttpError("Nada para atualizar.", 400);
    update.updated_at = new Date().toISOString();

    const { error } = await admin
      .from("deals")
      .update(update)
      .eq("id", deal.id)
      .eq("org_id", profile.org_id);
    if (error) throw new HttpError("Erro ao atualizar o negócio.", 500);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
