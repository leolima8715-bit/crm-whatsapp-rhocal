"use client";

import { FileText, Loader2, X } from "lucide-react";
import { formatBytes, kindFromMime } from "@/lib/media";

export default function AttachmentPanel({
  file,
  previewUrl,
  caption,
  onCaption,
  progress,
  busy,
  error,
  onSend,
  onCancel,
}: {
  file: File;
  previewUrl: string | null;
  caption: string;
  onCaption: (v: string) => void;
  progress: number | null;
  busy: boolean;
  error: string | null;
  onSend: () => void;
  onCancel: () => void;
}) {
  const kind = kindFromMime(file.type);

  return (
    <div className="mb-3 rounded-lg border border-cyber-line bg-cyber-panel p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-cyber-bg">
          {kind === "image" && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Prévia" className="h-full w-full object-cover" />
          ) : kind === "video" && previewUrl ? (
            <video src={previewUrl} className="h-full w-full object-cover" muted />
          ) : (
            <FileText size={28} className="text-cyber-cyan" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{file.name}</p>
          <p className="font-mono text-xs text-cyber-white/50">{formatBytes(file.size)}</p>
          {kind !== "audio" && (
            <input
              value={caption}
              onChange={(e) => onCaption(e.target.value)}
              disabled={busy}
              maxLength={1024}
              placeholder="Legenda (opcional)"
              className="mt-2 w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-1.5 text-sm outline-none focus:border-cyber-cyan disabled:opacity-60"
            />
          )}
        </div>
        <button
          onClick={onCancel}
          disabled={busy}
          aria-label="Cancelar"
          className="text-cyber-white/60 hover:text-cyber-orange disabled:opacity-40"
        >
          <X size={18} />
        </button>
      </div>

      {busy && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-cyber-bg">
            <div
              className="h-full bg-cyber-cyan transition-all"
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>
          <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-cyber-amber">
            {progress !== null && progress < 100 ? `Enviando arquivo… ${progress}%` : "Enviando pelo WhatsApp…"}
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-cyber-orange">{error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-cyber-line px-4 py-1.5 text-sm text-cyber-white/80 hover:border-cyber-orange hover:text-cyber-orange disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          onClick={onSend}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-4 py-1.5 text-sm font-bold text-cyber-bg hover:opacity-90 disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />} Enviar
        </button>
      </div>
    </div>
  );
}
