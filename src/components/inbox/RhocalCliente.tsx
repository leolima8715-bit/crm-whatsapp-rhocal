"use client";

import { useCallback, useEffect, useState } from "react";
import { ExternalLink, Loader2 } from "lucide-react";

type Oportunidade = { id: string; titulo: string; etapa: string; valor: number | null; link?: string };
type Orcamento = { numero: number; valor: number; status: string; validade: string; link?: string };
type Cliente = {
  id: string;
  nome: string;
  cnpj: string | null;
  cidade: string | null;
  temperatura: string | null;
  vendedor: { nome: string | null; email: string | null } | null;
  oportunidades: Oportunidade[];
  orcamentos: Orcamento[];
  ultimo_pedido: { data: string; valor: number } | null;
  recompra: { previsao: string; itens: string[] } | null;
  link: string;
};
type State =
  | { kind: "loading" }
  | { kind: "ok"; clientes: Cliente[]; baseUrl: string }
  | { kind: "indisponivel" };

const TZ = "America/Sao_Paulo";
const labelCls = "text-xs uppercase tracking-widest text-accent-text";
const linkBtn =
  "flex w-full items-center justify-center gap-2 rounded-lg border border-accent px-3 py-1.5 text-sm font-semibold text-accent-text transition hover:bg-accent/10";

const brl = (v: number | null | undefined) =>
  typeof v === "number"
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v)
    : "—";

const dayKey = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // aaaa-mm-dd

function toKey(v: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  return Number.isNaN(Date.parse(v)) ? null : dayKey(new Date(v));
}

