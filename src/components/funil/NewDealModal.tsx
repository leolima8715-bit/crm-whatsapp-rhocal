"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { Owner, Stage } from "@/lib/inbox-types";

const inputCls =
  "w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-2 text-sm outline-none focus:border-cyber-cyan";

type ContactHit = { id: string; name: string | null; push_name: string | null; phone: string };

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

export default function NewDealModal({
  presetContact,
  stages: stagesProp,
  owners: ownersProp,
  isGestor: isGestorProp,
  defaultStageId,
  onClose,
  onCreated,
}: {
  presetContact?: { id: string; name: string };
  stages?: Stage[];
  owners?: Owner[];
  isGestor?: boolean;
  defaultStageId?: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [stages, setStages] = useState<Stage[]>(stagesProp ?? []);
  const [owners, setOwners] = useState<Owner[]>(ownersProp ?? []);
  const [isGestor, setIsGestor] = useState(isGestorProp ?? false);

  const [contact, setContact] = useState<{ id: string; name: string } | null>(presetContact ?? null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ContactHit[]>([]);
  const [title, setTitle] = useState("");
  const [value, setValue] = useState("");
  const [stageId, setStageId] = useState(defaultStageId ?? "");
  const [ownerId, setOwnerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const searchSeq = useRef(0);

  // Quando aberto fora do funil, carrega etapas e responsáveis.
  useEffect(() => {
    if (stagesProp) return;
    api("/api/pipeline", "GET")
      .then((d) => {
        setStages(d.stages ?? []);
        setOwners(d.owners ?? []);
        setIsGestor(!!d.is_gestor);
      })
      .catch(() => setError("Não foi possível carregar as etapas do funil."));
  }, [stagesProp]);

  // Busca de contato por nome ou telefone (com debounce).
  useEffect(() => {
    if (contact || query.trim().length < 2) {
      setHits([]);
      return;
    }
    const seq = ++searchSeq.current;
    const t = setTimeout(() => {
      api(`/api/contacts/search?q=${encodeURIComponent(query.trim())}`, "GET")
        .then((d) => seq === searchSeq.current && setHits(d.contacts ?? []))
        .catch(() => seq === searchSeq.current && setHits([]));
    }, 300);
    return () => clearTimeout(t);
  }, [query, contact]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!contact) return;
    setSaving(true);
    setError(null);
    try {
      await api("/api/deals", "POST", {
        contact_id: contact.id,
        title,
        value: value || undefined,
        stage_id: stageId || undefined,
        owner_id: isGestor && ownerId ? ownerId : undefined,
      });
      onCreated();
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4 text-left">
      <div className="w-full max-w-md rounded-lg border border-cyber-line bg-cyber-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Novo negócio</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-cyber-white/60 hover:text-cyber-orange">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 text-sm">
          <div>
            <span className="mb-1 block text-cyber-white/70">Contato</span>
            {contact ? (
              <div className="flex items-center justify-between rounded-lg border border-cyber-line bg-cyber-bg px-3 py-2">
                <span className="truncate">{contact.name}</span>
                {!presetContact && (
                  <button type="button" onClick={() => setContact(null)} className="text-xs text-cyber-cyan underline">
                    Trocar
                  </button>
                )}
              </div>
            ) : (
              <>
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nome ou telefone..."
                  className={inputCls}
                />
                {hits.length > 0 && (
                  <ul className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-cyber-line bg-cyber-bg">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button
                          type="button"
                          onClick={() =>
                            setContact({ id: h.id, name: h.name || h.push_name || h.phone })
                          }
                          className="w-full px-3 py-2 text-left hover:bg-cyber-panel"
                        >
                          {h.name || h.push_name || "Sem nome"}{" "}
                          <span className="font-mono text-xs text-cyber-white/50">{h.phone}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>

          <label className="block">
            <span className="mb-1 block text-cyber-white/70">Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={inputCls} />
          </label>

          <div className="flex gap-3">
            <label className="block flex-1">
              <span className="mb-1 block text-cyber-white/70">Valor (R$)</span>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                inputMode="decimal"
                placeholder="0,00"
                className={inputCls}
              />
            </label>
            <label className="block flex-1">
              <span className="mb-1 block text-cyber-white/70">Etapa</span>
              <select value={stageId} onChange={(e) => setStageId(e.target.value)} className={inputCls}>
                <option value="">Primeira etapa</option>
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {isGestor && owners.length > 0 && (
            <label className="block">
              <span className="mb-1 block text-cyber-white/70">Responsável</span>
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls}>
                <option value="">Eu mesmo</option>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name}
                  </option>
                ))}
              </select>
            </label>
          )}

          {error && <p className="text-sm text-cyber-orange">{error}</p>}

          <button
            type="submit"
            disabled={saving || !contact || !title.trim()}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Criando...
              </>
            ) : (
              "Criar negócio"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
