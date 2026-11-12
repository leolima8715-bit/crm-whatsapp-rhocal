import { NextResponse } from "next/server";
import { errorResponse, HttpError, requireUser } from "@/lib/auth";
import { loadAccessibleConversation } from "@/lib/conversations-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

const TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 5000;
const MAX_ENTRIES = 500;

// Cache em memória (por instância do servidor), por telefone. Só guarda respostas válidas.
const cache = new Map<string, { at: number; data: unknown }>();

export async function GET(req: Request) {
  try {
    const { supabase } = await requireUser();
    const conversationId = new URL(req.url).searchParams.get("conversationId") ?? "";
    // Client do usuário: a RLS (can_access_conversation) decide se ele enxerga a conversa.
    const conv = await loadAccessibleConversation(supabase, conversationId);

    const admin = createAdminClient();
    const { data: contact } = await admin
      .from("contacts")
      .select("phone, is_internal")
      .eq("id", conv.contact_id)
      .eq("org_id", conv.org_id)
      .maybeSingle();
    const phone = (contact?.phone as string | undefined)?.replace(/\D/g, "");
    if (!phone) throw new HttpError("Contato sem telefone.", 422);

    // Contato da equipe RHOCAL não é cliente: não consulta o CRM RHOCAL.
    if (contact?.is_internal) return NextResponse.json({ encontrado: false, clientes: [], interno: true });

    const base = process.env.RHOCAL_CRM_URL?.replace(/\/$/, "");
    const secret = process.env.BRIDGE_SECRET;
    if (!base || !secret) return NextResponse.json({ indisponivel: true });

    const hit = cache.get(phone);
    if (hit && Date.now() - hit.at < TTL_MS) return NextResponse.json(hit.data);

    try {
      const res = await fetch(`${base}/api/bridge/cliente?phone=${encodeURIComponent(phone)}`, {
        headers: { "x-bridge-secret": secret },
        cache: "no-store",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) throw new Error(`status ${res.status}`);
      const json = await res.json();
      const data = {
        encontrado: !!json?.encontrado,
        clientes: Array.isArray(json?.clientes) ? json.clientes : [],
        base_url: base,
      };
      if (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string);
      cache.set(phone, { at: Date.now(), data });
      return NextResponse.json(data);
    } catch (e) {
      console.error("[rhocal/cliente] CRM RHOCAL indisponível:", (e as Error).message);
      return NextResponse.json({ indisponivel: true });
    }
  } catch (e) {
    return errorResponse(e);
  }
}
