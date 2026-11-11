import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ThemeToggle from "@/components/ThemeToggle";
import LogoutButton from "@/components/LogoutButton";
import ContaForm from "@/components/conta/ContaForm";

export const dynamic = "force-dynamic";

export default async function ContaPage() {
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

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-subtle bg-panel px-5">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-accent-text">
            CRM WhatsApp · RHOCAL
          </p>
          <p className="text-sm font-bold">Minha conta</p>
        </div>

        {profile?.must_change_password !== true && (
          <Link
            href="/inbox"
            className="rounded-lg border border-subtle px-4 py-2 text-sm text-primary transition hover:border-accent hover:text-accent-text"
          >
            Voltar ao Inbox
          </Link>
        )}

        <div className="flex items-center gap-3">

          <ThemeToggle />

          <LogoutButton />

        </div>
      </header>

      <ContaForm
        name={profile?.full_name ?? ""}
        email={user.email ?? ""}
        mustChange={profile?.must_change_password === true}
      />
    </main>
  );
}
