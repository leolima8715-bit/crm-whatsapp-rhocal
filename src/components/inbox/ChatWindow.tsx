"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, ArrowDown, Check, CheckCheck, Clock, Loader2, Mic, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchMessages } from "@/lib/inbox-queries";
import { displayName, formatContactLabel, formatPhone, formatTime, initials } from "@/lib/format";
import { baseMime, kindFromMime, validateFileClient } from "@/lib/media";
import {
  ownerNameOf,
  type Assignee,
  type ConversationRow,
  type MessageRow,
  type QuickReply,
  type SectorOption,
  type StageRow,
} from "@/lib/inbox-types";
import { alpha, conversationSector, sectorStyle } from "@/lib/sector-style";
import AttachmentPanel from "./AttachmentPanel";
import SectorTag from "./SectorTag";
import ConversationActions from "./ConversationActions";
import MediaContent from "./MediaContent";
import TeamBadge from "./TeamBadge";
import { linkify } from "./Linkify";
import VoiceRecorder from "./VoiceRecorder";

const ACCEPT =
  "image/jpeg,image/png,image/webp,video/mp4,video/3gpp,audio/ogg,audio/mpeg,audio/mp4,audio/webm,audio/aac," +
  "application/pdf,.doc,.docx,.xls,.xlsx,.pptx,text/plain,text/csv,application/zip";

const isTemp = (m: MessageRow) => m.id.startsWith("tmp-");

// Insere ou atualiza sem duplicar (por id, por external_id e por mensagem otimista).
function mergeMessage(list: MessageRow[], msg: MessageRow): MessageRow[] {
  let idx = list.findIndex((m) => m.id === msg.id);
  if (idx < 0 && msg.external_id) {
    idx = list.findIndex((m) => m.external_id && m.external_id === msg.external_id);
  }
  if (idx < 0 && msg.direction === "out") {
    idx = list.findIndex(
      (m) => isTemp(m) && m.status === "pending" && m.type === msg.type && m.body === msg.body
    );
  }
  if (idx >= 0) {
    const next = [...list];
    next[idx] = { ...next[idx], ...msg };
    return next;
  }
  return [...list, msg].sort(compareMessages);
}

// Ordem cronológica; desempata por created_at textual (microssegundos) e por id.
function compareMessages(a: MessageRow, b: MessageRow): number {
  const d = Date.parse(a.created_at) - Date.parse(b.created_at);
  if (d !== 0) return d;
  if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
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
      return <CheckCheck size={12} className="text-read" aria-label="Lida" />;
    default:
      return null;
  }
}

// PUT com progresso direto no Storage; se falhar, tenta o uploadToSignedUrl do supabase-js.
function uploadWithProgress(
  signedUrl: string,
  file: File,
  onProgress: (pct: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("upload")));
    xhr.onerror = () => reject(new Error("upload"));
    const fd = new FormData();
    fd.append("cacheControl", "3600");
    fd.append("", file);
    xhr.send(fd);
  });
}

async function postJson(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, data };
}

