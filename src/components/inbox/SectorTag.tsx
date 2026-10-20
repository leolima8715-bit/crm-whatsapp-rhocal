import { sectorStyle, type SectorInfo } from "@/lib/sector-style";

// Etiqueta sólida: fundo na cor do setor, texto escuro em negrito (contraste garantido).
export default function SectorTag({
  sector,
  size = "sm",
  className = "",
}: {
  sector: SectorInfo;
  size?: "sm" | "lg";
  className?: string;
}) {
  const s = sectorStyle(sector.color);
  const noSector = sector.id === null;
  return (
    <span
      title={`Setor: ${sector.name}`}
      style={{ backgroundColor: noSector ? "#8A93A6" : s.stripe, color: "#07090F" }}
      className={`inline-block max-w-full shrink-0 truncate rounded-md font-mono font-bold uppercase tracking-wider ${
        size === "lg" ? "px-3 py-1 text-sm leading-5" : "px-2 py-0.5 text-[11px] leading-4"
      } ${className}`}
    >
      {sector.name}
    </span>
  );
}
