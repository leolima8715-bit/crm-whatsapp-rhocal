import { NextResponse } from "next/server";
import { errorResponse, getOwnedInstance, requireGestor } from "@/lib/auth";
import { evolutionFetch } from "@/lib/evolution";
import { markInternalContacts } from "@/lib/internal-contacts";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { orgId } = await requireGestor();
    const inst = await getOwnedInstance(params.id, orgId);
    const name = encodeURIComponent(inst.evolution_instance);

    const cs = await evolutionFetch(`/instance/connectionState/${name}`);
    const state: string = cs?.instance?.state ?? cs?.state ?? "";
    const status =
      state === "open" ? "connected" : state === "connecting" ? "connecting" : "disconnected";

    let phone: string | null = inst.phone ?? null;
    if (status === "connected" && !phone) {
      try {
        const list = await evolutionFetch(`/instance/fetchInstances?instanceName=${name}`);
        const first = Array.isArray(list) ? list[0] : list;
        const jid: string | undefined = first?.ownerJid ?? first?.instance?.ownerJid;
        const digits = jid?.split("@")[0]?.replace(/\D/g, "");
        if (digits) phone = digits;
      } catch {
        // telefone é opcional; tenta de novo no próximo polling
      }
    }

    const admin = createAdminClient();
    await admin
      .from("whatsapp_instances")
      .update({ status, phone })
      .eq("id", inst.id)
      .eq("org_id", orgId);

    // O telefone do chip só é conhecido ao conectar: contatos que já existiam com esse número
    // passam a ser internos (antes, is_internal só era calculado na criação do contato).
    let marked = 0;
    if (phone && phone !== (inst.phone ?? null)) {
      try {
        marked = await markInternalContacts(admin, orgId);
      } catch (e) {
        console.error("[status] remarcar contatos internos:", (e as Error).message);
      }
    }

    return NextResponse.json({ status, phone, marked_internal: marked });
  } catch (e) {
    return errorResponse(e);
  }
}
