// Transforma URLs http(s) do texto em links que abrem em nova aba.
export function linkify(text: string): React.ReactNode[] {
  return text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? (
      <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="underline">
        Abrir no mapa
      </a>
    ) : (
      part
    )
  );
}
