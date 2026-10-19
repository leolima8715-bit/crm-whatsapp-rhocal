import type { ConversationRow } from "@/lib/inbox-types";
import { displayName, formatPhone, initials } from "@/lib/format";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="font-mono text-xs uppercase tracking-widest text-cyber-cyan">{label}</dt>
      <dd className="mt-1 break-words">{value}</dd>
    </div>
  );
}

export default function ContactPanel({
  conversation,
}: {
  conversation: ConversationRow | null;
}) {
  if (!conversation) return null;

  const name = displayName(conversation.contact);
  const origin = conversation.instance
    ? conversation.instance.phone
      ? `${conversation.instance.label} · ${formatPhone(conversation.instance.phone)}`
      : conversation.instance.label
    : "—";

  return (
    <aside className="hidden w-72 shrink-0 flex-col border-l border-cyber-line bg-cyber-panel p-5 xl:flex">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cyber-cyan/15 font-mono text-xl font-bold text-cyber-cyan">
          {initials(name)}
        </div>
        <h3 className="mt-3 text-base font-bold">{name}</h3>
        <p className="text-sm text-cyber-white/60">{conversation.contact?.company ?? ""}</p>
      </div>

      <dl className="mt-6 space-y-4 text-sm">
        <Field
          label="Telefone"
          value={conversation.contact ? formatPhone(conversation.contact.phone) : "—"}
        />
        <Field label="Empresa" value={conversation.contact?.company || "—"} />
        <Field label="Número de origem" value={origin} />
        <Field
          label="Responsável"
          value={conversation.assignee?.full_name ?? "Sem responsável"}
        />
      </dl>
    </aside>
  );
}
