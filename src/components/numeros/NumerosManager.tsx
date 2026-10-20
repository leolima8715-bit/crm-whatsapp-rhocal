"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, QrCode, Unplug, Archive, X, Loader2, Tag } from "lucide-react";
import SectorTag from "@/components/inbox/SectorTag";
import { sectorInfo, sectorStyle } from "@/lib/sector-style";

type Status = "disconnected" | "connecting" | "connected";
type Instance = {
  id: string;
  label: string;
  phone: string | null;
  status: Status;
  sector_id: string | null;
};
type Sector = { id: string; name: string; color: string | null };

const statusUi: Record<Status, { text: string; cls: string }> = {
  connected: { text: "Conectado", cls: "border-cyber-cyan/50 text-cyber-cyan" },
  connecting: { text: "Conectando", cls: "border-cyber-amber/50 text-cyber-amber" },
  disconnected: { text: "Desconectado", cls: "border-cyber-orange/50 text-cyber-orange" },
};

function qrSrc(qr: string) {
  return qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`;
}

function formatPhone(p: string) {
  const d = p.replace(/\D/g, "");
  if (d.startsWith("55") && d.length >= 12) {
    const ddd = d.slice(2, 4);
    const num = d.slice(4);
    return `+55 (${ddd}) ${num.slice(0, num.length - 4)}-${num.slice(-4)}`;
  }
  return `+${d}`;
}

async function api(url: string, init?: RequestInit) {
  const res = await fetch(url, init);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Erro inesperado. Tente novamente.");
  return data;
}

export default function NumerosManager({
  instances,
  sectors,
}: {
  instances: Instance[];
  sectors: Sector[];
}) {
  const router = useRouter();

  const [addOpen, setAddOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [sectorId, setSectorId] = useState("");
  const [editSectorId, setEditSectorId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [qrFor, setQrFor] = useState<{ id: string; label: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [pairing, setPairing] = useState<string | null>(null);
  const [qrLoading, setQrLoading] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const closeRef = useRef<() => void>(() => {});

  const fetchQr = useCallback(async (id: string) => {
    setQrLoading(true);
    try {
      const data = await api(`/api/instances/${id}/qr`);
      setQr(data.qr ?? null);
      setPairing(data.pairingCode ?? null);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQrLoading(false);
    }
  }, []);

  function closeQr() {
    setQrFor(null);
    setQr(null);
    setPairing(null);
    setError(null);
  }
  closeRef.current = closeQr;

  // Polling de status (3s) e renovação do QR (30s) enquanto o modal estiver aberto.
  const qrId = qrFor?.id;
  useEffect(() => {
    if (!qrId) return;
    let cancelled = false;

    const poll = setInterval(async () => {
      try {
        const data = await api(`/api/instances/${qrId}/status`);
        if (!cancelled && data.status === "connected") {
          closeRef.current();
          router.refresh();
        }
      } catch {
        // falhas pontuais de polling são ignoradas
      }
    }, 3000);

    const renew = setInterval(() => {
      if (!cancelled) fetchQr(qrId);
    }, 30000);

    return () => {
      cancelled = true;
      clearInterval(poll);
      clearInterval(renew);
    };
  }, [qrId, fetchQr, router]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim() || !sectorId) return;
    setCreating(true);
    setError(null);
    try {
      const data = await api("/api/instances", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), sector_id: sectorId }),
      });
      setQrFor({ id: data.id, label: label.trim() });
      setQr(data.qr ?? null);
      setPairing(null);
      setAddOpen(false);
      setLabel("");
      setSectorId("");
      router.refresh();
      if (!data.qr) fetchQr(data.id);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setCreating(false);
    }
  }

  function openQr(inst: Instance) {
    setError(null);
    setQr(null);
    setPairing(null);
    setQrFor({ id: inst.id, label: inst.label });
    fetchQr(inst.id);
  }

  async function changeSector(inst: Instance, newSectorId: string) {
    if (!newSectorId) return;
    setBusyId(inst.id);
    setError(null);
    try {
      await api(`/api/instances/${inst.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sector_id: newSectorId }),
      });
      setEditSectorId(null);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  async function action(inst: Instance, kind: "logout" | "archive") {
    const msg =
      kind === "logout"
        ? `Desconectar "${inst.label}"? Será preciso ler o QR Code novamente.`
        : `Arquivar "${inst.label}"? Ele sairá desta lista.`;
    if (!window.confirm(msg)) return;
    setBusyId(inst.id);
    setError(null);
    try {
      await api(`/api/instances/${inst.id}/${kind}`, { method: "POST" });
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-4xl flex-1 p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Números WhatsApp</h1>
          <p className="text-sm text-cyber-white/60">Conecte e gerencie os números da operação.</p>
        </div>
        <button
          onClick={() => {
            setError(null);
            setAddOpen(true);
          }}
          className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg transition hover:opacity-90"
        >
          <Plus size={16} /> Adicionar número
        </button>
      </div>

      {error && !qrFor && !addOpen && (
        <p className="mb-4 rounded-lg border border-cyber-orange/40 px-4 py-2 text-sm text-cyber-orange">
          {error}
        </p>
      )}

      {instances.length === 0 ? (
        <p className="rounded-lg border border-cyber-line bg-cyber-panel p-8 text-center text-cyber-white/60">
          Nenhum número cadastrado ainda. Clique em &quot;Adicionar número&quot; para começar.
        </p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2">
          {instances.map((inst) => {
            const ui = statusUi[inst.status];
            const busy = busyId === inst.id;
            const sector = sectors.find((x) => x.id === inst.sector_id);
            const info = sectorInfo(sector);
            return (
              <li
                key={inst.id}
                style={sector ? { borderLeft: `6px solid ${sectorStyle(sector.color).stripe}` } : undefined}
                className="rounded-lg border border-cyber-line bg-cyber-panel p-4"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-bold">{inst.label}</p>
                    <p className="font-mono text-xs text-cyber-white/60">
                      {inst.phone ? formatPhone(inst.phone) : "Aguardando conexão"}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${ui.cls}`}
                  >
                    {ui.text}
                  </span>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <SectorTag sector={info} />
                  {!sector && (
                    <span className="text-xs font-bold text-[#FEB23D]">Defina o setor deste número</span>
                  )}
                </div>

                {editSectorId === inst.id && (
                  <div className="mt-3 flex items-center gap-2">
                    <select
                      autoFocus
                      disabled={busy}
                      value={sector ? sector.id : ""}
                      onChange={(e) => changeSector(inst, e.target.value)}
                      aria-label="Setor do número"
                      className="min-w-0 flex-1 rounded-lg border border-cyber-line bg-cyber-bg px-2 py-1.5 text-sm outline-none focus:border-cyber-cyan"
                    >
                      <option value="" disabled>
                        Selecione o setor
                      </option>
                      {sectors.map((x) => (
                        <option key={x.id} value={x.id} style={{ color: sectorStyle(x.color).text }}>
                          ● {x.name}
                        </option>
                      ))}
                    </select>
                    <button
                      onClick={() => setEditSectorId(null)}
                      aria-label="Cancelar"
                      className="text-cyber-white/60 hover:text-cyber-orange"
                    >
                      <X size={16} />
                    </button>
                  </div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    disabled={busy}
                    onClick={() => setEditSectorId(inst.id)}
                    style={
                      !sector
                        ? { borderColor: "#FEB23D", color: "#FEB23D", backgroundColor: "rgba(254,178,61,0.12)" }
                        : undefined
                    }
                    className="flex items-center gap-2 rounded-lg border border-cyber-line px-3 py-1.5 text-sm text-cyber-white/80 transition hover:border-cyber-cyan hover:text-cyber-cyan disabled:opacity-50"
                  >
                    <Tag size={14} /> Alterar setor
                  </button>
                  {inst.status !== "connected" ? (
                    <button
                      disabled={busy}
                      onClick={() => openQr(inst)}
                      className="flex items-center gap-2 rounded-lg border border-cyber-cyan/50 px-3 py-1.5 text-sm text-cyber-cyan transition hover:bg-cyber-cyan/10 disabled:opacity-50"
                    >
                      <QrCode size={14} /> Conectar / Mostrar QR
                    </button>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => action(inst, "logout")}
                      className="flex items-center gap-2 rounded-lg border border-cyber-line px-3 py-1.5 text-sm text-cyber-white/80 transition hover:border-cyber-orange hover:text-cyber-orange disabled:opacity-50"
                    >
                      <Unplug size={14} /> Desconectar
                    </button>
                  )}
                  <button
                    disabled={busy}
                    onClick={() => action(inst, "archive")}
                    className="flex items-center gap-2 rounded-lg border border-cyber-line px-3 py-1.5 text-sm text-cyber-white/80 transition hover:border-cyber-amber hover:text-cyber-amber disabled:opacity-50"
                  >
                    <Archive size={14} /> Arquivar
                  </button>
                  {busy && <Loader2 size={16} className="animate-spin self-center text-cyber-cyan" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {addOpen && (
        <Modal title="Adicionar número" onClose={() => !creating && setAddOpen(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block text-cyber-white/70">Nome do número</span>
              <input
                autoFocus
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="Ex.: Comercial - Joyce"
                maxLength={60}
                className="w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-2 outline-none focus:border-cyber-cyan"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-cyber-white/70">Setor *</span>
              <select
                required
                value={sectorId}
                onChange={(e) => setSectorId(e.target.value)}
                className="w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-2 outline-none focus:border-cyber-cyan"
              >
                <option value="">Selecione o setor</option>
                {sectors.map((x) => (
                  <option key={x.id} value={x.id} style={{ color: sectorStyle(x.color).text }}>
                    ● {x.name}
                  </option>
                ))}
              </select>
              {sectors.length === 0 && (
                <span className="mt-1 block text-xs text-[#FEB23D]">
                  Cadastre um setor em Usuários antes de adicionar números.
                </span>
              )}
            </label>
            {error && <p className="text-sm text-cyber-orange">{error}</p>}
            <button
              type="submit"
              disabled={creating || !label.trim() || !sectorId}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg transition hover:opacity-90 disabled:opacity-50"
            >
              {creating ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Gerando...
                </>
              ) : (
                "Gerar QR Code"
              )}
            </button>
          </form>
        </Modal>
      )}

      {qrFor && (
        <Modal title={`Conectar · ${qrFor.label}`} onClose={closeQr}>
          <div className="flex flex-col items-center gap-4">
            <div className="flex h-64 w-64 items-center justify-center rounded-lg bg-white p-2">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qrSrc(qr)} alt="QR Code do WhatsApp" className="h-full w-full" />
              ) : qrLoading ? (
                <span className="flex items-center gap-2 text-sm text-neutral-600">
                  <Loader2 size={16} className="animate-spin" /> Carregando QR Code...
                </span>
              ) : (
                <span className="px-4 text-center text-sm text-neutral-600">
                  QR Code indisponível no momento.
                </span>
              )}
            </div>

            {pairing && (
              <p className="font-mono text-sm text-cyber-cyan">Código de pareamento: {pairing}</p>
            )}

            {error && <p className="text-sm text-cyber-orange">{error}</p>}

            <ol className="list-inside list-decimal space-y-1 text-sm text-cyber-white/70">
              <li>Abra o WhatsApp no celular</li>
              <li>Vá em Aparelhos conectados &gt; Conectar um aparelho</li>
              <li>Aponte a câmera para este QR Code</li>
            </ol>

            <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-cyber-amber">
              <Loader2 size={12} className="animate-spin" /> Aguardando leitura · QR renovado a cada 30s
            </p>

            <button
              onClick={() => fetchQr(qrFor.id)}
              disabled={qrLoading}
              className="text-sm text-cyber-cyan underline disabled:opacity-50"
            >
              Gerar novo QR agora
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="w-full max-w-sm rounded-lg border border-cyber-line bg-cyber-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-bold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-cyber-white/60 hover:text-cyber-orange"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
