"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, CheckCheck, Clock, Loader2, Mic, Paperclip } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchMessages } from "@/lib/inbox-queries";
import { displayName, formatPhone, formatTime, initials } from "@/lib/format";
import { baseMime, kindFromMime, validateFileClient } from "@/lib/media";
import type {
  Assignee,
  ConversationRow,
  MessageRow,
  QuickReply,
  SectorOption,
} from "@/lib/inbox-types";
import { alpha, conversationSector, sectorStyle } from "@/lib/sector-style";
import AttachmentPanel from "./AttachmentPanel";
import SectorTag from "./SectorTag";
import ConversationActions from "./ConversationActions";
import MediaContent from "./MediaContent";
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
  onChanged,
  quickReplies,
  currentUserName,
}: {
  conversation: ConversationRow | null;
  currentUserId: string;
  isGestor: boolean;
  assignees: Assignee[];
  sectors: SectorOption[];
  onChanged: (conversationId: string, movedTo?: string) => void;
  quickReplies: QuickReply[];
  currentUserName: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const conversationId = conversation?.id ?? null;

  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [text, setText] = useState("");
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const nearBottom = useRef(true);
  const forceScroll = useRef(true);

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
      <section className="flex flex-1 items-center justify-center text-cyber-white/50">
        Selecione uma conversa para começar.
      </section>
    );
  }

  const name = displayName(conversation.contact);
  const sector = conversationSector(conversation, sectors);

  return (
    <section
      className="relative flex min-w-0 flex-1 flex-col"
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
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center border-2 border-dashed border-cyber-cyan bg-cyber-bg/80 text-cyber-cyan">
          Solte o arquivo para enviar
        </div>
      )}

      <header
        style={{
          borderTop: `8px solid ${sectorStyle(sector.color).stripe}`,
          backgroundColor: alpha(sectorStyle(sector.color).stripe, 0.18),
        }}
        className="flex items-center gap-3 px-5 py-3"
      >
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyber-cyan/15 font-mono text-sm font-bold text-cyber-cyan">
          {initials(name)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-sm font-bold">{name}</h2>
            <SectorTag sector={sector} size="lg" className="max-w-[50%]" />
          </div>
          <p className="truncate text-xs text-cyber-white/70">
            {conversation.instance
              ? `${conversation.instance.label}${
                  conversation.instance.phone ? ` · ${formatPhone(conversation.instance.phone)}` : ""
                }`
              : "Sem número"}
          </p>
        </div>
        <ConversationActions
          conversation={conversation}
          currentUserId={currentUserId}
          isGestor={isGestor}
          assignees={assignees}
          onChanged={onChanged}
        />
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
          const isMedia = ["image", "video", "audio", "document", "sticker"].includes(m.type);
          const otherLabel: Record<string, string> = {
            location: "[Localização]",
            contact: "[Contato]",
            other: "[Mensagem]",
          };
          return (
            <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                  out ? "bg-cyber-cyan text-cyber-bg" : "bg-cyber-panel text-cyber-white"
                }`}
              >
                {isMedia ? (
                  <MediaContent m={m} />
                ) : (
                  <>
                    {m.type !== "text" && (
                      <p className="font-mono text-xs font-bold opacity-80">
                        {otherLabel[m.type] ?? "[Mensagem]"}
                      </p>
                    )}
                    {m.body && <p className="whitespace-pre-wrap break-words">{m.body}</p>}
                  </>
                )}
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

      <footer
        style={{ borderTop: `3px solid ${sectorStyle(sector.color).stripe}` }}
        className="p-3"
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
        {!pending && mediaError && <p className="mb-2 text-xs text-cyber-orange">{mediaError}</p>}
        {sendError && <p className="mb-2 text-xs text-cyber-orange">{sendError}</p>}

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
              className="rounded-lg border border-cyber-line p-2 text-cyber-white/70 transition hover:border-cyber-cyan hover:text-cyber-cyan disabled:opacity-40"
            >
              <Paperclip size={18} />
            </button>
            <div className="relative flex-1">
              {qrMatches.length > 0 && (
                <ul
                  role="listbox"
                  className="absolute bottom-full left-0 right-0 z-20 mb-2 max-h-56 overflow-y-auto rounded-lg border border-cyber-line bg-cyber-panel shadow-lg"
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
                          i === qrIndex ? "bg-cyber-bg" : ""
                        }`}
                      >
                        <span className="font-mono text-xs text-cyber-cyan">{r.shortcut}</span>
                        <span className="truncate text-xs text-cyber-white/70">{r.body}</span>
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
                className="max-h-32 w-full resize-none rounded-lg border border-cyber-line bg-cyber-panel px-3 py-2 text-sm outline-none focus:border-cyber-cyan"
              />
            </div>
            {text.trim() || !canRecord ? (
              <button
                onClick={send}
                disabled={!text.trim()}
                className="rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
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
                className="rounded-lg bg-cyber-cyan p-2 text-cyber-bg transition hover:opacity-90 disabled:opacity-40"
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
