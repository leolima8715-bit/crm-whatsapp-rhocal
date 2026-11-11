import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { supabase, profile } = await requireProfile();
    const raw = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (raw.length < 2 || raw.length > 50) throw new HttpError("Digite ao menos 2 caracteres.", 400);

    // Remove caracteres que quebrariam o filtro .or() do PostgREST.
    const q = raw.replace(/[%,()*\\]/g, " ").trim();
    const digits = raw.replace(/\D/g, "");

    // Client do usuário: a RLS de contacts limita o que cada um enxerga (gestor vê todos).
    let query = supabase
      .from("contacts")
      .select("id, name, push_name, phone")
      .eq("org_id", profile.org_id)
      .eq("archived", false)
      .limit(8);

    const filters = [`name.ilike.%${q}%`, `push_name.ilike.%${q}%`];
    if (digits.length >= 3) filters.push(`phone.ilike.%${digits}%`);
    query = query.or(filters.join(","));

    const { data, error } = await query;
    if (error) throw new HttpError("Erro na busca.", 500);
    return NextResponse.json({ contacts: data ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
}
