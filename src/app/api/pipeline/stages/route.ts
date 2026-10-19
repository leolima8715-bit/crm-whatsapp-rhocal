import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hexColor, text } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { orgId } = await requireGestor();
    const body = await req.json().catch(() => ({}));
    const name = text(body?.name, "Nome da etapa", 1, 40);
    const color = hexColor(body?.color);

    const admin = createAdminClient();
    // Posição única por organização (inclui arquivadas): vai para depois da maior.
    const { data: last } = await admin
      .from("pipeline_stages")
      .select("position")
      .eq("org_id", orgId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data, error } = await admin
      .from("pipeline_stages")
      .insert({ org_id: orgId, name, color, position: (last?.position ?? 0) + 1 })
      .select("id, name, position, color")
      .single();
    if (error) throw new HttpError("Erro ao criar a etapa.", 500);
    return NextResponse.json({ stage: data }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
