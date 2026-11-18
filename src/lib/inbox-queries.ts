/* eslint-disable @typescript-eslint/no-explicit-any */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationRow, MessageRow } from "@/lib/inbox-types";

export const CONVERSATION_SELECT =
  "id, contact_id, instance_id, assigned_to, sector_id, stage_id, status, unread_count, last_message_at, last_message_preview, " +
  "contact:contacts(owner_id, is_internal, name, push_name, phone, company, email, document, notes), " +
  "instance:whatsapp_instances(label, phone, owner_id, sector_id, sector:sectors(id, name, color)), " +
  "assignee:profiles!assigned_to(full_name)";

export const MESSAGE_SELECT =
  "id, conversation_id, direction, type, body, media_mime, media_path, external_id, status, sent_by, created_at";

type Sb = SupabaseClient<any, any, any>;

export const CONVERSATIONS_PAGE_SIZE = 100;

// Filtros aplicados na query (servidor), para a lista não depender só das conversas já carregadas.
// Todos opcionais; ausente = sem filtro. As abas Minhas/Sem responsável ficam no cliente.
export type ConversationQuery = {
  status?: "open" | "waiting" | "resolved";
  audience?: "clients" | "team"; // is_internal do contato
  assignee?: string; // responsável = contacts.owner_id (mesma regra de ownerIdOf)
  instance?: string; // chip (instance_id)
  sector?: string; // id do setor do chip, ou "none" = chip sem setor
  stage?: string; // etapa do funil
  search?: string; // nome, nome do WhatsApp ou telefone do contato
};

// Consulta padrão da tela (status "Abertas", demais filtros vazios). Deve coincidir com o que
// `buildConversationQuery` devolve para os filtros padrão.
export const DEFAULT_CONVERSATION_QUERY: ConversationQuery = { status: "open" };

// Termo seguro para o filtro .or() do PostgREST (sem separadores nem curingas).
function cleanTerm(s: string) {
  return s.replace(/[,()*%\\"':]/g, " ").replace(/\s+/g, " ").trim();
}

function applyQuery(q: any, f: ConversationQuery) {
  if (f.status) q = q.eq("status", f.status);
  if (f.instance) q = q.eq("instance_id", f.instance);
  if (f.stage) q = q.eq("stage_id", f.stage);
  if (f.sector) q = f.sector === "none" ? q.is("instance.sector_id", null) : q.eq("instance.sector_id", f.sector);
  if (f.audience === "team") q = q.eq("contact.is_internal", true);
  if (f.audience === "clients") q = q.not("contact.is_internal", "is", true);
  if (f.assignee) q = q.eq("contact.owner_id", f.assignee);
  const term = f.search ? cleanTerm(f.search) : "";
  if (term) {
    const conds = [`name.ilike.*${term}*`, `push_name.ilike.*${term}*`];
    const digits = term.replace(/\D/g, "");
    if (digits) conds.push(`phone.ilike.*${digits}*`);
    q = q.or(conds.join(","), { referencedTable: "contact" });
  }
  return q;
}

// Filtros em tabelas embutidas só excluem a conversa com o join "inner".
function selectFor(f?: ConversationQuery) {
  if (!f) return CONVERSATION_SELECT;
  const contactInner = !!(f.audience || f.assignee || (f.search && cleanTerm(f.search)));
  const instanceInner = !!f.sector;
  return CONVERSATION_SELECT.replace("contact:contacts(", contactInner ? "contact:contacts!inner(" : "contact:contacts(").replace(
    "instance:whatsapp_instances(",
    instanceInner ? "instance:whatsapp_instances!inner(" : "instance:whatsapp_instances("
  );
}

async function runConversations(supabase: Sb, limit: number, offset: number, filters?: ConversationQuery) {
  let q = supabase.from("conversations").select(selectFor(filters));
  if (filters) q = applyQuery(q, filters);
  return q
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .order("id", { ascending: false })
    .range(offset, offset + limit - 1);
}

// Funciona com o client do servidor e do navegador (ambos respeitam a RLS do usuário).
// `offset` pagina na mesma ordem da lista (last_message_at desc); o id desempata para a página
// seguinte não repetir nem pular conversas com o mesmo horário. Erro vira lista vazia.
export async function fetchConversations(
  supabase: Sb,
  limit = CONVERSATIONS_PAGE_SIZE,
  offset = 0,
  filters?: ConversationQuery
): Promise<ConversationRow[]> {
  const { data } = await runConversations(supabase, limit, offset, filters);
  return (data ?? []) as unknown as ConversationRow[];
}

// Igual, mas lança em caso de erro (para a lista distinguir "vazio" de "falhou").
export async function fetchConversationsChecked(
  supabase: Sb,
  limit: number,
  offset: number,
  filters?: ConversationQuery
): Promise<ConversationRow[]> {
  const { data, error } = await runConversations(supabase, limit, offset, filters);
  if (error) throw new Error(error.message);
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

export const MESSAGES_PAGE_SIZE = 50;

export type MessagesPage = { rows: MessageRow[]; hasMore: boolean };

// Página de mensagens (as mais recentes, ou as anteriores a `before`), devolvida em
// ordem cronológica. Ordem no banco: created_at desc, id desc (id desempata).
// Cursor `before` = (created_at, id) da mensagem mais antiga já carregada.
// Busca limit+1 para saber se existem mais mensagens antigas.
export async function fetchMessages(
  supabase: Sb,
  conversationId: string,
  opts: { limit?: number; before?: { created_at: string; id: string } } = {}
): Promise<MessagesPage> {
  const limit = opts.limit ?? MESSAGES_PAGE_SIZE;
  let q = supabase
    .from("messages")
    .select(MESSAGE_SELECT)
    .eq("conversation_id", conversationId);
  if (opts.before) {
    const { created_at, id } = opts.before;
    q = q.or(`created_at.lt."${created_at}",and(created_at.eq."${created_at}",id.lt.${id})`);
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(limit + 1);
  if (error) throw new Error(error.message);
  const all = (data ?? []) as unknown as MessageRow[];
  const hasMore = all.length > limit;
  return { rows: all.slice(0, limit).reverse(), hasMore };
}
