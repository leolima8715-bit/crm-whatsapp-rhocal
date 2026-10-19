import { HttpError } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const ROLES = ["gestor", "comercial", "compras"] as const;
export type Role = (typeof ROLES)[number];

export type OrgUser = {
  id: string;
  email: string | null;
  full_name: string;
  role: Role;
  active: boolean;
  sector_ids: string[];
  created_at: string;
};

export type Admin = ReturnType<typeof createAdminClient>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export function validateEmail(v: unknown): string {
  const email = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    throw new HttpError("Informe um e-mail válido.", 400);
  }
  return email;
}

export function validateName(v: unknown): string {
  const name = typeof v === "string" ? v.trim() : "";
  if (name.length < 2 || name.length > 100) {
    throw new HttpError("Informe o nome completo (2 a 100 caracteres).", 400);
  }
  return name;
}

export function validateRole(v: unknown): Role {
  if (typeof v !== "string" || !(ROLES as readonly string[]).includes(v)) {
    throw new HttpError("Papel inválido.", 400);
  }
  return v as Role;
}

export function validatePassword(v: unknown): string {
  if (typeof v !== "string" || v.length < 8) {
    throw new HttpError("A senha deve ter no mínimo 8 caracteres.", 400);
  }
  if (v.length > 72) throw new HttpError("A senha deve ter no máximo 72 caracteres.", 400);
  return v;
}

// Todos os setores precisam existir, estar ativos e pertencer à organização.
export async function validateSectorIds(admin: Admin, orgId: string, v: unknown): Promise<string[]> {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every(isUuid)) throw new HttpError("Setores inválidos.", 400);
  const ids = Array.from(new Set(v as string[]));
  if (ids.length === 0) return [];

  const { data, error } = await admin
    .from("sectors")
    .select("id")
    .eq("org_id", orgId)
    .eq("archived", false)
    .in("id", ids);
  if (error) throw new HttpError("Erro ao validar os setores.", 500);
  if ((data ?? []).length !== ids.length) {
    throw new HttpError("Algum setor não existe nesta organização.", 400);
  }
  return ids;
}

export async function getOrgProfile(admin: Admin, id: string, orgId: string) {
  if (!isUuid(id)) throw new HttpError("Usuário não encontrado.", 404);
  const { data } = await admin
    .from("profiles")
    .select("id, org_id, full_name, role, active")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) throw new HttpError("Usuário não encontrado.", 404);
  return data as { id: string; org_id: string; full_name: string; role: Role; active: boolean };
}

export async function countOtherActiveGestores(admin: Admin, orgId: string, excludeId: string) {
  const { count, error } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("org_id", orgId)
    .eq("role", "gestor")
    .eq("active", true)
    .neq("id", excludeId);
  if (error) throw new HttpError("Erro ao verificar os gestores.", 500);
  return count ?? 0;
}

export async function listOrgUsers(orgId: string): Promise<OrgUser[]> {
  const admin = createAdminClient();

  const { data: profiles, error } = await admin
    .from("profiles")
    .select("id, full_name, role, active, created_at")
    .eq("org_id", orgId)
    .order("full_name", { ascending: true });
  if (error) throw new HttpError("Erro ao listar os usuários.", 500);
  if (!profiles?.length) return [];

  const emails = new Map<string, string>();
  for (let page = 1; page <= 10; page++) {
    const { data, error: authErr } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (authErr) throw new HttpError("Erro ao buscar os e-mails.", 500);
    for (const u of data.users) if (u.email) emails.set(u.id, u.email);
    if (data.users.length < 1000) break;
  }

  const { data: links } = await admin
    .from("profile_sectors")
    .select("profile_id, sector_id")
    .in(
      "profile_id",
      profiles.map((p) => p.id)
    );
  const sectorsByProfile = new Map<string, string[]>();
  for (const l of links ?? []) {
    sectorsByProfile.set(l.profile_id, [...(sectorsByProfile.get(l.profile_id) ?? []), l.sector_id]);
  }

  return profiles.map((p) => ({
    id: p.id,
    email: emails.get(p.id) ?? null,
    full_name: p.full_name,
    role: p.role as Role,
    active: p.active,
    sector_ids: sectorsByProfile.get(p.id) ?? [],
    created_at: p.created_at,
  }));
}
