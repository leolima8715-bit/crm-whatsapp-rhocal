"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, Plus } from "lucide-react";
import type { NoteEntry, Tag } from "@/lib/inbox-types";
import NewDealModal from "@/components/funil/NewDealModal";
import TagChip from "./TagChip";

const labelCls = "font-mono text-xs uppercase tracking-widest text-cyber-cyan";
const inputCls =
  "w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-1.5 text-sm outline-none focus:border-cyber-cyan";

const PALETTE = ["#00B4D8", "#FF6B2B", "#FEB23D", "#8B5CF6", "#22C55E", "#EF4444", "#EC4899", "#64748B"];

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

function dateTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// ---------- Tags ----------

export function TagsSection({
  contactId,
  tags,
  selectedIds,
  isGestor,
  onChange,
  onTagCreated,
}: {
  contactId: string;
  tags: Tag[];
  selectedIds: string[];
  isGestor: boolean;
  onChange: (tagIds: string[]) => void;
  onTagCreated: (tag: Tag) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selected = tags.filter((t) => selectedIds.includes(t.id));
  const available = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tags.filter((t) => !selectedIds.includes(t.id) && (!q || t.name.toLowerCase().includes(q)));
  }, [tags, selectedIds, query]);

  async function save(next: string[]) {
    const prev = selectedIds;
    onChange(next); // otimista
    setError(null);
    try {
      await api(`/api/contacts/${contactId}/tags`, "PUT", { tag_ids: next });
    } catch (e) {
      onChange(prev);
      setError((e as Error).message);
    }
  }

  async function createTag(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const data = await api("/api/tags", "POST", { name: newName, color: newColor });
      onTagCreated(data.tag);
      setNewName("");
      setCreating(false);
      await save([...selectedIds, data.tag.id]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <h4 className={labelCls}>Tags</h4>
        <button
          onClick={() => setOpen((o) => !o)}
          aria-label="Adicionar tag"
          className="rounded border border-cyber-line p-0.5 text-cyber-cyan hover:border-cyber-cyan"
        >
          <Plus size={14} />
        </button>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {selected.length === 0 && <p className="text-xs text-cyber-white/50">Nenhuma tag.</p>}
        {selected.map((t) => (
          <TagChip key={t.id} tag={t} onRemove={() => save(selectedIds.filter((id) => id !== t.id))} />
        ))}
      </div>

      {open && (
        <div className="mt-2 space-y-2 rounded-lg border border-cyber-line bg-cyber-bg p-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar tag..."
            className={inputCls}
          />
          <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
            {available.length === 0 && <p className="text-xs text-cyber-white/50">Nenhuma tag disponível.</p>}
            {available.map((t) => (
              <button key={t.id} onClick={() => save([...selectedIds, t.id])} className="hover:opacity-80">
                <TagChip tag={t} />
              </button>
            ))}
          </div>

          {isGestor &&
            (creating ? (
              <form onSubmit={createTag} className="space-y-2 border-t border-cyber-line pt-2">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  maxLength={30}
                  placeholder="Nome da nova tag"
                  className={inputCls}
                />
                <div className="flex flex-wrap gap-1.5">
                  {PALETTE.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setNewColor(c)}
                      aria-label={`Cor ${c}`}
                      className={`h-5 w-5 rounded-full border-2 ${newColor === c ? "border-cyber-white" : "border-transparent"}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={busy || !newName.trim()}
                    className="flex-1 rounded-lg bg-cyber-cyan py-1 text-xs font-bold text-cyber-bg disabled:opacity-50"
                  >
                    {busy ? "Criando..." : "Criar tag"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCreating(false)}
                    className="rounded-lg border border-cyber-line px-3 text-xs text-cyber-white/70"
                  >
                    Cancelar
                  </button>
                </div>
              </form>
            ) : (
              <button onClick={() => setCreating(true)} className="text-xs text-cyber-cyan underline">
                Criar tag
              </button>
            ))}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-cyber-orange">{error}</p>}
    </div>
  );
}

// ---------- Notas internas ----------

export function NotesSection({ contactId }: { contactId: string }) {
  const [notes, setNotes] = useState<NoteEntry[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setNotes(null);
    setFailed(false);
    api(`/api/contacts/${contactId}/notes`, "GET")
      .then((d) => !cancelled && setNotes(d.notes ?? []))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const data = await api(`/api/contacts/${contactId}/notes`, "POST", { body });
      setNotes((prev) => [data.note, ...(prev ?? [])]);
      setBody("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h4 className={`${labelCls} mb-1`}>Notas internas</h4>
      <p className="mb-2 text-[11px] text-cyber-amber">Visível apenas para a equipe.</p>

      <form onSubmit={add} className="space-y-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Escreva uma nota..."
          className={`${inputCls} resize-none`}
        />
        {error && <p className="text-xs text-cyber-orange">{error}</p>}
        <button
          type="submit"
          disabled={saving || !body.trim()}
          className="w-full rounded-lg border border-cyber-cyan/50 py-1.5 text-xs font-bold text-cyber-cyan hover:bg-cyber-cyan/10 disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Adicionar nota"}
        </button>
      </form>

      <div className="mt-3">
        {failed && <p className="text-xs text-cyber-orange">Não foi possível carregar as notas.</p>}
        {!failed && !notes && (
          <p className="flex items-center gap-2 text-xs text-cyber-white/50">
            <Loader2 size={12} className="animate-spin" /> Carregando...
          </p>
        )}
        {notes && notes.length === 0 && <p className="text-xs text-cyber-white/50">Nenhuma nota ainda.</p>}
        {notes && notes.length > 0 && (
          <ol className="space-y-3 border-l border-cyber-line pl-3">
            {notes.map((n) => (
              <li key={n.id} className="relative text-xs">
                <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-cyber-amber" />
                <p className="font-mono text-[10px] text-cyber-white/40">
                  {n.author_name ?? "—"} · {dateTime(n.created_at)}
                </p>
                <p className="whitespace-pre-wrap break-words text-cyber-white/80">{n.body}</p>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// ---------- Negócio ----------

type OpenDeal = { id: string; title: string; value: number; stage_name: string; stage_color: string };

export function DealSection({
  contactId,
  contactName,
  isGestor,
}: {
  contactId: string;
  contactName: string;
  isGestor: boolean;
}) {
  const [deals, setDeals] = useState<OpenDeal[] | null>(null);
  const [modal, setModal] = useState(false);

  function load() {
    api(`/api/contacts/${contactId}/deals`, "GET")
      .then((d) => setDeals(d.deals ?? []))
      .catch(() => setDeals([]));
  }
  useEffect(() => {
    setDeals(null);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactId]);

  return (
    <div>
      <h4 className={`${labelCls} mb-2`}>Funil</h4>
      {deals && deals.length > 0 && (
        <ul className="mb-2 space-y-1.5">
          {deals.map((d) => (
            <li key={d.id} className="rounded-lg border border-cyber-line p-2 text-xs">
              <p className="font-semibold">{d.title}</p>
              <p className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: d.stage_color }} />
                {d.stage_name}
                <Link href="/funil" className="ml-auto text-cyber-cyan underline">
                  Ver no funil
                </Link>
              </p>
            </li>
          ))}
        </ul>
      )}
      <button
        onClick={() => setModal(true)}
        className="w-full rounded-lg border border-cyber-line py-1.5 text-xs text-cyber-white/80 hover:border-cyber-cyan hover:text-cyber-cyan"
      >
        Criar negócio
      </button>
      {modal && (
        <NewDealModal
          presetContact={{ id: contactId, name: contactName }}
          isGestor={isGestor}
          onClose={() => setModal(false)}
          onCreated={() => {
            setModal(false);
            load();
          }}
        />
      )}
    </div>
  );
}
