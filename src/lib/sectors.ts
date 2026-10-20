import { HEX_COLOR_RE } from "@/lib/sector-style";
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

// Setor obrigatório, ativo e da mesma organização do usuário.
export async function assertActiveSector(admin: Admin, orgId: string, sectorId: unknown): Promise<string> {
  if (typeof sectorId !== "string" || !sectorId) throw new HttpError("Selecione o setor do número.", 400);
  const { data, error } = await admin
    .from("sectors")
    .select("id")
    .eq("id", sectorId)
    .eq("org_id", orgId)
    .eq("archived", false)
    .maybeSingle();
  if (error) throw new HttpError("Erro ao verificar o setor.", 500);
  if (!data) throw new HttpError("Setor inválido.", 400);
  return data.id;
}

export function validateSectorColor(v: unknown): string {
  if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) {
    throw new HttpError("Cor inválida. Use o formato #RRGGBB.", 400);
  }
  return v.toUpperCase();
}
