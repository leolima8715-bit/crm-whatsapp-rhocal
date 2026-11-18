import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgProfile, validatePassword } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { orgId, user: gestor } = await requireGestor();
    const admin = createAdminClient();
    const target = await getOrgProfile(admin, params.id, orgId);

    const body = await req.json().catch(() => ({}));
    const password = validatePassword(body?.password);

    const { error } = await admin.auth.admin.updateUserById(target.id, { password });
    if (error) throw new HttpError("Não foi possível redefinir a senha.", 500);

    // A senha definida pelo gestor é provisória: a pessoa precisa criar a dela no próximo acesso.
    // Se o próprio gestor redefine a sua, a senha já é pessoal e não há o que forçar.
    if (target.id !== gestor.id) {
      const { error: flagErr } = await admin
        .from("profiles")
        .update({ must_change_password: true })
        .eq("id", target.id);
      if (flagErr) {
        console.error("[users] must_change_password não definido:", flagErr.message);
        throw new HttpError(
          "A senha foi redefinida, mas não foi possível exigir a troca no próximo acesso. Tente novamente.",
          500
        );
      }
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
