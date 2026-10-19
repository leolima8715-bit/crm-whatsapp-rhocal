import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import {
  STATUSES,
  conversationPayload,
  loadAccessibleConversation,
} from "@/lib/conversations-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireProfile();
    const conv = await loadAccessibleConversation(supabase, params.id);

    const body = await req.json().catch(() => ({}));
    const status = body?.status;
    if (typeof status !== "string" || !(STATUSES as readonly string[]).includes(status)) {
      throw new HttpError("Status inválido.", 400);
    }

    const admin = createAdminClient();
    const { error } = await admin
      .from("conversations")
      .update({ status })
      .eq("id", conv.id)
      .eq("org_id", conv.org_id);
    if (error) throw new HttpError("Erro ao alterar o status.", 500);

    return NextResponse.json({ conversation: await conversationPayload(admin, conv.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
