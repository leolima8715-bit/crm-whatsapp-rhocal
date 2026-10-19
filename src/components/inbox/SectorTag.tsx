import { sectorStyle, type SectorInfo } from "@/lib/sector-style";

export default function SectorTag({ sector, className = "" }: { sector: SectorInfo; className?: string }) {
  const s = sectorStyle(sector.color);
  return (
    <span
      title={`Setor: ${sector.name}`}
      style={{ backgroundColor: s.bg, color: s.text, borderColor: s.border }}
      className={`inline-block max-w-full shrink-0 truncate rounded-full border px-2 py-px font-mono text-[10px] uppercase leading-4 tracking-wider ${className}`}
    >
      {sector.name}
    </span>
  );
}
