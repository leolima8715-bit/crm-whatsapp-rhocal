import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fetchConversations } from "@/lib/inbox-queries";
import { loadStages } from "@/lib/stages";
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

  // Conversas com o client do usuário (RLS = can_access_conversation); etapas são da organização.
  const [conversations, stages] = await Promise.all([
    fetchConversations(supabase, 500),
    loadStages(createAdminClient(), profile.org_id),
  ]);

  return (
    <main className="flex h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-cyber-line bg-cyber-panel px-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyber-cyan">
            CRM WhatsApp · RHOCAL
          </p>
          <p className="text-sm font-bold">Funil de conversas · {profile.full_name}</p>
        </div>

        <Link
          href="/inbox"
          className="rounded-lg border border-cyber-line px-4 py-2 text-sm text-cyber-white/80 transition hover:border-cyber-cyan hover:text-cyber-cyan"
        >
          Voltar ao Inbox
        </Link>

        <LogoutButton />
      </header>

      <FunilBoard
        initialConversations={conversations}
        initialStages={stages}
        isGestor={profile.role === "gestor"}
      />
    </main>
  );
}
