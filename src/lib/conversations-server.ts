import { HttpError } from "@/lib/auth";
import { fetchConversation } from "@/lib/inbox-queries";
import { isUuid, type Admin } from "@/lib/users";
import type { createClient } from "@/lib/supabase/server";

export const STATUSES = ["open", "waiting", "resolved"] as const;

export type AccessibleConversation = {
  id: string;
  org_id: string;
  assigned_to: string | null;
  sector_id: string | null;
  status: string;
  contact_id: string;
  instance_id: string;
};

// Lê com o client do USUÁRIO: a RLS decide se ele enxerga a conversa.
export async function loadAccessibleConversation(
  supabase: ReturnType<typeof createClient>,
  id: string
): Promise<AccessibleConversation> {
  if (!isUuid(id)) throw new HttpError("Conversa não encontrada.", 404);
  const { data } = await supabase
    .from("conversations")
    .select("id, org_id, assigned_to, sector_id, status, contact_id, instance_id")
    .eq("id", id)
    .maybeSingle();
  if (!data) throw new HttpError("Conversa não encontrada.", 404);
  return data as AccessibleConversation;
}

export async function recordTransfer(
  admin: Admin,
  args: {
    conv: AccessibleConversation;
    toProfile: string | null;
    toSector: string | null;
    byProfile: string;
    note: string | null;
  }
) {
  const { error } = await admin.from("conversation_transfers").insert({
    org_id: args.conv.org_id,
    conversation_id: args.conv.id,
    from_profile: args.conv.assigned_to,
    to_profile: args.toProfile,
    from_sector: args.conv.sector_id,
    to_sector: args.toSector,
    by_profile: args.byProfile,
    note: args.note,
  });
  if (error) {
    console.error("[transfer] histórico não gravado:", error.message);
    throw new HttpError(
      "A conversa foi atualizada, mas o histórico da transferência não pôde ser salvo.",
      500
    );
  }
}

export async function conversationPayload(admin: Admin, id: string) {
  return fetchConversation(admin, id);
}

// Responsável atual do contato da conversa (fonte da verdade: contacts.owner_id).
export async function loadContactOwner(admin: Admin, conv: AccessibleConversation): Promise<string | null> {
  const { data, error } = await admin
    .from("contacts")
    .select("owner_id")
    .eq("id", conv.contact_id)
    .eq("org_id", conv.org_id)
    .maybeSingle();
  if (error || !data) throw new HttpError("Contato não encontrado.", 404);
  return (data.owner_id as string | null) ?? null;
}
