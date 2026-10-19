"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, Loader2, Pencil, Plus, X } from "lucide-react";
import type { QuickReply } from "@/lib/inbox-types";

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

const inputCls =
  "w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-2 text-sm outline-none focus:border-cyber-cyan";

export default function QuickRepliesManager({
  replies,
  currentUserId,
  isGestor,
}: {
  replies: QuickReply[];
  currentUserId: string;
  isGestor: boolean;
}) {
  const router = useRouter();
  const [editingId, setEditingId] = useState<string | null>(null); // "new" ou id
  const [shortcut, setShortcut] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function startNew() {
    setEditingId("new");
    setShortcut("/");
    setBody("");
    setError(null);
  }

  function startEdit(r: QuickReply) {
    setEditingId(r.id);
    setShortcut(r.shortcut);
    setBody(r.body);
    setError(null);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (editingId === "new") {
        await api("/api/quick-replies", "POST", { shortcut, body });
      } else {
        await api(`/api/quick-replies/${editingId}`, "PATCH", { shortcut, body });
      }
      setEditingId(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function archive(r: QuickReply) {
    if (!window.confirm(`Arquivar a resposta ${r.shortcut}? Ela sai das listas, mas nada é apagado.`)) return;
    setBusyId(r.id);
    setError(null);
    try {
      await api(`/api/quick-replies/${r.id}`, "PATCH", { archived: true });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  const form = (
    <form onSubmit={save} className="space-y-3 rounded-lg border border-cyber-cyan/40 bg-cyber-panel p-4">
      <label className="block text-sm">
        <span className="mb-1 block text-cyber-white/70">
          Atalho (começa com /, 2 a 20 caracteres: letras minúsculas, números e hífen)
        </span>
        <input
          autoFocus
          value={shortcut}
          onChange={(e) => setShortcut(e.target.value.toLowerCase())}
          maxLength={20}
          className={`${inputCls} font-mono`}
        />
      </label>
      <label className="block text-sm">
        <span className="mb-1 block text-cyber-white/70">
          Texto — use {"{nome}"} (contato) e {"{atendente}"} (você)
        </span>
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={4096}
          rows={5}
          className={`${inputCls} resize-y`}
        />
      </label>
      {error && <p className="text-sm text-cyber-orange">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving || shortcut.length < 2 || !body.trim()}
          className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg hover:opacity-90 disabled:opacity-50"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Salvar
        </button>
        <button
          type="button"
          onClick={() => setEditingId(null)}
          disabled={saving}
          className="flex items-center gap-2 rounded-lg border border-cyber-line px-4 py-2 text-sm text-cyber-white/80 hover:border-cyber-orange hover:text-cyber-orange"
        >
          <X size={14} /> Cancelar
        </button>
      </div>
    </form>
  );

  return (
    <section className="mx-auto w-full max-w-3xl flex-1 p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Respostas rápidas</h1>
          <p className="text-sm text-cyber-white/60">
            No chat, digite / e escolha um atalho para inserir o texto.
          </p>
        </div>
        {editingId === null && (
          <button
            onClick={startNew}
            className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg hover:opacity-90"
          >
            <Plus size={16} /> Nova resposta
          </button>
        )}
      </div>

      {error && editingId === null && (
        <p className="mb-4 rounded-lg border border-cyber-orange/40 px-4 py-2 text-sm text-cyber-orange">
          {error}
        </p>
      )}

      {editingId === "new" && <div className="mb-4">{form}</div>}

      {replies.length === 0 && editingId !== "new" ? (
        <p className="rounded-lg border border-cyber-line bg-cyber-panel p-8 text-center text-cyber-white/60">
          Nenhuma resposta rápida ainda. Clique em &quot;Nova resposta&quot; para criar a primeira.
        </p>
      ) : (
        <ul className="space-y-3">
          {replies.map((r) => {
            const canEdit = isGestor || r.created_by === currentUserId;
            if (editingId === r.id) return <li key={r.id}>{form}</li>;
            return (
              <li key={r.id} className="rounded-lg border border-cyber-line bg-cyber-panel p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-cyber-cyan">{r.shortcut}</p>
                    <p className="mt-1 whitespace-pre-wrap break-words text-sm text-cyber-white/80">{r.body}</p>
                  </div>
                  {canEdit && (
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => startEdit(r)}
                        disabled={busyId === r.id}
                        className="flex items-center gap-1.5 rounded-lg border border-cyber-line px-2.5 py-1 text-xs text-cyber-white/80 hover:border-cyber-cyan hover:text-cyber-cyan"
                      >
                        <Pencil size={12} /> Editar
                      </button>
                      <button
                        onClick={() => archive(r)}
                        disabled={busyId === r.id}
                        className="flex items-center gap-1.5 rounded-lg border border-cyber-line px-2.5 py-1 text-xs text-cyber-white/80 hover:border-cyber-amber hover:text-cyber-amber disabled:opacity-50"
                      >
                        {busyId === r.id ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}{" "}
                        Arquivar
                      </button>
                    </div>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
