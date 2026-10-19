import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { assertContactAccess } from "@/lib/contacts-server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";
import { money, text, uuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { supabase, user, profile } = await requireProfile();
    const body = await req.json().catch(() => ({}));

    const contact = await assertContactAccess(supabase, profile, uuid(body?.contact_id, "Contato"));
    const title = text(body?.title, "Título", 1, 120);
    const value = body?.value === undefined || body?.value === "" ? 0 : money(body.value);

    const admin = createAdminClient();

    // Etapa: a informada (ativa) ou a primeira.
    let stageId: string;
    if (body?.stage_id !== undefined && body.stage_id !== null) {
      stageId = uuid(body.stage_id, "Etapa");
      const { data } = await admin
        .from("pipeline_stages")
        .select("id")
        .eq("id", stageId)
        .eq("org_id", profile.org_id)
        .eq("archived", false)
        .maybeSingle();
      if (!data) throw new HttpError("Etapa inválida.", 400);
    } else {
      const { data } = await admin
        .from("pipeline_stages")
        .select("id")
        .eq("org_id", profile.org_id)
        .eq("archived", false)
        .order("position", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!data) throw new HttpError("Nenhuma etapa configurada no funil.", 422);
      stageId = data.id;
    }

    // Responsável: o próprio usuário; só o gestor atribui a outra pessoa.
    let ownerId = user.id;
    if (body?.owner_id !== undefined && body.owner_id !== null && body.owner_id !== user.id) {
      if (profile.role !== "gestor") {
        throw new HttpError("Só o gestor pode atribuir o negócio a outra pessoa.", 403);
      }
      if (!isUuid(body.owner_id)) throw new HttpError("Responsável inválido.", 400);
      const { data } = await admin
        .from("profiles")
        .select("id")
        .eq("id", body.owner_id)
        .eq("org_id", profile.org_id)
        .eq("active", true)
        .maybeSingle();
      if (!data) throw new HttpError("Responsável inválido.", 400);
      ownerId = body.owner_id;
    }

    // Posição: fim da coluna.
    const { data: last } = await admin
      .from("deals")
      .select("position")
      .eq("org_id", profile.org_id)
      .eq("stage_id", stageId)
      .order("position", { ascending: false })
      .limit(1)
      .maybeSingle();
    const position = (last?.position ?? -1) + 1;

    const { data, error } = await admin
      .from("deals")
      .insert({
        org_id: profile.org_id,
        contact_id: contact.id,
        stage_id: stageId,
        title,
        value,
        owner_id: ownerId,
        status: "open",
        position,
      })
      .select("id")
      .single();
    if (error) throw new HttpError("Erro ao criar o negócio.", 500);

    return NextResponse.json({ id: data.id }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
