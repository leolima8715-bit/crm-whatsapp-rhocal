import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { assertContactAccess } from "@/lib/contacts-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uuidList } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Substitui os vínculos do contato. Só contact_tags muda; as tags nunca são apagadas.
export async function PUT(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireProfile();
    const contact = await assertContactAccess(supabase, profile, params.id);

    const body = await req.json().catch(() => ({}));
    const wanted = uuidList(body?.tag_ids, "Tags", 50);

    const admin = createAdminClient();
    if (wanted.length > 0) {
      const { data: valid } = await admin
        .from("tags")
        .select("id")
        .eq("org_id", contact.org_id)
        .in("id", wanted);
      if ((valid ?? []).length !== wanted.length) throw new HttpError("Alguma tag não existe.", 400);
    }

    const { data: current, error } = await admin
      .from("contact_tags")
      .select("tag_id")
      .eq("contact_id", contact.id);
    if (error) throw new HttpError("Erro ao ler as tags do contato.", 500);

    const have = new Set((current ?? []).map((r) => r.tag_id as string));
    const want = new Set(wanted);
    const toAdd = wanted.filter((id) => !have.has(id));
    const toRemove = Array.from(have).filter((id) => !want.has(id));

    if (toAdd.length > 0) {
      const { error: insErr } = await admin
        .from("contact_tags")
        .insert(toAdd.map((tag_id) => ({ contact_id: contact.id, tag_id })));
      if (insErr) throw new HttpError("Erro ao adicionar tags.", 500);
    }
    if (toRemove.length > 0) {
      const { error: delErr } = await admin
        .from("contact_tags")
        .delete()
        .eq("contact_id", contact.id)
        .in("tag_id", toRemove);
      if (delErr) throw new HttpError("Erro ao remover tags.", 500);
    }

    return NextResponse.json({ tag_ids: wanted });
  } catch (e) {
    return errorResponse(e);
  }
}
