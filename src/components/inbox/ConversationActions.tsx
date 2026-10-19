"use client";

import { useMemo, useState } from "react";
import { Loader2, Send, UserCheck, X } from "lucide-react";
import type {
  Assignee,
  ConversationRow,
  ConversationStatus,
  SectorOption,
} from "@/lib/inbox-types";

const STATUS_OPTIONS: { value: ConversationStatus; label: string; cls: string }[] = [
  { value: "open", label: "Aberta", cls: "border-cyber-cyan/60 text-cyber-cyan" },
  { value: "waiting", label: "Aguardando", cls: "border-cyber-amber/60 text-cyber-amber" },
  { value: "resolved", label: "Resolvida", cls: "border-cyber-line text-cyber-white/60" },
];

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Erro inesperado. Tente novamente.");
  return data;
}

export default function ConversationActions({
  conversation,
  currentUserId,
  isGestor,
  assignees,
  sectors,
  onChanged,
}: {
  conversation: ConversationRow;
  currentUserId: string;
  isGestor: boolean;
  assignees: Assignee[];
  sectors: SectorOption[];
  // movedTo: nome do novo responsável, para a mensagem se o usuário perder o acesso.
  onChanged: (conversationId: string, movedTo?: string) => void;
}) {
  const [busy, setBusy] = useState<"claim" | "status" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  const assigneeName =
    assignees.find((a) => a.id === conversation.assigned_to)?.full_name ??
    conversation.assignee?.full_name ??
    null;
  const sectorName = sectors.find((s) => s.id === conversation.sector_id)?.name ?? null;

  const unassigned = !conversation.assigned_to;
  const canTransfer = isGestor || unassigned || conversation.assigned_to === currentUserId;
  const current = STATUS_OPTIONS.find((o) => o.value === conversation.status) ?? STATUS_OPTIONS[0];

  async function claim() {
    setBusy("claim");
    setError(null);
    setNotice(null);
    try {
      await api(`/api/conversations/${conversation.id}/claim`, "POST");
      setNotice("Você assumiu a conversa.");
      onChanged(conversation.id);
    } catch (e) {
      setError((e as Error).message);
      onChanged(conversation.id);
    } finally {
      setBusy(null);
    }
  }

  async function changeStatus(status: ConversationStatus) {
    if (status === conversation.status) return;
    setBusy("status");
    setError(null);
    setNotice(null);
    try {
      await api(`/api/conversations/${conversation.id}/status`, "PATCH", { status });
      onChanged(conversation.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <p className="mr-1 text-right text-xs text-cyber-white/60">
          <span className="text-cyber-white/80">{assigneeName ?? "Sem responsável"}</span>
          {sectorName && <span className="font-mono"> · {sectorName}</span>}
        </p>

        {unassigned && (
          <button
            onClick={claim}
            disabled={busy !== null}
            className="flex items-center gap-1.5 rounded-lg bg-cyber-cyan px-3 py-1.5 text-xs font-bold text-cyber-bg hover:opacity-90 disabled:opacity-50"
          >
            {busy === "claim" ? <Loader2 size={12} className="animate-spin" /> : <UserCheck size={12} />}
            Assumir
          </button>
        )}

        {canTransfer && (
          <button
            onClick={() => {
              setError(null);
              setNotice(null);
              setTransferOpen(true);
            }}
            className="flex items-center gap-1.5 rounded-lg border border-cyber-line px-3 py-1.5 text-xs text-cyber-white/80 hover:border-cyber-cyan hover:text-cyber-cyan"
          >
            <Send size={12} /> Transferir
          </button>
        )}

        <select
          value={conversation.status}
          disabled={busy === "status"}
          onChange={(e) => changeStatus(e.target.value as ConversationStatus)}
          aria-label="Status da conversa"
          className={`rounded-full border bg-cyber-bg px-3 py-1 text-xs outline-none disabled:opacity-60 ${current.cls}`}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      {error && <p className="text-xs text-cyber-orange">{error}</p>}
      {notice && <p className="text-xs text-cyber-cyan">{notice}</p>}

      {transferOpen && (
        <TransferModal
          conversation={conversation}
          currentUserId={currentUserId}
          assignees={assignees}
          sectors={sectors}
          onClose={() => setTransferOpen(false)}
          onDone={(movedTo) => {
            setTransferOpen(false);
            setNotice("Conversa transferida com sucesso.");
            onChanged(conversation.id, movedTo);
          }}
        />
      )}
    </div>
  );
}

function TransferModal({
  conversation,
  currentUserId,
  assignees,
  sectors,
  onClose,
  onDone,
}: {
  conversation: ConversationRow;
  currentUserId: string;
  assignees: Assignee[];
  sectors: SectorOption[];
  onClose: () => void;
  onDone: (movedTo: string) => void;
}) {
  // "keep" = não alterar; "none" = Sem responsável; senão, id do perfil.
  const [person, setPerson] = useState<string>("keep");
  const [sector, setSector] = useState<string>("keep");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assignees.filter((a) => !q || a.full_name.toLowerCase().includes(q));
  }, [assignees, query]);

  const nothingChosen =
    (person === "keep" || person === (conversation.assigned_to ?? "none")) &&
    (sector === "keep" || sector === (conversation.sector_id ?? "none"));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = {};
      if (person !== "keep") body.to_profile = person === "none" ? null : person;
      if (sector !== "keep") body.to_sector = sector === "none" ? null : sector;
      if (note.trim()) body.note = note.trim();

      await api(`/api/conversations/${conversation.id}/transfer`, "POST", body);
      const movedTo =
        person === "none"
          ? "Sem responsável"
          : (assignees.find((a) => a.id === person)?.full_name ?? "outra pessoa");
      setSuccess(true);
      setTimeout(() => onDone(movedTo), 700);
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-2 text-sm outline-none focus:border-cyber-cyan";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 text-left">
      <div className="w-full max-w-md rounded-lg border border-cyber-line bg-cyber-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Transferir conversa</h2>
          <button
            onClick={onClose}
            disabled={saving}
            aria-label="Fechar"
            className="text-cyber-white/60 hover:text-cyber-orange disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        {success ? (
          <p className="rounded-lg border border-cyber-cyan/40 px-4 py-3 text-sm text-cyber-cyan">
            Conversa transferida com sucesso.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="text-sm">
              <span className="mb-1 block text-cyber-white/70">Pessoa</span>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nome..."
                className={`${inputCls} mb-2`}
              />
              <select
                value={person}
                onChange={(e) => setPerson(e.target.value)}
                size={Math.min(6, filtered.length + 2)}
                className={inputCls}
              >
                <option value="keep">Manter o responsável atual</option>
                <option value="none">Sem responsável</option>
                {filtered.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.full_name}
                    {a.id === currentUserId ? " (você)" : ""}
                  </option>
                ))}
              </select>
            </div>

            <label className="block text-sm">
              <span className="mb-1 block text-cyber-white/70">Setor (opcional)</span>
              <select value={sector} onChange={(e) => setSector(e.target.value)} className={inputCls}>
                <option value="keep">Manter o setor atual</option>
                <option value="none">Sem setor</option>
                {sectors.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-sm">
              <span className="mb-1 block text-cyber-white/70">Observação (opcional)</span>
              <textarea
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                rows={3}
                className={`${inputCls} resize-none`}
              />
              <span className="mt-1 block text-right font-mono text-[10px] text-cyber-white/40">
                {note.length}/500
              </span>
            </label>

            {error && <p className="text-sm text-cyber-orange">{error}</p>}

            <button
              type="submit"
              disabled={saving || nothingChosen}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Transferindo...
                </>
              ) : (
                "Transferir"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
