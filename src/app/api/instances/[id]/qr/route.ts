import { NextResponse } from "next/server";
import { errorResponse, getOwnedInstance, requireGestor } from "@/lib/auth";
import { evolutionFetch } from "@/lib/evolution";
import { extractQr } from "@/lib/qr";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { orgId } = await requireGestor();
    const inst = await getOwnedInstance(params.id, orgId);
    const data = await evolutionFetch(
      `/instance/connect/${encodeURIComponent(inst.evolution_instance)}`
    );
    const { qr, pairingCode } = extractQr(data);
    return NextResponse.json({ qr, ...(pairingCode ? { pairingCode } : {}) });
  } catch (e) {
    return errorResponse(e);
  }
}
