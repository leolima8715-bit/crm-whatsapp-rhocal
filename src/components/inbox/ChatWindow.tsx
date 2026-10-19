import type { Conversation } from "@/lib/mock-data";
import { initials } from "@/lib/format";

const statusLabel = {
  open: "Aberta",
  waiting: "Aguardando",
  resolved: "Resolvida",
} as const;

export default function ChatWindow({
  conversation,
}: {
  conversation: Conversation | null;
}) {
  if (!conversation) {
    return (
      <section className="flex flex-1 items-center justify-center text-cyber-white/50">
        Selecione uma conversa para começar.
      </section>
    );
  }

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-3 border-b border-cyber-line px-5 py-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-cyber-cyan/15 font-mono text-sm font-bold text-cyber-cyan">
          {initials(conversation.name)}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold">{conversation.name}</h2>
          <p className="truncate text-xs text-cyber-white/60">
            {conversation.company}
          </p>
        </div>
        <span className="rounded-full border border-cyber-line px-3 py-1 text-xs text-cyber-amber">
          {statusLabel[conversation.status]}
        </span>
      </header>

      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {conversation.messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.direction === "out" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[70%] rounded-2xl px-4 py-2 text-sm ${
                m.direction === "out"
                  ? "bg-cyber-cyan text-cyber-bg"
                  : "bg-cyber-panel text-cyber-white"
              }`}
            >
              <p className="whitespace-pre-wrap">{m.body}</p>
              <p
                className={`mt-1 text-right font-mono text-[10px] ${
                  m.direction === "out" ? "text-cyber-bg/70" : "text-cyber-white/40"
                }`}
              >
                {m.time}
              </p>
            </div>
          </div>
        ))}
      </div>

      <footer className="border-t border-cyber-line p-3">
        <div className="flex items-center gap-2">
          <input
            disabled
            placeholder="O envio de mensagens será ligado no Passo 8"
            className="flex-1 cursor-not-allowed rounded-lg border border-cyber-line bg-cyber-panel px-3 py-2 text-sm opacity-60"
          />
          <button
            disabled
            className="cursor-not-allowed rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg opacity-40"
          >
            Enviar
          </button>
        </div>
      </footer>
    </section>
  );
}
