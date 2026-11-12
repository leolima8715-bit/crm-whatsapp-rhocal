// Etiqueta neutra para contatos da equipe RHOCAL (is_internal).
export default function TeamBadge({ size = "sm" }: { size?: "sm" | "lg" }) {
  return (
    <span
      title="Contato da equipe RHOCAL"
      className={`shrink-0 rounded border border-secondary/40 bg-secondary/15 font-bold uppercase tracking-wider text-secondary ${
        size === "lg" ? "px-2 py-0.5 text-[11px]" : "px-1.5 py-px text-[9px]"
      }`}
    >
      Equipe
    </span>
  );
}
