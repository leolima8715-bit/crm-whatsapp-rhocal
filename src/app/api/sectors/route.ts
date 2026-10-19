import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { assertSectorNameFree, validateSectorColor, validateSectorName } from "@/lib/sectors";
import { nextPaletteColor } from "@/lib/sector-style";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { orgId } = await requireGestor();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("sectors")
      .select("id, name, color")
      .eq("org_id", orgId)
      .eq("archived", false)
      .order("name", { ascending: true });
    if (error) throw new HttpError("Erro ao listar os setores.", 500);
    return NextResponse.json({ sectors: data ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { orgId } = await requireGestor();
    const body = await req.json().catch(() => ({}));
    const name = validateSectorName(body?.name);

    const admin = createAdminClient();
    await assertSectorNameFree(admin, orgId, name);

    // Sem cor informada: a primeira da paleta que ainda não está em uso.
    let color: string;
    if (body?.color !== undefined) {
      color = validateSectorColor(body.color);
    } else {
      const { data: existing } = await admin
        .from("sectors")
        .select("color")
        .eq("org_id", orgId)
        .eq("archived", false);
      color = nextPaletteColor((existing ?? []).map((s) => s.color));
    }

    const { data, error } = await admin
      .from("sectors")
      .insert({ org_id: orgId, name, color })
      .select("id, name, color")
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new HttpError("Já existe um setor com este nome.", 409);
      }
      throw new HttpError("Erro ao criar o setor.", 500);
    }

    return NextResponse.json({ sector: data }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
