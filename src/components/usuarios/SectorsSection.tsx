"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, Loader2, Pencil, Plus, X } from "lucide-react";

type Sector = { id: string; name: string };

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
  "w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-1.5 text-sm outline-none focus:border-cyber-cyan";

export default function SectorsSection({ sectors }: { sectors: Sector[] }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function create(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    run("new", async () => {
      await api("/api/sectors", "POST", { name: newName });
      setNewName("");
      setAdding(false);
    });
  }

  function rename(e: React.FormEvent, id: string) {
    e.preventDefault();
    run(id, async () => {
      await api(`/api/sectors/${id}`, "PATCH", { name: editName });
      setEditingId(null);
    });
  }

  function archive(s: Sector) {
    if (!window.confirm(`Arquivar o setor "${s.name}"? Ele sai das listas, mas nada é apagado.`)) return;
    run(s.id, async () => {
      await api(`/api/sectors/${s.id}`, "PATCH", { archived: true });
    });
  }

  return (
    <div className="mt-10">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="font-bold">Setores</h2>
        {!adding && (
          <button
            onClick={() => {
              setError(null);
              setAdding(true);
            }}
            className="flex items-center gap-2 rounded-lg border border-cyber-cyan/50 px-3 py-1.5 text-sm text-cyber-cyan transition hover:bg-cyber-cyan/10"
          >
            <Plus size={14} /> Novo setor
          </button>
        )}
      </div>

      {error && (
        <p className="mb-3 rounded-lg border border-cyber-orange/40 px-4 py-2 text-sm text-cyber-orange">
          {error}
        </p>
      )}

      {adding && (
        <form onSubmit={create} className="mb-3 flex gap-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nome do setor"
            maxLength={60}
            className={inputCls}
          />
          <button
            type="submit"
            disabled={busy === "new" || !newName.trim()}
            className="flex shrink-0 items-center gap-2 rounded-lg bg-cyber-cyan px-3 text-sm font-bold text-cyber-bg disabled:opacity-50"
          >
            {busy === "new" ? <Loader2 size={14} className="animate-spin" /> : "Criar"}
          </button>
          <button
            type="button"
            onClick={() => {
              setAdding(false);
              setNewName("");
              setError(null);
            }}
            aria-label="Cancelar"
            className="shrink-0 rounded-lg border border-cyber-line px-3 text-cyber-white/60 hover:text-cyber-orange"
          >
            <X size={14} />
          </button>
        </form>
      )}

      {sectors.length === 0 ? (
        <p className="rounded-lg border border-cyber-line bg-cyber-panel p-4 text-sm text-cyber-white/60">
          Nenhum setor cadastrado.
        </p>
      ) : (
        <ul className="divide-y divide-cyber-line rounded-lg border border-cyber-line bg-cyber-panel">
          {sectors.map((s) => (
            <li key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
              {editingId === s.id ? (
                <form onSubmit={(e) => rename(e, s.id)} className="flex flex-1 gap-2">
                  <input
                    autoFocus
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    maxLength={60}
                    className={inputCls}
                  />
                  <button
                    type="submit"
                    disabled={busy === s.id || !editName.trim()}
                    aria-label="Salvar"
                    className="shrink-0 rounded-lg bg-cyber-cyan px-3 text-cyber-bg disabled:opacity-50"
                  >
                    {busy === s.id ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(null);
                      setError(null);
                    }}
                    aria-label="Cancelar"
                    className="shrink-0 rounded-lg border border-cyber-line px-3 text-cyber-white/60 hover:text-cyber-orange"
                  >
                    <X size={14} />
                  </button>
                </form>
              ) : (
                <>
                  <span className="truncate text-sm">{s.name}</span>
                  <div className="flex shrink-0 gap-2">
                    <button
                      disabled={busy === s.id}
                      onClick={() => {
                        setError(null);
                        setEditingId(s.id);
                        setEditName(s.name);
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-cyber-line px-2.5 py-1 text-xs text-cyber-white/80 transition hover:border-cyber-cyan hover:text-cyber-cyan disabled:opacity-50"
                    >
                      <Pencil size={12} /> Renomear
                    </button>
                    <button
                      disabled={busy === s.id}
                      onClick={() => archive(s)}
                      className="flex items-center gap-1.5 rounded-lg border border-cyber-line px-2.5 py-1 text-xs text-cyber-white/80 transition hover:border-cyber-amber hover:text-cyber-amber disabled:opacity-50"
                    >
                      {busy === s.id ? <Loader2 size={12} className="animate-spin" /> : <Archive size={12} />}{" "}
                      Arquivar
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
