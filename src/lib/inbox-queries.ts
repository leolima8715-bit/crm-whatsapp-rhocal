/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationRow, MessageRow } from "@/lib/inbox-types";

export const CONVERSATION_SELECT =
  "id, contact_id, instance_id, assigned_to, status, unread_count, last_message_at, last_message_preview, " +
  "contact:contacts(name, push_name, phone, company), " +
  "instance:whatsapp_instances(label, phone), " +
  "assignee:profiles!assigned_to(full_name)";

export const MESSAGE_SELECT =
  "id, conversation_id, direction, type, body, media_mime, external_id, status, sent_by, created_at";

type Sb = SupabaseClient<any, any, any>;

// Funciona com o client do servidor e do navegador (ambos respeitam a RLS do usuário).
export async function fetchConversations(supabase: Sb, limit = 100): Promise<ConversationRow[]> {
  const { data } = await supabase
    .from("conversations")
    .select(CONVERSATION_SELECT)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(limit);
  return (data ?? []) as unknown as ConversationRow[];
}

export async function fetchConversation(supabase: Sb, id: string): Promise<ConversationRow | null> {
  const { data } = await supabase
    .from("conversations")
    .select(CONVERSATION_SELECT)
    .eq("id", id)
    .maybeSingle();
  return (data ?? null) as unknown as ConversationRow | null;
}

export async function fetchMessages(
  supabase: Sb,
  conversationId: string,
  limit = 200
): Promise<MessageRow[]> {
  const { data } = await supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data ?? []) as unknown as MessageRow[]).reverse();
}
