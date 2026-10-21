"use client";

import Link from "next/link";
import { ownerNameOf, type Assignee, type ContactTagsMap, type ConversationRow, type SectorOption, type Tag } from "@/lib/inbox-types";
import { alpha, conversationSector, sectorStyle, type SectorInfo } from "@/lib/sector-style";
import ConversationFilters from "./ConversationFilters";
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
  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-cyber-line bg-cyber-panel">
      <ConversationFilters
        search={search}
        onSearch={onSearch}
        filters={filters}
        onFilters={onFilters}
        counts={counts}
        isGestor={isGestor}
        assignees={assignees}
        instances={instances}
        tags={tags}
        sectorChips={sectorChips}
        onNewConversation={onNewConversation}
      />

      <ul className="min-h-0 flex-1 overflow-y-auto">
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
            <li key={c.id} className="px-1.5 py-0.5">
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
                className={`flex w-full flex-col gap-1 rounded-lg border-solid bg-[var(--sec-bg)] px-3 py-2 text-left transition ${
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
              {!hasSector && isGestor && (
                <Link
                  href="/numeros"
                  className="mt-0.5 block px-3 font-mono text-[10px] uppercase tracking-wider text-cyber-cyan hover:underline"
                >
                  Definir setor
                </Link>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
