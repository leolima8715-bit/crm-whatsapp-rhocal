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
    <div className="mb-3 rounded-lg border border-subtle bg-panel p-3">
      <div className="flex items-start gap-3">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-app">
          {kind === "image" && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Prévia" className="h-full w-full object-cover" />
          ) : kind === "video" && previewUrl ? (
            <video src={previewUrl} className="h-full w-full object-cover" muted />
          ) : (
            <FileText size={28} className="text-accent-text" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{file.name}</p>
          <p className="text-xs text-secondary">{formatBytes(file.size)}</p>
          {kind !== "audio" && (
            <input
              value={caption}
              onChange={(e) => onCaption(e.target.value)}
              disabled={busy}
              maxLength={1024}
              placeholder="Legenda (opcional)"
              className="mt-2 w-full rounded-lg border border-subtle bg-app px-3 py-1.5 text-sm outline-none focus:border-accent disabled:opacity-60"
            />
          )}
        </div>
        <button
          onClick={onCancel}
          disabled={busy}
          aria-label="Cancelar"
          className="text-secondary hover:text-danger disabled:opacity-40"
        >
          <X size={18} />
        </button>
      </div>

      {busy && (
        <div className="mt-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-app">
            <div
              className="h-full bg-accent transition-all"
              style={{ width: `${progress ?? 0}%` }}
            />
          </div>
          <p className="mt-1 text-[10px] uppercase tracking-widest text-warn">
            {progress !== null && progress < 100 ? `Enviando arquivo… ${progress}%` : "Enviando pelo WhatsApp…"}
          </p>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      <div className="mt-3 flex justify-end gap-2">
        <button
          onClick={onCancel}
          disabled={busy}
          className="rounded-lg border border-subtle px-4 py-1.5 text-sm text-primary hover:border-danger hover:text-danger disabled:opacity-40"
        >
          Cancelar
        </button>
        <button
          onClick={onSend}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-accent px-4 py-1.5 text-sm font-bold text-on-accent hover:bg-accent-hover disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin" />} Enviar
        </button>
      </div>
    </div>
  );
}
