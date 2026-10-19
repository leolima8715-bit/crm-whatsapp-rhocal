// Utilitários de mídia compartilhados entre servidor e navegador (sem imports de servidor).

export const BUCKET = "wa-media";
export const MAX_BYTES = 20 * 1024 * 1024;

const EXACT_MIMES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "video/mp4",
  "video/3gpp",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp4",
  "audio/webm",
  "audio/aac",
  "application/pdf",
  "application/msword",
  "application/vnd.ms-excel",
  "text/plain",
  "text/csv",
  "application/zip",
]);

export type MediaKind = "image" | "video" | "audio" | "document";

// "audio/ogg; codecs=opus" -> "audio/ogg"
export function baseMime(mime: string) {
  return mime.split(";")[0].trim().toLowerCase();
}

export function isAllowedMime(mime: string) {
  const m = baseMime(mime);
  return EXACT_MIMES.has(m) || m.startsWith("application/vnd.openxmlformats-officedocument.");
}

export function kindFromMime(mime: string): MediaKind {
  const m = baseMime(mime);
  if (m.startsWith("image/")) return "image";
  if (m.startsWith("video/")) return "video";
  if (m.startsWith("audio/")) return "audio";
  return "document";
}

// Só letras, números, ponto, hífen e sublinhado; sem barras nem "..".
export function sanitizeFileName(name: string) {
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/\.{2,}/g, ".")
    .replace(/^[._]+/, "")
    .slice(-100);
  return cleaned || "arquivo";
}

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/3gpp": "3gp",
  "audio/ogg": "ogg",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/webm": "webm",
  "audio/aac": "aac",
  "application/pdf": "pdf",
  "text/plain": "txt",
  "text/csv": "csv",
  "application/zip": "zip",
};

export function extFromMime(mime: string) {
  return EXT[baseMime(mime)] ?? "bin";
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

// Nome exibido a partir do caminho `${org}/${conversa}/${uuid}-${nome}`.
export function fileNameFromPath(path: string | null) {
  if (!path) return null;
  const last = path.split("/").pop() ?? "";
  return last.replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}-/i, "") || null;
}

export function validateFileClient(file: { type: string; size: number }): string | null {
  if (!file.type || !isAllowedMime(file.type)) {
    return "Tipo de arquivo não suportado. Envie imagem, vídeo, áudio, PDF, Office, texto ou ZIP.";
  }
  if (file.size > MAX_BYTES) {
    return `O arquivo passa do limite de ${formatBytes(MAX_BYTES)}.`;
  }
  if (file.size === 0) return "O arquivo está vazio.";
  return null;
}
