"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { MessageSquare, Search } from "lucide-react";
import NewConversationModal from "@/components/inbox/NewConversationModal";
import { displayName, formatPhone } from "@/lib/format";

export type ContactRow = {
  id: string;
  name: string | null;
  push_name: string | null;
  phone: string;
  chip: string | null;
  owner: string | null;
};

const inputCls =
  "rounded-lg border border-subtle bg-app px-3 py-2 text-sm outline-none focus:border-accent";

export default function ContatosManager({
  contacts,
  total,
  page,
  pageSize,
  isGestor,
  chips,
  people,
  filters,
  loadError,
}: {
  contacts: ContactRow[];
  total: number;
  page: number;
  pageSize: number;
  isGestor: boolean;
  chips: { id: string; label: string }[];
  people: { id: string; name: string }[];
  filters: { q: string; chip: string; owner: string };
  loadError: boolean;
}) {
  const router = useRouter();
  const [chat, setChat] = useState<{ phone: string; name: string } | null>(null);

  const pages = Math.max(1, Math.ceil(total / pageSize));

  function go(next: { q?: string; chip?: string; owner?: string; page?: number }) {
    const p = new URLSearchParams();
    const merged = { ...filters, page: 1, ...next };
    if (merged.q) p.set("q", merged.q);
    if (merged.chip) p.set("chip", merged.chip);
    if (merged.owner) p.set("owner", merged.owner);
    if (merged.page > 1) p.set("page", String(merged.page));
    const qs = p.toString();
    router.push(qs ? `/contatos?${qs}` : "/contatos");
  }

  return (
    <section className="mx-auto w-full max-w-5xl flex-1 p-5">
      <div className="mb-4">
        <h1 className="text-lg font-bold">Contatos</h1>
        <p className="text-sm text-secondary">
          {total} {total === 1 ? "contato" : "contatos"}
        </p>
      </div>

      <form
        key={`${filters.q}|${filters.chip}|${filters.owner}`}
        onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          go({
            q: String(fd.get("q") ?? "").trim(),
            chip: String(fd.get("chip") ?? ""),
            owner: String(fd.get("owner") ?? ""),
          });
        }}
        className="mb-4 flex flex-wrap items-center gap-2"
      >
        <div className="relative min-w-[220px] flex-1">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-secondary" />
          <input
            name="q"
            defaultValue={filters.q}
            maxLength={50}
            placeholder="Buscar por nome ou telefone"
            className={`${inputCls} w-full pl-9`}
          />
        </div>
        {isGestor && (
          <>
            <select name="chip" defaultValue={filters.chip} aria-label="Filtrar por número" className={inputCls}>
              <option value="">Todos os números</option>
              {chips.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            <select name="owner" defaultValue={filters.owner} aria-label="Filtrar por responsável" className={inputCls}>
              <option value="">Todos os responsáveis</option>
              <option value="none">Sem responsável</option>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </>
        )}
        <button
          type="submit"
          className="rounded-lg bg-accent px-4 py-2 text-sm font-bold text-on-accent transition hover:bg-accent-hover"
        >
          Buscar
        </button>
      </form>

      {loadError ? (
        <p className="rounded-lg border border-danger/40 px-4 py-2 text-sm text-danger">
          Não foi possível carregar os contatos.
        </p>
      ) : contacts.length === 0 ? (
        <p className="rounded-lg border border-subtle bg-panel p-8 text-center text-secondary">
          Nenhum contato encontrado.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-subtle bg-panel">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-subtle text-[10px] uppercase tracking-widest text-secondary">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="px-4 py-3">Telefone</th>
                <th className="px-4 py-3">Número de origem</th>
                <th className="px-4 py-3">Responsável</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const name = displayName(c);
                return (
                  <tr key={c.id} className="border-b border-subtle last:border-0">
                    <td className="max-w-[240px] truncate px-4 py-2.5 font-medium">{name}</td>
                    <td className="whitespace-nowrap px-4 py-2.5 text-secondary">{formatPhone(c.phone)}</td>
                    <td className="px-4 py-2.5 text-secondary">{c.chip ?? "—"}</td>
                    <td className="px-4 py-2.5 text-secondary">{c.owner ?? "—"}</td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        onClick={() => setChat({ phone: c.phone, name: c.name || c.push_name || "" })}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-accent/50 px-3 py-1.5 text-sm text-accent-text transition hover:bg-accent/10"
                      >
                        <MessageSquare size={14} /> Conversar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm">
          <button
            disabled={page <= 1}
            onClick={() => go({ page: page - 1 })}
            className="rounded-lg border border-subtle px-3 py-1.5 text-primary transition hover:border-accent disabled:opacity-40"
          >
            Anterior
          </button>
          <span className="text-secondary">
            Página {page} de {pages}
          </span>
          <button
            disabled={page >= pages}
            onClick={() => go({ page: page + 1 })}
            className="rounded-lg border border-subtle px-3 py-1.5 text-primary transition hover:border-accent disabled:opacity-40"
          >
            Próxima
          </button>
        </div>
      )}

      {chat && (
        <NewConversationModal
          initialPhone={chat.phone}
          initialName={chat.name}
          onClose={() => setChat(null)}
          onOpened={(id) => router.push(`/inbox?conversation=${id}`)}
        />
      )}
    </section>
  );
}
