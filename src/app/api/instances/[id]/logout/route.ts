import { NextResponse } from "next/server";
import { errorResponse, getOwnedInstance, requireGestor } from "@/lib/auth";
import { evolutionFetch } from "@/lib/evolution";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Estados do Evolution em que o chip já não está conectado.
const NOT_CONNECTED = new Set(["close", "closed", "connecting", "refused"]);

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { orgId } = await requireGestor();
    const inst = await getOwnedInstance(params.id, orgId);
    const name = encodeURIComponent(inst.evolution_instance);

    try {
      await evolutionFetch(`/instance/logout/${name}`, { method: "DELETE" });
    } catch (e) {
      // O Evolution recusa o logout (400) quando a instância já está desconectada.
      // Registra o erro (sem chaves) e confere o estado real antes de decidir.
      console.error(
        `[instances/logout] ${inst.evolution_instance}:`,
        e instanceof Error ? e.message : e
      );
      let state: string | null = null;
      try {
        const st = await evolutionFetch(`/instance/connectionState/${name}`);
        state = st?.instance?.state ?? st?.state ?? null;
      } catch (e2) {
        console.error(
          `[instances/logout] connectionState ${inst.evolution_instance}:`,
          e2 instanceof Error ? e2.message : e2
        );
      }
      if (!state || !NOT_CONNECTED.has(String(state).toLowerCase())) throw e;
      // Já estava desconectada no Evolution: segue e grava 'disconnected' no banco.
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("whatsapp_instances")
      .update({ status: "disconnected" })
      .eq("id", inst.id)
      .eq("org_id", orgId);
    if (error) {
      console.error("[instances/logout] update:", error.message);
      return NextResponse.json({ error: "Não foi possível atualizar o status do número." }, { status: 500 });
    }

    return NextResponse.json({ status: "disconnected" });
  } catch (e) {
    return errorResponse(e);
  }
}
