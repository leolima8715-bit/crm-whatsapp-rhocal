// Aceita com ou sem máscara/+55 e devolve só dígitos com DDI 55 (ex.: 5511987654321), ou null.
export function normalizePhone(input: string): string | null {
  let d = input.replace(/\D/g, "").replace(/^0+/, "");
  if (d.length === 10 || d.length === 11) d = `55${d}`;
  return d.length >= 12 && d.length <= 15 ? d : null;
}
