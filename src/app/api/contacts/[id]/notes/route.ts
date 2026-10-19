import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { assertContactAccess } from "@/lib/contacts-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { text } from "@/lib/validate";

export const dynamic = "force-dynamic";

// Notas são imutáveis (auditoria): só GET e POST.
export async function GET(_req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireProfile();
    const contact = await assertContactAccess(supabase, profile, params.id);

    const admin = createAdminClient();
    const { data: rows, error } = await admin
      .from("contact_notes")
      .select("id, body, author_id, created_at")
      .eq("contact_id", contact.id)
      .eq("org_id", contact.org_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new HttpError("Erro ao buscar as notas.", 500);

    const authorIds = Array.from(new Set((rows ?? []).map((r) => r.author_id as string)));
    const { data: authors } = authorIds.length
      ? await admin.from("profiles").select("id, full_name").in("id", authorIds)
      : { data: [] as { id: string; full_name: string }[] };
    const names = new Map((authors ?? []).map((a) => [a.id, a.full_name]));

    return NextResponse.json({
      notes: (rows ?? []).map((r) => ({
        id: r.id,
        body: r.body,
        created_at: r.created_at,
        author_name: names.get(r.author_id) ?? null,
      })),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, user, profile } = await requireProfile();
    const contact = await assertContactAccess(supabase, profile, params.id);

    const body = await req.json().catch(() => ({}));
    const noteBody = text(body?.body, "Nota", 1, 2000);

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("contact_notes")
      .insert({ org_id: contact.org_id, contact_id: contact.id, author_id: user.id, body: noteBody })
      .select("id, body, created_at")
      .single();
    if (error) throw new HttpError("Erro ao salvar a nota.", 500);

    return NextResponse.json(
      { note: { ...data, author_name: profile.full_name } },
      { status: 201 }
    );
  } catch (e) {
    return errorResponse(e);
  }
}
