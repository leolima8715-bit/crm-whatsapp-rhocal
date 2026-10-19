import { HttpError } from "@/lib/auth";
import { isUuid } from "@/lib/users";

export function text(v: unknown, label: string, min: number, max: number): string {
  const s = typeof v === "string" ? v.trim() : "";
  if (s.length < min || s.length > max) {
    throw new HttpError(
      min <= 1
        ? `${label}: informe até ${max} caracteres.`
        : `${label}: informe de ${min} a ${max} caracteres.`,
      400
    );
  }
  return s;
}

export function hexColor(v: unknown, fallback = "#00B4D8"): string {
  if (v === undefined || v === null || v === "") return fallback;
  if (typeof v !== "string" || !/^#[0-9A-Fa-f]{6}$/.test(v)) {
    throw new HttpError("Cor inválida. Use o formato #RRGGBB.", 400);
  }
  return v.toUpperCase();
}

export function uuid(v: unknown, label: string): string {
  if (!isUuid(v)) throw new HttpError(`${label} inválido.`, 400);
  return v;
}

export function uuidList(v: unknown, label: string, max: number): string[] {
  if (!Array.isArray(v) || v.length > max || !v.every(isUuid)) {
    throw new HttpError(`${label} inválidos.`, 400);
  }
  return Array.from(new Set(v as string[]));
}

export function money(v: unknown): number {
  const n = typeof v === "string" ? Number(v.replace(",", ".")) : v;
  if (typeof n !== "number" || !Number.isFinite(n) || n < 0 || n > 1e12) {
    throw new HttpError("Valor inválido.", 400);
  }
  return Math.round(n * 100) / 100;
}

// Atalho de resposta rápida: "/" + 1 a 19 letras minúsculas, números ou hífen (2 a 20 no total).
export const SHORTCUT_RE = /^\/[a-z0-9-]{1,19}$/;
