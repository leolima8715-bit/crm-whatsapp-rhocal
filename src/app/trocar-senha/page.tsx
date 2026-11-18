import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ThemeToggle from "@/components/ThemeToggle";
import LogoutButton from "@/components/LogoutButton";
import ContaForm from "@/components/conta/ContaForm";

export const dynamic = "force-dynamic";

export default async function TrocarSenhaPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, must_change_password")
    .eq("id", user.id)
    .single();

  // Sem troca pendente, não há por que ficar aqui.
  if (profile?.must_change_password !== true) redirect("/conta");

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-subtle bg-panel px-5">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-accent-text">
            CRM WhatsApp · RHOCAL
          </p>
          <p className="text-sm font-bold">Criar senha pessoal</p>
        </div>
        <div className="flex items-center gap-3">
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      <ContaForm name={profile?.full_name ?? ""} email={user.email ?? ""} mustChange />
    </main>
  );
}
