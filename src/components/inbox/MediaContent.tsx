"use client";

import { useEffect, useState } from "react";
import { Download, FileText, Loader2 } from "lucide-react";
import { fileNameFromPath } from "@/lib/media";
import type { MessageRow } from "@/lib/inbox-types";

const RETRY_DELAYS_MS = [5000, 12000, 25000];

function Lightbox({ src, onClose }: { src: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-6"
      onClick={onClose}
      role="dialog"
      aria-label="Imagem ampliada"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt="Imagem ampliada"
        className="max-h-full max-w-full rounded-lg object-contain"
        onClick={(e) => e.stopPropagation()}
      />
    </div>
  );
}

export default function MediaContent({ m }: { m: MessageRow }) {
  const isTemp = m.id.startsWith("tmp-");
  const [forced, setForced] = useState(false);
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(false);

  const apiUrl = `/api/media/${m.id}`;
  const src = m.local_url ?? (m.media_path || forced ? apiUrl : null);
  const downloadUrl = m.local_url ?? `${apiUrl}?download=1`;

  // Mídia recebida ainda sem arquivo: tenta de novo (o servidor baixa sob demanda).
  const waiting = !src && m.direction === "in" && !isTemp && !failed;
  useEffect(() => {
    if (!waiting) return;
    let cancelled = false;
    const timers = RETRY_DELAYS_MS.map((delay, i) =>
      setTimeout(async () => {
        if (cancelled) return;
        try {
          const res = await fetch(apiUrl, { redirect: "manual" });
          if (!cancelled && (res.type === "opaqueredirect" || res.ok)) {
            setForced(true);
            return;
          }
        } catch {
          // tenta de novo no próximo ciclo
        }
        if (!cancelled && i === RETRY_DELAYS_MS.length - 1) setFailed(true);
      }, delay)
    );
    return () => {
      cancelled = true;
      timers.forEach(clearTimeout);
    };
  }, [waiting, apiUrl]);

  const name =
    m.local_name ?? fileNameFromPath(m.media_path) ?? (m.type === "document" ? m.body : null) ?? "Documento";
  // Em documentos recebidos o body é o nome do arquivo, não uma legenda.
  const caption = m.type === "document" && m.direction === "in" ? null : m.body;

  let media: React.ReactNode;

  if (failed || (!src && m.direction === "out" && !isTemp)) {
    media = <p className="text-xs italic opacity-70">Mídia indisponível</p>;
  } else if (!src) {
    media = (
      <p className="flex items-center gap-2 text-xs opacity-70">
        <Loader2 size={12} className="animate-spin" /> Carregando mídia…
      </p>
    );
  } else if (m.type === "image") {
    media = (
      <>
        <button type="button" onClick={() => setZoom(true)} className="block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={src}
            alt="Imagem"
            loading="lazy"
            onError={() => setFailed(true)}
            className="max-h-64 max-w-full rounded-lg object-cover"
          />
        </button>
        {zoom && <Lightbox src={src} onClose={() => setZoom(false)} />}
      </>
    );
  } else if (m.type === "sticker") {
    media = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt="Figurinha"
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-28 w-28 object-contain"
      />
    );
  } else if (m.type === "video") {
    media = (
      <video
        src={src}
        controls
        preload="metadata"
        onError={() => setFailed(true)}
        className="max-h-64 max-w-full rounded-lg"
      />
    );
  } else if (m.type === "audio") {
    media = (
      <div className="flex flex-col gap-1">
        <audio
          src={src}
          controls
          preload="none"
          onError={() => setFailed(true)}
          className="h-9 w-60 max-w-full"
        />
        <a href={downloadUrl} download className="text-xs underline opacity-80">
          Baixar
        </a>
      </div>
    );
  } else {
    media = (
      <div className="flex items-center gap-3 rounded-lg border border-current/20 p-3">
        <FileText size={28} className="shrink-0 opacity-80" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="font-mono text-[10px] uppercase opacity-70">{m.media_mime ?? "arquivo"}</p>
        </div>
        <a
          href={downloadUrl}
          download={name}
          className="flex shrink-0 items-center gap-1 rounded-md border border-current/30 px-2 py-1 text-xs font-bold"
        >
          <Download size={12} /> Baixar
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {media}
      {caption && <p className="whitespace-pre-wrap break-words">{caption}</p>}
    </div>
  );
}
