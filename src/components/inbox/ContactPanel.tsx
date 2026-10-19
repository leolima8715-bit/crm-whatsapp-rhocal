import type { Conversation } from "@/lib/mock-data";
import { initials } from "@/lib/format";

export default function ContactPanel({
  conversation,
}: {
  conversation: Conversation | null;
}) {
  if (!conversation) return null;

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-cyber-line bg-cyber-panel p-5 xl:flex">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cyber-cyan/15 font-mono text-xl font-bold text-cyber-cyan">
          {initials(conversation.name)}
        </div>
        <h3 className="mt-3 text-base font-bold">{conversation.name}</h3>
        <p className="text-sm text-cyber-white/60">{conversation.company}</p>
      </div>

      <dl className="mt-6 space-y-4 text-sm">
        <div>
          <dt className="font-mono text-xs uppercase tracking-widest text-cyber-cyan">
            Telefone
          </dt>
          <dd className="mt-1">{conversation.phone}</dd>
        </div>

        <div>
          <dt className="font-mono text-xs uppercase tracking-widest text-cyber-cyan">
            Etapa do funil
          </dt>
          <dd className="mt-1">
            <span className="rounded-full bg-cyber-amber/15 px-3 py-1 text-xs font-semibold text-cyber-amber">
              {conversation.stage}
            </span>
          </dd>
        </div>

        <div>
          <dt className="font-mono text-xs uppercase tracking-widest text-cyber-cyan">
            Tags
          </dt>
          <dd className="mt-1 flex flex-wrap gap-2">
            {conversation.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-cyber-line px-3 py-1 text-xs text-cyber-white/80"
              >
                {tag}
              </span>
            ))}
          </dd>
        </div>
      </dl>
    </aside>
  );
}
