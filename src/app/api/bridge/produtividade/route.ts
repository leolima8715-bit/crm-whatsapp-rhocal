import { createHash, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
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
  esperas: number[];
  semResposta: number;
  maiorEsperaMs: number;
  concluidas: number;
};
const blank = (): Stats => ({
  atendidas: new Set(),
  enviadas: 0,
  novas: 0,
  esperas: [],
  semResposta: 0,
  maiorEsperaMs: 0,
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

    type Conv = { id: string; instance_id: string; owner: string | null };
    const convCache = new Map<string, Conv>();
    const loadConvs = async (ids: string[]) => {
      const missing = ids.filter((id) => !convCache.has(id));
      for (const part of chunk(missing, 150)) {
        const { data, error } = await admin
          .from("conversations")
          .select("id, instance_id, contact:contacts(owner_id)")
          .in("id", part);
        if (error) throw new Error(error.message);
        for (const c of data ?? []) {
          const contact = Array.isArray(c.contact) ? c.contact[0] : c.contact;
          convCache.set(c.id, {
            id: c.id,
            instance_id: c.instance_id,
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
      if (!conv) continue;
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
        st?.esperas.push(t - start);
      }
      if (!st) continue;
      st.enviadas++;
      st.atendidas.add(m.conversation_id);
    }

    // 2) Conversas novas no período, nos chips de cada usuário.
    const novas = await fetchAll<{ instance_id: string }>((f, t) =>
      admin
        .from("conversations")
        .select("instance_id")
        .gte("created_at", ini)
        .lt("created_at", fim)
        .order("created_at", { ascending: true })
        .order("id", { ascending: true })
        .range(f, t)
    );
    for (const c of novas) {
      const o = chipOwner.get(c.instance_id);
      const st = o ? stats.get(o) : undefined;
      if (st) st.novas++;
    }

    // 3) Concluídas: movidas para etapa "done" no período (responsável = dono do contato, senão do chip).
    if (doneIds.length) {
      const done = await fetchAll<{ id: string }>((f, t) =>
        admin
          .from("conversations")
          .select("id")
          .in("stage_id", doneIds)
          .gte("stage_changed_at", ini)
          .lt("stage_changed_at", fim)
          .order("id", { ascending: true })
          .range(f, t)
      );
      await loadConvs(done.map((d) => d.id));
      for (const d of done) {
        const o = convCache.get(d.id)?.owner;
        const st = o ? stats.get(o) : undefined;
        if (st) st.concluidas++;
      }
    }

    // 4) Sem resposta agora: conversas não resolvidas cuja última mensagem é do cliente.
    const abertas = await fetchAll<{ id: string }>((f, t) =>
      admin
        .from("conversations")
        .select("id")
        .neq("status", "resolved")
        .not("last_message_at", "is", null)
        .order("id", { ascending: true })
        .range(f, t)
    );
    await loadConvs(abertas.map((a) => a.id));
    const queue = abertas.map((a) => a.id);
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
        st.semResposta++;
        st.maiorEsperaMs = Math.max(st.maiorEsperaMs, agora - Date.parse(data.created_at));
      }
    };
    await Promise.all(Array.from({ length: 8 }, worker));

    const round1 = (n: number) => Math.round(n * 10) / 10;
    return NextResponse.json({
      de,
      ate,
      usuarios: users.map((u) => {
        const s = stats.get(u.id)!;
        const media = s.esperas.length ? s.esperas.reduce((a, b) => a + b, 0) / s.esperas.length / 60000 : null;
        return {
          email: u.email,
          nome: u.nome,
          conversas_atendidas: s.atendidas.size,
          mensagens_enviadas: s.enviadas,
          conversas_novas: s.novas,
          tempo_medio_primeira_resposta_min: media === null ? null : round1(media),
          sem_resposta_agora: s.semResposta,
          maior_espera_min: Math.round(s.maiorEsperaMs / 60000),
          concluidas: s.concluidas,
        };
      }),
    });
  } catch (e) {
    console.error("[bridge/produtividade]", e instanceof Error ? e.message : e);
    return NextResponse.json({ erro: "Falha ao calcular." }, { status: 500 });
  }
}
