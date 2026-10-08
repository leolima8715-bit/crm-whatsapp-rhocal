import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";

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
    <main className="min-h-screen p-8">
      <header className="flex items-center justify-between border-b border-cyber-line pb-4">
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-cyber-cyan">
            CRM WhatsApp
          </p>
          <h1 className="text-xl font-bold">
            {profile ? `Olá, ${profile.full_name}` : "Olá"}
          </h1>
          {profile && (
            <p className="text-sm text-cyber-white/60">
              Perfil: {roleLabel[profile.role] ?? profile.role}
            </p>
          )}
        </div>
        <LogoutButton />
      </header>

      {!profile && (
        <p className="mt-6 text-cyber-orange">
          Seu usuário ainda não tem perfil. Peça ao gestor para liberar o acesso.
        </p>
      )}

      <p className="mt-8 text-cyber-white/60">
        O inbox de conversas vai aparecer aqui.
      </p>
    </main>
  );
}
