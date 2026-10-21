import { fetchConversations, CONVERSATION_SELECT } from "@/lib/inbox-queries";
import { loadStages, pickStages } from "@/lib/stages";
import type { ConversationRow } from "@/lib/inbox-types";
import type { createClient } from "@/lib/supabase/server";
import type { Admin } from "@/lib/users";

const MAX_ROWS = 1000;

// Conversas do funil. Sessão e papel já foram validados por quem chama.
// Gestor vê todas as da organização (admin client, sem depender de joins sob RLS); os demais usam o
// client do usuário, onde a RLS (can_access_conversation) é a regra de acesso.
export async function loadFunilData(
  admin: Admin,
  userClient: ReturnType<typeof createClient>,
  profile: { role: string; org_id: string }
) {
  const stages = await loadStages(admin, profile.org_id);

  let conversations: ConversationRow[];
  if (profile.role === "gestor") {
    const { data, error } = await admin
      .from("conversations")
      .select(CONVERSATION_SELECT)
      .eq("org_id", profile.org_id)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(MAX_ROWS);
    if (error) throw new Error(error.message);
    conversations = (data ?? []) as unknown as ConversationRow[];
  } else {
    conversations = await fetchConversations(userClient, MAX_ROWS);
  }

  // Conversa sem etapa: grava a etapa padrão ("Novo") e já devolve com ela.
  const fallback = pickStages(stages).novo ?? stages[0] ?? null;
  const orphans = conversations.filter((c) => !c.stage_id);
  if (fallback && orphans.length > 0) {
    const { error } = await admin
      .from("conversations")
      .update({ stage_id: fallback.id, stage_changed_at: new Date().toISOString() })
      .in(
        "id",
        orphans.map((c) => c.id)
      )
      .is("stage_id", null);
    if (error) console.error("[funil] etapa padrão não gravada:", error.message);
    else for (const c of orphans) c.stage_id = fallback.id;
  }

  return { conversations, stages };
}
