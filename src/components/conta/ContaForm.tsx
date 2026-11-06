"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";

const inputCls =
  "w-full rounded-lg border border-subtle bg-app px-3 py-2 text-sm outline-none focus:border-accent";

export default function ContaForm({ name, email }: { name: string; email: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (password.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Erro inesperado. Tente novamente.");
      setPassword("");
      setConfirm("");
      setDone(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-md flex-1 p-5">
      <div className="mb-6 rounded-lg border border-subtle bg-panel p-4">
        <p className="font-bold">{name || "Sem nome"}</p>
        <p className="text-xs text-secondary">{email}</p>
      </div>

      <form onSubmit={submit} className="space-y-4 rounded-lg border border-subtle bg-panel p-4">
        <h1 className="font-bold">Trocar senha</h1>

        <label className="block text-sm">
          <span className="mb-1 block text-secondary">Nova senha (mínimo 8 caracteres)</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            maxLength={72}
            className={inputCls}
          />
        </label>

        <label className="block text-sm">
          <span className="mb-1 block text-secondary">Confirmar nova senha</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="new-password"
            maxLength={72}
            className={inputCls}
          />
        </label>

        {error && <p className="text-sm text-danger">{error}</p>}
        {done && <p className="text-sm text-accent-text">Senha alterada com sucesso.</p>}

        <button
          type="submit"
          disabled={saving || !password || !confirm}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-on-accent transition hover:bg-accent-hover disabled:opacity-50"
        >
          {saving ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Salvando...
            </>
          ) : (
            "Alterar senha"
          )}
        </button>
      </form>
    </section>
  );
}
