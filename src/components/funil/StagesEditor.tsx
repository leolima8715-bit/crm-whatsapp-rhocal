"use client";

import { useState } from "react";
import { DndContext, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Archive, GripVertical, Plus, Save, X } from "lucide-react";
import type { StageRow } from "@/lib/inbox-types";
import { HEX_COLOR_RE, SECTOR_PALETTE } from "@/lib/sector-style";

async function api(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error ?? "Erro inesperado. Tente novamente.");
  return data;
}

const inputCls =
  "min-w-0 rounded-lg border border-cyber-line bg-cyber-bg px-2 py-1.5 text-sm outline-none focus:border-cyber-cyan";

function Row({
  stage,
  count,
  all,
  onSaved,
  onError,
  onArchived,
}: {
  stage: StageRow;
  count: number;
  all: StageRow[];
  onSaved: (s: StageRow) => void;
  onError: (m: string | null) => void;
  onArchived: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: stage.id });
  const [name, setName] = useState(stage.name);
  const [color, setColor] = useState(stage.color);
  const [kind, setKind] = useState(stage.kind);
  const [busy, setBusy] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTo, setMoveTo] = useState("");

  const dirty = name.trim() !== stage.name || color.toUpperCase() !== stage.color || kind !== stage.kind;
  const validColor = HEX_COLOR_RE.test(color);
  const others = all.filter((s) => s.id !== stage.id);

  async function save() {
    if (!validColor || !name.trim()) return;
    setBusy(true);
    onError(null);
    try {
      const d = await api(`/api/stages/${stage.id}`, "PATCH", { name, color, kind });
      onSaved(d.stage);
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function archive(target?: string) {
    setBusy(true);
    onError(null);
    try {
      await api(`/api/stages/${stage.id}`, "PATCH", { archived: true, move_to: target });
      onArchived();
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className="rounded-lg border border-cyber-line bg-cyber-bg p-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <button
          {...attributes}
          {...listeners}
          aria-label="Arrastar para reordenar"
          className="cursor-grab touch-none text-cyber-white/50 hover:text-cyber-cyan"
        >
          <GripVertical size={16} />
        </button>
        <input
          type="color"
          value={validColor ? color : "#000000"}
          onChange={(e) => setColor(e.target.value)}
          aria-label="Cor da etapa"
          className="h-8 w-8 shrink-0 cursor-pointer rounded border border-cyber-line bg-transparent p-0.5"
        />
        <input
          value={name}
          maxLength={40}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && dirty && save()}
          aria-label="Nome da etapa"
          className={`${inputCls} flex-1`}
        />
        <label className="flex items-center gap-1 text-[11px] text-cyber-white/70" title="Etapa que conclui a conversa">
          <input
            type="checkbox"
            checked={kind === "done"}
            onChange={(e) => setKind(e.target.checked ? "done" : "open")}
          />
          Conclui
        </label>
        {dirty && (
          <button
            onClick={save}
            disabled={busy || !validColor || !name.trim()}
            aria-label="Salvar etapa"
            title="Salvar"
            className="rounded-lg bg-cyber-cyan p-1.5 text-cyber-bg disabled:opacity-50"
          >
            <Save size={14} />
          </button>
        )}
        <button
          onClick={() => (count > 0 ? setMoveOpen((v) => !v) : archive())}
          disabled={busy}
          aria-label="Arquivar etapa"
          title="Arquivar"
          className="rounded-lg border border-cyber-line p-1.5 text-cyber-white/70 hover:border-cyber-orange hover:text-cyber-orange disabled:opacity-50"
        >
          <Archive size={14} />
        </button>
      </div>
      {moveOpen && (
        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-cyber-line pt-2 text-xs">
          <span className="text-cyber-white/70">
            {count} conversa(s) nesta etapa. Mover para:
          </span>
          <select value={moveTo} onChange={(e) => setMoveTo(e.target.value)} className={inputCls}>
            <option value="">Escolha...</option>
            {others.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <button
            onClick={() => archive(moveTo)}
            disabled={!moveTo || busy}
            className="rounded-lg bg-cyber-orange px-3 py-1.5 font-bold text-cyber-bg disabled:opacity-50"
          >
            Mover e arquivar
          </button>
        </div>
      )}
    </li>
  );
}

export default function StagesEditor({
  stages,
  counts,
  onClose,
  onChanged,
  onMoved,
}: {
  stages: StageRow[];
  counts: Record<string, number>;
  onClose: () => void;
  onChanged: (stages: StageRow[]) => void;
  onMoved: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(SECTOR_PALETTE[0]);
  const [busy, setBusy] = useState(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  async function reload() {
    const d = await api("/api/stages", "GET");
    onChanged(d.stages ?? []);
  }

  async function onDragEnd(e: DragEndEvent) {
    if (!e.over || e.active.id === e.over.id) return;
    const from = stages.findIndex((s) => s.id === e.active.id);
    const to = stages.findIndex((s) => s.id === e.over!.id);
    const previous = stages;
    const next = arrayMove(stages, from, to);
    onChanged(next);
    try {
      const d = await api("/api/stages/reorder", "POST", { ids: next.map((s) => s.id) });
      onChanged(d.stages ?? next);
    } catch (err) {
      onChanged(previous);
      setError((err as Error).message);
    }
  }

  async function create() {
    if (!newName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await api("/api/stages", "POST", { name: newName, color: newColor });
      setNewName("");
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="Editar etapas"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-xl flex-col rounded-xl border border-cyber-line bg-cyber-panel"
      >
        <header className="flex items-center justify-between border-b border-cyber-line px-4 py-3">
          <h2 className="text-sm font-bold">Etapas do funil</h2>
          <button onClick={onClose} aria-label="Fechar" className="text-cyber-white/60 hover:text-cyber-orange">
            <X size={18} />
          </button>
        </header>

        <div className="space-y-3 overflow-y-auto p-4">
          {error && <p className="rounded-lg border border-cyber-orange/40 bg-cyber-orange/10 px-3 py-2 text-xs text-cyber-orange">{error}</p>}

          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
            <SortableContext items={stages.map((s) => s.id)} strategy={verticalListSortingStrategy}>
              <ul className="space-y-1.5">
                {stages.map((s) => (
                  <Row
                    key={`${s.id}:${s.name}:${s.color}:${s.kind}`}
                    stage={s}
                    count={counts[s.id] ?? 0}
                    all={stages}
                    onSaved={(saved) => onChanged(stages.map((x) => (x.id === saved.id ? saved : x)))}
                    onError={setError}
                    onArchived={() => {
                      reload();
                      onMoved();
                    }}
                  />
                ))}
              </ul>
            </SortableContext>
          </DndContext>

          <div className="flex items-center gap-2 border-t border-cyber-line pt-3">
            <input
              type="color"
              value={newColor}
              onChange={(e) => setNewColor(e.target.value)}
              aria-label="Cor da nova etapa"
              className="h-8 w-8 shrink-0 cursor-pointer rounded border border-cyber-line bg-transparent p-0.5"
            />
            <input
              value={newName}
              maxLength={40}
              placeholder="Nova etapa..."
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && create()}
              className={`${inputCls} flex-1`}
            />
            <button
              onClick={create}
              disabled={busy || !newName.trim()}
              className="flex items-center gap-1 rounded-lg bg-cyber-cyan px-3 py-1.5 text-sm font-bold text-cyber-bg disabled:opacity-50"
            >
              <Plus size={14} /> Criar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
