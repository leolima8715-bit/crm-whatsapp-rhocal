import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import {
  conversationPayload,
  loadAccessibleConversation,
  recordTransfer,
} from "@/lib/conversations-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, user } = await requireProfile();
    const conv = await loadAccessibleConversation(supabase, params.id);

    if (conv.assigned_to) {
      throw new HttpError("Esta conversa já tem um responsável.", 409);
    }

    const admin = createAdminClient();
    // O filtro is(null) evita que duas pessoas assumam ao mesmo tempo.
    const { data: updated, error } = await admin
      .from("conversations")
      .update({ assigned_to: user.id })
      .eq("id", conv.id)
      .eq("org_id", conv.org_id)
      .is("assigned_to", null)
      .select("id");
    if (error) throw new HttpError("Erro ao assumir a conversa.", 500);
    if (!updated || updated.length === 0) {
      throw new HttpError("Outra pessoa acabou de assumir esta conversa.", 409);
    }

    await recordTransfer(admin, {
      conv,
      toProfile: user.id,
      toSector: conv.sector_id,
      byProfile: user.id,
      note: null,
    });

    return NextResponse.json({ conversation: await conversationPayload(admin, conv.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
