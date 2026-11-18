"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";

const inputCls =
  "w-full rounded-lg border border-subtle bg-app px-3 py-2 text-sm outline-none focus:border-accent";

type Status = "checking" | "ready" | "invalid";

export default function RedefinirSenhaPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // O link do e-mail traz ?code=... (PKCE). O cliente do Supabase troca o código por uma
  // sessão ao inicializar; getSession() espera essa troca terminar.
  useEffect(() => {
    let alive = true;
    const qs = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    if (qs.get("error") || hash.get("error")) {
      setStatus("invalid");
      return;
    }
    createClient()
      .auth.getSession()
      .then(({ data }) => {
        if (alive) setStatus(data.session ? "ready" : "invalid");
      })
      .catch(() => alive && setStatus("invalid"));
    return () => {
      alive = false;
    };
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 10 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      setError("A senha deve ter no mínimo 10 caracteres, com letras e números.");
      return;
    }
    if (password !== confirm) {
      setError("As senhas não conferem.");
      return;
    }
    setSaving(true);
    try {
      // Mesma rota da troca obrigatória: valida as regras, troca a senha e zera
      // must_change_password no servidor.
      const res = await fetch("/api/account/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error ?? "Erro inesperado. Tente novamente.");

      await createClient().auth.signOut();
      window.location.href = "/login";
    } catch (err) {
      setError((err as Error).message);
      setSaving(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-subtle bg-panel p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-widest text-accent-text">RHOCAL Equipamentos</p>
        <h1 className="mt-2 text-2xl font-bold">Redefinir senha</h1>

        {status === "checking" && (
          <p className="mt-6 flex items-center gap-2 text-sm text-secondary">
            <Loader2 size={16} className="animate-spin" /> Validando o link...
          </p>
        )}

        {status === "invalid" && (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-danger" role="alert">
              Link inválido ou expirado. Peça um novo link.
            </p>
            <Link href="/esqueci-senha" className="block text-sm text-accent-text hover:underline">
              Pedir novo link
            </Link>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <label className="block text-sm">
              <span className="mb-1 block text-secondary">
                Nova senha (mínimo 10 caracteres, com letras e números)
              </span>
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

            {error && (
              <p className="text-sm text-danger" role="alert">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={saving || !password || !confirm}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-bold text-on-accent transition hover:brightness-110 disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 size={16} className="animate-spin" /> Salvando...
                </>
              ) : (
                "Salvar nova senha"
              )}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
