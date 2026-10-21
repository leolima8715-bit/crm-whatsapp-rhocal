"use client";

import { useEffect, useState } from "react";
import { Filter, Plus, X } from "lucide-react";
import type { Assignee, StageRow } from "@/lib/inbox-types";
import { alpha, sectorStyle, type SectorInfo } from "@/lib/sector-style";
import type { Filters, StatusFilter, Tab } from "./ConversationList";

export const DEFAULT_FILTERS: Filters = {
  tab: "all",
  status: "open",
  assignee: "",
  instance: "",
  sector: "",
  stage: "",
};

const TAB_LABEL: Record<Tab, string> = { all: "Todas", mine: "Minhas", unassigned: "Sem responsável" };
const STATUS_LABEL: Record<StatusFilter, string> = {
  open: "Abertas",
  waiting: "Aguardando",
  resolved: "Resolvidas",
  all: "Todos os status",
};

const selectCls =
  "w-full rounded-lg border border-cyber-line bg-cyber-bg px-2 py-1.5 text-xs outline-none focus:border-cyber-cyan";
const sectionCls = "font-mono text-[10px] uppercase tracking-widest text-cyber-cyan";
const pillCls = "rounded-full border px-2.5 py-1 text-[11px] leading-tight transition";
const pillOn = "border-cyber-cyan bg-cyber-cyan/10 text-cyber-cyan";
const pillOff = "border-cyber-line text-cyber-white/70 hover:border-cyber-cyan/50";

type Props = {
  search: string;
  onSearch: (v: string) => void;
  filters: Filters;
  onFilters: (f: Filters) => void;
  counts: { all: number; mine: number; mineUnread: number; unassigned: number };
  isGestor: boolean;
  assignees: Assignee[];
  instances: { id: string; label: string }[];
  sectorChips: SectorInfo[];
  stages: StageRow[];
  onNewConversation: () => void;
};

type ActiveChip = { key: string; label: string; color?: string; clear: () => void };

