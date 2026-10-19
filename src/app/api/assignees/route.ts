import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { profile } = await requireProfile();
    const admin = createAdminClient();

    const [profiles, sectors] = await Promise.all([
      admin
        .from("profiles")
        .select("id, full_name, role")
        .eq("org_id", profile.org_id)
        .eq("active", true)
        .order("full_name", { ascending: true }),
      admin
        .from("sectors")
        .select("id, name")
        .eq("org_id", profile.org_id)
        .eq("archived", false)
        .order("name", { ascending: true }),
    ]);
    if (profiles.error || sectors.error) throw new HttpError("Erro ao listar atendentes.", 500);

    const ids = (profiles.data ?? []).map((p) => p.id);
    const { data: links } = ids.length
      ? await admin.from("profile_sectors").select("profile_id, sector_id").in("profile_id", ids)
      : { data: [] as { profile_id: string; sector_id: string }[] };
    const byProfile = new Map<string, string[]>();
    for (const l of links ?? []) {
      byProfile.set(l.profile_id, [...(byProfile.get(l.profile_id) ?? []), l.sector_id]);
    }

    return NextResponse.json({
      assignees: (profiles.data ?? []).map((p) => ({
        id: p.id,
        full_name: p.full_name,
        role: p.role,
        sector_ids: byProfile.get(p.id) ?? [],
      })),
      sectors: sectors.data ?? [],
    });
  } catch (e) {
    return errorResponse(e);
  }
}
