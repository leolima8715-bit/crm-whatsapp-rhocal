import type { Tag } from "@/lib/inbox-types";

// Escolhe texto claro ou escuro conforme o brilho do fundo da tag.
function textOn(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r * 299 + g * 587 + b * 114) / 1000 > 140 ? "#07090F" : "#F0F4FF";
}

export default function TagChip({
  tag,
  small = false,
  onRemove,
}: {
  tag: Pick<Tag, "name" | "color">;
  small?: boolean;
  onRemove?: () => void;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-full font-semibold ${
        small ? "px-1.5 py-0 text-[9px]" : "px-2.5 py-0.5 text-xs"
      }`}
      style={{ backgroundColor: tag.color, color: textOn(tag.color) }}
    >
      <span className="truncate">{tag.name}</span>
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remover ${tag.name}`} className="opacity-70 hover:opacity-100">
          ×
        </button>
      )}
    </span>
  );
}
