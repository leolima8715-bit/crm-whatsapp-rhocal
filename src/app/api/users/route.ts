import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  listOrgUsers,
  validateEmail,
  validateName,
  validatePassword,
  validateRole,
  validateSectorIds,
} from "@/lib/users";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { orgId } = await requireGestor();
    return NextResponse.json({ users: await listOrgUsers(orgId) });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { orgId } = await requireGestor();
    const body = await req.json().catch(() => ({}));

    const email = validateEmail(body?.email);
    const fullName = validateName(body?.full_name);
    const role = validateRole(body?.role);
    const password = validatePassword(body?.password);

    const admin = createAdminClient();
    const sectorIds = await validateSectorIds(admin, orgId, body?.sector_ids);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (createErr || !created?.user) {
      const exists =
        createErr?.code === "email_exists" ||
        /already|registered|exists/i.test(createErr?.message ?? "");
      if (exists) throw new HttpError("Já existe um usuário com este e-mail.", 409);
      throw new HttpError("Não foi possível criar o login. Tente novamente.", 500);
    }
    const userId = created.user.id;

    // A partir daqui nada é apagado: se algo falhar, o login já existe e precisa de ajuste manual.
    const { error: profileErr } = await admin.from("profiles").insert({
      id: userId,
      org_id: orgId,
      full_name: fullName,
      role,
      active: true,
    });
    if (profileErr) {
      console.error("[users] perfil não criado:", profileErr.message);
      throw new HttpError(
        `O login de ${email} foi criado (id ${userId}), mas o perfil não pôde ser salvo. ` +
          "Corrija manualmente no Supabase: crie a linha em profiles com este id.",
        500
      );
    }

    if (sectorIds.length > 0) {
      const { error: linkErr } = await admin
        .from("profile_sectors")
        .insert(sectorIds.map((sector_id) => ({ profile_id: userId, sector_id })));
      if (linkErr) {
        console.error("[users] setores não vinculados:", linkErr.message);
        throw new HttpError(
          `O usuário ${email} foi criado, mas os setores não foram vinculados. ` +
            "Abra Editar e salve os setores novamente.",
          500
        );
      }
    }

    return NextResponse.json({ id: userId }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
