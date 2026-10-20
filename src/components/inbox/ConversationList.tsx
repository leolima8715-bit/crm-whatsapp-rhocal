"use client";

import { ownerNameOf, type Assignee, type ContactTagsMap, type ConversationRow, type SectorOption, type Tag } from "@/lib/inbox-types";
import { alpha, conversationSector, sectorStyle, type SectorInfo } from "@/lib/sector-style";
import { Plus } from "lucide-react";
import TagChip from "./TagChip";
import SectorTag from "./SectorTag";
import { formatContactLabel, initials, previewLabel, relativeTime } from "@/lib/format";

export type Tab = "all" | "mine" | "unassigned";
export type StatusFilter = "open" | "waiting" | "resolved" | "all";

export type Filters = {
  tab: Tab;
  status: StatusFilter;
  assignee: string; // "" = todos
  instance: string; // "" = todos
  tag: string; // "" = todas
  sector: string; // "" = todos, "none" = sem setor, senão id do setor
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
  tags: Tag[];
  contactTags: ContactTagsMap;
  sectors: SectorOption[];
  sectorChips: SectorInfo[];
  onNewConversation: () => void;
};

function ListTags({ tags, ids }: { tags: Tag[]; ids: string[] | undefined }) {
  if (!ids?.length) return null;
  const mine = ids.map((id) => tags.find((t) => t.id === id)).filter(Boolean) as Tag[];
  if (mine.length === 0) return null;
  return (
    <div className="mt-1 flex items-center gap-1 overflow-hidden">
      {mine.slice(0, 2).map((t) => (
        <TagChip key={t.id} tag={t} small />
      ))}
      {mine.length > 2 && <span className="text-[9px] text-cyber-white/50">+{mine.length - 2}</span>}
    </div>
  );
}

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
  tags,
  contactTags,
  sectors,
  sectorChips,
  onNewConversation,
}: Props) {
  const tabs: { id: Tab; label: string; count: number; extra?: number }[] = [
    { id: "all", label: "Todas", count: counts.all },
    { id: "mine", label: "Minhas", count: counts.mine, extra: counts.mineUnread },
    { id: "unassigned", label: "Sem responsável", count: counts.unassigned },
  ];

  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-cyber-line bg-cyber-panel">
      <div className="space-y-2 border-b border-cyber-line p-3">
        <button
          onClick={onNewConversation}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyber-cyan px-3 py-2 text-sm font-bold text-cyber-bg transition hover:opacity-90"
        >
          <Plus size={16} /> Nova conversa
        </button>
        <input
          type="search"
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-2 text-sm outline-none focus:border-cyber-cyan"
        />

        {sectorChips.length > 0 && (
          <div className="flex flex-wrap gap-1" role="group" aria-label="Filtrar por setor">
            <button
              onClick={() => onFilters({ ...filters, sector: "" })}
              aria-pressed={filters.sector === ""}
              className={`rounded-full border px-2.5 py-1 text-[11px] leading-tight transition ${
                filters.sector === ""
                  ? "border-cyber-cyan bg-cyber-cyan/10 text-cyber-cyan"
                  : "border-cyber-line text-cyber-white/70 hover:border-cyber-cyan/50"
              }`}
            >
              Todos
            </button>
            {sectorChips.map((s) => {
              const key = s.id ?? "none";
              const active = filters.sector === key;
              const st = sectorStyle(s.color);
              return (
                <button
                  key={key}
                  onClick={() => onFilters({ ...filters, sector: active ? "" : key })}
                  aria-pressed={active}
                  style={active ? { borderColor: st.stripe, backgroundColor: st.bg } : undefined}
                  className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-tight transition ${
                    active ? "text-cyber-white" : "border-cyber-line text-cyber-white/70 hover:border-cyber-white/30"
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
        )}

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

        {tags.length > 0 && (
          <select
            value={filters.tag}
            onChange={(e) => onFilters({ ...filters, tag: e.target.value })}
            aria-label="Filtrar por tag"
            className={selectCls}
          >
            <option value="">Tag: todas</option>
            {tags.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}

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
          const sector = conversationSector(c, sectors);
          const label = formatContactLabel(c.contact, sector, ownerNameOf(c, assignees));
          const sc = sectorStyle(sector.color).stripe;
          const selected = selectedId === c.id;
          const hasSector = sector.id !== null;
          return (
            <li key={c.id} className="px-1.5 py-1">
              <button
                onClick={() => onSelect(c.id)}
                style={
                  {
                    "--sec-bg": alpha(sc, selected ? 0.26 : 0.14),
                    "--sec-hover": alpha(sc, 0.2),
                    borderColor: selected ? sc : alpha(sc, 0.35),
                    borderWidth: selected ? 2 : 1,
                    borderLeftWidth: 6,
                    borderLeftColor: sc,
                  } as React.CSSProperties
                }
                className={`flex w-full flex-col gap-1.5 rounded-lg border-solid bg-[var(--sec-bg)] px-3 py-2.5 text-left transition ${
                  selected ? "" : "hover:bg-[var(--sec-hover)]"
                }`}
              >
                <div className="flex w-full items-center justify-between gap-2">
                  <SectorTag sector={sector} className="max-w-[70%]" />
                  <span className="shrink-0 text-xs text-cyber-white/60">
                    {relativeTime(c.last_message_at)}
                  </span>
                </div>
                <div className="flex w-full items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyber-cyan/15 font-mono text-sm font-bold text-cyber-cyan">
                    {initials(label)}
                  </div>
                  <div className="min-w-0 flex-1">
                    <span
                      title={label}
                      style={{ color: hasSector ? sectorStyle(sector.color).text : undefined }}
                      className="block truncate text-sm font-bold"
                    >
                      {label}
                    </span>
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-xs text-cyber-white/70">
                        {c.last_message_at || c.last_message_preview
                          ? previewLabel(c.last_message_preview)
                          : ""}
                      </span>
                      {c.unread_count > 0 && (
                        <span
                          style={hasSector ? { backgroundColor: sc, color: "#07090F" } : undefined}
                          className="shrink-0 rounded-full bg-cyber-orange px-2 py-0.5 text-xs font-bold text-cyber-bg"
                        >
                          {c.unread_count}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
                <ListTags tags={tags} ids={contactTags[c.contact_id]} />
                <p className="w-full truncate font-mono text-[10px] uppercase tracking-wider text-cyber-white/50">
                  {c.instance?.label ?? "Sem número"}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
