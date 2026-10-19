export type ConversationStatus = "open" | "waiting" | "resolved";
export type MessageStatus = "pending" | "sent" | "delivered" | "read" | "failed";

export type ConversationRow = {
  id: string;
  contact_id: string;
  instance_id: string;
  assigned_to: string | null;
  status: ConversationStatus;
  unread_count: number;
  last_message_at: string | null;
  last_message_preview: string | null;
  contact: {
    name: string | null;
    push_name: string | null;
    phone: string;
    company: string | null;
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
  external_id: string | null;
  status: MessageStatus;
  sent_by: string | null;
  created_at: string;
};
