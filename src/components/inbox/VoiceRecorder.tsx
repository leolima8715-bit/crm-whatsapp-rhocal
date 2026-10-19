"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Send, Trash2 } from "lucide-react";

function pickMime() {
  if (typeof MediaRecorder === "undefined") return "";
  if (MediaRecorder.isTypeSupported("audio/ogg;codecs=opus")) return "audio/ogg;codecs=opus";
  if (MediaRecorder.isTypeSupported("audio/webm;codecs=opus")) return "audio/webm;codecs=opus";
  return "";
}

function mmss(s: number) {
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

export default function VoiceRecorder({
  onSend,
  onCancel,
  onError,
}: {
  onSend: (file: File) => void;
  onCancel: () => void;
  onError: (message: string) => void;
}) {
  const [seconds, setSeconds] = useState(0);
  const [ready, setReady] = useState(false);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const discardRef = useRef(false);
  const callbacks = useRef({ onSend, onCancel, onError });
  callbacks.current = { onSend, onCancel, onError };

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setInterval> | undefined;
    discardRef.current = false;
    chunksRef.current = [];

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        callbacks.current.onError("Seu navegador não suporta gravação de áudio.");
        callbacks.current.onCancel();
        return;
      }
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      } catch (e) {
        const denied = (e as DOMException)?.name === "NotAllowedError";
        callbacks.current.onError(
          denied
            ? "Permissão do microfone negada. Libere o microfone nas configurações do navegador."
            : "Não foi possível acessar o microfone."
        );
        callbacks.current.onCancel();
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      streamRef.current = stream;

      const mime = pickMime();
      let recorder: MediaRecorder;
      try {
        recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      } catch {
        stream.getTracks().forEach((t) => t.stop());
        callbacks.current.onError("Não foi possível iniciar a gravação de áudio neste navegador.");
        callbacks.current.onCancel();
        return;
      }
      recorderRef.current = recorder;

      recorder.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        if (discardRef.current) return;
        const type = (recorder.mimeType || mime || "audio/webm").split(";")[0];
        const blob = new Blob(chunksRef.current, { type });
        if (blob.size === 0) {
          callbacks.current.onError("A gravação ficou vazia. Tente novamente.");
          callbacks.current.onCancel();
          return;
        }
        const ext = type.includes("ogg") ? "ogg" : "webm";
        callbacks.current.onSend(new File([blob], `audio-${Date.now()}.${ext}`, { type }));
      };

      recorder.start(250);
      setReady(true);
      timer = setInterval(() => setSeconds((s) => s + 1), 1000);
    }

    start();

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      discardRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function finish() {
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
  }

  function cancel() {
    discardRef.current = true;
    const r = recorderRef.current;
    if (r && r.state !== "inactive") r.stop();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    onCancel();
  }

  return (
    <div className="flex items-center gap-3 rounded-lg border border-cyber-line bg-cyber-panel px-3 py-2">
      <button
        onClick={cancel}
        aria-label="Cancelar gravação"
        className="text-cyber-white/60 hover:text-cyber-orange"
      >
        <Trash2 size={18} />
      </button>
      <div className="flex flex-1 items-center gap-2 font-mono text-sm">
        {ready ? (
          <>
            <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-cyber-orange" />
            Gravando… {mmss(seconds)}
          </>
        ) : (
          <span className="flex items-center gap-2 text-cyber-white/60">
            <Loader2 size={14} className="animate-spin" /> Aguardando o microfone…
          </span>
        )}
      </div>
      <button
        onClick={finish}
        disabled={!ready}
        className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-4 py-1.5 text-sm font-bold text-cyber-bg hover:opacity-90 disabled:opacity-50"
      >
        <Send size={14} /> Enviar
      </button>
    </div>
  );
}
