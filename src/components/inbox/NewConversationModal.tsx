"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import { formatPhone } from "@/lib/format";
import { normalizePhone } from "@/lib/phone";
import { sectorStyle } from "@/lib/sector-style";

type UsableInstance = {
  id: string;
  label: string;
  phone: string | null;
  sector: { id: string; name: string; color: string | null } | null;
};

const inputCls =
  "w-full rounded-lg border border-subtle bg-app px-3 py-2 text-sm outline-none focus:border-accent";

type Suggestion = { id: string; name: string | null; push_name: string | null; phone: string };

export default function NewConversationModal({
  onClose,
  onOpened,
  initialPhone = "",
  initialName = "",
}: {
  onClose: () => void;
  initialPhone?: string;
  initialName?: string;
  // existingText: preenche a caixa de digitação quando a conversa já existia (nada foi enviado).
  onOpened: (conversationId: string, existingText?: string) => void;
}) {
  const [instances, setInstances] = useState<UsableInstance[] | null>(null);
  const [instanceId, setInstanceId] = useState("");
  const [phone, setPhone] = useState(initialPhone);
  const [name, setName] = useState(initialName);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Autocomplete: sugere contatos (só os que o usuário pode ver) conforme digita telefone/nome.
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [suggestFor, setSuggestFor] = useState<"phone" | "name" | null>(null);
  const skipSearch = useRef(true); // não busca ao abrir com dados preenchidos nem após escolher

  const searchTerm = (suggestFor === "name" ? name : phone).trim();
  useEffect(() => {
    if (skipSearch.current) {
      skipSearch.current = false;
      return;
    }
    if (!suggestFor || searchTerm.length < 2) {
      setSuggestions([]);
      return;
    }
    const ctrl = new AbortController();
    const t = setTimeout(() => {
      fetch(`/api/contacts/search?q=${encodeURIComponent(searchTerm)}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : Promise.reject()))
        .then((d) => setSuggestions(d.contacts ?? []))
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(t);
      ctrl.abort();
    };
  }, [searchTerm, suggestFor]);

  function pick(c: Suggestion) {
    skipSearch.current = true;
    setPhone(c.phone);
    setName(c.name || c.push_name || "");
    setSuggestions([]);
    setSuggestFor(null);
  }

  const suggestionList =
    suggestions.length > 0 ? (
      <ul className="absolute left-0 right-0 top-full z-10 mt-1 max-h-48 overflow-y-auto rounded-lg border border-subtle bg-panel shadow-xl">
        {suggestions.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(c)}
              className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-app"
            >
              <span className="min-w-0 truncate">{c.name || c.push_name || "Sem nome"}</span>
              <span className="shrink-0 text-xs text-secondary">{formatPhone(c.phone)}</span>
            </button>
          </li>
        ))}
      </ul>
    ) : null;

  useEffect(() => {
    fetch("/api/instances/usable")
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((d) => {
        const list: UsableInstance[] = d.instances ?? [];
        setInstances(list);
        if (list.length === 1) setInstanceId(list[0].id);
      })
      .catch(() => {
        setInstances([]);
        setError("Não foi possível carregar os números.");
      });
  }, []);

  const phoneOk = normalizePhone(phone) !== null;
  const canSend = phoneOk && !!instanceId && !!text.trim() && !sending;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSend) return;
    setSending(true);
    setError(null);
    try {
      const res = await fetch("/api/conversations/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, name: name.trim(), instance_id: instanceId, text: text.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      // Conversa criada mas envio falhou: abre mesmo assim, para o usuário ver o status.
      if (!res.ok && !data?.conversation_id) throw new Error(data?.error ?? "Erro inesperado. Tente novamente.");
      onOpened(data.conversation_id, data.existing ? text.trim() : undefined);
    } catch (err) {
      setError((err as Error).message);
      setSending(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
      <div className="w-full max-w-md rounded-lg border border-subtle bg-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Nova conversa</h2>
          <button
            onClick={onClose}
            disabled={sending}
            aria-label="Fechar"
            className="text-secondary hover:text-danger disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="relative block text-sm">
            <span className="mb-1 block text-secondary">Telefone *</span>
            <input
              autoFocus={!initialPhone}
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => {
                setSuggestFor("phone");
                setPhone(e.target.value);
              }}
              onFocus={() => setSuggestFor("phone")}
              onBlur={() => setSuggestions([])}
              placeholder="(11) 98765-4321"
              autoComplete="off"
              className={inputCls}
            />
            {suggestFor === "phone" && suggestionList}
            {phone && !phoneOk && (
              <span className="mt-1 block text-xs text-danger">
                Informe DDD + número (com ou sem +55).
              </span>
            )}
          </label>

          <label className="relative block text-sm">
            <span className="mb-1 block text-secondary">Nome do contato (recomendado)</span>
            <input
              value={name}
              onChange={(e) => {
                setSuggestFor("name");
                setName(e.target.value);
              }}
              onFocus={() => setSuggestFor("name")}
              onBlur={() => setSuggestions([])}
              maxLength={120}
              autoComplete="off"
              className={inputCls}
            />
            {suggestFor === "name" && suggestionList}
          </label>

          <div className="text-sm">
            <span className="mb-1 block text-secondary">Número de envio *</span>
            {instances === null ? (
              <p className="flex items-center gap-2 text-xs text-secondary">
                <Loader2 size={12} className="animate-spin" /> Carregando...
              </p>
            ) : instances.length === 0 ? (
              <p className="text-xs text-warn">Nenhum número conectado disponível para você.</p>
            ) : (
              <div role="radiogroup" aria-label="Número de envio" className="space-y-1.5">
                {instances.map((i) => {
                  const active = i.id === instanceId;
                  const st = sectorStyle(i.sector?.color);
                  return (
                    <button
                      key={i.id}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      onClick={() => setInstanceId(i.id)}
                      style={active ? { borderColor: st.stripe, backgroundColor: st.bg } : undefined}
                      className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left transition ${
                        active ? "" : "border-subtle hover:border-secondary/50"
                      }`}
                    >
                      <span
                        aria-hidden
                        style={{ backgroundColor: st.stripe }}
                        className="h-3 w-3 shrink-0 rounded-full border border-secondary/50"
                      />
                      <span className="min-w-0 flex-1 truncate">{i.label}</span>
                      <span className="shrink-0 text-[10px] uppercase tracking-wider text-secondary">
                        {i.sector?.name ?? "Sem setor"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-secondary">Primeira mensagem *</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={4096}
              rows={4}
              className={`${inputCls} resize-none`}
            />
          </label>

          <p className="text-xs text-secondary">
            Envie só para quem conhece a empresa. Muitas mensagens para desconhecidos podem bloquear o
            número.
          </p>

          {error && <p className="text-sm text-danger">{error}</p>}

          <button
            type="submit"
            disabled={!canSend}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
          >
            {sending ? (
              <>
                <Loader2 size={16} className="animate-spin" /> Enviando...
              </>
            ) : (
              "Enviar"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}
