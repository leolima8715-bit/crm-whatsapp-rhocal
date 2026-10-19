import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase } = await requireUser();

    // Select com a sessão do usuário: a RLS decide se ele enxerga a conversa.
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("id", params.id)
      .maybeSingle();
    if (!conv) throw new HttpError("Conversa não encontrada.", 404);

    const admin = createAdminClient();
    const { error } = await admin
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", conv.id);
    if (error) throw new HttpError("Erro ao marcar como lida.", 500);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
