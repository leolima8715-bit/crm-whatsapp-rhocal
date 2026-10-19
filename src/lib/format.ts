const TZ = "America/Sao_Paulo";

export function initials(name: string) {
  const letters = name
    .split(" ")
    .filter((part) => /^[A-Za-zÀ-ÿ]/.test(part))
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join("");
  return letters || "#";
}

// 5511999999999 -> +55 11 99999-9999
export function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.startsWith("55") && (d.length === 13 || d.length === 12)) {
    const ddd = d.slice(2, 4);
    const num = d.slice(4);
    return `+55 ${ddd} ${num.slice(0, num.length - 4)}-${num.slice(-4)}`;
  }
  return d ? `+${d}` : phone;
}

export function displayName(
  contact: { name: string | null; push_name: string | null; phone: string } | null
) {
  if (!contact) return "Contato";
  return contact.name || contact.push_name || formatPhone(contact.phone);
}

function dayKey(d: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d); // yyyy-mm-dd
}

export function formatTime(iso: string | null) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

// Hoje = HH:mm, ontem = "Ontem", antes = dd/MM.
export function relativeTime(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const now = new Date();
  if (dayKey(date) === dayKey(now)) return formatTime(iso);
  if (dayKey(date) === dayKey(new Date(now.getTime() - 86_400_000))) return "Ontem";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ,
    day: "2-digit",
    month: "2-digit",
  }).format(date);
}

export const typeLabel: Record<string, string> = {
  image: "[Imagem]",
  audio: "[Áudio]",
  video: "[Vídeo]",
  document: "[Documento]",
  sticker: "[Figurinha]",
  location: "[Localização]",
  contact: "[Contato]",
  other: "[Mensagem]",
};
