import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor, requireProfile } from "@/lib/auth";
import { loadStages, parseStageColor, parseStageName, STAGE_SELECT } from "@/lib/stages";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { profile } = await requireProfile();
    return NextResponse.json({ stages: await loadStages(createAdminClient(), profile.org_id) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { orgId } = await requireGestor();
    const body = await req.json().catch(() => ({}));
    const name = parseStageName(body?.name);
    const color = parseStageColor(body?.color);
    const kind = body?.kind === "done" ? "done" : "open";

    const admin = createAdminClient();
    const { data: last } = await admin
      .from("conversation_stages")
      .select("position")
      .eq("org_id", orgId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await admin
      .from("conversation_stages")
      .insert({ org_id: orgId, name, color, kind, position: (last?.position ?? 0) + 1 })
      .select(STAGE_SELECT)
      .single();
    if (error) throw new HttpError("Erro ao criar a etapa.", 500);
    return NextResponse.json({ stage: data }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
