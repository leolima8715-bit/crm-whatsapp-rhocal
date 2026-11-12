import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { businessMinutesBetween } from "@/lib/business-hours";
import { createAdminClient } from "@/lib/supabase/admin";

// Ponte servidor-a-servidor (CRM RHOCAL): SOMENTE LEITURA, protegida por BRIDGE_SECRET.
// Devolve só indicadores agregados por usuário — sem conteúdo de mensagens e sem telefones.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Admin = ReturnType<typeof createAdminClient>;

function secretOk(received: string | null) {
  const expected = process.env.BRIDGE_SECRET;
  if (!expected || !received) return false;
  const a = createHash("sha256").update(received).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function validDate(v: string | null): v is string {
  if (!v || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

// America/Sao_Paulo não tem horário de verão desde 2019: UTC-3 fixo.
const TZ_OFFSET = "-03:00";
const startOf = (day: string) => new Date(`${day}T00:00:00${TZ_OFFSET}`);
const nextDay = (day: string) => new Date(startOf(day).getTime() + 86400000);

async function fetchAll<T>(
  build: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[]> {
  const PAGE = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

const chunk = <T,>(arr: T[], n: number) =>
  Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

type Stats = {
  atendidas: Set<string>;
  enviadas: number;
  novas: number;
  esperas: number[]; // minutos úteis
  esperasCorridas: number[]; // minutos corridos
  semResposta: number;
  esquecidas: number;
  maiorEsperaMin: number; // minutos úteis
  concluidas: number;
};
const blank = (): Stats => ({
  atendidas: new Set(),
  enviadas: 0,
  novas: 0,
  esperas: [],
  esperasCorridas: [],
  semResposta: 0,
  esquecidas: 0,
  maiorEsperaMin: 0,
  concluidas: 0,
});

async function listUsers(admin: Admin) {
  const emails = new Map<string, string>();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(error.message);
    for (const u of data.users) if (u.email) emails.set(u.id, u.email.toLowerCase());
    if (data.users.length < 1000) break;
  }
  const profiles = await fetchAll<{ id: string; full_name: string; active: boolean | null }>((f, t) =>
    admin.from("profiles").select("id, full_name, active").order("id", { ascending: true }).range(f, t)
  );
  return profiles
    .filter((p) => p.active !== false && emails.has(p.id))
    .map((p) => ({ id: p.id, email: emails.get(p.id)!, nome: p.full_name }));
}

const REGRAS = {
  conversas_atendidas: "Conversas em que o usuário enviou ao menos 1 mensagem no período.",
  mensagens_enviadas:
    "Mensagens enviadas no período (mensagens enviadas direto pelo celular contam para o dono do chip).",
  conversas_novas: "Conversas criadas no período nos números (chips) do usuário.",
  tempo_medio_primeira_resposta_min:
    "Média do tempo entre uma mensagem do cliente e a próxima resposta enviada, contando só o horário comercial (seg a sex, 08h às 18h, horário de Brasília). Só espera iniciada e respondida dentro do período.",
  tempo_medio_primeira_resposta_corrido_min:
    "Mesma média, mas em minutos corridos (24h, inclui noites e fins de semana). Apenas para referência.",
  sem_resposta_agora:
    "Conversas abertas (não resolvidas e fora de etapa Concluído) cuja última mensagem é do cliente e chegou nos últimos 7 dias.",
  maior_espera_min:
    "Maior tempo, em minutos de horário comercial, que um cliente aguarda resposta entre as conversas de sem_resposta_agora.",
  esquecidas:
    "Conversas abertas cuja última mensagem é do cliente há mais de 7 dias: precisam ser concluídas ou retomadas.",
  concluidas:
    "Conversas distintas movidas para uma etapa do tipo Concluído no período (pelo histórico de etapas; reabrir depois não desfaz a contagem). Responsável: dono do contato, senão dono do chip.",
};

export async function GET(req: Request) {
  if (!secretOk(req.headers.get("x-bridge-secret"))) {
    return new NextResponse(null, { status: 401 });
  }

  const params = new URL(req.url).searchParams;
  const de = params.get("de");
  const ate = params.get("ate");
  const emailFiltro = params.get("email")?.trim().toLowerCase() || null;
  if (!validDate(de) || !validDate(ate) || de > ate) {
    return NextResponse.json({ erro: "Informe de e ate no formato AAAA-MM-DD (de <= ate)." }, { status: 400 });
  }
  if (Date.parse(ate) - Date.parse(de) > 366 * 86400000) {
    return NextResponse.json({ erro: "Período máximo de 366 dias." }, { status: 400 });
  }

  try {
    const admin = createAdminClient();
    const ini = startOf(de).toISOString();
    const fim = nextDay(ate).toISOString(); // exclusivo => "ate" inclusivo
    const agora = Date.now();

    let users = await listUsers(admin);
    if (emailFiltro) users = users.filter((u) => u.email === emailFiltro);
    const stats = new Map(users.map((u) => [u.id, blank()]));

    // Chips (dono do chip recebe o que não tem autor) e etapas "done".
    const instances = await fetchAll<{ id: string; owner_id: string | null }>((f, t) =>
      admin.from("whatsapp_instances").select("id, owner_id").order("id", { ascending: true }).range(f, t)
    );
    const chipOwner = new Map(instances.map((i) => [i.id, i.owner_id]));
    const { data: doneStages } = await admin.from("conversation_stages").select("id").eq("kind", "done");
    const doneIds = (doneStages ?? []).map((s) => s.id as string);

    type Conv = { id: string; instance_id: string; owner: string | null; internal: boolean };
    const convCache = new Map<string, Conv>();
    const loadConvs = async (ids: string[]) => {
      const missing = ids.filter((id) => !convCache.has(id));
      for (const part of chunk(missing, 150)) {
        const { data, error } = await admin
          .from("conversations")
          .select("id, instance_id, contact:contacts(owner_id, is_internal)")
          .in("id", part);
        if (error) throw new Error(error.message);
        for (const c of data ?? []) {
          const contact = Array.isArray(c.contact) ? c.contact[0] : c.contact;
          convCache.set(c.id, {
            id: c.id,
            instance_id: c.instance_id,
            internal: contact?.is_internal === true, // contatos da equipe ficam fora dos indicadores
            owner: (contact?.owner_id as string | null | undefined) ?? chipOwner.get(c.instance_id) ?? null,
          });
        }
      }
    };

    // 1) Mensagens do período: enviadas, atendidas e tempo de primeira resposta.
    const msgs = await fetchAll<{
      conversation_id: string;
      direction: "in" | "out";
      sent_by: string | null;
      status: string;
      created_at: string;
    }>((f, t) =>
      admin
        .from("messages")
        .select("conversation_id, direction, sent_by, status, created_at")
        .gte("created_at", ini)
        .lt("created_at", fim)
        .order("conversation_id", { ascending: true })
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(f, t)
    );
    await loadConvs(Array.from(new Set(msgs.map((m) => m.conversation_id))));

    const waiting = new Map<string, number>(); // conversa -> início da espera
    for (const m of msgs) {
      const conv = convCache.get(m.conversation_id);
      if (!conv || conv.internal) continue;
      const t = Date.parse(m.created_at);
      if (m.direction === "in") {
        if (!waiting.has(m.conversation_id)) waiting.set(m.conversation_id, t);
        continue;
      }
      if (m.status === "failed") continue;
      // Autor; mensagem enviada direto pelo celular (sem usuário) conta para o dono do chip.
      const author = m.sent_by ?? chipOwner.get(conv.instance_id) ?? null;
      const st = author ? stats.get(author) : undefined;
      const start = waiting.get(m.conversation_id);
      if (start !== undefined) {
        waiting.delete(m.conversation_id);
        if (st) {
          st.esperas.push(businessMinutesBetween(start, t));
          st.esperasCorridas.push((t - start) / 60000);
        }
      }
      if (!st) continue;
      st.enviadas++;
      st.atendidas.add(m.conversation_id);
    }

    // 2) Conversas novas no período, nos chips de cada usuário.
    const novas = await fetchAll<{ instance_id: string; contact: { is_internal: boolean | null } | { is_internal: boolean | null }[] | null }>((f, t) =>
      admin
        .from("conversations")
        .select("instance_id, contact:contacts(is_internal)")
        .gte("created_at", ini)
        .lt("created_at", fim)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(f, t)
    );
    for (const c of novas) {
      const ct = Array.isArray(c.contact) ? c.contact[0] : c.contact;
      if (ct?.is_internal) continue;
      const o = chipOwner.get(c.instance_id);
      const st = o ? stats.get(o) : undefined;
      if (st) st.novas++;
    }

    // 3) Concluídas: conversas distintas com evento de mudança de etapa para "done" no período
    // (histórico: concluída e depois reaberta continua contando). Responsável = dono do contato, senão do chip.
    if (doneIds.length) {
      const events = await fetchAll<{ conversation_id: string }>((f, t) =>
        admin
          .from("conversation_stage_events")
          .select("conversation_id")
          .in("to_stage", doneIds)
          .gte("changed_at", ini)
          .lt("changed_at", fim)
          .order("conversation_id", { ascending: true })
          .order("changed_at", { ascending: true })
          .range(f, t)
      );
      const doneConvs = Array.from(new Set(events.map((e) => e.conversation_id)));
      await loadConvs(doneConvs);
      for (const id of doneConvs) {
        const cv = convCache.get(id);
        const st = cv && !cv.internal && cv.owner ? stats.get(cv.owner) : undefined;
        if (st) st.concluidas++;
      }
    }

    // 4) Sem resposta agora: conversas não resolvidas cuja última mensagem é do cliente.
    const doneSet = new Set(doneIds);
    const abertasAll = await fetchAll<{ id: string; stage_id: string | null }>((f, t) =>
      admin
        .from("conversations")
        .select("id, stage_id")
        .neq("status", "resolved")
        .not("last_message_at", "is", null)
        .order("id", { ascending: true })
        .range(f, t)
    );
    const abertas = abertasAll.filter((a) => !a.stage_id || !doneSet.has(a.stage_id));
    await loadConvs(abertas.map((a) => a.id));
    const queue = abertas.filter((a) => !convCache.get(a.id)?.internal).map((a) => a.id);
    const worker = async () => {
      for (let id = queue.pop(); id; id = queue.pop()) {
        const { data } = await admin
          .from("messages")
          .select("direction, created_at")
          .eq("conversation_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (data?.direction !== "in") continue;
        const o = convCache.get(id)?.owner;
        const st = o ? stats.get(o) : undefined;
        if (!st) continue;
        const chegou = Date.parse(data.created_at);
        if (agora - chegou > 7 * 86400000) {
          st.esquecidas++; // sem resposta há mais de 7 dias: concluir ou retomar
          continue;
        }
        st.semResposta++;
        st.maiorEsperaMin = Math.max(st.maiorEsperaMin, businessMinutesBetween(chegou, agora));
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));

    const round1 = (n: number) => Math.round(n * 10) / 10;
    return NextResponse.json({
      de,
      ate,
      regras: REGRAS,
      usuarios: users.map((u) => {
        const s = stats.get(u.id)!;
        const avg = (v: number[]) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
        const media = avg(s.esperas);
        const corrido = avg(s.esperasCorridas);
        return {
          email: u.email,
          nome: u.nome,
          conversas_atendidas: s.atendidas.size,
          mensagens_enviadas: s.enviadas,
          conversas_novas: s.novas,
          tempo_medio_primeira_resposta_min: media === null ? null : round1(media),
          tempo_medio_primeira_resposta_corrido_min: corrido === null ? null : round1(corrido),
          sem_resposta_agora: s.semResposta,
          esquecidas: s.esquecidas,
          maior_espera_min: Math.round(s.maiorEsperaMin),
          concluidas: s.concluidas,
        };
      }),
    });
  } catch (e) {
    console.error("[bridge/produtividade]", e instanceof Error ? e.message : e);
    return NextResponse.json({ erro: "Falha ao calcular." }, { status: 500 });
  }
}
