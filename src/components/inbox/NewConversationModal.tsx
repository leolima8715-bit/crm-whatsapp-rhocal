"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
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

export default function NewConversationModal({
  onClose,
  onOpened,
}: {
  onClose: () => void;
  // existingText: preenche a caixa de digitação quando a conversa já existia (nada foi enviado).
  onOpened: (conversationId: string, existingText?: string) => void;
}) {
  const [instances, setInstances] = useState<UsableInstance[] | null>(null);
  const [instanceId, setInstanceId] = useState("");
  const [phone, setPhone] = useState("");
  const [name, setName] = useState("");
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
          <label className="block text-sm">
            <span className="mb-1 block text-secondary">Telefone *</span>
            <input
              autoFocus
              type="tel"
              inputMode="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(11) 98765-4321"
              className={inputCls}
            />
            {phone && !phoneOk && (
              <span className="mt-1 block text-xs text-danger">
                Informe DDD + número (com ou sem +55).
              </span>
            )}
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-secondary">Nome do contato (recomendado)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className={inputCls}
            />
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
