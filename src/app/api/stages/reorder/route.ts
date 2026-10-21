import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor } from "@/lib/auth";
import { loadStages } from "@/lib/stages";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { orgId } = await requireGestor();
    const body = await req.json().catch(() => ({}));
    const ids: unknown = body?.ids;
    const admin = createAdminClient();
    const current = await loadStages(admin, orgId);

    if (
      !Array.isArray(ids) ||
      ids.length !== current.length ||
      new Set(ids).size !== ids.length ||
      !current.every((s) => ids.includes(s.id))
    ) {
      throw new HttpError("Ordem inválida.", 400);
    }

    // Duas passadas: evita colisão caso exista unicidade em (org_id, position).
    for (const base of [1000, 1]) {
      const list = ids as string[];
      for (let i = 0; i < list.length; i++) {
        const { error } = await admin
          .from("conversation_stages")
          .update({ position: base + i })
          .eq("id", list[i])
          .eq("org_id", orgId);
        if (error) throw new HttpError("Erro ao reordenar.", 500);
      }
    }
    return NextResponse.json({ stages: await loadStages(admin, orgId) });
  } catch (e) {
    return errorResponse(e);
  }
}
