/* eslint-disable @typescript-eslint/no-explicit-any */
export class EvolutionError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

// Somente servidor: nunca importar em componentes client.
export async function evolutionFetch<T = any>(
  path: string,
  init: RequestInit = {}
): Promise<T> {
  const base = process.env.EVOLUTION_URL;
  const apikey = process.env.EVOLUTION_API_KEY;
  if (!base || !apikey) {
    throw new EvolutionError("Evolution API não configurada no servidor.", 500);
  }

  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/+$/, "")}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
        apikey,
      },
      cache: "no-store",
    });
  } catch {
    throw new EvolutionError("Não foi possível conectar à Evolution API.", 502);
  }

  const text = await res.text();
  let data: any = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    const detail =
      (data && (data.response?.message ?? data.message ?? data.error)) || res.statusText;
    const msg = Array.isArray(detail) ? detail.join(", ") : String(detail);
    throw new EvolutionError(`Evolution API (${res.status}): ${msg}`, 502);
  }

  return data as T;
}

// Config de webhook enviada à Evolution (criação e /webhook/set). Null se APP_URL não existir.
export function webhookSettings() {
  const app = process.env.APP_URL;
  const secret = process.env.WEBHOOK_SECRET;
  if (!app || !secret) return null;
  return {
    enabled: true,
    url: `${app.replace(/\/+$/, "")}/api/webhook/evolution`,
    byEvents: false,
    base64: false,
    headers: { "x-webhook-secret": secret },
    events: ["MESSAGES_UPSERT", "MESSAGES_UPDATE", "CONNECTION_UPDATE"],
  };
}
