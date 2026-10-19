import { HttpError } from "@/lib/auth";
import type { Admin } from "@/lib/users";

export function validateSectorName(v: unknown): string {
  const name = typeof v === "string" ? v.trim().replace(/\s+/g, " ") : "";
  if (name.length < 2 || name.length > 60) {
    throw new HttpError("Informe o nome do setor (2 a 60 caracteres).", 400);
  }
  return name;
}

// Nome único por organização (ignora maiúsculas e inclui setores arquivados).
export async function assertSectorNameFree(
  admin: Admin,
  orgId: string,
  name: string,
  ignoreId?: string
) {
  const { data, error } = await admin
    .from("sectors")
    .select("id, name, archived")
    .eq("org_id", orgId);
  if (error) throw new HttpError("Erro ao verificar o nome do setor.", 500);

  const clash = (data ?? []).find(
    (s) => s.id !== ignoreId && s.name.trim().toLowerCase() === name.toLowerCase()
  );
  if (clash) {
    throw new HttpError(
      clash.archived
        ? "Já existe um setor arquivado com este nome. Escolha outro nome."
        : "Já existe um setor com este nome.",
      409
    );
  }
}
