"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchConversation, fetchConversations } from "@/lib/inbox-queries";
import { displayName } from "@/lib/format";
import type { Assignee, ConversationRow, SectorOption } from "@/lib/inbox-types";
import ConversationList, { type Filters } from "./ConversationList";
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
  currentRole,
}: {
  initialConversations: ConversationRow[];
  currentUserId: string;
  currentRole: string;
}) {
  const isGestor = currentRole === "gestor";
  const supabase = useMemo(() => createClient(), []);
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialConversations[0]?.id ?? null
  );
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState<Filters>({
    tab: "all",
    status: "open",
    assignee: "",
    instance: "",
  });
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [sectors, setSectors] = useState<SectorOption[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const selectedRef = useRef(selectedId);
  selectedRef.current = selectedId;
  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const readInFlight = useRef(new Set<string>());

  // Pessoas e setores para os seletores (transferência e filtros).
  useEffect(() => {
    fetch("/api/assignees")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setAssignees(d.assignees ?? []);
        setSectors(d.sectors ?? []);
      })
      .catch(() => {});
  }, []);

  // Mensagem de aviso some sozinha.
  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 8000);
    return () => clearTimeout(t);
  }, [notice]);

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
    setNotice(null);
    const c = conversationsRef.current.find((x) => x.id === id);
    if (c && c.unread_count > 0) markRead(id);
  }

  // Relê a conversa com a sessão do usuário (RLS): se sumiu, ele perdeu o acesso.
  const refreshConversation = useCallback(
    async (id: string, movedTo?: string) => {
      const fresh = await fetchConversation(supabase, id);
      if (!fresh) {
        setConversations((prev) => prev.filter((c) => c.id !== id));
        if (selectedRef.current === id) {
          setSelectedId(null);
          setNotice(
            movedTo ? `Conversa transferida para ${movedTo}` : "Você não tem mais acesso a esta conversa."
          );
        }
        return;
      }
      setConversations((prev) =>
        sortConversations(
          prev.some((c) => c.id === id)
            ? prev.map((c) => (c.id === id ? { ...fresh, unread_count: c.unread_count } : c))
            : [...prev, fresh]
        )
      );
    },
    [supabase]
  );

  const handleContactSaved = useCallback(
    (contactId: string, fields: Partial<NonNullable<ConversationRow["contact"]>>) => {
      setConversations((prev) =>
        prev.map((c) =>
          c.contact_id === contactId && c.contact ? { ...c, contact: { ...c.contact, ...fields } } : c
        )
      );
    },
    []
  );

  // Tempo real: conversas (preview, horário, não lidas, novas e transferidas para mim).
  useEffect(() => {
    let subscribedBefore = false;

    const refetchAll = async () => {
      const fresh = await fetchConversations(supabase, 100);
      setConversations(sortConversations(fresh));
    };

    const upsertFromEvent = async (row: Partial<ConversationRow> & { id: string }) => {
      const existing = conversationsRef.current.find((c) => c.id === row.id);

      // Conversa nova ou que passou a ficar visível para mim (ex.: transferida): busca tudo.
      if (!existing || (row.assigned_to !== undefined && row.assigned_to !== existing.assigned_to)) {
        const full = await fetchConversation(supabase, row.id);
        if (!full) {
          if (existing) setConversations((prev) => prev.filter((c) => c.id !== row.id));
          return;
        }
        setConversations((prev) =>
          sortConversations([...prev.filter((c) => c.id !== full.id), full])
        );
        if (full.id === selectedRef.current && full.unread_count > 0) markRead(full.id);
        return;
      }

      const merged: ConversationRow = {
        ...existing,
        status: row.status ?? existing.status,
        sector_id: row.sector_id !== undefined ? row.sector_id : existing.sector_id,
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

  // Filtros: status + atendente + número definem a base; a aba e a busca refinam.
  const base = useMemo(
    () =>
      conversations.filter(
        (c) =>
          (filters.status === "all" || c.status === filters.status) &&
          (!isGestor || !filters.assignee || c.assigned_to === filters.assignee) &&
          (!isGestor || !filters.instance || c.instance_id === filters.instance)
      ),
    [conversations, filters, isGestor]
  );

  const counts = useMemo(() => {
    const mine = base.filter((c) => c.assigned_to === currentUserId);
    return {
      all: base.length,
      mine: mine.length,
      mineUnread: mine.filter((c) => c.unread_count > 0).length,
      unassigned: base.filter((c) => !c.assigned_to).length,
    };
  }, [base, currentUserId]);

  const filtered = useMemo(() => {
    const byTab = base.filter((c) =>
      filters.tab === "mine"
        ? c.assigned_to === currentUserId
        : filters.tab === "unassigned"
          ? !c.assigned_to
          : true
    );
    const term = search.trim().toLowerCase();
    if (!term) return byTab;
    const digits = term.replace(/\D/g, "");
    return byTab.filter((c) => {
      const name = displayName(c.contact).toLowerCase();
      const phone = c.contact?.phone ?? "";
      return name.includes(term) || (digits.length > 0 && phone.includes(digits));
    });
  }, [base, filters.tab, search, currentUserId]);

  const instances = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations) {
      if (c.instance) map.set(c.instance_id, c.instance.label);
    }
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) =>
      a.label.localeCompare(b.label)
    );
  }, [conversations]);

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
        filters={filters}
        onFilters={setFilters}
        counts={counts}
        isGestor={isGestor}
        assignees={assignees}
        instances={instances}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {notice && (
          <p className="border-b border-cyber-cyan/40 bg-cyber-cyan/10 px-5 py-2 text-sm text-cyber-cyan">
            {notice}
          </p>
        )}
        <ChatWindow
          key={selectedId ?? "none"}
          conversation={selected}
          currentUserId={currentUserId}
          isGestor={isGestor}
          assignees={assignees}
          sectors={sectors}
          onChanged={refreshConversation}
        />
      </div>
      <ContactPanel conversation={selected} sectors={sectors} onContactSaved={handleContactSaved} />
    </div>
  );
}
