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
  "w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-2 text-sm outline-none focus:border-cyber-cyan";

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
      <div className="w-full max-w-md rounded-lg border border-cyber-line bg-cyber-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">Nova conversa</h2>
          <button
            onClick={onClose}
            disabled={sending}
            aria-label="Fechar"
            className="text-cyber-white/60 hover:text-cyber-orange disabled:opacity-40"
          >
            <X size={18} />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <label className="block text-sm">
            <span className="mb-1 block text-cyber-white/70">Telefone *</span>
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
              <span className="mt-1 block text-xs text-cyber-orange">
                Informe DDD + número (com ou sem +55).
              </span>
            )}
          </label>

          <label className="block text-sm">
            <span className="mb-1 block text-cyber-white/70">Nome do contato (recomendado)</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={120}
              className={inputCls}
            />
          </label>

          <div className="text-sm">
            <span className="mb-1 block text-cyber-white/70">Número de envio *</span>
            {instances === null ? (
              <p className="flex items-center gap-2 text-xs text-cyber-white/50">
                <Loader2 size={12} className="animate-spin" /> Carregando...
              </p>
            ) : instances.length === 0 ? (
              <p className="text-xs text-[#FEB23D]">Nenhum número conectado disponível para você.</p>
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
                        active ? "" : "border-cyber-line hover:border-cyber-white/30"
                      }`}
                    >
                      <span
                        aria-hidden
                        style={{ backgroundColor: st.stripe }}
                        className="h-3 w-3 shrink-0 rounded-full border border-cyber-white/30"
                      />
                      <span className="min-w-0 flex-1 truncate">{i.label}</span>
                      <span className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-cyber-white/60">
                        {i.sector?.name ?? "Sem setor"}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <label className="block text-sm">
            <span className="mb-1 block text-cyber-white/70">Primeira mensagem *</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              maxLength={4096}
              rows={4}
              className={`${inputCls} resize-none`}
            />
          </label>

          <p className="text-xs text-cyber-white/50">
            Envie só para quem conhece a empresa. Muitas mensagens para desconhecidos podem bloquear o
            número.
          </p>

          {error && <p className="text-sm text-cyber-orange">{error}</p>}

          <button
            type="submit"
            disabled={!canSend}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg transition hover:opacity-90 disabled:opacity-50"
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
