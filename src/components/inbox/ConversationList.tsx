"use client";

import type { Assignee, ConversationRow } from "@/lib/inbox-types";
import { displayName, initials, previewLabel, relativeTime } from "@/lib/format";

export type Tab = "all" | "mine" | "unassigned";
export type StatusFilter = "open" | "waiting" | "resolved" | "all";

export type Filters = {
  tab: Tab;
  status: StatusFilter;
  assignee: string; // "" = todos
  instance: string; // "" = todos
};

type Props = {
  conversations: ConversationRow[];
  totalCount: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
  filters: Filters;
  onFilters: (f: Filters) => void;
  counts: { all: number; mine: number; mineUnread: number; unassigned: number };
  isGestor: boolean;
  assignees: Assignee[];
  instances: { id: string; label: string }[];
};

const selectCls =
  "w-full rounded-lg border border-cyber-line bg-cyber-bg px-2 py-1.5 text-xs outline-none focus:border-cyber-cyan";

export default function ConversationList({
  conversations,
  totalCount,
  selectedId,
  onSelect,
  search,
  onSearch,
  filters,
  onFilters,
  counts,
  isGestor,
  assignees,
  instances,
}: Props) {
  const tabs: { id: Tab; label: string; count: number; extra?: number }[] = [
    { id: "all", label: "Todas", count: counts.all },
    { id: "mine", label: "Minhas", count: counts.mine, extra: counts.mineUnread },
    { id: "unassigned", label: "Sem responsável", count: counts.unassigned },
  ];

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-cyber-line bg-cyber-panel">
      <div className="space-y-2 border-b border-cyber-line p-3">
        <input
          type="search"
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-2 text-sm outline-none focus:border-cyber-cyan"
        />

        <div className="flex gap-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              onClick={() => onFilters({ ...filters, tab: t.id })}
              className={`flex-1 rounded-lg border px-1.5 py-1.5 text-[11px] leading-tight transition ${
                filters.tab === t.id
                  ? "border-cyber-cyan bg-cyber-cyan/10 text-cyber-cyan"
                  : "border-cyber-line text-cyber-white/70 hover:border-cyber-cyan/50"
              }`}
            >
              {t.label}
              <span className="ml-1 font-mono">{t.count}</span>
              {t.extra ? (
                <span className="ml-1 rounded-full bg-cyber-orange px-1.5 font-bold text-cyber-bg">
                  {t.extra}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        <select
          value={filters.status}
          onChange={(e) => onFilters({ ...filters, status: e.target.value as StatusFilter })}
          aria-label="Filtrar por status"
          className={selectCls}
        >
          <option value="open">Abertas</option>
          <option value="waiting">Aguardando</option>
          <option value="resolved">Resolvidas</option>
          <option value="all">Todas</option>
        </select>

        {isGestor && (
          <div className="flex gap-2">
            <select
              value={filters.assignee}
              onChange={(e) => onFilters({ ...filters, assignee: e.target.value })}
              aria-label="Filtrar por atendente"
              className={selectCls}
            >
              <option value="">Atendente: todos</option>
              {assignees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.full_name}
                </option>
              ))}
            </select>
            <select
              value={filters.instance}
              onChange={(e) => onFilters({ ...filters, instance: e.target.value })}
              aria-label="Filtrar por número"
              className={selectCls}
            >
              <option value="">Número: todos</option>
              {instances.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      <ul className="flex-1 overflow-y-auto">
        {totalCount === 0 && (
          <li className="p-4 text-sm text-cyber-white/50">
            Nenhuma conversa ainda. Quando chegar uma mensagem, ela aparece aqui.
          </li>
        )}
        {totalCount > 0 && conversations.length === 0 && (
          <li className="p-4 text-sm text-cyber-white/50">Nenhuma conversa encontrada.</li>
        )}

        {conversations.map((c) => {
          const name = displayName(c.contact);
          return (
            <li key={c.id}>
              <button
                onClick={() => onSelect(c.id)}
                className={`flex w-full items-center gap-3 border-b border-cyber-line px-4 py-3 text-left transition hover:bg-cyber-bg/60 ${
                  selectedId === c.id ? "bg-cyber-bg" : ""
                }`}
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyber-cyan/15 font-mono text-sm font-bold text-cyber-cyan">
                  {initials(name)}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{name}</span>
                    <span className="shrink-0 text-xs text-cyber-white/50">
                      {relativeTime(c.last_message_at)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-xs text-cyber-white/60">
                      {c.last_message_at || c.last_message_preview
                        ? previewLabel(c.last_message_preview)
                        : ""}
                    </span>
                    {c.unread_count > 0 && (
                      <span className="shrink-0 rounded-full bg-cyber-orange px-2 py-0.5 text-xs font-bold text-cyber-bg">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-cyber-white/40">
                    {c.instance?.label ?? "Sem número"} ·{" "}
                    {c.assignee?.full_name ??
                      assignees.find((a) => a.id === c.assigned_to)?.full_name ??
                      (c.assigned_to ? "Responsável" : "Sem responsável")}
                  </p>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
