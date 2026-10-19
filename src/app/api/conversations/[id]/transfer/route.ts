import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import {
  conversationPayload,
  loadAccessibleConversation,
  recordTransfer,
} from "@/lib/conversations-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, user, profile } = await requireProfile();
    const conv = await loadAccessibleConversation(supabase, params.id);

    // Gestor, atendente atual, ou qualquer um com acesso se não há responsável.
    const isGestor = profile.role === "gestor";
    if (!isGestor && conv.assigned_to && conv.assigned_to !== user.id) {
      throw new HttpError("Só o atendente atual ou o gestor pode transferir esta conversa.", 403);
    }

    const body = await req.json().catch(() => ({}));
    const hasProfile = Object.prototype.hasOwnProperty.call(body, "to_profile");
    const hasSector = Object.prototype.hasOwnProperty.call(body, "to_sector");
    if (!hasProfile && !hasSector) throw new HttpError("Escolha uma pessoa ou um setor.", 400);

    const admin = createAdminClient();
    let toProfile = conv.assigned_to;
    let toSector = conv.sector_id;

    if (hasProfile) {
      if (body.to_profile === null) {
        toProfile = null;
      } else if (isUuid(body.to_profile)) {
        const { data } = await admin
          .from("profiles")
          .select("id")
          .eq("id", body.to_profile)
          .eq("org_id", conv.org_id)
          .eq("active", true)
          .maybeSingle();
        if (!data) throw new HttpError("Essa pessoa não está ativa nesta organização.", 400);
        toProfile = body.to_profile;
      } else {
        throw new HttpError("Pessoa inválida.", 400);
      }
    }

    if (hasSector) {
      if (body.to_sector === null) {
        toSector = null;
      } else if (isUuid(body.to_sector)) {
        const { data } = await admin
          .from("sectors")
          .select("id")
          .eq("id", body.to_sector)
          .eq("org_id", conv.org_id)
          .eq("archived", false)
          .maybeSingle();
        if (!data) throw new HttpError("Setor inválido ou arquivado.", 400);
        toSector = body.to_sector;
      } else {
        throw new HttpError("Setor inválido.", 400);
      }
    }

    if (toProfile === conv.assigned_to && toSector === conv.sector_id) {
      throw new HttpError("Nada mudou: escolha outra pessoa ou outro setor.", 400);
    }

    const note =
      typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    if (note && note.length > 500) throw new HttpError("A observação passa de 500 caracteres.", 400);

    const { error } = await admin
      .from("conversations")
      .update({ assigned_to: toProfile, sector_id: toSector })
      .eq("id", conv.id)
      .eq("org_id", conv.org_id);
    if (error) throw new HttpError("Erro ao transferir a conversa.", 500);

    await recordTransfer(admin, { conv, toProfile, toSector, byProfile: user.id, note });

    return NextResponse.json({ conversation: await conversationPayload(admin, conv.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
