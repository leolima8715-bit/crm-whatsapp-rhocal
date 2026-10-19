"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Check, Loader2, Pencil, Plus, X } from "lucide-react";
import { nextPaletteColor, normalizeColor, SECTOR_PALETTE } from "@/lib/sector-style";

type Sector = { id: string; name: string; color: string | null };

function ColorPicker({
  value,
  onPick,
  disabled,
  label,
}: {
  value: string;
  onPick: (color: string) => void;
  disabled?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        title="Alterar cor"
        style={{ backgroundColor: value }}
        className="h-5 w-5 rounded-full border border-cyber-white/30 transition hover:scale-110 disabled:opacity-50"
      />
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-7 z-20 grid grid-cols-4 gap-2 rounded-lg border border-cyber-line bg-cyber-bg p-3 shadow-xl">
            {SECTOR_PALETTE.map((c) => (
              <button
                key={c}
                type="button"
                aria-label={`Cor ${c}`}
                onClick={() => {
                  setOpen(false);
                  if (c !== value) onPick(c);
                }}
                style={{ backgroundColor: c }}
                className={`flex h-6 w-6 items-center justify-center rounded-full transition hover:scale-110 ${
                  c === value ? "ring-2 ring-cyber-white ring-offset-2 ring-offset-cyber-bg" : ""
                }`}
              >
                {c === value && <Check size={12} className="text-cyber-bg" />}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

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
  const [newColor, setNewColor] = useState<string | null>(null);
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

  const defaultColor = nextPaletteColor(sectors.map((s) => s.color));

  function create(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    run("new", async () => {
      await api("/api/sectors", "POST", { name: newName, color: newColor ?? defaultColor });
      setNewName("");
      setNewColor(null);
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

  function recolor(id: string, color: string) {
    run(id, async () => {
      await api(`/api/sectors/${id}`, "PATCH", { color });
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
        <form onSubmit={create} className="mb-3 flex items-center gap-2">
          <ColorPicker
            value={newColor ?? defaultColor}
            onPick={setNewColor}
            label="Escolher cor do novo setor"
          />
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
              setNewColor(null);
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
            <li key={s.id} className="flex items-center gap-3 px-4 py-2.5">
              <ColorPicker
                value={normalizeColor(s.color)}
                onPick={(c) => recolor(s.id, c)}
                disabled={busy === s.id}
                label={`Alterar cor do setor ${s.name}`}
              />
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
                  <span className="min-w-0 flex-1 truncate text-sm">{s.name}</span>
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
