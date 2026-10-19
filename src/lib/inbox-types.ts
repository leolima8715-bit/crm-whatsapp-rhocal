export type ConversationStatus = "open" | "waiting" | "resolved";
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export type ConversationRow = {
  id: string;
  contact_id: string;
  instance_id: string;
  assigned_to: string | null;
  sector_id: string | null;
  status: ConversationStatus;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  contact: {
    name: string | null;
    push_name: string | null;
    phone: string;
    company: string | null;
    email: string | null;
    document: string | null;
    notes: string | null;
  } | null;
  instance: { label: string; phone: string | null } | null;
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

export type Assignee = { id: string; full_name: string; role: string; sector_ids: string[] };
export type SectorOption = { id: string; name: string };

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
