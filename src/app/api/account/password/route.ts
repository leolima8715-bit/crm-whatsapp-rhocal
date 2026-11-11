import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireUser } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function validateNewPassword(v: unknown): string {
  if (typeof v !== "string" || v.length < 10) {
    throw new HttpError("A senha deve ter no mínimo 10 caracteres.", 400);
  }
  if (v.length > 72) throw new HttpError("A senha deve ter no máximo 72 caracteres.", 400);
  if (!/[A-Za-z]/.test(v) || !/\d/.test(v)) {
    throw new HttpError("A senha deve conter letras e números.", 400);
  }
  const def = process.env.DEFAULT_PASSWORD;
  if (def && v === def) {
    throw new HttpError("A nova senha precisa ser diferente da senha padrão.", 400);
  }
  return v;
}

export async function POST(req: Request) {
  try {
    const { supabase, user } = await requireUser();
    const body = await req.json().catch(() => ({}));
    const password = validateNewPassword(body?.password);

    // Quem está com troca pendente ainda usa a senha padrão: "mesma senha" = senha padrão.
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      const same = error.code === "same_password";
      throw new HttpError(
        same
          ? "A nova senha precisa ser diferente da atual (senha padrão)."
          : "Não foi possível alterar a senha.",
        same ? 400 : 500
      );
    }

    const admin = createAdminClient();
    const { error: flagErr } = await admin
      .from("profiles")
      .update({ must_change_password: false })
      .eq("id", user.id);
    if (flagErr) {
      console.error("[account] must_change_password não atualizado:", flagErr.message);
      throw new HttpError(
        "Senha alterada, mas não foi possível liberar o acesso. Tente salvar novamente.",
        500
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
