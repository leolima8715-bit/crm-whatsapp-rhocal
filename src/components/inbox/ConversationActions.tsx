"use client";

import { useState } from "react";
import Link from "next/link";
import type { Assignee, ConversationRow, ConversationStatus, StageRow } from "@/lib/inbox-types";
import ContactOwner from "./ContactOwner";
import StageSelect from "./StageSelect";

const STATUS_OPTIONS: { value: ConversationStatus; label: string; cls: string }[] = [
  { value: "open", label: "Aberta", cls: "border-cyber-cyan/60 text-cyber-cyan" },
  { value: "waiting", label: "Aguardando", cls: "border-cyber-amber/60 text-cyber-amber" },
  { value: "resolved", label: "Resolvida", cls: "border-cyber-line text-cyber-white/60" },
];

export default function ConversationActions({
  conversation,
  currentUserId,
  isGestor,
  assignees,
  stages,
  onStageChange,
  onChanged,
}: {
  conversation: ConversationRow;
  currentUserId: string;
  isGestor: boolean;
  assignees: Assignee[];
  stages: StageRow[];
  onStageChange: (conversationId: string, stageId: string) => void;
  // movedTo: nome do novo responsável, para a mensagem se o usuário perder o acesso.
  onChanged: (conversationId: string, movedTo?: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = STATUS_OPTIONS.find((o) => o.value === conversation.status) ?? STATUS_OPTIONS[0];

  async function changeStatus(status: ConversationStatus) {
    if (status === conversation.status) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/conversations/${conversation.id}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Erro inesperado. Tente novamente.");
      onChanged(conversation.id);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <ContactOwner
          variant="header"
          conversation={conversation}
          currentUserId={currentUserId}
          isGestor={isGestor}
          assignees={assignees}
          onChanged={onChanged}
        />
        <StageSelect
          stages={stages}
          stageId={conversation.stage_id}
          disabled={busy}
          onChange={(id) => onStageChange(conversation.id, id)}
        />
        <Link
          href="/funil"
          className="rounded-full border border-cyber-line px-3 py-1 text-xs text-cyber-white/70 transition hover:border-cyber-cyan hover:text-cyber-cyan"
        >
          Ver no funil
        </Link>
        <select
          value={conversation.status}
          disabled={busy}
          onChange={(e) => changeStatus(e.target.value as ConversationStatus)}
          aria-label="Status da conversa"
          className={`rounded-full border bg-cyber-bg px-3 py-1 text-xs outline-none disabled:opacity-60 ${current.cls}`}
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {error && <p className="text-xs text-cyber-orange">{error}</p>}
    </div>
  );
}