// Aceita "aaaa-mm-dd" ou ISO completo e mostra dd/mm/aaaa (sem deslocar o dia por fuso).
function dateBr(v: string | null | undefined) {
  const key = v ? toKey(v) : null;
  if (!key) return "—";
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

// Dias entre hoje e a validade (negativo = vencido).
function daysUntil(validade: string) {
  const key = toKey(validade);
  if (!key) return 999;
  const [y, m, d] = key.split("-").map(Number);
  const [ty, tm, td] = dayKey(new Date()).split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

function ExtLink({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={className}>
      {children}
    </a>
  );
}

function ClienteView({ c }: { c: Cliente }) {
  return (
    <div className="space-y-3 text-sm">
      <div>
        <p className="break-words font-semibold">{c.nome}</p>
        <p className="text-xs text-secondary">{[c.cnpj, c.cidade].filter(Boolean).join(" · ") || "—"}</p>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        {c.vendedor?.nome && (
          <span className="text-secondary">
            Vendedor: <span className="text-primary">{c.vendedor.nome}</span>
          </span>
        )}
        {c.temperatura && (
          <span className="rounded-full bg-accent/15 px-2 py-0.5 font-semibold uppercase tracking-wider text-accent-text">
            {c.temperatura}
          </span>
        )}
      </div>

      <div>
        <p className={labelCls}>Oportunidades abertas</p>
        {c.oportunidades.length === 0 ? (
          <p className="mt-1 text-xs text-secondary">Nenhuma.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {c.oportunidades.map((o) => {
              const body = (
                <>
                  <span className="min-w-0 flex-1 truncate">{o.titulo}</span>
                  <span className="shrink-0 text-xs text-secondary">
                    {o.etapa} · {brl(o.valor)}
                  </span>
                </>
              );
              return (
                <li key={o.id}>
                  {o.link ? (
                    <ExtLink href={o.link} className="flex items-center gap-2 hover:text-accent-text">
                      {body}
                    </ExtLink>
                  ) : (
                    <span className="flex items-center gap-2">{body}</span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <p className={labelCls}>Orçamentos</p>
        {c.orcamentos.length === 0 ? (
          <p className="mt-1 text-xs text-secondary">Nenhum.</p>
        ) : (
          <ul className="mt-1 space-y-1">
            {c.orcamentos.map((o) => {
              const dias = daysUntil(o.validade);
              const tone =
                dias < 0
                  ? "border-danger/50 bg-danger/10 text-danger"
                  : dias <= 3
                    ? "border-warn/50 bg-warn/10 text-warn"
                    : "border-subtle";
              const body = (
                <>
                  <span className="flex justify-between gap-2">
                    <span className="font-semibold">#{o.numero}</span>
                    <span>{brl(o.valor)}</span>
                  </span>
                  <span className="flex justify-between gap-2 text-xs">
                    <span className="truncate">{o.status}</span>
                    <span className="shrink-0">
                      {dias < 0 ? "Vencido em " : "Válido até "}
                      {dateBr(o.validade)}
                    </span>
                  </span>
                </>
              );
              return (
                <li key={o.numero}>
                  {o.link ? (
                    <ExtLink href={o.link} className={`block rounded-lg border px-2.5 py-1.5 ${tone}`}>
                      {body}
                    </ExtLink>
                  ) : (
                    <div className={`rounded-lg border px-2.5 py-1.5 ${tone}`}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <div>
        <p className={labelCls}>Último pedido</p>
        <p className="mt-1 text-xs">
          {c.ultimo_pedido ? `${dateBr(c.ultimo_pedido.data)} · ${brl(c.ultimo_pedido.valor)}` : "Nenhum pedido."}
        </p>
      </div>

      {c.recompra && (
        <div>
          <p className={labelCls}>Recompra</p>
          <p className="mt-1 text-xs">
            Prevista para {dateBr(c.recompra.previsao)}
            {c.recompra.itens.length > 0 && <span className="text-secondary"> · {c.recompra.itens.join(", ")}</span>}
          </p>
        </div>
      )}

      <ExtLink href={c.link} className={linkBtn}>
        <ExternalLink size={14} /> Abrir no CRM RHOCAL
      </ExtLink>
    </div>
  );
}

export default function RhocalCliente({ conversationId }: { conversationId: string }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [selected, setSelected] = useState(0);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setState({ kind: "loading" });
      setSelected(0);
      fetch(`/api/rhocal/cliente?conversationId=${encodeURIComponent(conversationId)}`, {
        cache: "no-store",
        signal,
      })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) =>
          setState(
            d?.indisponivel
              ? { kind: "indisponivel" }
              : { kind: "ok", clientes: d?.clientes ?? [], baseUrl: d?.base_url ?? "" }
          )
        )
        .catch((e) => {
          if (e?.name !== "AbortError") setState({ kind: "indisponivel" });
        });
    },
    [conversationId]
  );

  // Carrega só quando a conversa é aberta (e recarrega ao trocar de conversa).
  useEffect(() => {
    const ctrl = new AbortController();
    load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  return (
    <section>
      <h4 className={`${labelCls} mb-3`}>Cliente RHOCAL</h4>
      {state.kind === "loading" && (
        <p className="flex items-center gap-2 text-xs text-secondary">
          <Loader2 size={12} className="animate-spin" /> Buscando no CRM RHOCAL...
        </p>
      )}
      {state.kind === "indisponivel" && (
        <div className="space-y-2">
          <p className="text-xs text-warn">CRM RHOCAL indisponível no momento</p>
          <button type="button" onClick={() => load()} className={linkBtn}>
            Tentar de novo
          </button>
        </div>
      )}
      {state.kind === "ok" && state.clientes.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs text-secondary">Cliente não encontrado no CRM RHOCAL</p>
          {state.baseUrl && (
            <ExtLink href={`${state.baseUrl}/clientes`} className={linkBtn}>
              <ExternalLink size={14} /> Abrir CRM RHOCAL
            </ExtLink>
          )}
        </div>
      )}
      {state.kind === "ok" && state.clientes.length > 0 && (
        <div className="space-y-3">
          {state.clientes.length > 1 && (
            <label className="block text-xs">
              <span className="text-secondary">{state.clientes.length} clientes com este telefone</span>
              <select
                value={selected}
                onChange={(e) => setSelected(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-subtle bg-app px-3 py-1.5 text-sm outline-none focus:border-accent"
              >
                {state.clientes.map((c, i) => (
                  <option key={c.id} value={i}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </label>
          )}
          <ClienteView c={state.clientes[Math.min(selected, state.clientes.length - 1)]} />
        </div>
      )}
    </section>
  );
}
