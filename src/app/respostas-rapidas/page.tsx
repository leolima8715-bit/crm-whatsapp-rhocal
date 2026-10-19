import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import LogoutButton from "@/components/LogoutButton";
import QuickRepliesManager from "@/components/respostas/QuickRepliesManager";

export const dynamic = "force-dynamic";

export default async function RespostasRapidasPage() {
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

  const { data: replies } = await createAdminClient()
    .from("quick_replies")
    .select("id, shortcut, body, created_by")
    .eq("org_id", profile.org_id)
    .eq("archived", false)
    .order("shortcut", { ascending: true });

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-cyber-line bg-cyber-panel px-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyber-cyan">
            CRM WhatsApp · RHOCAL
          </p>
          <p className="text-sm font-bold">Respostas rápidas · {profile.full_name}</p>
        </div>

        <Link
          href="/inbox"
          className="rounded-lg border border-cyber-line px-4 py-2 text-sm text-cyber-white/80 transition hover:border-cyber-cyan hover:text-cyber-cyan"
        >
          Voltar ao Inbox
        </Link>

        <LogoutButton />
      </header>

      <QuickRepliesManager
        replies={(replies ?? []) as { id: string; shortcut: string; body: string; created_by: string }[]}
        currentUserId={user.id}
        isGestor={profile.role === "gestor"}
      />
    </main>
  );
}
