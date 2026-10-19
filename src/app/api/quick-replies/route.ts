import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { SHORTCUT_RE, text } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { profile } = await requireProfile();
    const admin = createAdminClient();
    const { data, error } = await admin
      .from("quick_replies")
      .select("id, shortcut, body, created_by")
      .eq("org_id", profile.org_id)
      .eq("archived", false)
      .order("shortcut", { ascending: true });
    if (error) throw new HttpError("Erro ao listar as respostas rápidas.", 500);
    return NextResponse.json({ quick_replies: data ?? [] });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(req: Request) {
  try {
    const { user, profile } = await requireProfile();
    const body = await req.json().catch(() => ({}));

    const shortcut = typeof body?.shortcut === "string" ? body.shortcut.trim().toLowerCase() : "";
    if (!SHORTCUT_RE.test(shortcut)) {
      throw new HttpError(
        "O atalho deve começar com / e ter de 2 a 20 caracteres (letras minúsculas, números e hífen).",
        400
      );
    }
    const replyBody = text(body?.body, "Texto", 1, 4096);

    const admin = createAdminClient();
    const { data: dup } = await admin
      .from("quick_replies")
      .select("id")
      .eq("org_id", profile.org_id)
      .eq("shortcut", shortcut)
      .maybeSingle();
    if (dup) throw new HttpError("Já existe uma resposta com este atalho.", 409);

    const { data, error } = await admin
      .from("quick_replies")
      .insert({ org_id: profile.org_id, shortcut, body: replyBody, created_by: user.id })
      .select("id, shortcut, body, created_by")
      .single();
    if (error) {
      if (error.code === "23505") throw new HttpError("Já existe uma resposta com este atalho.", 409);
      throw new HttpError("Erro ao criar a resposta rápida.", 500);
    }
    return NextResponse.json({ quick_reply: data }, { status: 201 });
  } catch (e) {
    return errorResponse(e);
  }
}
