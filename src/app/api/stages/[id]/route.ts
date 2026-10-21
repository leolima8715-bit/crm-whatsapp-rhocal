import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor } from "@/lib/auth";
import {
  loadStages,
  parseStageColor,
  parseStageName,
  statusForStage,
  STAGE_SELECT,
  type StageRow,
} from "@/lib/stages";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";

export const dynamic = "force-dynamic";

// Edita (nome, cor, tipo) ou arquiva (archived: true + move_to se houver conversas). Nada é apagado.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { orgId } = await requireGestor();
    if (!isUuid(params.id)) throw new HttpError("Etapa não encontrada.", 404);
    const body = await req.json().catch(() => ({}));
    const admin = createAdminClient();

    const stages = await loadStages(admin, orgId);
    const stage = stages.find((s) => s.id === params.id);
    if (!stage) throw new HttpError("Etapa não encontrada.", 404);

    const patch: Record<string, unknown> = {};
    if (body?.name !== undefined) patch.name = parseStageName(body.name);
    if (body?.color !== undefined) patch.color = parseStageColor(body.color);
    if (body?.kind !== undefined) {
      if (body.kind !== "open" && body.kind !== "done") throw new HttpError("Tipo inválido.", 400);
      patch.kind = body.kind;
    }

    const archiving = body?.archived === true;
    const newKind = (patch.kind as string | undefined) ?? stage.kind;
    const othersDone = stages.some((s) => s.id !== stage.id && s.kind === "done");
    if (stage.kind === "done" && (archiving || newKind !== "done") && !othersDone) {
      throw new HttpError("Mantenha ao menos uma etapa de conclusão.", 400);
    }
    if (archiving && stages.length <= 1) throw new HttpError("Mantenha ao menos uma etapa.", 400);

    if (archiving) {
      const { count } = await admin
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("org_id", orgId)
        .eq("stage_id", stage.id);

      if ((count ?? 0) > 0) {
        const target = stages.find((s) => s.id === body?.move_to && s.id !== stage.id);
        if (!target) throw new HttpError("Escolha para qual etapa mover as conversas.", 400);
        const { error } = await admin
          .from("conversations")
          .update({
            stage_id: target.id,
            stage_changed_at: new Date().toISOString(),
            status: statusForStage(target),
          })
          .eq("org_id", orgId)
          .eq("stage_id", stage.id);
        if (error) throw new HttpError("Erro ao mover as conversas.", 500);
      }
      patch.archived = true;
    }

    if (Object.keys(patch).length === 0) throw new HttpError("Nada para alterar.", 400);
    const { data, error } = await admin
      .from("conversation_stages")
      .update(patch)
      .eq("id", stage.id)
      .eq("org_id", orgId)
      .select(STAGE_SELECT)
      .single();
    if (error) throw new HttpError("Erro ao salvar a etapa.", 500);

    // Mudou o tipo: alinha o status das conversas que já estão nela.
    if (!archiving && patch.kind !== undefined) {
      await admin
        .from("conversations")
        .update({ status: statusForStage(data as StageRow) })
        .eq("org_id", orgId)
        .eq("stage_id", stage.id);
    }

    return NextResponse.json({ stage: data });
  } catch (e) {
    return errorResponse(e);
  }
}
