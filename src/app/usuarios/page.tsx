import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { listOrgUsers } from "@/lib/users";
import LogoutButton from "@/components/LogoutButton";
import UsuariosManager from "@/components/usuarios/UsuariosManager";

export const dynamic = "force-dynamic";

export default async function UsuariosPage() {
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

  if (!profile || profile.role !== "gestor") redirect("/inbox");

  const admin = createAdminClient();
  const [users, { data: sectors }] = await Promise.all([
    listOrgUsers(profile.org_id),
    admin
      .from("sectors")
      .select("id, name, color")
      .eq("org_id", profile.org_id)
      .eq("archived", false)
      .order("name", { ascending: true }),
  ]);

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-subtle bg-panel px-5">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-accent-text">
            CRM WhatsApp · RHOCAL
          </p>
          <p className="text-sm font-bold">Usuários · {profile.full_name}</p>
        </div>

        <Link
          href="/inbox"
          className="rounded-lg border border-subtle px-4 py-2 text-sm text-primary transition hover:border-accent hover:text-accent-text"
        >
          Voltar ao Inbox
        </Link>

        <LogoutButton />
      </header>

      <UsuariosManager
        users={users}
        sectors={(sectors ?? []) as { id: string; name: string; color: string | null }[]}
        currentUserId={user.id}
      />
    </main>
  );
}
