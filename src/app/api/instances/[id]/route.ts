import { NextResponse } from "next/server";
import { errorResponse, getOwnedInstance, requireGestor } from "@/lib/auth";
import { assertActiveSector } from "@/lib/sectors";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Altera apenas o setor do número; as conversas dele herdam o novo setor.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { orgId } = await requireGestor();
    const inst = await getOwnedInstance(params.id, orgId);
    const body = await req.json().catch(() => ({}));

    const admin = createAdminClient();
    const sectorId = await assertActiveSector(admin, orgId, body?.sector_id);

    const { error } = await admin
      .from("whatsapp_instances")
      .update({ sector_id: sectorId })
      .eq("id", inst.id)
      .eq("org_id", orgId);
    if (error) throw new Error("Erro ao alterar o setor do número.");

    return NextResponse.json({ sector_id: sectorId });
  } catch (e) {
    return errorResponse(e);
  }
}
