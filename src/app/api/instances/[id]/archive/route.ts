import { NextResponse } from "next/server";
import { errorResponse, getOwnedInstance, requireGestor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { orgId } = await requireGestor();
    const inst = await getOwnedInstance(params.id, orgId);

    const admin = createAdminClient();
    const { error } = await admin
      .from("whatsapp_instances")
      .update({ archived: true })
      .eq("id", inst.id)
      .eq("org_id", orgId);
    if (error) throw new Error("Erro ao arquivar o número.");

    return NextResponse.json({ archived: true });
  } catch (e) {
    return errorResponse(e);
  }
}
