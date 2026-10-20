"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  ownerIdOf,
  ownerNameOf,
  type Assignee,
  type ConversationRow,
  type SectorOption,
  type Tag,
  type TransferEntry,
} from "@/lib/inbox-types";
import { conversationSector } from "@/lib/sector-style";
import ContactOwner from "./ContactOwner";
import { DealSection, NotesSection, TagsSection } from "./ContactExtras";
import { displayName, formatContactLabel, formatPhone, initials } from "@/lib/format";

type ContactFields = NonNullable<ConversationRow["contact"]>;

const labelCls = "font-mono text-xs uppercase tracking-widest text-cyber-cyan";
const inputCls =
  "mt-1 w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-1.5 text-sm outline-none focus:border-cyber-cyan";

function ReadOnly({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className={labelCls}>{label}</dt>
      <dd className="mt-1 break-words text-sm">{value}</dd>
    </div>
  );
}

function dateTime(iso: string) {
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function ContactForm({
  conversation,
  onSaved,
  isGestor,
  assignees,
  onOwnerChanged,
}: {
  conversation: ConversationRow;
  onSaved: (contactId: string, fields: Partial<ContactFields>) => void;
  isGestor: boolean;
  assignees: Assignee[];
  onOwnerChanged: (conversationId: string) => void;
}) {
  const c = conversation.contact;
  const [owner, setOwner] = useState(ownerIdOf(conversation) ?? "");
  // Acompanha mudanças feitas fora do formulário (transferir), para não reverter o responsável.
  useEffect(() => {
    setOwner(ownerIdOf(conversation) ?? "");
  }, [ownerIdOf(conversation)]);
  const [form, setForm] = useState({
    name: c?.name ?? "",
    company: c?.company ?? "",
    email: c?.email ?? "",
    document: c?.document ?? "",
    notes: c?.notes ?? "",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  function set<K extends keyof typeof form>(key: K, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
    setSaved(false);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/contacts/${conversation.contact_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isGestor && owner !== (ownerIdOf(conversation) ?? "")
            ? { ...form, owner_id: owner || null }
            : form
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Erro inesperado. Tente novamente.");
      onSaved(conversation.contact_id, data.contact);
      if (isGestor && owner !== (ownerIdOf(conversation) ?? "")) onOwnerChanged(conversation.id);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 text-sm">
      <label className="block">
        <span className={labelCls}>Nome</span>
        <input
          value={form.name}
          onChange={(e) => set("name", e.target.value)}
          maxLength={120}
          placeholder={c?.push_name ?? ""}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className={labelCls}>Empresa</span>
        <input
          value={form.company}
          onChange={(e) => set("company", e.target.value)}
          maxLength={120}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className={labelCls}>E-mail</span>
        <input
          type="email"
          value={form.email}
          onChange={(e) => set("email", e.target.value)}
          maxLength={254}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className={labelCls}>CNPJ / CPF</span>
        <input
          value={form.document}
          onChange={(e) => set("document", e.target.value)}
          maxLength={30}
          className={inputCls}
        />
      </label>
      <label className="block">
        <span className={labelCls}>Observações</span>
        <textarea
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
          maxLength={2000}
          rows={4}
          className={`${inputCls} resize-none`}
        />
      </label>

      {isGestor && (
        <label className="block">
          <span className={labelCls}>Responsável</span>
          <select
            value={owner}
            onChange={(e) => {
              setOwner(e.target.value);
              setSaved(false);
            }}
            className={inputCls}
          >
            <option value="">Sem responsável</option>
            {assignees.map((a) => (
              <option key={a.id} value={a.id}>
                {a.full_name}
              </option>
            ))}
          </select>
          <span className="mt-1 block text-xs text-cyber-white/50">
            Vale para todas as conversas deste contato.
          </span>
        </label>
      )}

      {error && <p className="text-xs text-cyber-orange">{error}</p>}
      {saved && <p className="text-xs text-cyber-cyan">Contato salvo.</p>}

      <button
        type="submit"
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg hover:opacity-90 disabled:opacity-50"
      >
        {saving ? (
          <>
            <Loader2 size={14} className="animate-spin" /> Salvando...
          </>
        ) : (
          "Salvar"
        )}
      </button>
    </form>
  );
}

function TransferHistory({ conversation }: { conversation: ConversationRow }) {
  const [items, setItems] = useState<TransferEntry[] | null>(null);
  const [failed, setFailed] = useState(false);

  // Recarrega quando a conversa muda de dono ou de setor.
  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    fetch(`/api/conversations/${conversation.id}/transfers`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => !cancelled && setItems(d.transfers ?? []))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [conversation.id, conversation.assigned_to, conversation.sector_id]);

  if (failed) return <p className="text-xs text-cyber-orange">Não foi possível carregar o histórico.</p>;
  if (!items) {
    return (
      <p className="flex items-center gap-2 text-xs text-cyber-white/50">
        <Loader2 size={12} className="animate-spin" /> Carregando...
      </p>
    );
  }
  if (items.length === 0) {
    return <p className="text-xs text-cyber-white/50">Nenhuma transferência registrada.</p>;
  }

  return (
    <ol className="space-y-3 border-l border-cyber-line pl-3">
      {items.map((t) => (
        <li key={t.id} className="relative text-xs">
          <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full bg-cyber-cyan" />
          <p className="font-mono text-[10px] text-cyber-white/40">{dateTime(t.created_at)}</p>
          <p>
            <span className="text-cyber-white/60">{t.from_name ?? "Sem responsável"}</span>
            {" → "}
            <span className="font-semibold">{t.to_name ?? "Sem responsável"}</span>
          </p>
          {(t.from_sector || t.to_sector) && (
            <p className="text-cyber-white/60">
              Setor: {t.from_sector ?? "—"} → {t.to_sector ?? "—"}
            </p>
          )}
          {t.note && <p className="italic text-cyber-white/70">“{t.note}”</p>}
          <p className="text-cyber-white/40">por {t.by_name ?? "—"}</p>
        </li>
      ))}
    </ol>
  );
}

export default function ContactPanel({
  conversation,
  sectors,
  onContactSaved,
  isGestor,
  tags,
  contactTagIds,
  onTagsChange,
  onTagCreated,
  currentUserId,
  assignees,
  onOwnerChanged,
}: {
  currentUserId: string;
  assignees: Assignee[];
  onOwnerChanged: (conversationId: string, movedTo?: string) => void;
  conversation: ConversationRow | null;
  sectors: SectorOption[];
  onContactSaved: (contactId: string, fields: Partial<ContactFields>) => void;
  isGestor: boolean;
  tags: Tag[];
  contactTagIds: string[];
  onTagsChange: (contactId: string, tagIds: string[]) => void;
  onTagCreated: (tag: Tag) => void;
}) {
  if (!conversation) return null;

  const name = displayName(conversation.contact);
  const origin = conversation.instance
    ? conversation.instance.phone
      ? `${conversation.instance.label} · ${formatPhone(conversation.instance.phone)}`
      : conversation.instance.label
    : "—";
  const label = formatContactLabel(
    conversation.contact,
    conversationSector(conversation, sectors),
    ownerNameOf(conversation, assignees)
  );
  const sectorName = conversationSector(conversation, sectors).name;

  return (
    <aside className="hidden w-80 shrink-0 flex-col overflow-y-auto border-l border-cyber-line bg-cyber-panel p-5 xl:flex">
      <div className="flex flex-col items-center text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-cyber-cyan/15 font-mono text-xl font-bold text-cyber-cyan">
          {initials(name)}
        </div>
        <h3 title={label} className="mt-3 w-full truncate text-base font-bold">
          {label}
        </h3>
      </div>

      <dl className="mt-5 space-y-3">
        <ReadOnly
          label="Telefone"
          value={conversation.contact ? formatPhone(conversation.contact.phone) : "—"}
        />
        <ReadOnly label="Número de origem" value={origin} />
        <ContactOwner
          variant="panel"
          conversation={conversation}
          currentUserId={currentUserId}
          isGestor={isGestor}
          assignees={assignees}
          onChanged={onOwnerChanged}
        />
        <ReadOnly label="Setor" value={sectorName} />
      </dl>

      <div className="mt-6 border-t border-cyber-line pt-5">
        <TagsSection
          key={`tags-${conversation.contact_id}`}
          contactId={conversation.contact_id}
          tags={tags}
          selectedIds={contactTagIds}
          isGestor={isGestor}
          onChange={(ids) => onTagsChange(conversation.contact_id, ids)}
          onTagCreated={onTagCreated}
        />
      </div>

      <div className="mt-6 border-t border-cyber-line pt-5">
        <DealSection
          key={`deal-${conversation.contact_id}`}
          contactId={conversation.contact_id}
          contactName={name}
          isGestor={isGestor}
        />
      </div>

      <div className="mt-6 border-t border-cyber-line pt-5">
        <ContactForm
          key={conversation.contact_id}
          conversation={conversation}
          onSaved={onContactSaved}
          isGestor={isGestor}
          assignees={assignees}
          onOwnerChanged={onOwnerChanged}
        />
      </div>

      <div className="mt-6 border-t border-cyber-line pt-5">
        <h4 className={`${labelCls} mb-3`}>Histórico de transferências</h4>
        <TransferHistory key={conversation.id} conversation={conversation} />
      </div>

      <div className="mt-6 border-t border-cyber-line pt-5">
        <NotesSection key={`notes-${conversation.contact_id}`} contactId={conversation.contact_id} />
      </div>
    </aside>
  );
}
