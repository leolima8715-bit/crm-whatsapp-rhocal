import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import FunilBoard from "@/components/funil/FunilBoard";

export const dynamic = "force-dynamic";

export default async function FunilPage() {
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
  if (!profile) redirect("/inbox");

  return (
    <main className="flex h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-cyber-line bg-cyber-panel px-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyber-cyan">
            CRM WhatsApp · RHOCAL
          </p>
          <p className="text-sm font-bold">Funil · {profile.full_name}</p>
        </div>

        <Link
          href="/inbox"
          className="rounded-lg border border-cyber-line px-4 py-2 text-sm text-cyber-white/80 transition hover:border-cyber-cyan hover:text-cyber-cyan"
        >
          Voltar ao Inbox
        </Link>

        <LogoutButton />
      </header>

      <FunilBoard currentUserId={user.id} />
    </main>
  );
}
