import type { Admin } from "@/lib/users";

// Chave de comparação de telefone: DDD + 8 últimos dígitos (ignora 55 e o 9º dígito de celular).
// Mesma regra da função SQL public.phone_key (migration 20261116_internal_phones.sql).
export function phoneKey(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  const national = d.startsWith("55") && d.length >= 12 ? d.slice(2) : d;
  if (national.length < 10) return null;
  return national.slice(0, 2) + national.slice(-8);
}

// Conjunto de chaves dos telefones internos da organização:
// chips (whatsapp_instances.phone) + lista de telefones internos (internal_phones: gestores etc.).
export async function internalPhoneKeys(admin: Admin, orgId: string): Promise<Set<string>> {
  const keys = new Set<string>();
  const [chips, extra] = await Promise.all([
    admin.from("whatsapp_instances").select("phone").eq("org_id", orgId),
    admin.from("internal_phones").select("phone").eq("org_id", orgId),
  ]);
  for (const r of [...(chips.data ?? []), ...(extra.data ?? [])]) {
    const k = phoneKey(r.phone as string | null);
    if (k) keys.add(k);
  }
  return keys;
}

// O telefone é interno (chip da empresa ou telefone da lista interna, ex.: gestores)?
// Contatos assim são da equipe: is_internal = true e nunca têm responsável.
export async function isInternalPhone(admin: Admin, orgId: string, phone: string): Promise<boolean> {
  const key = phoneKey(phone);
  if (!key) return false;
  return (await internalPhoneKeys(admin, orgId)).has(key);
}

// Remarca como internos os contatos JÁ existentes cujo telefone bate com um telefone interno
// (o is_internal só era calculado na criação do contato). Só marca; nunca desmarca.
// Contato interno não tem responsável, então o owner_id é limpo junto (triggers sincronizam as conversas).
export async function markInternalContacts(admin: Admin, orgId: string): Promise<number> {
  const keys = await internalPhoneKeys(admin, orgId);
  if (keys.size === 0) return 0;

  const ids: string[] = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await admin
      .from("contacts")
      .select("id, phone")
      .eq("org_id", orgId)
      .eq("is_internal", false)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw new Error("Erro ao ler os contatos.");
    for (const c of data ?? []) {
      const k = phoneKey(c.phone as string | null);
      if (k && keys.has(k)) ids.push(c.id as string);
    }
    if ((data?.length ?? 0) < PAGE) break;
  }

  for (let i = 0; i < ids.length; i += 200) {
    const { error } = await admin
      .from("contacts")
      .update({ is_internal: true, owner_id: null })
      .eq("org_id", orgId)
      .in("id", ids.slice(i, i + 200));
    if (error) throw new Error("Erro ao marcar contatos internos.");
  }
  return ids.length;
}