export default function ConversationFilters({
  search,
  onSearch,
  filters,
  onFilters,
  counts,
  isGestor,
  assignees,
  instances,
  sectorChips,
  stages,
  onNewConversation,
}: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const set = (patch: Partial<Filters>) => onFilters({ ...filters, ...patch });

  // Filtros ativos = os que diferem do padrão (e que o usuário pode ver).
  const active: ActiveChip[] = [];
  if (filters.sector) {
    const s = sectorChips.find((x) => (x.id ?? "none") === filters.sector);
    active.push({
      key: "sector",
      label: s?.name ?? "Setor",
      color: s ? sectorStyle(s.color).stripe : undefined,
      clear: () => set({ sector: "" }),
    });
  }
  if (filters.stage) {
    const st = stages.find((x) => x.id === filters.stage);
    active.push({
      key: "stage",
      label: `Funil: ${st?.name ?? "—"}`,
      color: st?.color,
      clear: () => set({ stage: "" }),
    });
  }
  if (filters.tab !== "all") {
    active.push({ key: "tab", label: TAB_LABEL[filters.tab], clear: () => set({ tab: "all" }) });
  }
  if (filters.status !== "open") {
    active.push({ key: "status", label: STATUS_LABEL[filters.status], clear: () => set({ status: "open" }) });
  }
  if (isGestor && filters.assignee) {
    active.push({
      key: "assignee",
      label: assignees.find((a) => a.id === filters.assignee)?.full_name ?? "Atendente",
      clear: () => set({ assignee: "" }),
    });
  }
  if (isGestor && filters.instance) {
    active.push({
      key: "instance",
      label: instances.find((i) => i.id === filters.instance)?.label ?? "Número",
      clear: () => set({ instance: "" }),
    });
  }

  const tabs: { id: Tab; count: number; extra?: number }[] = [
    { id: "all", count: counts.all },
    { id: "mine", count: counts.mine, extra: counts.mineUnread },
    { id: "unassigned", count: counts.unassigned },
  ];

  return (
    <div className="relative shrink-0 border-b border-cyber-line">
      <div className="flex items-center gap-2 p-2">
        <input
          type="search"
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="min-w-0 flex-1 rounded-lg border border-cyber-line bg-cyber-bg px-3 py-1.5 text-sm outline-none focus:border-cyber-cyan"
        />
        <button
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-label="Filtros"
          title="Filtros"
          className={`relative flex h-9 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-xs transition ${
            open || active.length ? pillOn : pillOff
          }`}
        >
          <Filter size={14} />
          <span className="hidden sm:inline">Filtros</span>
          {active.length > 0 && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-cyber-cyan px-1 font-mono text-[10px] font-bold text-cyber-bg">
              {active.length}
            </span>
          )}
        </button>
        <button
          onClick={onNewConversation}
          aria-label="Nova conversa"
          title="Nova conversa"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-cyber-cyan text-cyber-bg transition hover:opacity-90"
        >
          <Plus size={18} />
        </button>
      </div>

      {active.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 px-2 pb-2">
          {active.map((a) => (
            <span
              key={a.key}
              className="flex max-w-full items-center gap-1 rounded-full border border-cyber-line bg-cyber-bg py-0.5 pl-2 pr-1 text-[11px] leading-tight"
            >
              {a.color && (
                <span
                  aria-hidden
                  style={{ backgroundColor: a.color }}
                  className="h-2 w-2 shrink-0 rounded-full border border-cyber-white/30"
                />
              )}
              <span className="truncate">{a.label}</span>
              <button
                onClick={a.clear}
                aria-label={`Remover filtro ${a.label}`}
                className="rounded-full p-0.5 text-cyber-white/60 hover:text-cyber-orange"
              >
                <X size={11} />
              </button>
            </span>
          ))}
          <button
            onClick={() => onFilters(DEFAULT_FILTERS)}
            className="px-1 text-[11px] text-cyber-cyan underline"
          >
            Limpar
          </button>
        </div>
      )}

      {open && (
        <>
          <div
            aria-hidden
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-20 bg-black/50 md:bg-transparent"
          />
          <div
            role="dialog"
            aria-label="Filtros"
            className="fixed inset-x-0 bottom-0 z-30 max-h-[80vh] overflow-y-auto rounded-t-xl border border-cyber-line bg-cyber-panel p-3 shadow-2xl md:absolute md:inset-x-2 md:bottom-auto md:top-full md:mt-1 md:max-h-[70vh] md:rounded-lg"
          >
            <div className="space-y-3">
              {sectorChips.length > 0 && (
                <section>
                  <h3 className={`${sectionCls} mb-1.5`}>Setor</h3>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por setor">
                    <button
                      onClick={() => set({ sector: "" })}
                      aria-pressed={filters.sector === ""}
                      className={`${pillCls} ${filters.sector === "" ? pillOn : pillOff}`}
                    >
                      Todos
                    </button>
                    {sectorChips.map((s) => {
                      const key = s.id ?? "none";
                      const on = filters.sector === key;
                      const st = sectorStyle(s.color);
                      return (
                        <button
                          key={key}
                          onClick={() => set({ sector: on ? "" : key })}
                          aria-pressed={on}
                          style={on ? { borderColor: st.stripe, backgroundColor: st.bg } : undefined}
                          className={`flex items-center gap-1.5 ${pillCls} ${
                            on ? "text-cyber-white" : "border-cyber-line text-cyber-white/70 hover:border-cyber-white/30"
                          }`}
                        >
                          <span
                            aria-hidden
                            style={{ backgroundColor: st.stripe }}
                            className="h-2 w-2 shrink-0 rounded-full border border-cyber-white/30"
                          />
                          <span className="truncate">{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              <section>
                <h3 className={`${sectionCls} mb-1.5`}>Atribuição</h3>
                <div className="flex gap-1">
                  {tabs.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => set({ tab: t.id })}
                      className={`flex-1 rounded-lg border px-1.5 py-1.5 text-[11px] leading-tight transition ${
                        filters.tab === t.id ? pillOn : pillOff
                      }`}
                    >
                      {TAB_LABEL[t.id]}
                      <span className="ml-1 font-mono">{t.count}</span>
                      {t.extra ? (
                        <span className="ml-1 rounded-full bg-cyber-orange px-1.5 font-bold text-cyber-bg">
                          {t.extra}
                        </span>
                      ) : null}
                    </button>
                  ))}
                </div>
              </section>

              <section>
                <h3 className={`${sectionCls} mb-1.5`}>Status</h3>
                <div className="flex flex-wrap gap-1">
                  {(["open", "waiting", "resolved", "all"] as StatusFilter[]).map((s) => (
                    <button
                      key={s}
                      onClick={() => set({ status: s })}
                      aria-pressed={filters.status === s}
                      className={`${pillCls} ${filters.status === s ? pillOn : pillOff}`}
                    >
                      {s === "all" ? "Todas" : STATUS_LABEL[s]}
                    </button>
                  ))}
                </div>
              </section>

              {stages.length > 0 && (
                <section>
                  <h3 className={`${sectionCls} mb-1.5`}>Funil</h3>
                  <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por funil">
                    <button
                      onClick={() => set({ stage: "" })}
                      aria-pressed={filters.stage === ""}
                      className={`${pillCls} ${filters.stage === "" ? pillOn : pillOff}`}
                    >
                      Todas
                    </button>
                    {stages.map((s) => {
                      const on = filters.stage === s.id;
                      return (
                        <button
                          key={s.id}
                          onClick={() => set({ stage: on ? "" : s.id })}
                          aria-pressed={on}
                          style={on ? { borderColor: s.color, backgroundColor: alpha(s.color, 0.15) } : undefined}
                          className={`flex items-center gap-1.5 ${pillCls} ${
                            on ? "text-cyber-white" : "border-cyber-line text-cyber-white/70 hover:border-cyber-white/30"
                          }`}
                        >
                          <span aria-hidden style={{ backgroundColor: s.color }} className="h-2 w-2 shrink-0 rounded-full" />
                          <span className="truncate">{s.name}</span>
                        </button>
                      );
                    })}
                  </div>
                </section>
              )}

              {isGestor && (
                <section className="grid grid-cols-2 gap-2">
                  <div>
                    <h3 className={`${sectionCls} mb-1.5`}>Atendente</h3>
                    <select
                      value={filters.assignee}
                      onChange={(e) => set({ assignee: e.target.value })}
                      aria-label="Filtrar por atendente"
                      className={selectCls}
                    >
                      <option value="">Todos</option>
                      {assignees.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.full_name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <h3 className={`${sectionCls} mb-1.5`}>Número</h3>
                    <select
                      value={filters.instance}
                      onChange={(e) => set({ instance: e.target.value })}
                      aria-label="Filtrar por número"
                      className={selectCls}
                    >
                      <option value="">Todos</option>
                      {instances.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </section>
              )}
            </div>

            <div className="mt-3 flex gap-2 border-t border-cyber-line pt-3">
              <button
                onClick={() => onFilters(DEFAULT_FILTERS)}
                className="flex-1 rounded-lg border border-cyber-line px-3 py-1.5 text-sm text-cyber-white/80 hover:border-cyber-cyan hover:text-cyber-cyan"
              >
                Limpar
              </button>
              <button
                onClick={() => setOpen(false)}
                className="flex-1 rounded-lg bg-cyber-cyan px-3 py-1.5 text-sm font-bold text-cyber-bg hover:opacity-90"
              >
                Aplicar
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
