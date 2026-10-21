import { HttpError } from "@/lib/auth";
import { HEX_COLOR_RE } from "@/lib/sector-style";
import type { Admin } from "@/lib/users";
import type { ConversationStatus, StageRow } from "@/lib/inbox-types";

export type { StageRow };

export function parseStageName(v: unknown) {
  const name = typeof v === "string" ? v.trim() : "";
  if (!name || name.length > 40) throw new HttpError("Informe um nome de até 40 caracteres.", 400);
  return name;
}

export function parseStageColor(v: unknown) {
  if (typeof v !== "string" || !HEX_COLOR_RE.test(v)) throw new HttpError("Cor inválida.", 400);
  return v.toUpperCase();
}

export const STAGE_SELECT = "id, name, position, color, kind";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();

export function isWaitingStage(s: Pick<StageRow, "name" | "kind">) {
  return s.kind === "open" && norm(s.name).startsWith("aguardando");
}

// Status da conversa que corresponde à etapa.
export function statusForStage(s: Pick<StageRow, "name" | "kind">): ConversationStatus {
  if (s.kind === "done") return "resolved";
  return isWaitingStage(s) ? "waiting" : "open";
}

export async function loadStages(admin: Admin, orgId: string): Promise<StageRow[]> {
  const { data } = await admin
    .from("conversation_stages")
    .select(STAGE_SELECT)
    .eq("org_id", orgId)
    .eq("archived", false)
    .order("position", { ascending: true });
  return (data ?? []) as StageRow[];
}

// Etapas de referência das automações (por nome; se renomeadas, caem na posição entre as abertas).
export function pickStages(stages: StageRow[]) {
  const open = stages.filter((s) => s.kind === "open" && !isWaitingStage(s));
  const byName = (n: string) => stages.find((s) => norm(s.name) === n);
  return {
    novo: byName("novo") ?? open[0] ?? null,
    atendimento: byName("em atendimento") ?? open[1] ?? open[0] ?? null,
    aguardando: stages.find(isWaitingStage) ?? null,
    done: stages.find((s) => s.kind === "done") ?? null,
  };
}

async function moveTo(admin: Admin, convId: string, orgId: string, stage: StageRow) {
  const { error } = await admin
    .from("conversations")
    .update({
      stage_id: stage.id,
      stage_changed_at: new Date().toISOString(),
      status: statusForStage(stage),
    })
    .eq("id", convId)
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
}

type Event = "in" | "out";

// Automações de etapa por mensagem. Nunca lança: falhar aqui não pode derrubar webhook/envio.
export async function applyMessageAutomation(
  admin: Admin,
  args: { conversationId: string; orgId: string; event: Event }
) {
  try {
    const { data: conv } = await admin
      .from("conversations")
      .select("stage_id")
      .eq("id", args.conversationId)
      .eq("org_id", args.orgId)
      .maybeSingle();
    if (!conv) return;

    const stages = await loadStages(admin, args.orgId);
    const ref = pickStages(stages);
    const current = stages.find((s) => s.id === conv.stage_id) ?? null;

    let target: StageRow | null = null;
    if (args.event === "in") {
      if (!current || current.kind === "done") target = ref.novo;
      else if (ref.aguardando && current.id === ref.aguardando.id) target = ref.atendimento;
    } else if (ref.novo && current?.id === ref.novo.id) {
      target = ref.atendimento;
    }

    if (target && target.id !== current?.id) await moveTo(admin, args.conversationId, args.orgId, target);
  } catch (e) {
    console.error("[stages] automação falhou:", (e as Error).message);
  }
}

// Status alterado pelo inbox: resolver -> Concluído; reabrir -> Em atendimento (aguardando -> Aguardando cliente).
export async function syncStageWithStatus(
  admin: Admin,
  args: { conversationId: string; orgId: string; status: ConversationStatus; previous: string }
) {
  try {
    const { data: conv } = await admin
      .from("conversations")
      .select("stage_id")
      .eq("id", args.conversationId)
      .eq("org_id", args.orgId)
      .maybeSingle();
    if (!conv) return;

    const stages = await loadStages(admin, args.orgId);
    const ref = pickStages(stages);
    const current = stages.find((s) => s.id === conv.stage_id) ?? null;

    let target: StageRow | null = null;
    if (args.status === "resolved") {
      if (current?.kind !== "done") target = ref.done;
    } else if (args.status === "waiting") {
      if (current && statusForStage(current) !== "waiting") target = ref.aguardando;
    } else if (current?.kind === "done" || args.previous === "waiting") {
      if (!current || statusForStage(current) !== "open") target = ref.atendimento;
    }

    if (!target || target.id === current?.id) return;
    // Só a etapa muda: o status já foi gravado pela rota.
    const { error } = await admin
      .from("conversations")
      .update({ stage_id: target.id, stage_changed_at: new Date().toISOString() })
      .eq("id", args.conversationId)
      .eq("org_id", args.orgId);
    if (error) throw new Error(error.message);
  } catch (e) {
    console.error("[stages] sincronização com status falhou:", (e as Error).message);
  }
}
