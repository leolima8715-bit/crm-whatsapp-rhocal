"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DndContext, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { Settings2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { fetchConversation, fetchConversations } from "@/lib/inbox-queries";
import { displayName, formatContactLabel, previewLabel, relativeTime } from "@/lib/format";
import {
  ownerIdOf,
  ownerNameOf,
  type Assignee,
  type ConversationRow,
  type SectorOption,
  type StageRow,
} from "@/lib/inbox-types";
import { alpha, conversationSector, sectorInfo, sectorStyle, type SectorInfo } from "@/lib/sector-style";
import SectorTag from "@/components/inbox/SectorTag";
import StagesEditor from "./StagesEditor";

const byRecent = (a: ConversationRow, b: ConversationRow) =>
  (b.last_message_at ? Date.parse(b.last_message_at) : 0) -
  (a.last_message_at ? Date.parse(a.last_message_at) : 0);

const selectCls =
  "rounded-lg border border-cyber-line bg-cyber-bg px-2 py-1.5 text-xs outline-none focus:border-cyber-cyan";

function Card({
  c,
  sectors,
  assignees,
  overlay = false,
  onOpen,
}: {
  c: ConversationRow;
  sectors: SectorOption[];
  assignees: Assignee[];
  overlay?: boolean;
  onOpen?: () => void;
}) {
  const sector = conversationSector(c, sectors);
  const owner = ownerNameOf(c, assignees);
  const stripe = sectorStyle(sector.color).stripe;
  const label = formatContactLabel(c.contact, sector, owner);

  return (
    <div
      onClick={onOpen}
      style={{
        borderLeft: `6px solid ${stripe}`,
        borderColor: alpha(stripe, 0.35),
        borderLeftColor: stripe,
        backgroundColor: alpha(stripe, 0.14),
      }}
      className={`w-full cursor-grab touch-none select-none rounded-lg border px-3 py-2 text-left active:cursor-grabbing ${
        overlay ? "shadow-2xl" : ""
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <SectorTag sector={{ ...sector, name: label }} className="max-w-[75%]" />
        <span className="shrink-0 text-xs text-cyber-white/60">{relativeTime(c.last_message_at)}</span>
      </div>
      <p className="mt-1 truncate text-sm font-bold" title={displayName(c.contact)}>
        {displayName(c.contact)}
      </p>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs text-cyber-white/70">
          {c.last_message_at || c.last_message_preview ? previewLabel(c.last_message_preview) : ""}
        </span>
        {c.unread_count > 0 && (
          <span
            style={{ backgroundColor: stripe, color: "#07090F" }}
            className="shrink-0 rounded-full px-2 py-0.5 text-xs font-bold"
          >
            {c.unread_count}
          </span>
        )}
      </div>
      <div className="mt-1 flex items-center justify-between gap-2 font-mono text-[10px] uppercase tracking-wider text-cyber-white/50">
        <span className="truncate">{owner ?? "Sem responsável"}</span>
        <span className="max-w-[50%] shrink-0 truncate rounded border border-cyber-line px-1.5 py-0.5">
          {c.instance?.label ?? "Sem número"}
        </span>
      </div>
    </div>
  );
}

function DraggableCard(props: Parameters<typeof Card>[0] & { onOpen: () => void }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: props.c.id });
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} className={isDragging ? "opacity-30" : ""}>
      <Card {...props} />
    </div>
  );
}

function Column({
  stage,
  items,
  sectors,
  assignees,
  onOpen,
}: {
  stage: StageRow;
  items: ConversationRow[];
  sectors: SectorOption[];
  assignees: Assignee[];
  onOpen: (id: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: stage.id });
  return (
    <section
      ref={setNodeRef}
      style={isOver ? { borderColor: stage.color } : undefined}
      className="flex h-full w-72 shrink-0 flex-col rounded-xl border border-cyber-line bg-cyber-panel"
    >
      <header className="flex items-center gap-2 border-b border-cyber-line px-3 py-2">
        <span aria-hidden style={{ backgroundColor: stage.color }} className="h-2.5 w-2.5 rounded-full" />
        <h2 className="min-w-0 flex-1 truncate text-sm font-bold">{stage.name}</h2>
        <span className="rounded-full bg-cyber-bg px-2 font-mono text-xs text-cyber-white/70">
          {items.length}
        </span>
      </header>
      <div className="flex-1 space-y-1.5 overflow-y-auto p-1.5">
        {items.map((c) => (
          <DraggableCard
            key={c.id}
            c={c}
            sectors={sectors}
            assignees={assignees}
            onOpen={() => onOpen(c.id)}
          />
        ))}
        {items.length === 0 && (
          <p className="px-2 py-4 text-center text-xs text-cyber-white/40">Nenhuma conversa</p>
        )}
      </div>
    </section>
  );
}

export default function FunilBoard({
  initialConversations,
  initialStages,
  isGestor,
}: {
  initialConversations: ConversationRow[];
  initialStages: StageRow[];
  isGestor: boolean;
}) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [conversations, setConversations] = useState(initialConversations);
  const [stages, setStages] = useState(initialStages);
  const [assignees, setAssignees] = useState<Assignee[]>([]);
  const [sectors, setSectors] = useState<SectorOption[]>([]);
  const [search, setSearch] = useState("");
  const [sectorFilter, setSectorFilter] = useState("");
  const [assigneeFilter, setAssigneeFilter] = useState("");
  const [instanceFilter, setInstanceFilter] = useState("");
  const [activeId, setActiveId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);

  const conversationsRef = useRef(conversations);
  conversationsRef.current = conversations;
  const dragging = useRef(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const loadMeta = useCallback(() => {
    fetch("/api/assignees", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d) return;
        setAssignees(d.assignees ?? []);
        setSectors(d.sectors ?? []);
      })
      .catch(() => {});
    fetch("/api/stages", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStages(d.stages ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(t);
  }, [notice]);

  // Tempo real (conversas e etapas) + revalidação ao focar e a cada 30s como rede de segurança.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;

    const refetchAll = async () => {
      if (dragging.current) return;
      const fresh = await fetchConversations(supabase, 500);
      setConversations(fresh);
      loadMeta();
    };
    const revalidate = () => {
      if (timer) return;
      timer = setTimeout(() => {
        timer = null;
        refetchAll();
      }, 300);
    };

    const onConversation = async (row: Partial<ConversationRow> & { id: string }) => {
      const existing = conversationsRef.current.find((c) => c.id === row.id);
      if (!existing || (row.sector_id !== undefined && row.sector_id !== existing.sector_id)) {
        const full = await fetchConversation(supabase, row.id);
        setConversations((prev) => {
          const rest = prev.filter((c) => c.id !== row.id);
          return full ? [...rest, full] : rest;
        });
        return;
      }
      setConversations((prev) =>
        prev.map((c) =>
          c.id === row.id
            ? {
                ...c,
                stage_id: row.stage_id !== undefined ? row.stage_id : c.stage_id,
                status: row.status ?? c.status,
                unread_count: row.unread_count ?? c.unread_count,
                last_message_at: row.last_message_at ?? c.last_message_at,
                last_message_preview: row.last_message_preview ?? c.last_message_preview,
              }
            : c
        )
      );
    };

    const channel = supabase
      .channel("funil-conversations")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "conversations" }, (p) =>
        onConversation(p.new as ConversationRow)
      )
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "conversations" }, (p) =>
        onConversation(p.new as ConversationRow)
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "conversation_stages" }, revalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "sectors" }, revalidate)
      .on("postgres_changes", { event: "*", schema: "public", table: "whatsapp_instances" }, revalidate)
      .subscribe();

    const onVisible = () => document.visibilityState === "visible" && revalidate();
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", onVisible);
    const interval = setInterval(onVisible, 30_000);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [supabase, loadMeta]);

  const sectorChips = useMemo(() => {
    const inUse = new Map<string, SectorInfo>();
    let hasNone = false;
    for (const c of conversations) {
      const s = conversationSector(c, sectors);
      if (s.id) inUse.set(s.id, s);
      else hasNone = true;
    }
    const chips = isGestor ? sectors.map((s) => sectorInfo(s)) : Array.from(inUse.values());
    chips.sort((a, b) => a.name.localeCompare(b.name));
    if (hasNone) chips.push(sectorInfo(null));
    return chips;
  }, [conversations, sectors, isGestor]);

  const instances = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of conversations) if (c.instance) map.set(c.instance_id, c.instance.label);
    return Array.from(map, ([id, label]) => ({ id, label })).sort((a, b) => a.label.localeCompare(b.label));
  }, [conversations]);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    const digits = term.replace(/\D/g, "");
    return conversations.filter((c) => {
      if (sectorFilter && (conversationSector(c, sectors).id ?? "none") !== sectorFilter) return false;
      if (assigneeFilter && ownerIdOf(c) !== assigneeFilter) return false;
      if (instanceFilter && c.instance_id !== instanceFilter) return false;
      if (!term) return true;
      return (
        displayName(c.contact).toLowerCase().includes(term) ||
        (digits.length > 0 && (c.contact?.phone ?? "").includes(digits))
      );
    });
  }, [conversations, sectors, sectorFilter, assigneeFilter, instanceFilter, search]);

  const firstStageId = stages[0]?.id;
  const byStage = useMemo(() => {
    const map = new Map<string, ConversationRow[]>(stages.map((s) => [s.id, []]));
    for (const c of visible) {
      // Conversa sem etapa (ou com etapa arquivada) aparece na primeira coluna.
      const key = c.stage_id && map.has(c.stage_id) ? c.stage_id : firstStageId;
      if (key) map.get(key)!.push(c);
    }
    for (const list of Array.from(map.values())) list.sort(byRecent);
    return map;
  }, [visible, stages, firstStageId]);

  function onDragStart(e: DragStartEvent) {
    dragging.current = true;
    setActiveId(String(e.active.id));
  }

  async function onDragEnd(e: DragEndEvent) {
    dragging.current = false;
    setActiveId(null);
    const id = String(e.active.id);
    const stageId = e.over ? String(e.over.id) : null;
    const conv = conversationsRef.current.find((c) => c.id === id);
    const stage = stages.find((s) => s.id === stageId);
    if (!conv || !stage) return;
    const current = conv.stage_id && stages.some((s) => s.id === conv.stage_id) ? conv.stage_id : firstStageId;
    if (stage.id === current) return;

    const previous = conv.stage_id;
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, stage_id: stage.id } : c)));
    try {
      const res = await fetch(`/api/conversations/${id}/stage`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: stage.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Erro inesperado.");
      const fresh = data.conversation as ConversationRow | null;
      if (fresh) setConversations((prev) => prev.map((c) => (c.id === id ? { ...fresh, unread_count: c.unread_count } : c)));
    } catch (err) {
      setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, stage_id: previous } : c)));
      setNotice(`Não foi possível mover a conversa: ${(err as Error).message}`);
    }
  }

  const active = activeId ? conversations.find((c) => c.id === activeId) : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-cyber-line px-4 py-2">
        <input
          type="search"
          placeholder="Buscar por nome ou telefone..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={`${selectCls} w-56`}
        />
        <select
          value={assigneeFilter}
          onChange={(e) => setAssigneeFilter(e.target.value)}
          aria-label="Filtrar por atendente"
          className={selectCls}
        >
          <option value="">Atendente: todos</option>
          {assignees.map((a) => (
            <option key={a.id} value={a.id}>
              {a.full_name}
            </option>
          ))}
        </select>
        <select
          value={instanceFilter}
          onChange={(e) => setInstanceFilter(e.target.value)}
          aria-label="Filtrar por número"
          className={selectCls}
        >
          <option value="">Número: todos</option>
          {instances.map((i) => (
            <option key={i.id} value={i.id}>
              {i.label}
            </option>
          ))}
        </select>

        <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filtrar por setor">
          {sectorChips.map((s) => {
            const key = s.id ?? "none";
            const on = sectorFilter === key;
            const st = sectorStyle(s.color);
            return (
              <button
                key={key}
                onClick={() => setSectorFilter(on ? "" : key)}
                aria-pressed={on}
                style={on ? { borderColor: st.stripe, backgroundColor: st.bg } : undefined}
                className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] leading-tight transition ${
                  on ? "text-cyber-white" : "border-cyber-line text-cyber-white/70 hover:border-cyber-white/30"
                }`}
              >
                <span aria-hidden style={{ backgroundColor: st.stripe }} className="h-2 w-2 rounded-full" />
                {s.name}
              </button>
            );
          })}
        </div>

        {isGestor && (
          <button
            onClick={() => setEditing(true)}
            className="ml-auto flex items-center gap-1.5 rounded-lg border border-cyber-line px-3 py-1.5 text-xs text-cyber-white/80 transition hover:border-cyber-cyan hover:text-cyber-cyan"
          >
            <Settings2 size={14} /> Editar etapas
          </button>
        )}
      </div>

      {notice && (
        <p className="border-b border-cyber-orange/40 bg-cyber-orange/10 px-5 py-2 text-sm text-cyber-orange">
          {notice}
        </p>
      )}

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => {
          dragging.current = false;
          setActiveId(null);
        }}
      >
        <div className="flex min-h-0 flex-1 gap-3 overflow-x-auto p-3">
          {stages.map((s) => (
            <Column
              key={s.id}
              stage={s}
              items={byStage.get(s.id) ?? []}
              sectors={sectors}
              assignees={assignees}
              onOpen={(id) => router.push(`/inbox?conversation=${id}`)}
            />
          ))}
          {stages.length === 0 && (
            <p className="p-4 text-sm text-cyber-white/50">Nenhuma etapa configurada.</p>
          )}
        </div>
        <DragOverlay>
          {active ? <Card c={active} sectors={sectors} assignees={assignees} overlay /> : null}
        </DragOverlay>
      </DndContext>

      {editing && (
        <StagesEditor
          stages={stages}
          counts={conversations.reduce<Record<string, number>>((acc, c) => {
            const key = c.stage_id && stages.some((s) => s.id === c.stage_id) ? c.stage_id : firstStageId;
            if (key) acc[key] = (acc[key] ?? 0) + 1;
            return acc;
          }, {})}
          onClose={() => setEditing(false)}
          onChanged={(next) => setStages(next)}
          onMoved={() => fetchConversations(supabase, 500).then(setConversations)}
        />
      )}
    </div>
  );
}
