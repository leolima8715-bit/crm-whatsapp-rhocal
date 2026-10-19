"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, Archive, Loader2, Plus, Settings, X } from "lucide-react";
import type { Deal, Owner, Stage, Tag } from "@/lib/inbox-types";
import TagChip from "@/components/inbox/TagChip";
import NewDealModal from "./NewDealModal";

type Board = {
  is_gestor: boolean;
  stages: Stage[];
  owners: Owner[];
  tags: Tag[];
  deals: Deal[];
};

const PALETTE = ["#00B4D8", "#FF6B2B", "#FEB23D", "#8B5CF6", "#22C55E", "#EF4444", "#EC4899", "#64748B"];
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const inputCls =
  "w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-2 text-sm outline-none focus:border-cyber-cyan";

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

function age(iso: string) {
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000);
  return days <= 0 ? "hoje" : days === 1 ? "há 1 dia" : `há ${days} dias`;
}

export default function FunilBoard({ currentUserId }: { currentUserId: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<{ stageId: string; beforeId: string | null } | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newDeal, setNewDeal] = useState<{ stageId?: string } | null>(null);
  const [configOpen, setConfigOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const qs = new URLSearchParams();
      if (ownerFilter) qs.set("owner", ownerFilter);
      if (showClosed) qs.set("closed", "1");
      const data = await api(`/api/pipeline?${qs.toString()}`, "GET");
      setBoard(data as Board);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [ownerFilter, showClosed]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const tagById = useMemo(() => new Map((board?.tags ?? []).map((t) => [t.id, t])), [board]);

  const byStage = useMemo(() => {
    const map = new Map<string, Deal[]>();
    for (const s of board?.stages ?? []) map.set(s.id, []);
    for (const d of board?.deals ?? []) map.get(d.stage_id)?.push(d);
    for (const list of Array.from(map.values())) list.sort((a, b) => a.position - b.position);
    return map;
  }, [board]);

  // Move com atualização otimista; reverte se a API falhar.
  async function moveDeal(dealId: string, stageId: string, beforeId: string | null) {
    if (!board) return;
    const snapshot = board;
    const deal = board.deals.find((d) => d.id === dealId);
    if (!deal || deal.status !== "open" || beforeId === dealId) return;

    const column = (byStage.get(stageId) ?? []).filter((d) => d.id !== dealId);
    const at = beforeId ? column.findIndex((d) => d.id === beforeId) : -1;
    const moved = { ...deal, stage_id: stageId };
    if (at >= 0) column.splice(at, 0, moved);
    else column.push(moved);
    const positions = new Map(column.map((d, i) => [d.id, i]));

    setBoard({
      ...board,
      deals: board.deals.map((d) =>
        d.id === dealId ? { ...moved, position: positions.get(d.id)! } : positions.has(d.id) ? { ...d, position: positions.get(d.id)! } : d
      ),
    });

    try {
      await api(`/api/deals/${dealId}`, "PATCH", { stage_id: stageId, before_id: beforeId });
    } catch (e) {
      setBoard(snapshot);
      setError((e as Error).message);
    }
  }

  function endDrag() {
    setDragId(null);
    setOver(null);
  }

  if (loading && !board) {
    return (
      <div className="flex flex-1 items-center justify-center gap-2 text-cyber-white/60">
        <Loader2 size={16} className="animate-spin" /> Carregando funil...
      </div>
    );
  }
  if (!board) {
    return <p className="p-6 text-cyber-orange">{error ?? "Não foi possível carregar o funil."}</p>;
  }

  const selected = board.deals.find((d) => d.id === selectedId) ?? null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-cyber-line px-5 py-3">
        <button
          onClick={() => setNewDeal({})}
          className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg hover:opacity-90"
        >
          <Plus size={16} /> Novo negócio
        </button>

        {board.is_gestor && (
          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            aria-label="Filtrar por responsável"
            className="rounded-lg border border-cyber-line bg-cyber-bg px-3 py-2 text-sm outline-none focus:border-cyber-cyan"
          >
            <option value="">Responsável: todos</option>
            {board.owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.full_name}
              </option>
            ))}
          </select>
        )}

        <label className="flex items-center gap-2 text-sm text-cyber-white/80">
          <input
            type="checkbox"
            checked={showClosed}
            onChange={(e) => setShowClosed(e.target.checked)}
            className="accent-cyber-cyan"
          />
          Mostrar ganhos/perdidos
        </label>

        {board.is_gestor && (
          <button
            onClick={() => setConfigOpen(true)}
            className="ml-auto flex items-center gap-2 rounded-lg border border-cyber-line px-3 py-2 text-sm text-cyber-white/80 hover:border-cyber-cyan hover:text-cyber-cyan"
          >
            <Settings size={14} /> Configurar etapas
          </button>
        )}
      </div>

      {error && (
        <p className="mx-5 mt-3 rounded-lg border border-cyber-orange/40 px-4 py-2 text-sm text-cyber-orange">
          {error}
        </p>
      )}

      <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-5">
        {board.stages.map((stage) => {
          const deals = byStage.get(stage.id) ?? [];
          const total = deals.filter((d) => d.status === "open").reduce((s, d) => s + d.value, 0);
          const isOver = over?.stageId === stage.id;
          return (
            <section
              key={stage.id}
              onDragOver={(e) => {
                if (!dragId) return;
                e.preventDefault();
                if (!isOver) setOver({ stageId: stage.id, beforeId: null });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (dragId && over) moveDeal(dragId, over.stageId, over.beforeId);
                endDrag();
              }}
              className={`flex w-72 shrink-0 flex-col rounded-lg border bg-cyber-panel ${
                isOver ? "border-cyber-cyan" : "border-cyber-line"
              }`}
            >
              <header className="border-b border-cyber-line p-3" style={{ borderTop: `3px solid ${stage.color}` }}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="truncate text-sm font-bold">{stage.name}</h2>
                  <span className="rounded-full bg-cyber-bg px-2 py-0.5 font-mono text-xs">{deals.length}</span>
                </div>
                <p className="mt-0.5 font-mono text-xs text-cyber-white/60">{brl.format(total)}</p>
              </header>

              <div className="flex-1 space-y-2 overflow-y-auto p-2">
                {deals.length === 0 && (
                  <p className="p-3 text-center text-xs text-cyber-white/40">Nenhum negócio.</p>
                )}
                {deals.map((d, i) => {
                  const closed = d.status !== "open";
                  const nextId = deals[i + 1]?.id ?? null;
                  return (
                    <div key={d.id}>
                      {isOver && over?.beforeId === d.id && dragId !== d.id && (
                        <div className="mb-2 h-0.5 rounded bg-cyber-cyan" />
                      )}
                      <article
                        draggable={!closed}
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", d.id);
                          e.dataTransfer.effectAllowed = "move";
                          setDragId(d.id);
                        }}
                        onDragEnd={endDrag}
                        onDragOver={(e) => {
                          if (!dragId) return;
                          e.preventDefault();
                          e.stopPropagation();
                          const r = e.currentTarget.getBoundingClientRect();
                          const before = e.clientY < r.top + r.height / 2 ? d.id : nextId;
                          if (over?.stageId !== stage.id || over.beforeId !== before) {
                            setOver({ stageId: stage.id, beforeId: before });
                          }
                        }}
                        onClick={() => setSelectedId(d.id)}
                        className={`cursor-pointer rounded-lg border border-cyber-line bg-cyber-bg p-3 text-sm transition hover:border-cyber-cyan/60 ${
                          dragId === d.id ? "opacity-40" : ""
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-semibold leading-snug">{d.title}</p>
                          {closed && (
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                                d.status === "won" ? "bg-cyber-cyan text-cyber-bg" : "bg-cyber-orange text-cyber-bg"
                              }`}
                            >
                              {d.status === "won" ? "Ganho" : "Perdido"}
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-cyber-white/60">{d.contact_name}</p>
                        <p className="mt-1 font-mono text-sm text-cyber-cyan">{brl.format(d.value)}</p>
                        {d.tag_ids.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-1">
                            {d.tag_ids
                              .map((id) => tagById.get(id))
                              .filter(Boolean)
                              .slice(0, 3)
                              .map((t) => (
                                <TagChip key={t!.id} tag={t!} small />
                              ))}
                          </div>
                        )}
                        <div className="mt-2 flex items-center justify-between text-[11px] text-cyber-white/50">
                          <span className="truncate">{d.owner_name ?? "—"}</span>
                          <span className="shrink-0">{age(d.created_at)}</span>
                        </div>
                        {!closed && (
                          <select
                            value=""
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              if (e.target.value) moveDeal(d.id, e.target.value, null);
                            }}
                            aria-label="Mover para"
                            className="mt-2 w-full rounded border border-cyber-line bg-cyber-panel px-1.5 py-1 text-[11px] text-cyber-white/70"
                          >
                            <option value="">Mover para…</option>
                            {board.stages
                              .filter((s) => s.id !== d.stage_id)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name}
                                </option>
                              ))}
                          </select>
                        )}
                      </article>
                    </div>
                  );
                })}
                {isOver && over?.beforeId === null && dragId && <div className="h-0.5 rounded bg-cyber-cyan" />}
              </div>

              <button
                onClick={() => setNewDeal({ stageId: stage.id })}
                className="border-t border-cyber-line py-2 text-xs text-cyber-white/60 hover:text-cyber-cyan"
              >
                + Adicionar negócio
              </button>
            </section>
          );
        })}
      </div>

      {selected && (
        <DealPanel
          key={selected.id}
          deal={selected}
          isGestor={board.is_gestor}
          owners={board.owners}
          currentUserId={currentUserId}
          onClose={() => setSelectedId(null)}
          onChanged={() => {
            load();
          }}
        />
      )}

      {newDeal && (
        <NewDealModal
          stages={board.stages}
          owners={board.owners}
          isGestor={board.is_gestor}
          defaultStageId={newDeal.stageId}
          onClose={() => setNewDeal(null)}
          onCreated={() => {
            setNewDeal(null);
            load();
          }}
        />
      )}

      {configOpen && (
        <StageConfig
          stages={board.stages}
          onClose={() => setConfigOpen(false)}
          onChanged={load}
        />
      )}
    </div>
  );
}

