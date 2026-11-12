import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchConversation, fetchConversations } from "@/lib/inbox-queries";
import { isUuid } from "@/lib/users";
import { createAdminClient } from "@/lib/supabase/admin";
import { normalizePhone } from "@/lib/phone";
import { CONVERSATION_SELECT } from "@/lib/inbox-queries";
import type { ConversationRow } from "@/lib/inbox-types";
import ThemeToggle from "@/components/ThemeToggle";
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
  searchParams: { conversation?: string; telefone?: string };
}) {
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

  // Não gestor que é dono de algum chip também acessa /numeros (importar contatos).
  let ownsInstance = false;
  if (profile && profile.role !== "gestor") {
    const { data: owned } = await supabase
      .from("whatsapp_instances")
      .select("id")
      .eq("owner_id", user.id)
      .eq("archived", false)
      .limit(1);
    ownsInstance = !!owned?.length;
  }

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

  // ?telefone=55...: link vindo do CRM RHOCAL. Procura as conversas desse telefone que o usuário pode ver.
  let phoneLookup: { phone: string; matches: ConversationRow[] } | null = null;
  const phone = typeof searchParams.telefone === "string" ? normalizePhone(searchParams.telefone) : null;
  if (profile && phone && !initialSelectedId) {
    // Variantes com/sem o 9º dígito de celular (55 + DDD + 9 + 8 dígitos).
    const variants = new Set([phone]);
    if (phone.length === 13 && phone.startsWith("55") && phone[4] === "9") variants.add(phone.slice(0, 4) + phone.slice(5));
    if (phone.length === 12 && phone.startsWith("55")) variants.add(phone.slice(0, 4) + "9" + phone.slice(4));
    const admin = createAdminClient();
    const { data: contacts } = await admin
      .from("contacts")
      .select("id")
      .eq("org_id", profile.org_id)
      .in("phone", Array.from(variants));
    const ids = (contacts ?? []).map((c) => c.id as string);
    let matches: ConversationRow[] = [];
    if (ids.length) {
      // Client do usuário: a RLS (can_access_conversation) filtra o que ele pode ver.
      const { data } = await supabase
        .from("conversations")
        .select(CONVERSATION_SELECT)
        .in("contact_id", ids)
        .order("last_message_at", { ascending: false, nullsFirst: false });
      matches = (data ?? []) as unknown as ConversationRow[];
    }
    for (const m of matches) if (!conversations.some((c) => c.id === m.id)) conversations.push(m);
    if (matches.length === 1) initialSelectedId = matches[0].id;
    else phoneLookup = { phone, matches };
  }

  return (
    <main className="flex h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-subtle bg-panel px-5">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-accent-text">
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
                className="rounded-lg border border-subtle px-4 py-2 text-sm text-primary transition hover:border-accent hover:text-accent-text"
              >
                Números
              </Link>
              <Link
                href="/usuarios"
                className="rounded-lg border border-subtle px-4 py-2 text-sm text-primary transition hover:border-accent hover:text-accent-text"
              >
                Usuários
              </Link>
            </>
          )}
          <Link
            href="/contatos"
            className="rounded-lg border border-subtle px-4 py-2 text-sm text-primary transition hover:border-accent hover:text-accent-text"
          >
            Contatos
          </Link>
          {ownsInstance && (
            <Link
              href="/numeros"
              className="rounded-lg border border-subtle px-4 py-2 text-sm text-primary transition hover:border-accent hover:text-accent-text"
            >
              Meus números
            </Link>
          )}
          <Link
            href="/funil"
            className="rounded-lg border border-subtle px-4 py-2 text-sm text-primary transition hover:border-accent hover:text-accent-text"
          >
            Funil
          </Link>
          <Link
            href="/respostas-rapidas"
            className="rounded-lg border border-subtle px-4 py-2 text-sm text-primary transition hover:border-accent hover:text-accent-text"
          >
            Respostas rápidas
          </Link>
          <Link
            href="/conta"
            className="rounded-lg border border-subtle px-4 py-2 text-sm text-primary transition hover:border-accent hover:text-accent-text"
          >
            Minha conta
          </Link>
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>

      {profile ? (
        <InboxShell
          initialConversations={conversations}
          currentUserId={user.id}
          currentRole={profile.role}
          currentUserName={profile.full_name}
          initialSelectedId={initialSelectedId}
          phoneLookup={phoneLookup}
        />
      ) : (
        <p className="p-8 text-danger">
          Seu usuário ainda não tem perfil. Peça ao gestor para liberar o acesso.
        </p>
      )}
    </main>
  );
}
