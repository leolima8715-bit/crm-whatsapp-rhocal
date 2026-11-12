import type { Admin } from "@/lib/users";

// Chave de comparação de telefone: DDD + 8 últimos dígitos (ignora 55 e o 9º dígito de celular).
export function phoneKey(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  const national = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (national.length < 10) return null;
  return national.slice(0, 2) + national.slice(-8);
}

// O telefone é de um chip (número WhatsApp) da própria empresa? Contatos assim são da equipe.
export async function isCompanyChipPhone(admin: Admin, orgId: string, phone: string): Promise<boolean> {
  const key = phoneKey(phone);
  if (!key) return false;
  const { data, error } = await admin.from("whatsapp_instances").select("phone").eq("org_id", orgId);
  if (error) return false;
  return (data ?? []).some((i) => phoneKey(i.phone as string | null) === key);
}

// Conjunto de chaves dos chips da empresa (para marcar vários contatos de uma vez).
export async function companyChipKeys(admin: Admin, orgId: string): Promise<Set<string>> {
  const { data } = await admin.from("whatsapp_instances").select("phone").eq("org_id", orgId);
  const keys = new Set<string>();
  for (const i of data ?? []) {
    const k = phoneKey(i.phone as string | null);
    if (k) keys.add(k);
  }
  return keys;
}
