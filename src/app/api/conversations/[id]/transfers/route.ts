import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { loadAccessibleConversation } from "@/lib/conversations-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireProfile();
    const conv = await loadAccessibleConversation(supabase, params.id);

    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("conversation_transfers")
      .select("id, from_profile, to_profile, from_sector, to_sector, by_profile, note, created_at")
      .eq("conversation_id", conv.id)
      .eq("org_id", conv.org_id)
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new HttpError("Erro ao buscar o histórico.", 500);

    const profileIds = new Set<string>();
    const sectorIds = new Set<string>();
    for (const r of rows ?? []) {
      for (const p of [r.from_profile, r.to_profile, r.by_profile]) if (p) profileIds.add(p);
      for (const s of [r.from_sector, r.to_sector]) if (s) sectorIds.add(s);
    }

    const [profiles, sectors] = await Promise.all([
      profileIds.size
        ? admin.from("profiles").select("id, full_name").in("id", Array.from(profileIds))
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      sectorIds.size
        ? admin.from("sectors").select("id, name").in("id", Array.from(sectorIds))
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const pName = new Map((profiles.data ?? []).map((p) => [p.id, p.full_name]));
    const sName = new Map((sectors.data ?? []).map((s) => [s.id, s.name]));

    return NextResponse.json({
      transfers: (rows ?? []).map((r) => ({
        id: r.id,
        created_at: r.created_at,
        note: r.note,
        by_name: r.by_profile ? (pName.get(r.by_profile) ?? null) : null,
        from_name: r.from_profile ? (pName.get(r.from_profile) ?? null) : null,
        to_name: r.to_profile ? (pName.get(r.to_profile) ?? null) : null,
        from_sector: r.from_sector ? (sName.get(r.from_sector) ?? null) : null,
        to_sector: r.to_sector ? (sName.get(r.to_sector) ?? null) : null,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
