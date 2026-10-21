import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchConversation, fetchConversations } from "@/lib/inbox-queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";
import type { ContactTagsMap } from "@/lib/inbox-types";
import LogoutButton from "@/components/LogoutButton";
import InboxShell from "@/components/inbox/InboxShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const roleLabel: Record<string, string> = {
  gestor: "Gestor",
  comercial: "Comercial",
  compras: "Compras",
};

export default async function InboxPage({
  searchParams,
}: {
  searchParams: { conversation?: string };
}) {
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

  const conversations = profile ? await fetchConversations(supabase, 100) : [];

  // ?conversation=ID: abre essa conversa (mesmo que esteja fora das 100 mais recentes).
  let initialSelectedId: string | null = null;
  const wanted = searchParams.conversation;
  if (profile && isUuid(wanted)) {
    const found = conversations.find((c) => c.id === wanted) ?? (await fetchConversation(supabase, wanted));
    if (found) {
      if (!conversations.some((c) => c.id === found.id)) conversations.push(found);
      initialSelectedId = found.id;
    }
  }

  // Tags dos contatos da lista numa única consulta (sem N+1).
  const contactTags: ContactTagsMap = {};
  const contactIds = Array.from(new Set(conversations.map((c) => c.contact_id)));
  if (contactIds.length > 0) {
    const { data: links } = await createAdminClient()
      .from("contact_tags")
      .select("contact_id, tag_id")
      .in("contact_id", contactIds);
    for (const l of links ?? []) (contactTags[l.contact_id] ??= []).push(l.tag_id);
    for (const id of contactIds) contactTags[id] ??= [];
  }

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

        <div className="flex items-center gap-3">
          {profile?.role === "gestor" && (
            <>
              <Link
                href="/numeros"
                className="rounded-lg border border-cyber-line px-4 py-2 text-sm text-cyber-white/80 transition hover:border-cyber-cyan hover:text-cyber-cyan"
              >
                Números
              </Link>
              <Link
                href="/usuarios"
                className="rounded-lg border border-cyber-line px-4 py-2 text-sm text-cyber-white/80 transition hover:border-cyber-cyan hover:text-cyber-cyan"
              >
                Usuários
              </Link>
            </>
          )}
          <Link
            href="/funil"
            className="rounded-lg border border-cyber-line px-4 py-2 text-sm text-cyber-white/80 transition hover:border-cyber-cyan hover:text-cyber-cyan"
          >
            Funil
          </Link>
          <Link
            href="/respostas-rapidas"
            className="rounded-lg border border-cyber-line px-4 py-2 text-sm text-cyber-white/80 transition hover:border-cyber-cyan hover:text-cyber-cyan"
          >
            Respostas rápidas
          </Link>
          <Link
            href="/conta"
            className="rounded-lg border border-cyber-line px-4 py-2 text-sm text-cyber-white/80 transition hover:border-cyber-cyan hover:text-cyber-cyan"
          >
            Minha conta
          </Link>
          <LogoutButton />
        </div>
      </header>

      {profile ? (
        <InboxShell
          initialConversations={conversations}
          currentUserId={user.id}
          currentRole={profile.role}
          currentUserName={profile.full_name}
          initialContactTags={contactTags}
          initialSelectedId={initialSelectedId}
        />
      ) : (
        <p className="p-8 text-cyber-orange">
          Seu usuário ainda não tem perfil. Peça ao gestor para liberar o acesso.
        </p>
      )}
    </main>
  );
}
