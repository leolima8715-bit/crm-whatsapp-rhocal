import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFunilData } from "@/lib/funil-server";
import ThemeToggle from "@/components/ThemeToggle";
import LogoutButton from "@/components/LogoutButton";
import FunilBoard from "@/components/funil/FunilBoard";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function FunilPage() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, role, org_id")
    .eq("id", user.id)
    .single();
  if (!profile) redirect("/inbox");

  const { conversations, stages } = await loadFunilData(createAdminClient(), supabase, profile);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-subtle bg-panel px-5">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-accent-text">
            CRM WhatsApp · RHOCAL
          </p>
          <p className="text-sm font-bold">Funil de conversas · {profile.full_name}</p>
        </div>

        <Link
          href="/inbox"
          className="rounded-lg border border-subtle px-4 py-2 text-sm text-primary transition hover:border-accent hover:text-accent-text"
        >
          Voltar ao Inbox
        </Link>

        <div className="flex items-center gap-3">

          <ThemeToggle />

          <LogoutButton />

        </div>
      </header>

      <FunilBoard
        initialConversations={conversations}
        initialStages={stages}
        isGestor={profile.role === "gestor"}
      />
    </main>
  );
}
