import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidList } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Reordena as etapas ativas sem violar a unicidade (org_id, position):
// 1) move todas para posições temporárias altas; 2) grava as posições finais,
// reaproveitando exatamente o conjunto de posições que elas já ocupavam.
export async function POST(req: Request) {
  try {
    const { orgId } = await requireGestor();
    const body = await req.json().catch(() => ({}));
    const ordered = uuidList(body?.ordered_ids, "Etapas", 100);

    const admin = createAdminClient();
    const { data: all, error } = await admin
      .from("pipeline_stages")
      .select("id, position, archived")
      .eq("org_id", orgId);
    if (error) throw new HttpError("Erro ao ler as etapas.", 500);

    const active = (all ?? []).filter((s) => !s.archived);
    const activeIds = new Set(active.map((s) => s.id as string));
    if (ordered.length !== activeIds.size || !ordered.every((id) => activeIds.has(id))) {
      throw new HttpError("A lista de etapas não confere. Recarregue a página.", 400);
    }

    const finalPositions = active.map((s) => s.position as number).sort((a, b) => a - b);
    const offset = Math.max(0, ...(all ?? []).map((s) => s.position as number)) + 1000;

    for (let i = 0; i < ordered.length; i++) {
      const { error: e1 } = await admin
        .from("pipeline_stages")
        .update({ position: offset + i })
        .eq("id", ordered[i])
        .eq("org_id", orgId);
      if (e1) throw new HttpError("Erro ao reordenar as etapas.", 500);
    }
    for (let i = 0; i < ordered.length; i++) {
      const { error: e2 } = await admin
        .from("pipeline_stages")
        .update({ position: finalPositions[i] })
        .eq("id", ordered[i])
        .eq("org_id", orgId);
      if (e2) {
        console.error("[pipeline] reordenação incompleta:", e2.message);
        throw new HttpError("A reordenação não foi concluída. Recarregue a página e tente de novo.", 500);
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
