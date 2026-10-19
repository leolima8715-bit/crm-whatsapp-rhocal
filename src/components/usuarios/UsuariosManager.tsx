"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, Pencil, Plus, Power, X } from "lucide-react";
import type { OrgUser, Role } from "@/lib/users";
import SectorsSection from "./SectorsSection";

type Sector = { id: string; name: string };

const roleLabel: Record<Role, string> = {
  gestor: "Gestor",
  comercial: "Comercial",
  compras: "Compras",
};

const roleCls: Record<Role, string> = {
  gestor: "border-cyber-cyan/50 text-cyber-cyan",
  comercial: "border-cyber-amber/50 text-cyber-amber",
  compras: "border-cyber-orange/50 text-cyber-orange",
};

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

function generatePassword() {
  const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(12));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
}

type ModalState =
  | { kind: "new" }
  | { kind: "edit"; user: OrgUser }
  | { kind: "password"; user: OrgUser }
  | null;

export default function UsuariosManager({
  users,
  sectors,
  currentUserId,
}: {
  users: OrgUser[];
  sectors: Sector[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [modal, setModal] = useState<ModalState>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Setores arquivados não aparecem mais nas listas.
  const sectorNames = (ids: string[]) =>
    ids.map((id) => sectors.find((s) => s.id === id)?.name).filter(Boolean) as string[];

  function open(m: ModalState) {
    setError(null);
    setNotice(null);
    setModal(m);
  }

  async function toggleActive(u: OrgUser) {
    const next = !u.active;
    const msg = next
      ? `Reativar ${u.full_name}? A pessoa volta a poder entrar no CRM.`
      : `Desativar ${u.full_name}? A pessoa não conseguirá mais entrar. Nada é apagado.`;
    if (!window.confirm(msg)) return;
    setBusyId(u.id);
    setError(null);
    setNotice(null);
    try {
      await api(`/api/users/${u.id}`, "PATCH", { active: next });
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section className="mx-auto w-full max-w-5xl flex-1 p-5">
      <div className="mb-5 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold">Usuários</h1>
          <p className="text-sm text-cyber-white/60">
            Crie logins, defina papéis e setores e controle quem tem acesso.
          </p>
        </div>
        <button
          onClick={() => open({ kind: "new" })}
          className="flex items-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg transition hover:opacity-90"
        >
          <Plus size={16} /> Novo usuário
        </button>
      </div>

      {notice && (
        <p className="mb-4 rounded-lg border border-cyber-cyan/40 px-4 py-2 text-sm text-cyber-cyan">
          {notice}
        </p>
      )}
      {error && !modal && (
        <p className="mb-4 rounded-lg border border-cyber-orange/40 px-4 py-2 text-sm text-cyber-orange">
          {error}
        </p>
      )}

      <ul className="space-y-3">
        {users.map((u) => {
          const self = u.id === currentUserId;
          const busy = busyId === u.id;
          return (
            <li
              key={u.id}
              className={`rounded-lg border border-cyber-line bg-cyber-panel p-4 ${
                u.active ? "" : "opacity-60"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-bold">
                    {u.full_name}
                    {self && <span className="ml-2 text-xs font-normal text-cyber-white/50">(você)</span>}
                  </p>
                  <p className="truncate font-mono text-xs text-cyber-white/60">{u.email ?? "—"}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${roleCls[u.role]}`}
                  >
                    {roleLabel[u.role]}
                  </span>
                  <span
                    className={`rounded-full border px-3 py-1 font-mono text-[10px] uppercase tracking-widest ${
                      u.active
                        ? "border-cyber-cyan/50 text-cyber-cyan"
                        : "border-cyber-line text-cyber-white/50"
                    }`}
                  >
                    {u.active ? "Ativo" : "Desativado"}
                  </span>
                </div>
              </div>

              <p className="mt-2 text-xs text-cyber-white/60">
                Setores:{" "}
                {sectorNames(u.sector_ids).join(", ") || "nenhum"}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  disabled={busy}
                  onClick={() => open({ kind: "edit", user: u })}
                  className="flex items-center gap-2 rounded-lg border border-cyber-line px-3 py-1.5 text-sm text-cyber-white/80 transition hover:border-cyber-cyan hover:text-cyber-cyan disabled:opacity-50"
                >
                  <Pencil size={14} /> Editar
                </button>
                <button
                  disabled={busy}
                  onClick={() => open({ kind: "password", user: u })}
                  className="flex items-center gap-2 rounded-lg border border-cyber-line px-3 py-1.5 text-sm text-cyber-white/80 transition hover:border-cyber-amber hover:text-cyber-amber disabled:opacity-50"
                >
                  <KeyRound size={14} /> Redefinir senha
                </button>
                {!self && (
                  <button
                    disabled={busy}
                    onClick={() => toggleActive(u)}
                    className="flex items-center gap-2 rounded-lg border border-cyber-line px-3 py-1.5 text-sm text-cyber-white/80 transition hover:border-cyber-orange hover:text-cyber-orange disabled:opacity-50"
                  >
                    <Power size={14} /> {u.active ? "Desativar" : "Reativar"}
                  </button>
                )}
                {busy && <Loader2 size={16} className="animate-spin self-center text-cyber-cyan" />}
              </div>
            </li>
          );
        })}
      </ul>

      <SectorsSection sectors={sectors} />

      {modal?.kind === "new" && (
        <UserFormModal
          title="Novo usuário"
          sectors={sectors}
          onClose={() => setModal(null)}
          onDone={(msg) => {
            setModal(null);
            setNotice(msg);
            router.refresh();
          }}
        />
      )}
      {modal?.kind === "edit" && (
        <UserFormModal
          title={`Editar · ${modal.user.full_name}`}
          sectors={sectors}
          user={modal.user}
          isSelf={modal.user.id === currentUserId}
          onClose={() => setModal(null)}
          onDone={(msg) => {
            setModal(null);
            setNotice(msg);
            router.refresh();
          }}
        />
      )}
      {modal?.kind === "password" && (
        <PasswordModal
          user={modal.user}
          onClose={() => setModal(null)}
          onDone={(msg) => {
            setModal(null);
            setNotice(msg);
          }}
        />
      )}
    </section>
  );
}

const inputCls =
  "w-full rounded-lg border border-cyber-line bg-cyber-bg px-3 py-2 text-sm outline-none focus:border-cyber-cyan";

function UserFormModal({
  title,
  sectors,
  user,
  isSelf = false,
  onClose,
  onDone,
}: {
  title: string;
  sectors: Sector[];
  user?: OrgUser;
  isSelf?: boolean;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const editing = !!user;
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [email, setEmail] = useState(user?.email ?? "");
  const [role, setRole] = useState<Role>(user?.role ?? "comercial");
  const [sectorIds, setSectorIds] = useState<string[]>(
    (user?.sector_ids ?? []).filter((id) => sectors.some((s) => s.id === id))
  );
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleSector(id: string) {
    setSectorIds((prev) => (prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id]));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!editing && password.length < 8) {
      setError("A senha inicial deve ter no mínimo 8 caracteres.");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api(`/api/users/${user!.id}`, "PATCH", {
          full_name: fullName,
          role,
          sector_ids: sectorIds,
        });
        onDone("Usuário atualizado.");
      } else {
        await api("/api/users", "POST", {
          full_name: fullName,
          email,
          role,
          password,
          sector_ids: sectorIds,
        });
        onDone(`Usuário criado. Envie o e-mail e a senha inicial para ${fullName.trim()}.`);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={title} onClose={() => !saving && onClose()}>
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm">
          <span className="mb-1 block text-cyber-white/70">Nome completo</span>
          <input
            autoFocus
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            maxLength={100}
            className={inputCls}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-cyber-white/70">E-mail</span>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={editing}
            className={`${inputCls} disabled:opacity-60`}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-cyber-white/70">Papel</span>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            disabled={isSelf}
            className={`${inputCls} disabled:opacity-60`}
          >
            <option value="gestor">Gestor</option>
            <option value="comercial">Comercial</option>
            <option value="compras">Compras</option>
          </select>
          {isSelf && (
            <span className="mt-1 block text-xs text-cyber-white/50">
              Você não pode alterar o seu próprio papel.
            </span>
          )}
        </label>

        <fieldset className="text-sm">
          <legend className="mb-1 text-cyber-white/70">Setores</legend>
          {sectors.length === 0 ? (
            <p className="text-xs text-cyber-white/50">Nenhum setor cadastrado.</p>
          ) : (
            <div className="space-y-1">
              {sectors.map((s) => (
                <label key={s.id} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={sectorIds.includes(s.id)}
                    onChange={() => toggleSector(s.id)}
                    className="accent-cyber-cyan"
                  />
                  {s.name}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        {!editing && (
          <div className="text-sm">
            <span className="mb-1 block text-cyber-white/70">Senha inicial (mínimo 8 caracteres)</span>
            <div className="flex gap-2">
              <input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                maxLength={72}
                className={inputCls}
              />
              <button
                type="button"
                onClick={() => {
                  setPassword(generatePassword());
                  setShowPw(true);
                }}
                className="shrink-0 rounded-lg border border-cyber-line px-3 text-xs text-cyber-cyan hover:border-cyber-cyan"
              >
                Gerar
              </button>
            </div>
            <label className="mt-2 flex items-center gap-2 text-xs text-cyber-white/60">
              <input
                type="checkbox"
                checked={showPw}
                onChange={(e) => setShowPw(e.target.checked)}
                className="accent-cyber-cyan"
              />
              Mostrar senha
            </label>
          </div>
        )}

        {error && <p className="text-sm text-cyber-orange">{error}</p>}

        <button
          type="submit"
          disabled={saving || !fullName.trim() || (!editing && !email.trim())}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Salvando...
            </>
          ) : editing ? (
            "Salvar alterações"
          ) : (
            "Criar usuário"
          )}
        </button>
      </form>
    </Modal>
  );
}

function PasswordModal({
  user,
  onClose,
  onDone,
}: {
  user: OrgUser;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    setSaving(true);
    try {
      await api(`/api/users/${user.id}/password`, "POST", { password });
      onDone(`Senha de ${user.full_name} redefinida.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title={`Redefinir senha · ${user.full_name}`} onClose={() => !saving && onClose()}>
      <form onSubmit={submit} className="space-y-4">
        <div className="text-sm">
          <span className="mb-1 block text-cyber-white/70">Nova senha (mínimo 8 caracteres)</span>
          <div className="flex gap-2">
            <input
              autoFocus
              type={showPw ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
              maxLength={72}
              className={inputCls}
            />
            <button
              type="button"
              onClick={() => {
                setPassword(generatePassword());
                setShowPw(true);
              }}
              className="shrink-0 rounded-lg border border-cyber-line px-3 text-xs text-cyber-cyan hover:border-cyber-cyan"
            >
              Gerar
            </button>
          </div>
          <label className="mt-2 flex items-center gap-2 text-xs text-cyber-white/60">
            <input
              type="checkbox"
              checked={showPw}
              onChange={(e) => setShowPw(e.target.checked)}
              className="accent-cyber-cyan"
            />
            Mostrar senha
          </label>
        </div>

        {error && <p className="text-sm text-cyber-orange">{error}</p>}

        <button
          type="submit"
          disabled={saving || !password}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-cyber-cyan px-4 py-2 text-sm font-bold text-cyber-bg transition hover:opacity-90 disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Salvando...
            </>
          ) : (
            "Redefinir senha"
          )}
        </button>
      </form>
    </Modal>
  );
}

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/70 p-4">
      <div className="w-full max-w-md rounded-lg border border-cyber-line bg-cyber-panel p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="truncate font-bold">{title}</h2>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="text-cyber-white/60 hover:text-cyber-orange"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
