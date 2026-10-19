import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireUser } from "@/lib/auth";
import { validatePassword } from "@/lib/users";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const { supabase } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const password = validatePassword(body?.password);

    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      throw new HttpError(
        error.code === "same_password"
          ? "A nova senha precisa ser diferente da atual."
          : "Não foi possível alterar a senha.",
        error.code === "same_password" ? 400 : 500
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
