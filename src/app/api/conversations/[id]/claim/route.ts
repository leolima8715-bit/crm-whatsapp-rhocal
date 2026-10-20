import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import {
  conversationPayload,
  loadAccessibleConversation,
  loadContactOwner,
  recordTransfer,
} from "@/lib/conversations-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// Assume o CONTATO da conversa (vale para todas as conversas dele).
export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, user, profile } = await requireProfile();
    const conv = await loadAccessibleConversation(supabase, params.id);

    const admin = createAdminClient();
    const owner = await loadContactOwner(admin, conv);
    const isGestor = profile.role === "gestor";

    if (owner === user.id) throw new HttpError("Você já é o responsável por este contato.", 409);
    if (owner && !isGestor) throw new HttpError("Este contato já tem um responsável.", 409);

    let q = admin
      .from("contacts")
      .update({ owner_id: user.id })
      .eq("id", conv.contact_id)
      .eq("org_id", conv.org_id);
    // O filtro evita que duas pessoas assumam ao mesmo tempo.
    q = owner ? q.eq("owner_id", owner) : q.is("owner_id", null);
    const { data: updated, error } = await q.select("id");
    if (error) throw new HttpError("Erro ao assumir o contato.", 500);
    if (!updated || updated.length === 0) {
      throw new HttpError("Outra pessoa acabou de assumir este contato.", 409);
    }

    await recordTransfer(admin, {
      conv: { ...conv, assigned_to: owner },
      toProfile: user.id,
      toSector: conv.sector_id,
      byProfile: user.id,
      note: "Contato assumido (vale para todas as conversas).",
    });

    return NextResponse.json({ conversation: await conversationPayload(admin, conv.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
