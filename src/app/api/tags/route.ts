import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor, requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { hexColor, text } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { profile } = await requireProfile();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("tags")
      .select("id, name, color")
      .eq("org_id", profile.org_id)
      .order("name", { ascending: true });
    if (error) throw new HttpError("Erro ao listar as tags.", 500);
    return NextResponse.json({ tags: data ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { orgId } = await requireGestor();
    const body = await req.json().catch(() => ({}));
    const name = text(body?.name, "Nome da tag", 1, 30);
    const color = hexColor(body?.color);

    const admin = createAdminClient();
    const { data: existing } = await admin.from("tags").select("id, name").eq("org_id", orgId);
    if ((existing ?? []).some((t) => t.name.trim().toLowerCase() === name.toLowerCase())) {
      throw new HttpError("Já existe uma tag com este nome.", 409);
    }

    const { data, error } = await admin
      .from("tags")
      .insert({ org_id: orgId, name, color })
      .select("id, name, color")
      .single();
    if (error) {
      if (error.code === "23505") throw new HttpError("Já existe uma tag com este nome.", 409);
      throw new HttpError("Erro ao criar a tag.", 500);
    }
    return NextResponse.json({ tag: data }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
