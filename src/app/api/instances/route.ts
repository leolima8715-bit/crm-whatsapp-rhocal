import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireGestor } from "@/lib/auth";
import { evolutionFetch, webhookSettings } from "@/lib/evolution";
import { extractQr } from "@/lib/qr";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function slugify(s: string) {
  return (
    s
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 30) || "numero"
  );
}

function suffix() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < 4; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: Request) {
  try {
    const { orgId } = await requireGestor();
    const body = await req.json().catch(() => ({}));
    const label = typeof body?.label === "string" ? body.label.trim() : "";
    if (!label) throw new HttpError("Informe o nome do número.", 400);

    const admin = createAdminClient();
    const base = slugify(label);

    let instanceName = "";
    for (let i = 0; i < 5; i++) {
      const candidate = `${base}-${suffix()}`;
      const { data } = await admin
        .from("whatsapp_instances")
        .select("id")
        .eq("evolution_instance", candidate)
        .maybeSingle();
      if (!data) {
        instanceName = candidate;
        break;
      }
    }
    if (!instanceName) throw new HttpError("Não foi possível gerar um identificador único.", 500);

    const created = await evolutionFetch("/instance/create", {
      method: "POST",
      body: JSON.stringify({
        instanceName,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        ...(webhookSettings() ? { webhook: webhookSettings() } : {}),
      }),
    });

    const { data: row, error } = await admin
      .from("whatsapp_instances")
      .insert({
        org_id: orgId,
        label,
        evolution_instance: instanceName,
        status: "connecting",
      })
      .select("id")
      .single();
    if (error || !row) throw new HttpError("Erro ao salvar o número.", 500);

    return NextResponse.json({ id: row.id, qr: extractQr(created).qr });
  } catch (e) {
    return errorResponse(e);
  }
}