// ---------- Painel lateral do negócio ----------

function DealPanel({
  deal,
  isGestor,
  owners,
  onClose,
  onChanged,
}: {
  deal: Deal;
  isGestor: boolean;
  owners: Owner[];
  currentUserId: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [title, setTitle] = useState(deal.title);
  const [value, setValue] = useState(String(deal.value).replace(".", ","));
  const [ownerId, setOwnerId] = useState(deal.owner_id);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [losing, setLosing] = useState(false);
  const [reason, setReason] = useState("");

  async function patch(body: Record<string, unknown>, closeAfter = false) {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await api(`/api/deals/${deal.id}`, "PATCH", body);
      setSaved(true);
      onChanged();
      if (closeAfter) onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function save(e: React.FormEvent) {
    e.preventDefault();
    const body: Record<string, unknown> = { title, value };
    if (isGestor && ownerId !== deal.owner_id) body.owner_id = ownerId;
    patch(body);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50" onClick={onClose}>
      <aside
        className="flex h-full w-full max-w-sm flex-col overflow-y-auto border-l border-cyber-line bg-cyber-panel p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Negócio</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-cyber-white/60 hover:text-cyber-orange">
            <X size={18} />
          </button>
        </div>

        <p className="mb-4 text-sm text-cyber-white/70">
          Contato: <span className="font-semibold text-cyber-white">{deal.contact_name}</span>
        </p>

        <form onSubmit={save} className="space-y-3 text-sm">
          <label className="block">
            <span className="mb-1 block text-cyber-white/70">Título</span>
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-cyber-white/70">Valor (R$)</span>
            <input
              value={value}
              onChange={(e) => setValue(e.target.value)}
              inputMode="decimal"
              className={inputCls}
            />
          </label>
          {isGestor ? (
            <label className="block">
              <span className="mb-1 block text-cyber-white/70">Responsável</span>
              <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className={inputCls}>
                {owners.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.full_name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <p className="text-cyber-white/70">
              Responsável: <span className="text-cyber-white">{deal.owner_name ?? "—"}</span>
            </p>
          )}

          {error && <p className="text-sm text-cyber-orange">{error}</p>}
          {saved && <p className="text-sm text-cyber-cyan">Salvo.</p>}

          <button
            type="submit"
            disabled={saving || !title.trim()}
            className="w-full rounded-lg bg-cyber-cyan py-2 text-sm font-bold text-cyber-bg hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Salvando..." : "Salvar alterações"}
          </button>
        </form>

        <div className="mt-6 space-y-2 border-t border-cyber-line pt-5 text-sm">
          {deal.status === "open" ? (
            losing ? (
              <div className="space-y-2">
                <label className="block">
                  <span className="mb-1 block text-cyber-white/70">Motivo da perda</span>
                  <textarea
                    autoFocus
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    maxLength={300}
                    rows={3}
                    className={`${inputCls} resize-none`}
                  />
                </label>
                <div className="flex gap-2">
                  <button
                    onClick={() => patch({ status: "lost", lost_reason: reason }, true)}
                    disabled={saving || !reason.trim()}
                    className="flex-1 rounded-lg bg-cyber-orange py-2 text-sm font-bold text-cyber-bg disabled:opacity-50"
                  >
                    Confirmar perda
                  </button>
                  <button
                    onClick={() => setLosing(false)}
                    className="rounded-lg border border-cyber-line px-4 text-cyber-white/70"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => patch({ status: "won" }, true)}
                  disabled={saving}
                  className="flex-1 rounded-lg border border-cyber-cyan/60 py-2 font-bold text-cyber-cyan hover:bg-cyber-cyan/10 disabled:opacity-50"
                >
                  Ganho
                </button>
                <button
                  onClick={() => setLosing(true)}
                  disabled={saving}
                  className="flex-1 rounded-lg border border-cyber-orange/60 py-2 font-bold text-cyber-orange hover:bg-cyber-orange/10 disabled:opacity-50"
                >
                  Perdido
                </button>
              </div>
            )
          ) : (
            <div>
              <p className="mb-2 text-cyber-white/70">
                {deal.status === "won" ? "Negócio ganho." : `Negócio perdido: ${deal.lost_reason ?? "—"}`}
              </p>
              <button
                onClick={() => patch({ status: "open" })}
                disabled={saving}
                className="w-full rounded-lg border border-cyber-line py-2 text-cyber-white/80 hover:border-cyber-cyan hover:text-cyber-cyan disabled:opacity-50"
              >
                Reabrir negócio
              </button>
            </div>
          )}

          {deal.conversation_id ? (
            <Link
              href={`/inbox?conversation=${deal.conversation_id}`}
              className="block w-full rounded-lg border border-cyber-line py-2 text-center text-cyber-white/80 hover:border-cyber-cyan hover:text-cyber-cyan"
            >
              Abrir conversa
            </Link>
          ) : (
            <p className="text-center text-xs text-cyber-white/40">Este contato ainda não tem conversa.</p>
          )}
        </div>
      </aside>
    </div>
  );
}

// ---------- Configuração das etapas (gestor) ----------

function StageConfig({
  stages,
  onClose,
  onChanged,
}: {
  stages: Stage[];
  onClose: () => void;
  onChanged: () => void;
}) {
  const [drafts, setDrafts] = useState(() => stages.map((s) => ({ ...s })));
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState(PALETTE[0]);

  // Reflete o servidor depois de cada mudança.
  useEffect(() => setDrafts(stages.map((s) => ({ ...s }))), [stages]);

  async function run(key: string, fn: () => Promise<void>) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      onChanged();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  function setDraft(id: string, patch: Partial<Stage>) {
    setDrafts((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }

  function move(index: number, dir: -1 | 1) {
    const next = [...drafts];
    const j = index + dir;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    run("reorder", async () => {
      await api("/api/pipeline/stages/reorder", "POST", { ordered_ids: next.map((s) => s.id) });
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
      <div className="w-full max-w-lg rounded-lg border border-cyber-line bg-cyber-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Configurar etapas</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-cyber-white/60 hover:text-cyber-orange">
            <X size={18} />
          </button>
        </div>

        {error && <p className="mb-3 text-sm text-cyber-orange">{error}</p>}

        <ul className="space-y-2">
          {drafts.map((s, i) => {
            const original = stages.find((x) => x.id === s.id);
            const dirty = original && (original.name !== s.name || original.color !== s.color);
            return (
              <li key={s.id} className="rounded-lg border border-cyber-line bg-cyber-bg p-2">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={s.color}
                    onChange={(e) => setDraft(s.id, { color: e.target.value.toUpperCase() })}
                    aria-label="Cor da etapa"
                    className="h-8 w-8 shrink-0 cursor-pointer rounded border border-cyber-line bg-transparent"
                  />
                  <input
                    value={s.name}
                    onChange={(e) => setDraft(s.id, { name: e.target.value })}
                    maxLength={40}
                    className={inputCls}
                  />
                  <button
                    onClick={() => move(i, -1)}
                    disabled={i === 0 || busy !== null}
                    aria-label="Subir"
                    className="rounded border border-cyber-line p-1.5 text-cyber-white/70 hover:text-cyber-cyan disabled:opacity-30"
                  >
                    <ArrowUp size={14} />
                  </button>
                  <button
                    onClick={() => move(i, 1)}
                    disabled={i === drafts.length - 1 || busy !== null}
                    aria-label="Descer"
                    className="rounded border border-cyber-line p-1.5 text-cyber-white/70 hover:text-cyber-cyan disabled:opacity-30"
                  >
                    <ArrowDown size={14} />
                  </button>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  {dirty && (
                    <button
                      onClick={() =>
                        run(s.id, async () => {
                          await api(`/api/pipeline/stages/${s.id}`, "PATCH", { name: s.name, color: s.color });
                        })
                      }
                      disabled={busy !== null || !s.name.trim()}
                      className="rounded-lg bg-cyber-cyan px-3 py-1 text-xs font-bold text-cyber-bg disabled:opacity-50"
                    >
                      Salvar
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (!window.confirm(`Arquivar a etapa "${s.name}"? Nada é apagado.`)) return;
                      run(s.id, async () => {
                        await api(`/api/pipeline/stages/${s.id}`, "PATCH", { archived: true });
                      });
                    }}
                    disabled={busy !== null}
                    className="flex items-center gap-1 rounded-lg border border-cyber-line px-3 py-1 text-xs text-cyber-white/70 hover:border-cyber-amber hover:text-cyber-amber disabled:opacity-50"
                  >
                    <Archive size={12} /> Arquivar
                  </button>
                </div>
              </li>
            );
          })}
        </ul>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!newName.trim()) return;
            run("new", async () => {
              await api("/api/pipeline/stages", "POST", { name: newName, color: newColor });
              setNewName("");
            });
          }}
          className="mt-4 border-t border-cyber-line pt-4"
        >
          <p className="mb-2 text-sm text-cyber-white/70">Nova etapa</p>
          <div className="flex gap-2">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value.toUpperCase())}
              aria-label="Cor da nova etapa"
              className="h-9 w-9 shrink-0 cursor-pointer rounded border border-cyber-line bg-transparent"
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              maxLength={40}
              placeholder="Nome da etapa"
              className={inputCls}
            />
            <button
              type="submit"
              disabled={busy !== null || !newName.trim()}
              className="shrink-0 rounded-lg bg-cyber-cyan px-4 text-sm font-bold text-cyber-bg disabled:opacity-50"
            >
              Criar
            </button>
          </div>
        </form>

        {busy && (
          <p className="mt-3 flex items-center gap-2 text-xs text-cyber-white/50">
            <Loader2 size={12} className="animate-spin" /> Salvando...
          </p>
        )}
      </div>
    </div>
  );
}
