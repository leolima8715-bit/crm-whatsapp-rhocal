"use client";

import type { Conversation } from "@/lib/mock-data";
import { initials } from "@/lib/format";

type Props = {
  conversations: Conversation[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  search: string;
  onSearch: (value: string) => void;
};

export default function ConversationList({
  conversations,
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
          placeholder="Buscar conversa..."
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-2 text-sm outline-none focus:border-cyber-cyan"
        />
      </div>

      <ul className="flex-1 overflow-y-auto">
        {conversations.length === 0 && (
          <li className="p-4 text-sm text-cyber-white/50">
            Nenhuma conversa encontrada.
          </li>
        )}

        {conversations.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onSelect(c.id)}
              className={`flex w-full items-center gap-3 border-b border-cyber-line px-4 py-3 text-left transition hover:bg-cyber-bg/60 ${
                selectedId === c.id ? "bg-cyber-bg" : ""
              }`}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyber-cyan/15 font-mono text-sm font-bold text-cyber-cyan">
                {initials(c.name)}
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{c.name}</span>
                  <span className="shrink-0 text-xs text-cyber-white/50">
                    {c.lastTime}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-cyber-white/60">
                    {c.lastMessage}
                  </span>
                  {c.unread > 0 && (
                    <span className="shrink-0 rounded-full bg-cyber-orange px-2 py-0.5 text-xs font-bold text-cyber-bg">
                      {c.unread}
                    </span>
                  )}
                </div>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
