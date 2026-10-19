import { NextResponse } from "next/server";
import { errorResponse, requireProfile } from "@/lib/auth";
import { assertContactAccess } from "@/lib/contacts-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Negócios abertos do contato (quem não é gestor vê só os próprios).
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, user, profile } = await requireProfile();
    const contact = await assertContactAccess(supabase, profile, params.id);

    const admin = createAdminClient();
    let q = admin
      .from("deals")
      .select("id, title, value, stage_id")
      .eq("org_id", contact.org_id)
      .eq("contact_id", contact.id)
      .eq("status", "open");
    if (profile.role !== "gestor") q = q.eq("owner_id", user.id);
    const { data: deals } = await q;

    const stageIds = Array.from(new Set((deals ?? []).map((d) => d.stage_id as string)));
    const { data: stages } = stageIds.length
      ? await admin.from("pipeline_stages").select("id, name, color").in("id", stageIds)
      : { data: [] as { id: string; name: string; color: string }[] };
    const byId = new Map((stages ?? []).map((s) => [s.id, s]));

    return NextResponse.json({
      deals: (deals ?? []).map((d) => ({
        id: d.id,
        title: d.title,
        value: Number(d.value ?? 0),
        stage_name: byId.get(d.stage_id)?.name ?? "—",
        stage_color: byId.get(d.stage_id)?.color ?? "#00B4D8",
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
