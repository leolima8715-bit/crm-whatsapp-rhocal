import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export class HttpError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export async function requireUser() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new HttpError("Não autenticado.", 401);
  return { supabase, user };
}

export async function requireGestor() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new HttpError("Não autenticado.", 401);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, org_id")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "gestor") {
    throw new HttpError("Acesso restrito ao gestor.", 403);
  }

  return { user, profile, orgId: profile.org_id as string };
}

// Busca a instância garantindo que pertence à organização do gestor.
export async function getOwnedInstance(id: string, orgId: string) {
  const admin = createAdminClient();
  const { data } = await admin
    .from("whatsapp_instances")
    .select("*")
    .eq("id", id)
    .eq("org_id", orgId)
    .maybeSingle();
  if (!data) throw new HttpError("Número não encontrado.", 404);
  return data;
}

export function errorResponse(e: unknown) {
  const status = (e as { status?: number })?.status ?? 500;
  const message = e instanceof Error ? e.message : "Erro inesperado.";
  return NextResponse.json({ error: message }, { status });
}
