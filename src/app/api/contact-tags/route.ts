import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";

export const dynamic = "force-dynamic";

// Tags de vários contatos de uma vez (sem N+1). Só devolve contatos que o usuário enxerga.
export async function GET(req: Request) {
  try {
    const { supabase, profile } = await requireProfile();
    const raw = new URL(req.url).searchParams.get("contact_ids") ?? "";
    const ids = Array.from(new Set(raw.split(",").filter(Boolean)));
    if (ids.length === 0) return NextResponse.json({ contact_tags: {} });
    if (ids.length > 150 || !ids.every(isUuid)) throw new HttpError("Contatos inválidos.", 400);

    let visible = ids;
    if (profile.role !== "gestor") {
      const { data } = await supabase.from("conversations").select("contact_id").in("contact_id", ids);
      visible = Array.from(new Set((data ?? []).map((r) => r.contact_id as string)));
    }
    if (visible.length === 0) return NextResponse.json({ contact_tags: {} });

    const admin = createAdminClient();
    const { data, error } = await admin
      .from("contact_tags")
      .select("contact_id, tag_id")
      .in("contact_id", visible);
    if (error) throw new HttpError("Erro ao buscar as tags.", 500);

    const map: Record<string, string[]> = {};
    for (const r of data ?? []) (map[r.contact_id] ??= []).push(r.tag_id);
    return NextResponse.json({ contact_tags: map });
  } catch (e) {
    return errorResponse(e);
  }
}
