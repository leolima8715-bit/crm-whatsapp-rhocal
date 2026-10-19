import { NextResponse } from "next/server";
import { errorResponse, getOwnedInstance, requireGestor } from "@/lib/auth";
import { evolutionFetch } from "@/lib/evolution";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { orgId } = await requireGestor();
    const inst = await getOwnedInstance(params.id, orgId);

    await evolutionFetch(`/instance/logout/${encodeURIComponent(inst.evolution_instance)}`, {
      method: "DELETE",
    });

    const admin = createAdminClient();
    await admin
      .from("whatsapp_instances")
      .update({ status: "disconnected" })
      .eq("id", inst.id)
      .eq("org_id", orgId);

    return NextResponse.json({ status: "disconnected" });
  } catch (e) {
    return errorResponse(e);
  }
}
