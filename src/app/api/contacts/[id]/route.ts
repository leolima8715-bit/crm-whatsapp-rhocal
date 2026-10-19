import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";

export const dynamic = "force-dynamic";

const LIMITS = { name: 120, company: 120, email: 254, document: 30, notes: 2000 } as const;
const LABELS = { name: "nome", company: "empresa", email: "e-mail", document: "documento", notes: "observações" } as const;
type Field = keyof typeof LIMITS;

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  try {
    const { supabase, profile } = await requireProfile();
    if (!isUuid(params.id)) throw new HttpError("Contato não encontrado.", 404);

    // Acesso: uma conversa deste contato visível ao usuário (RLS), ou gestor da organização.
    const { data: viaConversation } = await supabase
      .from("conversations")
      .select("id")
      .eq("contact_id", params.id)
      .limit(1);
    if (!viaConversation?.length && profile.role !== "gestor") {
      throw new HttpError("Contato não encontrado.", 404);
    }

    const body = await req.json().catch(() => ({}));
    const update: Partial<Record<Field, string | null>> = {};

    for (const field of Object.keys(LIMITS) as Field[]) {
      if (body?.[field] === undefined) continue;
      const raw = body[field];
      if (raw !== null && typeof raw !== "string") throw new HttpError("Dados inválidos.", 400);
      const value = typeof raw === "string" ? raw.trim() : "";
      if (value.length > LIMITS[field]) {
        throw new HttpError(`O campo ${LABELS[field]} passa de ${LIMITS[field]} caracteres.`, 400);
      }
      if (field === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        throw new HttpError("Informe um e-mail válido.", 400);
      }
      update[field] = value || null;
    }
    if (Object.keys(update).length === 0) throw new HttpError("Nada para atualizar.", 400);

    // org_id e phone nunca são alterados por esta rota.
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("contacts")
      .update(update)
      .eq("id", params.id)
      .eq("org_id", profile.org_id)
      .select("id, name, company, email, document, notes")
      .maybeSingle();
    if (error) throw new HttpError("Erro ao salvar o contato.", 500);
    if (!data) throw new HttpError("Contato não encontrado.", 404);

    return NextResponse.json({ contact: data });
  } catch (e) {
    return errorResponse(e);
  }
}
