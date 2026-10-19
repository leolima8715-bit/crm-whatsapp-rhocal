import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const { user, profile } = await requireProfile();
    const isGestor = profile.role === "gestor";
    const url = new URL(req.url);
    const owner = url.searchParams.get("owner");
    const closed = url.searchParams.get("closed") === "1";
    if (owner && !isUuid(owner)) throw new HttpError("Responsável inválido.", 400);

    const admin = createAdminClient();

    const { data: stages, error: stErr } = await admin
      .from("pipeline_stages")
      .select("id, name, position, color")
      .eq("org_id", profile.org_id)
      .eq("archived", false)
      .order("position", { ascending: true });
    if (stErr) throw new HttpError("Erro ao buscar as etapas.", 500);

    // Gestor vê tudo; os demais, só os negócios em que são owner_id.
    let q = admin
      .from("deals")
      .select("id, contact_id, stage_id, title, value, owner_id, status, lost_reason, position, created_at")
      .eq("org_id", profile.org_id)
      .order("position", { ascending: true });
    if (!closed) q = q.eq("status", "open");
    if (!isGestor) q = q.eq("owner_id", user.id);
    else if (owner) q = q.eq("owner_id", owner);
    const { data: deals, error: dErr } = await q;
    if (dErr) throw new HttpError("Erro ao buscar os negócios.", 500);

    const contactIds = Array.from(new Set((deals ?? []).map((d) => d.contact_id as string)));
    const ownerIds = Array.from(new Set((deals ?? []).map((d) => d.owner_id as string)));

    const [contacts, owners, tagLinks, convs, allTags, people] = await Promise.all([
      contactIds.length
        ? admin.from("contacts").select("id, name, push_name, phone").in("id", contactIds)
        : Promise.resolve({ data: [] as { id: string; name: string | null; push_name: string | null; phone: string }[] }),
      ownerIds.length
        ? admin.from("profiles").select("id, full_name").in("id", ownerIds)
        : Promise.resolve({ data: [] as { id: string; full_name: string }[] }),
      contactIds.length
        ? admin.from("contact_tags").select("contact_id, tag_id").in("contact_id", contactIds)
        : Promise.resolve({ data: [] as { contact_id: string; tag_id: string }[] }),
      contactIds.length
        ? admin
            .from("conversations")
            .select("id, contact_id, last_message_at")
            .eq("org_id", profile.org_id)
            .in("contact_id", contactIds)
            .order("last_message_at", { ascending: false, nullsFirst: false })
        : Promise.resolve({ data: [] as { id: string; contact_id: string }[] }),
      admin.from("tags").select("id, name, color").eq("org_id", profile.org_id),
      isGestor
        ? admin
            .from("profiles")
            .select("id, full_name")
            .eq("org_id", profile.org_id)
            .eq("active", true)
            .order("full_name", { ascending: true })
        : Promise.resolve({ data: [{ id: user.id, full_name: profile.full_name }] }),
    ]);

    const contactById = new Map((contacts.data ?? []).map((c) => [c.id, c]));
    const ownerName = new Map((owners.data ?? []).map((o) => [o.id, o.full_name]));
    const tagsByContact = new Map<string, string[]>();
    for (const l of tagLinks.data ?? []) {
      tagsByContact.set(l.contact_id, [...(tagsByContact.get(l.contact_id) ?? []), l.tag_id]);
    }
    const convByContact = new Map<string, string>();
    for (const c of convs.data ?? []) if (!convByContact.has(c.contact_id)) convByContact.set(c.contact_id, c.id);

    return NextResponse.json({
      is_gestor: isGestor,
      stages: stages ?? [],
      owners: people.data ?? [],
      tags: allTags.data ?? [],
      deals: (deals ?? []).map((d) => {
        const c = contactById.get(d.contact_id);
        return {
          ...d,
          value: Number(d.value ?? 0),
          contact_name: c?.name || c?.push_name || c?.phone || "Contato",
          contact_phone: c?.phone ?? "",
          owner_name: ownerName.get(d.owner_id) ?? null,
          tag_ids: tagsByContact.get(d.contact_id) ?? [],
          conversation_id: convByContact.get(d.contact_id) ?? null,
        };
      }),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
