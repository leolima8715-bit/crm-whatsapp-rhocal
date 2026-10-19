"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCheck, Clock, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchMessages } from "@/lib/inbox-queries";
import { displayName, formatTime, initials, typeLabel } from "@/lib/format";
import type { ConversationRow, MessageRow } from "@/lib/inbox-types";

const statusLabel = {
  open: "Aberta",
  waiting: "Aguardando",
  resolved: "Resolvida",
} as const;

const isTemp = (m: MessageRow) => m.id.startsWith("tmp-");

// Insere ou atualiza sem duplicar (por id, por external_id e por mensagem otimista).
function mergeMessage(list: MessageRow[], msg: MessageRow): MessageRow[] {
  let idx = list.findIndex((m) => m.id === msg.id);
  if (idx < 0 && msg.external_id) {
    idx = list.findIndex((m) => m.external_id && m.external_id === msg.external_id);
  }
  if (idx < 0 && msg.direction === "out") {
    idx = list.findIndex(
      (m) => isTemp(m) && m.status === "pending" && m.body === msg.body
    );
  }
  if (idx >= 0) {
    const next = [...list];
    next[idx] = { ...next[idx], ...msg };
    return next;
  }
  return [...list, msg].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
}

function StatusIcon({ status }: { status: MessageRow["status"] }) {
  switch (status) {
    case "pending":
      return <Clock size={12} aria-label="Enviando" />;
    case "sent":
      return <Check size={12} aria-label="Enviada" />;
    case "delivered":
      return <CheckCheck size={12} aria-label="Entregue" />;
    case "read":
      return <CheckCheck size={12} className="text-cyber-bg" aria-label="Lida" />;
    default:
      return null;
  }
}

export default function ChatWindow({
  conversation,
  currentUserId,
}: {
  conversation: ConversationRow | null;
  currentUserId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const conversationId = conversation?.id ?? null;

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const forceScroll = useRef(true);

  const load = useCallback(async () => {
    if (!conversationId) return;
    try {
      const rows = await fetchMessages(supabase, conversationId, 200);
      // Mantém mensagens otimistas ainda não confirmadas.
      setMessages((prev) => {
        let merged = rows;
        for (const t of prev.filter(isTemp)) merged = mergeMessage(merged, t);
        return merged;
      });
      setLoadError(null);
    } catch {
      setLoadError("Não foi possível carregar as mensagens.");
    } finally {
      setLoading(false);
    }
  }, [supabase, conversationId]);

  // Carga inicial + tempo real das mensagens desta conversa.
  useEffect(() => {
    if (!conversationId) return;
    setLoading(true);
    forceScroll.current = true;
    load();

    let subscribedBefore = false;
    const handler = (payload: { new: unknown }) => {
      const msg = payload.new as MessageRow;
      setMessages((prev) => mergeMessage(prev, msg));
    };

    const channel = supabase
      .channel(`chat-${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        handler
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        handler
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          if (subscribedBefore) load();
          subscribedBefore = true;
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, conversationId, load]);

  // Rola para o fim ao abrir ou se o usuário já estava perto do fim.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (forceScroll.current || nearBottom.current) {
      el.scrollTop = el.scrollHeight;
      if (messages.length > 0) forceScroll.current = false;
    }
  }, [messages]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }

  async function send() {
    const value = text.trim();
    if (!value || !conversationId) return;
    if (value.length > 4096) {
      setSendError("A mensagem passa de 4096 caracteres.");
      return;
    }

    const tempId = `tmp-${crypto.randomUUID()}`;
    const optimistic: MessageRow = {
      id: tempId,
      conversation_id: conversationId,
      direction: "out",
      type: "text",
      body: value,
      media_mime: null,
      external_id: null,
      status: "pending",
      sent_by: currentUserId,
      created_at: new Date().toISOString(),
    };

    setText("");
    setSendError(null);
    nearBottom.current = true;
    setMessages((prev) => [...prev, optimistic]);

    const settle = (real: MessageRow | null, failed: boolean) =>
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (real) return mergeMessage(withoutTemp, real);
        if (failed) return [...withoutTemp, { ...optimistic, status: "failed" as const }];
        return withoutTemp;
      });

    try {
      const res = await fetch("/api/messages/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, text: value }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSendError(data?.error ?? "Falha no envio.");
        settle((data?.message as MessageRow | null) ?? null, true);
        return;
      }
      settle(data.message as MessageRow, false);
    } catch {
      setSendError("Falha no envio. Verifique sua conexão.");
      settle(null, true);
    }
  }

  if (!conversation) {
    return (
      <section className="flex flex-1 items-center justify-center text-cyber-white/50">
        Selecione uma conversa para começar.
      </section>
    );
  }

  const name = displayName(conversation.contact);

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-cyber-line px-5 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyber-cyan/15 font-mono text-sm font-bold text-cyber-cyan">
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold">{name}</h2>
          <p className="truncate text-xs text-cyber-white/60">
            {conversation.contact?.company ?? ""}
          </p>
        </div>
        <span className="rounded-full border border-cyber-line px-3 py-1 text-xs text-cyber-amber">
          {statusLabel[conversation.status] ?? conversation.status}
        </span>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 space-y-3 overflow-y-auto px-5 py-4"
      >
        {loading && messages.length === 0 && (
          <p className="flex items-center justify-center gap-2 text-sm text-cyber-white/50">
            <Loader2 size={14} className="animate-spin" /> Carregando mensagens...
          </p>
        )}
        {loadError && <p className="text-center text-sm text-cyber-orange">{loadError}</p>}
        {!loading && !loadError && messages.length === 0 && (
          <p className="text-center text-sm text-cyber-white/50">Nenhuma mensagem ainda.</p>
        )}

        {messages.map((m) => {
          const out = m.direction === "out";
          const label = m.type !== "text" ? (typeLabel[m.type] ?? "[Mensagem]") : null;
          return (
            <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                  out ? "bg-cyber-cyan text-cyber-bg" : "bg-cyber-panel text-cyber-white"
                }`}
              >
                {label && <p className="font-mono text-xs font-bold opacity-80">{label}</p>}
                {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                <p
                  className={`mt-1 flex items-center justify-end gap-1 font-mono text-[10px] ${
                    out ? "text-cyber-bg/70" : "text-cyber-white/40"
                  }`}
                >
                  {m.status === "failed" && out ? (
                    <span className="flex items-center gap-1 font-bold text-red-700">
                      <AlertCircle size={12} /> Falha no envio
                    </span>
                  ) : (
                    <>
                      {formatTime(m.created_at)}
                      {out && <StatusIcon status={m.status} />}
                    </>
                  )}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      <footer className="border-t border-cyber-line p-3">
        {sendError && <p className="mb-2 text-xs text-cyber-orange">{sendError}</p>}
        <div className="flex items-end gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            rows={1}
            maxLength={4096}
            placeholder="Digite uma mensagem..."
            className="max-h-32 flex-1 resize-none rounded-lg border border-cyber-line bg-cyber-panel px-3 py-2 text-sm outline-none focus:border-cyber-cyan"
          />
          <button
            onClick={send}
            disabled={!text.trim()}
            className="rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Enviar
          </button>
        </div>
      </footer>
    </section>
  );
}
