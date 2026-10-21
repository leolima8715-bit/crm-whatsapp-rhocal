import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { conversationPayload, loadAccessibleConversation } from "@/lib/conversations-server";
import { statusForStage, STAGE_SELECT, type StageRow } from "@/lib/stages";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireProfile();
    // Client do usuário: a RLS (can_access_conversation) decide se ele enxerga a conversa.
    const conv = await loadAccessibleConversation(supabase, params.id);

    const body = await req.json().catch(() => ({}));
    const stageId = body?.stage_id;
    if (!isUuid(stageId)) throw new HttpError("Etapa inválida.", 400);

    const admin = createAdminClient();
    const { data } = await admin
      .from("conversation_stages")
      .select(STAGE_SELECT)
      .eq("id", stageId)
      .eq("org_id", conv.org_id)
      .eq("archived", false)
      .maybeSingle();
    if (!data) throw new HttpError("Etapa não encontrada.", 404);
    const stage = data as StageRow;

    const { error } = await admin
      .from("conversations")
      .update({
        stage_id: stage.id,
        stage_changed_at: new Date().toISOString(),
        status: statusForStage(stage),
      })
      .eq("id", conv.id)
      .eq("org_id", conv.org_id);
    if (error) throw new HttpError("Erro ao alterar a etapa.", 500);

    return NextResponse.json({ conversation: await conversationPayload(admin, conv.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
