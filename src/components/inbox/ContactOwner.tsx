"use client";

import { useMemo, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import type { Assignee, ConversationRow } from "@/lib/inbox-types";

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

// Responsável do CONTATO: vale para todas as conversas dele, em qualquer número ou setor.
export default function ContactOwner({
  conversation,
  currentUserId,
  isGestor,
  assignees,
  onChanged,
  variant,
}: {
  conversation: ConversationRow;
  currentUserId: string;
  isGestor: boolean;
  assignees: Assignee[];
  // movedTo: nome do novo responsável, para a mensagem se o usuário perder o acesso.
  onChanged: (conversationId: string, movedTo?: string) => void;
  variant: "header" | "panel";
}) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  // Gestor transfere qualquer contato (inclusive sem responsável); os demais só os seus.
  const canTransfer = isGestor || conversation.assigned_to === currentUserId;

  const transferBtn = canTransfer && (
    <button
      onClick={() => {
        setError(null);
        setNotice(null);
        setTransferOpen(true);
      }}
      className="flex items-center gap-1.5 rounded-lg border border-cyber-line px-3 py-1.5 text-xs text-cyber-white/80 hover:border-cyber-cyan hover:text-cyber-cyan"
    >
      <Send size={12} /> Transferir contato
    </button>
  );

  const modal = transferOpen && (
    <TransferModal
      conversation={conversation}
      currentUserId={currentUserId}
      assignees={assignees}
      onClose={() => setTransferOpen(false)}
      onDone={(movedTo) => {
        setTransferOpen(false);
        setNotice("Contato transferido com sucesso.");
        onChanged(conversation.id, movedTo);
      }}
    />
  );

  if (variant === "header") {
    return (
      <>
        <div className="flex flex-wrap items-center justify-end gap-2">
          {transferBtn}
        </div>
        {error && <p className="text-xs text-cyber-orange">{error}</p>}
        {notice && <p className="text-xs text-cyber-cyan">{notice}</p>}
        {modal}
      </>
    );
  }

  return (
    <div>
      <p className="text-xs text-cyber-white/50">Vale para todas as conversas deste contato.</p>
      {transferBtn && (
        <div className="mt-2 flex flex-wrap gap-2">
          {transferBtn}
        </div>
      )}
      {error && <p className="mt-2 text-xs text-cyber-orange">{error}</p>}
      {notice && <p className="mt-2 text-xs text-cyber-cyan">{notice}</p>}
      {modal}
    </div>
  );
}

function TransferModal({
  conversation,
  currentUserId,
  assignees,
  onClose,
  onDone,
}: {
  conversation: ConversationRow;
  currentUserId: string;
  assignees: Assignee[];
  onClose: () => void;
  onDone: (movedTo: string) => void;
}) {
  // "keep" = não alterar; "none" = Sem responsável; senão, id do perfil.
  const [person, setPerson] = useState<string>("keep");
  const [query, setQuery] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return assignees.filter((a) => !q || a.full_name.toLowerCase().includes(q));
  }, [assignees, query]);

  const nothingChosen = person === "keep" || person === (conversation.assigned_to ?? "none");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const body: Record<string, unknown> = { to_profile: person === "none" ? null : person };
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
          <h2 className="font-bold">Transferir contato</h2>
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
            Contato transferido com sucesso.
          </p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <div className="text-sm">
              <span className="mb-1 block text-cyber-white/70">Novo responsável</span>
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
              <span className="mt-1 block text-xs text-cyber-white/50">
                Vale para todas as conversas deste contato.
              </span>
            </div>

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
                "Transferir contato"
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
