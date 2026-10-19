"use client";

import type { ConversationRow } from "@/lib/inbox-types";
import { displayName, initials, relativeTime } from "@/lib/format";

type Props = {
  conversations: ConversationRow[];
  totalCount: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
};

export default function ConversationList({
  conversations,
  totalCount,
  selectedId,
  onSelect,
  search,
  onSearch,
}: Props) {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-r border-cyber-line bg-cyber-panel">
      <div className="border-b border-cyber-line p-3">
        <input
          type="search"
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-2 text-sm outline-none focus:border-cyber-cyan"
        />
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
                      {c.last_message_preview ?? ""}
                    </span>
                    {c.unread_count > 0 && (
                      <span className="shrink-0 rounded-full bg-cyber-orange px-2 py-0.5 text-xs font-bold text-cyber-bg">
                        {c.unread_count}
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate font-mono text-[10px] uppercase tracking-wider text-cyber-white/40">
                    {c.instance?.label ?? "Sem número"} ·{" "}
                    {c.assignee?.full_name ?? (c.assigned_to ? "Responsável" : "Sem responsável")}
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
