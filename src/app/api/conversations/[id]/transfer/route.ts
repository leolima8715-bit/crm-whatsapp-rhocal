import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import {
  conversationPayload,
  loadAccessibleConversation,
  loadContactOwner,
  recordTransfer,
} from "@/lib/conversations-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";

export const dynamic = "force-dynamic";

// O responsável é do CONTATO: a transferência vale para todas as conversas dele
// (os triggers do banco sincronizam conversations.assigned_to).
export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, user, profile } = await requireProfile();
    const conv = await loadAccessibleConversation(supabase, params.id);

    const admin = createAdminClient();
    const owner = await loadContactOwner(admin, conv);

    // Gestor transfere qualquer contato; os demais só os que são seus.
    const isGestor = profile.role === "gestor";
    if (!isGestor && owner !== user.id) {
      throw new HttpError("Só o responsável pelo contato ou o gestor pode transferi-lo.", 403);
    }

    const body = await req.json().catch(() => ({}));
    if (!Object.prototype.hasOwnProperty.call(body, "to_profile")) {
      throw new HttpError("Escolha uma pessoa.", 400);
    }

    let toProfile: string | null;
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

    if (toProfile === owner) {
      throw new HttpError("Nada mudou: escolha outra pessoa.", 400);
    }

    const userNote = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    if (userNote && userNote.length > 500) {
      throw new HttpError("A observação passa de 500 caracteres.", 400);
    }

    const { error } = await admin
      .from("contacts")
      .update({ owner_id: toProfile })
      .eq("id", conv.contact_id)
      .eq("org_id", conv.org_id);
    if (error) throw new HttpError("Erro ao transferir o contato.", 500);

    await recordTransfer(admin, {
      conv: { ...conv, assigned_to: owner },
      toProfile,
      toSector: conv.sector_id,
      byProfile: user.id,
      note: userNote
        ? `Transferência do contato (vale para todas as conversas). ${userNote}`
        : "Transferência do contato (vale para todas as conversas).",
    });

    return NextResponse.json({ conversation: await conversationPayload(admin, conv.id) });
  } catch (e) {
    return errorResponse(e);
  }
}
