import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import InboxShell from "@/components/inbox/InboxShell";

const roleLabel: Record<string, string> = {
  gestor: "Gestor",
  comercial: "Comercial",
  compras: "Compras",
};

export default async function InboxPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role")
    .eq("id", user.id)
    .single();

  return (
    <main className="flex h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-cyber-line bg-cyber-panel px-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyber-cyan">
            CRM WhatsApp · RHOCAL
          </p>
          <p className="text-sm font-bold">
            {profile
              ? `${profile.full_name} · ${roleLabel[profile.role] ?? profile.role}`
              : "Sem perfil"}
          </p>
        </div>

        <span className="hidden rounded-full border border-cyber-amber/40 px-3 py-1 font-mono text-[10px] uppercase tracking-widest text-cyber-amber md:inline">
          Dados de teste
        </span>

        <div className="flex items-center gap-3">
          {profile?.role === "gestor" && (
            <Link
              href="/numeros"
              className="rounded-lg border border-cyber-line px-4 py-2 text-sm text-cyber-white/80 transition hover:border-cyber-cyan hover:text-cyber-cyan"
            >
              Números
            </Link>
          )}
          <LogoutButton />
        </div>
      </header>

      {profile ? (
        <InboxShell />
      ) : (
        <p className="p-8 text-cyber-orange">
          Seu usuário ainda não tem perfil. Peça ao gestor para liberar o acesso.
        </p>
      )}
    </main>
  );
}
