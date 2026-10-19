import { HttpError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";
import type { createClient } from "@/lib/supabase/server";

type Sb = ReturnType<typeof createClient>;

// Gestor acessa qualquer contato da organização; os demais precisam enxergar (RLS)
// ao menos uma conversa do contato.
export async function assertContactAccess(
  supabase: Sb,
  profile: { role: string; org_id: string },
  contactId: string
) {
  if (!isUuid(contactId)) throw new HttpError("Contato não encontrado.", 404);

  const admin = createAdminClient();
  const { data: contact } = await admin
    .from("contacts")
    .select("id, org_id, name, push_name, phone")
    .eq("id", contactId)
    .eq("org_id", profile.org_id)
    .maybeSingle();
  if (!contact) throw new HttpError("Contato não encontrado.", 404);

  if (profile.role !== "gestor") {
    const { data: conv } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", contactId)
      .limit(1);
    if (!conv?.length) throw new HttpError("Contato não encontrado.", 404);
  }

  return contact as { id: string; org_id: string; name: string | null; push_name: string | null; phone: string };
}
