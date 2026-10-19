import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { getOrgProfile, validatePassword } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: { id: string } }) {
  try {
    const { orgId } = await requireGestor();
    const admin = createAdminClient();
    const target = await getOrgProfile(admin, params.id, orgId);

    const body = await req.json().catch(() => ({}));
    const password = validatePassword(body?.password);

    const { error } = await admin.auth.admin.updateUserById(target.id, { password });
    if (error) throw new HttpError("Não foi possível redefinir a senha.", 500);

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
