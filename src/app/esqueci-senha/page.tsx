"use client";

import { useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import ThemeToggle from "@/components/ThemeToggle";

export default function EsqueciSenhaPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);

    // O resultado é ignorado de propósito: a resposta é sempre a mesma,
    // exista a conta ou não (e mesmo se o envio falhar), para não revelar cadastros.
    // Roda no navegador porque o fluxo PKCE guarda o verificador nos cookies daqui.
    try {
      await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/redefinir-senha`,
      });
    } catch {
      // ignorado — ver comentário acima
    }

    setSent(true);
    setLoading(false);
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="absolute right-4 top-4">
        <ThemeToggle />
      </div>
      <div className="w-full max-w-sm rounded-2xl border border-subtle bg-panel p-8 shadow-2xl">
        <p className="text-xs uppercase tracking-widest text-accent-text">RHOCAL Equipamentos</p>
        <h1 className="mt-2 text-2xl font-bold">Esqueci minha senha</h1>

        {sent ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-primary" role="status">
              Se o e-mail existir, enviamos o link para criar uma nova senha. Abra o e-mail no
              mesmo navegador em que fez este pedido.
            </p>
            <Link href="/login" className="block text-sm text-accent-text hover:underline">
              Voltar ao login
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <p className="text-sm text-secondary">
              Informe seu e-mail para receber o link de recuperação.
            </p>
            <div>
              <label htmlFor="email" className="mb-1 block text-sm text-primary">
                E-mail
              </label>
              <input
                id="email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-lg border border-subtle bg-app px-3 py-2 text-sm outline-none focus:border-accent"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-accent py-2 text-sm font-bold text-on-accent transition hover:brightness-110 disabled:opacity-50"
            >
              {loading ? "Enviando..." : "Enviar link"}
            </button>
            <Link href="/login" className="block text-sm text-accent-text hover:underline">
              Voltar ao login
            </Link>
          </form>
        )}
      </div>
    </main>
  );
}
