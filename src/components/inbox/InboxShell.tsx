"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchConversation, fetchConversations } from "@/lib/inbox-queries";
import { displayName } from "@/lib/format";
import type { ConversationRow } from "@/lib/inbox-types";
import ConversationList from "./ConversationList";
import ChatWindow from "./ChatWindow";
import ContactPanel from "./ContactPanel";

function sortConversations(list: ConversationRow[]) {
  return [...list].sort((a, b) => {
    const ta = a.last_message_at ? Date.parse(a.last_message_at) : 0;
    const tb = b.last_message_at ? Date.parse(b.last_message_at) : 0;
    return tb - ta;
  });
}

export default function InboxShell({
  initialConversations,
  currentUserId,
}: {
  initialConversations: ConversationRow[];
  currentUserId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id ?? null
  );
  const [search, setSearch] = useState("");

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const readInFlight = useRef(new Set<string>());

  // Zera a contagem na hora (otimista) e confirma no servidor.
  const markRead = useCallback((id: string) => {
    setConversations((prev) =>
      prev.map((c) => (c.id === id && c.unread_count > 0 ? { ...c, unread_count: 0 } : c))
    );
    if (readInFlight.current.has(id)) return;
    readInFlight.current.add(id);
    fetch(`/api/conversations/${id}/read`, { method: "POST" })
      .catch(() => {})
      .finally(() => readInFlight.current.delete(id));
  }, []);

  // Marca como lida a conversa aberta no carregamento inicial.
  useEffect(() => {
    const first = initialConversations.find((c) => c.id === selectedRef.current);
    if (first && first.unread_count > 0) markRead(first.id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSelect(id: string) {
    setSelectedId(id);
    const c = conversationsRef.current.find((x) => x.id === id);
    if (c && c.unread_count > 0) markRead(id);
  }

  // Tempo real: conversas (preview, horário, não lidas, novas conversas).
  useEffect(() => {
    let subscribedBefore = false;

    const refetchAll = async () => {
      const fresh = await fetchConversations(supabase, 100);
      setConversations(sortConversations(fresh));
    };

    const upsertFromEvent = async (row: Partial<ConversationRow> & { id: string }) => {
      const existing = conversationsRef.current.find((c) => c.id === row.id);

      if (!existing || (row.assigned_to !== undefined && row.assigned_to !== existing.assigned_to)) {
        const full = await fetchConversation(supabase, row.id);
        if (!full) return;
        setConversations((prev) =>
          sortConversations([...prev.filter((c) => c.id !== full.id), full])
        );
        if (full.id === selectedRef.current && full.unread_count > 0) markRead(full.id);
        return;
      }

      const merged: ConversationRow = {
        ...existing,
        status: row.status ?? existing.status,
        unread_count: row.unread_count ?? existing.unread_count,
        last_message_at: row.last_message_at ?? existing.last_message_at,
        last_message_preview: row.last_message_preview ?? existing.last_message_preview,
      };
      setConversations((prev) =>
        sortConversations(prev.map((c) => (c.id === merged.id ? merged : c)))
      );
      // Chegou mensagem na conversa aberta: já conta como lida.
      if (merged.id === selectedRef.current && merged.unread_count > 0) markRead(merged.id);
    };

    const channel = supabase
      .channel("inbox-conversations")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "conversations" },
        (payload) => upsertFromEvent(payload.new as ConversationRow)
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations" },
        (payload) => upsertFromEvent(payload.new as ConversationRow)
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          // Ao reconectar, refaz a busca para recuperar o que foi perdido.
          if (subscribedBefore) refetchAll();
          subscribedBefore = true;
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, markRead]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return conversations;
    const digits = term.replace(/\D/g, "");
    return conversations.filter((c) => {
      const name = displayName(c.contact).toLowerCase();
      const phone = c.contact?.phone ?? "";
      return name.includes(term) || (digits.length > 0 && phone.includes(digits));
    });
  }, [search, conversations]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  return (
    <div className="flex min-h-0 flex-1">
      <ConversationList
        conversations={filtered}
        totalCount={conversations.length}
        selectedId={selectedId}
        onSelect={handleSelect}
        search={search}
        onSearch={setSearch}
      />
      <ChatWindow key={selectedId ?? "none"} conversation={selected} currentUserId={currentUserId} />
      <ContactPanel conversation={selected} />
    </div>
  );
}
