"use client";

import type { StageRow } from "@/lib/inbox-types";
import { alpha } from "@/lib/sector-style";

// Etapa do funil: etiqueta (bolinha + nome) e select para trocar sem sair da conversa.
export default function StageSelect({
  stages,
  stageId,
  disabled,
  onChange,
  variant = "header",
}: {
  stages: StageRow[];
  stageId: string | null;
  disabled?: boolean;
  onChange: (stageId: string) => void;
  variant?: "header" | "panel";
}) {
  if (stages.length === 0) return null;
  const stage = stages.find((s) => s.id === stageId) ?? null;
  const color = stage?.color ?? "#8A93A6";

  return (
    <label
      title="Etapa do funil"
      style={{ borderColor: alpha(color, 0.6), backgroundColor: alpha(color, 0.12) }}
      className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold ${
        variant === "panel" ? "w-full" : ""
      } ${disabled ? "opacity-60" : ""}`}
    >
      <span aria-hidden style={{ backgroundColor: color }} className="h-2.5 w-2.5 shrink-0 rounded-full" />
      <select
        value={stage?.id ?? ""}
        disabled={disabled}
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label="Funil: etapa da conversa"
        style={{ color }}
        className="min-w-0 flex-1 cursor-pointer bg-transparent font-bold outline-none"
      >
        {!stage && <option value="">Sem etapa</option>}
        {stages.map((s) => (
          <option key={s.id} value={s.id} className="bg-cyber-bg text-cyber-white">
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
