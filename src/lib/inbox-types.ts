export type ConversationStatus = "open" | "waiting" | "resolved";
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export type ConversationRow = {
  id: string;
  contact_id: string;
  instance_id: string;
  assigned_to: string | null;
  sector_id: string | null;
  stage_id: string | null;
  status: ConversationStatus;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  contact: {
    owner_id: string | null;
    name: string | null;
    push_name: string | null;
    phone: string;
    company: string | null;
    email: string | null;
    document: string | null;
    notes: string | null;
  } | null;
  instance: {
    label: string;
    phone: string | null;
    sector_id: string | null;
    sector: { id: string; name: string; color: string | null } | null;
  } | null;
  assignee: { full_name: string } | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  direction: "in" | "out";
  type: string;
  body: string | null;
  media_mime: string | null;
  media_path: string | null;
  external_id: string | null;
  status: MessageStatus;
  sent_by: string | null;
  created_at: string;
  // Apenas no navegador (mensagens otimistas)
  local_url?: string | null;
  local_name?: string | null;
};

// Responsável = dono do CONTATO (contacts.owner_id); assigned_to é só o espelho.
export function ownerIdOf(c: Pick<ConversationRow, "contact" | "assigned_to">): string | null {
  return c.contact && c.contact.owner_id !== undefined ? c.contact.owner_id : c.assigned_to;
}

export function ownerNameOf(
  c: Pick<ConversationRow, "contact" | "assigned_to" | "assignee">,
  assignees: { id: string; full_name: string }[]
): string | null {
  const id = ownerIdOf(c);
  if (!id) return null;
  return (
    assignees.find((a) => a.id === id)?.full_name ??
    (id === c.assigned_to ? (c.assignee?.full_name ?? null) : null)
  );
}

export type StageRow = {
  id: string;
  name: string;
  position: number;
  color: string;
  kind: "open" | "done";
};

export type Assignee = { id: string; full_name: string; role: string; sector_ids: string[] };
export type SectorOption = { id: string; name: string; color?: string | null };

export type TransferEntry = {
  id: string;
  created_at: string;
  note: string | null;
  by_name: string | null;
  from_name: string | null;
  to_name: string | null;
  from_sector: string | null;
  to_sector: string | null;
};

export type Tag = { id: string; name: string; color: string };
export type ContactTagsMap = Record<string, string[]>;
export type QuickReply = { id: string; shortcut: string; body: string; created_by: string };
export type NoteEntry = { id: string; body: string; created_at: string; author_name: string | null };

export type Stage = { id: string; name: string; position: number; color: string };
export type Owner = { id: string; full_name: string };
export type Deal = {
  id: string;
  contact_id: string;
  stage_id: string;
  title: string;
  value: number;
  owner_id: string;
  status: "open" | "won" | "lost";
  lost_reason: string | null;
  position: number;
  created_at: string;
  contact_name: string;
  contact_phone: string;
  owner_name: string | null;
  tag_ids: string[];
  conversation_id: string | null;
};
