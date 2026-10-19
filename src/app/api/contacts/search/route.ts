import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { supabase, profile } = await requireProfile();
    const raw = (new URL(req.url).searchParams.get("q") ?? "").trim();
    if (raw.length < 2 || raw.length > 50) throw new HttpError("Digite ao menos 2 caracteres.", 400);

    // Remove caracteres que quebrariam o filtro .or() do PostgREST.
    const q = raw.replace(/[%,()*\\]/g, " ").trim();
    const digits = raw.replace(/\D/g, "");

    const admin = createAdminClient();
    let query = admin
      .from("contacts")
      .select("id, name, push_name, phone")
      .eq("org_id", profile.org_id)
      .limit(10);

    const filters = [`name.ilike.%${q}%`, `push_name.ilike.%${q}%`];
    if (digits.length >= 3) filters.push(`phone.ilike.%${digits}%`);
    query = query.or(filters.join(","));

    // Quem não é gestor só encontra contatos de conversas que enxerga (RLS).
    if (profile.role !== "gestor") {
      const { data: visible } = await supabase.from("conversations").select("contact_id").limit(1000);
      const ids = Array.from(new Set((visible ?? []).map((r) => r.contact_id as string)));
      if (ids.length === 0) return NextResponse.json({ contacts: [] });
      query = query.in("id", ids);
    }

    const { data, error } = await query;
    if (error) throw new HttpError("Erro na busca.", 500);
    return NextResponse.json({ contacts: data ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
}
