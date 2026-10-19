import type { ConversationRow, SectorOption } from "@/lib/inbox-types";

export const NO_SECTOR_COLOR = "#1A2233";
export const NO_SECTOR_NAME = "SEM SETOR";
export const NO_SECTOR_ID = "none";

export const SECTOR_PALETTE = [
  "#00B4D8",
  "#FF6B2B",
  "#FEB23D",
  "#22C55E",
  "#A855F7",
  "#EF4444",
  "#3B82F6",
  "#EC4899",
] as const;

export const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export type SectorInfo = { id: string | null; name: string; color: string };

const PANEL_BG = "#0D111C"; // cyber-panel: fundo sobre o qual a etiqueta é lida
const MIN_CONTRAST = 4.5;

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function luminance(hex: string) {
  const [r, g, b] = rgb(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

function lighten(hex: string, amount: number) {
  const [r, g, b] = rgb(hex).map((v) => Math.round(v + (255 - v) * amount));
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

function alpha(hex: string, a: number) {
  const [r, g, b] = rgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

export function normalizeColor(color: string | null | undefined) {
  return color && HEX_COLOR_RE.test(color) ? color.toUpperCase() : NO_SECTOR_COLOR;
}

// Único lugar com a lógica de cor do setor: faixa, fundo/texto/borda da etiqueta.
export function sectorStyle(color: string | null | undefined) {
  const base = normalizeColor(color);

  // Clareia o texto até ter contraste legível sobre o fundo escuro.
  let text = base;
  for (let i = 1; contrast(text, PANEL_BG) < MIN_CONTRAST && i <= 20; i++) {
    text = lighten(base, i * 0.05);
  }

  return {
    stripe: base,
    bg: alpha(base, 0.15),
    text,
    border: alpha(base, 0.4),
  };
}

export function sectorInfo(
  sector: { id: string; name: string; color?: string | null } | null | undefined
): SectorInfo {
  return sector
    ? { id: sector.id, name: sector.name, color: normalizeColor(sector.color) }
    : { id: null, name: NO_SECTOR_NAME, color: NO_SECTOR_COLOR };
}

// Setor da conversa = setor do número (instância) pelo qual ela entrou.
export function conversationSector(c: ConversationRow, sectors: SectorOption[]): SectorInfo {
  const inst = c.instance;
  if (inst?.sector) return sectorInfo(inst.sector);
  const found = inst?.sector_id ? sectors.find((s) => s.id === inst.sector_id) : undefined;
  return sectorInfo(found);
}

// Primeira cor da paleta ainda não usada (ou a primeira, se todas estiverem em uso).
export function nextPaletteColor(used: (string | null | undefined)[]) {
  const usedSet = new Set(used.map((c) => normalizeColor(c)));
  return SECTOR_PALETTE.find((c) => !usedSet.has(c)) ?? SECTOR_PALETTE[0];
}
