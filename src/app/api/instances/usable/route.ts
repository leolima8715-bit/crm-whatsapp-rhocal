import { NextResponse } from "next/server";
import { errorResponse, requireProfile } from "@/lib/auth";

export const dynamic = "force-dynamic";

type SectorRow = { id: string; name: string; color: string | null };

function one<T>(v: T | T[] | null | undefined): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

// Números conectados para iniciar conversa (RLS do client + regra: não gestor só os próprios).
export async function GET() {
  try {
    const { supabase, user, profile } = await requireProfile();
    let query = supabase
      .from("whatsapp_instances")
      .select("id, label, phone, sector:sectors(id, name, color)")
      .eq("status", "connected")
      .eq("archived", false);
    // Nova conversa: gestor usa qualquer chip; os demais, só os chips de que são donos.
    if (profile.role !== "gestor") query = query.eq("owner_id", user.id);
    const { data, error } = await query.order("label", { ascending: true });
    if (error) throw new Error("Erro ao listar números.");

    return NextResponse.json({
      instances: (data ?? []).map((i) => ({
        id: i.id as string,
        label: i.label as string,
        phone: (i.phone as string | null) ?? null,
        sector: one(i.sector as unknown as SectorRow | SectorRow[] | null),
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