export default function ChatWindow({
  conversation,
  currentUserId,
  isGestor,
  assignees,
  sectors,
  stages,
  onStageChange,
  onChanged,
  quickReplies,
  currentUserName,
  initialText = "",
}: {
  initialText?: string;
  conversation: ConversationRow | null;
  currentUserId: string;
  isGestor: boolean;
  assignees: Assignee[];
  sectors: SectorOption[];
  stages: StageRow[];
  onStageChange: (conversationId: string, stageId: string) => void;
  onChanged: (conversationId: string, movedTo?: string) => void;
  quickReplies: QuickReply[];
  currentUserName: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const conversationId = conversation?.id ?? null;

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState(initialText);
  const [sendError, setSendError] = useState<string | null>(null);

  const [pending, setPending] = useState<{ file: File; previewUrl: string | null } | null>(null);
  const [caption, setCaption] = useState("");
  const [progress, setProgress] = useState<number | null>(null);
  const [mediaBusy, setMediaBusy] = useState(false);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [canRecord, setCanRecord] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Respostas rápidas: menu ao digitar "/" no início do campo.
  const [qrIndex, setQrIndex] = useState(0);
  const [qrDismissed, setQrDismissed] = useState(false);
  const qrMatches = useMemo(() => {
    if (qrDismissed || !/^\/[a-z0-9-]*$/i.test(text)) return [];
    const typed = text.toLowerCase();
    return quickReplies.filter((r) => r.shortcut.startsWith(typed)).slice(0, 8);
  }, [text, quickReplies, qrDismissed]);

  function insertQuickReply(r: QuickReply) {
    const contactName =
      conversation?.contact?.name || conversation?.contact?.push_name || "";
    setText(
      r.body
        .replace(/\{nome\}/gi, contactName)
        .replace(/\{atendente\}/gi, currentUserName)
    );
    setQrIndex(0);
  }

  const scrollRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nearBottom = useRef(true);
  const forceScroll = useRef(true);

  // Paginação (mensagens anteriores).
  const [hasMore, setHasMore] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [olderError, setOlderError] = useState(false);
  const [reachedStart, setReachedStart] = useState(false); // só após carregar páginas anteriores
  const [showJump, setShowJump] = useState(false);
  const messagesRef = useRef<MessageRow[]>([]);
  const hasMoreRef = useRef(false);
  const loadingOlderRef = useRef(false);
  const activeConv = useRef<string | null>(null);
  const anchor = useRef<{ height: number; top: number } | null>(null);
  messagesRef.current = messages;
  hasMoreRef.current = hasMore;

  useEffect(() => {
    setCanRecord(typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia);
  }, []);

  // Libera a URL de prévia ao trocar/cancelar o anexo.
  useEffect(() => {
    const url = pending?.previewUrl;
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [pending]);

  // Carrega as 50 mais recentes. Na carga inicial substitui a lista; em recargas
  // (reconexão do Realtime) apenas mescla, preservando páginas anteriores já carregadas.
  const load = useCallback(
    async (initial: boolean) => {
      if (!conversationId) return;
      try {
        const page = await fetchMessages(supabase, conversationId);
        if (activeConv.current !== conversationId) return;
        setMessages((prev) => {
          let merged = initial ? page.rows : prev.filter((m) => !isTemp(m));
          if (!initial) for (const r of page.rows) merged = mergeMessage(merged, r);
          // Mantém mensagens otimistas ainda não confirmadas.
          for (const t of prev.filter(isTemp)) merged = mergeMessage(merged, t);
          return merged;
        });
        if (initial) setHasMore(page.hasMore);
        setLoadError(null);
      } catch {
        if (activeConv.current === conversationId) {
          setLoadError("Não foi possível carregar as mensagens.");
        }
      } finally {
        if (activeConv.current === conversationId) setLoading(false);
      }
    },
    [supabase, conversationId]
  );

  // Carrega as 50 anteriores à mais antiga já carregada, mantendo a posição de leitura.
  const loadOlder = useCallback(async () => {
    if (!conversationId || loadingOlderRef.current || !hasMoreRef.current) return;
    const oldest = messagesRef.current.find((m) => !isTemp(m));
    if (!oldest) return;
    loadingOlderRef.current = true;
    setLoadingOlder(true);
    setOlderError(false);
    try {
      const page = await fetchMessages(supabase, conversationId, {
        before: { created_at: oldest.created_at, id: oldest.id },
      });
      if (activeConv.current !== conversationId) return;
      const el = scrollRef.current;
      if (el) anchor.current = { height: el.scrollHeight, top: el.scrollTop };
      setMessages((prev) => {
        let merged = prev;
        for (const r of page.rows) merged = mergeMessage(merged, r);
        return merged;
      });
      setHasMore(page.hasMore);
      if (!page.hasMore) setReachedStart(true);
    } catch {
      if (activeConv.current === conversationId) setOlderError(true);
    } finally {
      loadingOlderRef.current = false;
      if (activeConv.current === conversationId) setLoadingOlder(false);
    }
  }, [supabase, conversationId]);

  // Carga inicial + tempo real das mensagens desta conversa.
  useEffect(() => {
    activeConv.current = conversationId;
    setMessages([]);
    setHasMore(false);
    setReachedStart(false);
    setOlderError(false);
    setShowJump(false);
    setLoadingOlder(false);
    loadingOlderRef.current = false;
    anchor.current = null;
    nearBottom.current = true;
    if (!conversationId) return;
    setLoading(true);
    forceScroll.current = true;
    load(true);

    let subscribedBefore = false;
    const handler = (payload: { new: unknown; eventType?: string }) => {
      const msg = payload.new as MessageRow;
      setMessages((prev) => {
        // Atualização de mensagem fora da janela carregada (mais antiga): ignora,
        // para não abrir um buraco na lista. Ela aparece ao carregar a página dela.
        if (
          hasMoreRef.current &&
          !prev.some((m) => m.id === msg.id || (msg.external_id && m.external_id === msg.external_id))
        ) {
          const oldest = prev.find((m) => !isTemp(m));
          if (oldest && compareMessages(msg, oldest) < 0) return prev;
        }
        return mergeMessage(prev, msg);
      });
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
          if (subscribedBefore) load(false);
          subscribedBefore = true;
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, conversationId, load]);

  // Após cada renderização da lista: (1) se acabou de entrar uma página anterior,
  // preserva a posição de leitura; (2) senão, rola ao fim ao abrir ou se o usuário já
  // estava perto do fim; (3) se a lista não enche a tela, busca mais antigas.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (anchor.current) {
      el.scrollTop = el.scrollHeight - anchor.current.height + anchor.current.top;
      anchor.current = null;
      return;
    }
    if (forceScroll.current || nearBottom.current) {
      el.scrollTop = el.scrollHeight;
      if (messages.length > 0) forceScroll.current = false;
    }
    if (messages.length > 0 && hasMore && el.scrollHeight <= el.clientHeight) loadOlder();
  }, [messages, hasMore, loadOlder]);

  // Mídias/imagens que terminam de carregar aumentam a altura do conteúdo: enquanto o
  // usuário não rolou para cima (nearBottom) ou a conversa acabou de abrir, mantém no fim.
  useEffect(() => {
    const content = contentRef.current;
    const el = scrollRef.current;
    if (!content || !el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => {
      if (anchor.current) return;
      if (forceScroll.current || nearBottom.current) el.scrollTop = el.scrollHeight;
    });
    ro.observe(content);
    return () => ro.disconnect();
  }, [conversationId]);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    nearBottom.current = near;
    setShowJump(!near);
    if (el.scrollTop < 80 && hasMoreRef.current && !olderError) loadOlder();
  }

  function jumpToLatest() {
    const el = scrollRef.current;
    if (!el) return;
    nearBottom.current = true;
    setShowJump(false);
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }

  // Troca a mensagem otimista pela real (ou marca como falha) sem duplicar balões.
  function settle(tempId: string, optimistic: MessageRow, real: MessageRow | null, failed: boolean) {
    setMessages((prev) => {
      const withoutTemp = prev.filter((m) => m.id !== tempId);
      if (real) {
        const merged = mergeMessage(withoutTemp, real);
        // Mantém a prévia local para a mídia não piscar.
        return merged.map((m) =>
          m.id === real.id ? { ...m, local_url: optimistic.local_url, local_name: optimistic.local_name } : m
        );
      }
      if (failed) return [...withoutTemp, { ...optimistic, status: "failed" as const }];
      return withoutTemp;
    });
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
      media_path: null,
      external_id: null,
      status: "pending",
      sent_by: currentUserId,
      created_at: new Date().toISOString(),
    };

    setText("");
    setSendError(null);
    nearBottom.current = true;
    setMessages((prev) => [...prev, optimistic]);

    try {
      const { ok, data } = await postJson("/api/messages/send", {
        conversation_id: conversationId,
        text: value,
      });
      if (!ok) {
        setSendError(data?.error ?? "Falha no envio.");
        settle(tempId, optimistic, (data?.message as MessageRow | null) ?? null, true);
        return;
      }
      settle(tempId, optimistic, data.message as MessageRow, false);
    } catch {
      setSendError("Falha no envio. Verifique sua conexão.");
      settle(tempId, optimistic, null, true);
    }
  }

  // ---------- mídia ----------

  function openPending(file: File) {
    const invalid = validateFileClient(file);
    if (invalid) {
      setMediaError(invalid);
      return;
    }
    const kind = kindFromMime(file.type);
    setMediaError(null);
    setCaption("");
    setProgress(null);
    setPending({
      file,
      previewUrl: kind === "image" || kind === "video" ? URL.createObjectURL(file) : null,
    });
  }

  function clearPending() {
    setPending(null);
    setCaption("");
    setProgress(null);
  }

  // Retorna true se o envio foi concluído.
  async function sendMedia(file: File, captionText: string): Promise<boolean> {
    if (!conversationId) return false;
    const invalid = validateFileClient(file);
    if (invalid) {
      setMediaError(invalid);
      return false;
    }

    const kind = kindFromMime(file.type);
    const mime = baseMime(file.type);
    const tempId = `tmp-${crypto.randomUUID()}`;
    const optimistic: MessageRow = {
      id: tempId,
      conversation_id: conversationId,
      direction: "out",
      type: kind,
      body: captionText.trim() || null,
      media_mime: mime,
      media_path: null,
      external_id: null,
      status: "pending",
      sent_by: currentUserId,
      created_at: new Date().toISOString(),
      local_url: URL.createObjectURL(file),
      local_name: file.name,
    };

    setMediaError(null);
    setMediaBusy(true);
    setProgress(0);
    nearBottom.current = true;
    setMessages((prev) => [...prev, optimistic]);

    try {
      const prep = await postJson("/api/media/upload-url", {
        conversation_id: conversationId,
        filename: file.name,
        mime,
        size: file.size,
      });
      if (!prep.ok) throw new Error(prep.data?.error ?? "Não foi possível preparar o envio.");

      try {
        await uploadWithProgress(prep.data.signedUrl, file, setProgress);
      } catch {
        // Plano B: upload do supabase-js (sem progresso detalhado).
        const { error } = await supabase.storage
          .from("wa-media")
          .uploadToSignedUrl(prep.data.path, prep.data.token, file, { contentType: mime });
        if (error) throw new Error("Falha ao enviar o arquivo. Tente novamente.");
      }
      setProgress(100);

      const sent = await postJson("/api/messages/send-media", {
        conversation_id: conversationId,
        path: prep.data.path,
        mime,
        filename: file.name,
        caption: captionText.trim(),
        kind,
      });
      if (!sent.ok) {
        setMediaError(sent.data?.error ?? "Falha no envio.");
        settle(tempId, optimistic, (sent.data?.message as MessageRow | null) ?? null, true);
        return false;
      }
      settle(tempId, optimistic, sent.data.message as MessageRow, false);
      return true;
    } catch (e) {
      setMediaError((e as Error).message || "Falha no envio. Verifique sua conexão.");
      settle(tempId, optimistic, null, true);
      return false;
    } finally {
      setMediaBusy(false);
    }
  }

  async function sendPending() {
    if (!pending) return;
    const ok = await sendMedia(pending.file, caption);
    if (ok) clearPending();
  }

  async function sendVoice(file: File) {
    setRecording(false);
    await sendMedia(file, "");
  }

  function onPaste(e: React.ClipboardEvent) {
    const file = e.clipboardData.files?.[0];
    if (file) {
      e.preventDefault();
      openPending(file);
    }
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) openPending(file);
  }

  if (!conversation) {
    return (
      <section className="flex flex-1 items-center justify-center text-secondary">
        Selecione uma conversa para começar.
      </section>
    );
  }

  const name = displayName(conversation.contact);
  const sector = conversationSector(conversation, sectors);
  const label = formatContactLabel(conversation.contact, sector, ownerNameOf(conversation, assignees));

  return (
    <section
      className="chat-bg relative flex min-h-0 min-w-0 flex-1 flex-col"
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
          setDragOver(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setDragOver(false);
      }}
      onDrop={onDrop}
    >
      {dragOver && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-accent bg-app/80 text-accent-text">
          Solte o arquivo para enviar
        </div>
      )}

      <header
        style={{
          borderTop: `8px solid ${sectorStyle(sector.color).stripe}`,
          backgroundColor: alpha(sectorStyle(sector.color).stripe, 0.18),
        }}
        className="flex shrink-0 items-center gap-3 px-5 py-3"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent/15 text-sm font-bold text-accent-text">
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 title={label} className="truncate text-sm font-bold">
              {label}
            </h2>
            <SectorTag sector={sector} size="lg" className="max-w-[50%]" />
            {conversation.contact?.is_internal && <TeamBadge size="lg" />}
          </div>
          <p className="truncate text-xs text-secondary">
            {conversation.contact ? formatPhone(conversation.contact.phone) : ""}
          </p>
        </div>
        <ConversationActions
          conversation={conversation}
          currentUserId={currentUserId}
          isGestor={isGestor}
          assignees={assignees}
          stages={stages}
          onStageChange={onStageChange}
          onChanged={onChanged}
        />
      </header>

      <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto px-5 py-4"
      >
        <div ref={contentRef} className="space-y-1.5">
        {loadingOlder && (
          <p className="flex items-center justify-center gap-2 pb-2 text-xs text-secondary">
            <Loader2 size={12} className="animate-spin" /> Carregando mensagens anteriores...
          </p>
        )}
        {olderError && !loadingOlder && (
          <p className="pb-2 text-center text-xs text-danger">
            Não foi possível carregar as anteriores.{" "}
            <button type="button" onClick={loadOlder} className="underline">
              Tentar de novo
            </button>
          </p>
        )}
        {reachedStart && !hasMore && !loadingOlder && (
          <p className="pb-2 text-center text-xs text-secondary">Início da conversa</p>
        )}
        {loading && messages.length === 0 && (
          <p className="flex items-center justify-center gap-2 text-sm text-secondary">
            <Loader2 size={14} className="animate-spin" /> Carregando mensagens...
          </p>
        )}
        {loadError && <p className="text-center text-sm text-danger">{loadError}</p>}
        {!loading && !loadError && messages.length === 0 && (
          <p className="text-center text-sm text-secondary">Nenhuma mensagem ainda.</p>
        )}

        {messages.map((m) => {
          const out = m.direction === "out";
          const isMedia = ["image", "video", "audio", "document", "sticker"].includes(m.type);
          const otherLabel: Record<string, string> = {
            location: "Localização",
            contact: "Contato",
            other: "Mensagem não suportada (abra no celular)",
          };
          return (
            <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[70%] rounded-xl px-2.5 py-1.5 text-sm text-bubble-text shadow-sm ${
                  out ? "bubble-tail-out bg-bubble-out" : "bubble-tail-in bg-bubble-in"
                }`}
              >
                {isMedia ? (
                  <MediaContent m={m} />
                ) : (
                  <>
                    {m.type !== "text" && !m.body && (
                      <p className="text-xs font-bold opacity-80">
                        {otherLabel[m.type] ?? otherLabel.other}
                      </p>
                    )}
                    {m.body && (
                      <p className="whitespace-pre-wrap break-words">
                        {m.type === "location" ? linkify(m.body) : m.body}
                      </p>
                    )}
                  </>
                )}
                <p
                  className="-mb-0.5 mt-0.5 flex items-center justify-end gap-1 text-[11px] text-secondary"
                >
                  {m.status === "failed" && out ? (
                    <span className="flex items-center gap-1 font-bold text-danger">
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
      </div>
      {showJump && (
        <button
          type="button"
          onClick={jumpToLatest}
          className="absolute bottom-3 right-5 flex items-center gap-1.5 rounded-full bg-panel px-3 py-1.5 text-xs font-bold text-accent-text shadow-lg transition hover:bg-panel-hover"
        >
          <ArrowDown size={14} /> Ir para as mais recentes
        </button>
      )}
      </div>

      <footer
        style={{ borderTop: `3px solid ${sectorStyle(sector.color).stripe}` }}
        className="shrink-0 bg-panel p-3"
      >
        {pending && (
          <AttachmentPanel
            file={pending.file}
            previewUrl={pending.previewUrl}
            caption={caption}
            onCaption={setCaption}
            progress={progress}
            busy={mediaBusy}
            error={mediaError}
            onSend={sendPending}
            onCancel={clearPending}
          />
        )}
        {!pending && mediaError && <p className="mb-2 text-xs text-danger">{mediaError}</p>}
        {sendError && <p className="mb-2 text-xs text-danger">{sendError}</p>}

        {recording ? (
          <VoiceRecorder
            onSend={sendVoice}
            onCancel={() => setRecording(false)}
            onError={(msg) => setMediaError(msg)}
          />
        ) : (
          <div className="flex items-end gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (f) openPending(f);
              }}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={mediaBusy}
              aria-label="Anexar arquivo"
              title="Anexar arquivo"
              className="rounded-lg border border-subtle p-2 text-secondary transition hover:border-accent hover:text-accent-text disabled:opacity-40"
            >
              <Paperclip size={18} />
            </button>
            <div className="relative flex-1">
              {qrMatches.length > 0 && (
                <ul
                  role="listbox"
                  className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-56 overflow-y-auto rounded-lg border border-subtle bg-panel shadow-lg"
                >
                  {qrMatches.map((r, i) => (
                    <li key={r.id} role="option" aria-selected={i === qrIndex}>
                      <button
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          insertQuickReply(r);
                        }}
                        onMouseEnter={() => setQrIndex(i)}
                        className={`flex w-full flex-col px-3 py-2 text-left text-sm ${
                          i === qrIndex ? "bg-panel-hover" : ""
                        }`}
                      >
                        <span className="text-xs text-accent-text">{r.shortcut}</span>
                        <span className="truncate text-xs text-secondary">{r.body}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <textarea
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  setQrDismissed(false);
                  setQrIndex(0);
                }}
                onPaste={onPaste}
                onKeyDown={(e) => {
                  if (qrMatches.length > 0) {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setQrIndex((i) => (i + 1) % qrMatches.length);
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setQrIndex((i) => (i - 1 + qrMatches.length) % qrMatches.length);
                      return;
                    }
                    if (e.key === "Enter" || e.key === "Tab") {
                      e.preventDefault();
                      insertQuickReply(qrMatches[Math.min(qrIndex, qrMatches.length - 1)]);
                      return;
                    }
                    if (e.key === "Escape") {
                      e.preventDefault();
                      setQrDismissed(true);
                      return;
                    }
                  }
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                rows={1}
                maxLength={4096}
                placeholder="Digite uma mensagem ou / para respostas rápidas..."
                className="max-h-32 w-full resize-none rounded-3xl border border-transparent bg-app px-4 py-2 text-sm outline-none placeholder:text-secondary focus:border-accent"
              />
            </div>
            {text.trim() || !canRecord ? (
              <button
                onClick={send}
                disabled={!text.trim()}
                className="rounded-full bg-accent px-4 py-2 text-sm font-bold text-on-accent transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                Enviar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMediaError(null);
                  setRecording(true);
                }}
                disabled={mediaBusy || !!pending}
                aria-label="Gravar áudio"
                title="Gravar áudio"
                className="rounded-full bg-accent p-2.5 text-on-accent transition hover:bg-accent-hover disabled:opacity-40"
              >
                <Mic size={18} />
              </button>
            )}
          </div>
        )}
      </footer>
    </section>
  );
}
