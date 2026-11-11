import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { isUuid } from "@/lib/users";
import ThemeToggle from "@/components/ThemeToggle";
import LogoutButton from "@/components/LogoutButton";
import ContatosManager, { type ContactRow } from "@/components/contatos/ContatosManager";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function ContatosPage({
  searchParams,
}: {
  searchParams: { q?: string; chip?: string; owner?: string; page?: string };
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
  if (!profile) redirect("/inbox");
  const isGestor = profile.role === "gestor";

  const q = (searchParams.q ?? "").replace(/[%,()*\\]/g, " ").trim().slice(0, 50);
  const digits = q.replace(/\D/g, "");
  const page = Math.max(1, Number.parseInt(searchParams.page ?? "1", 10) || 1);
  const chip = isGestor && isUuid(searchParams.chip) ? searchParams.chip : "";
  const owner =
    isGestor && (searchParams.owner === "none" || isUuid(searchParams.owner))
      ? (searchParams.owner as string)
      : "";

  // Client do usuário: a RLS de contacts decide o que cada um enxerga (gestor vê todos).
  let query = supabase
    .from("contacts")
    .select(
      "id, name, push_name, phone, owner_id, source_instance_id, source:whatsapp_instances!source_instance_id(label)",
      { count: "exact" }
    )
    .eq("org_id", profile.org_id)
    .eq("archived", false);

  if (q) {
    const filters = [`name.ilike.%${q}%`, `push_name.ilike.%${q}%`];
    if (digits.length >= 3) filters.push(`phone.ilike.%${digits}%`);
    query = query.or(filters.join(","));
  }
  if (chip) query = query.eq("source_instance_id", chip);
  if (owner === "none") query = query.is("owner_id", null);
  else if (owner) query = query.eq("owner_id", owner);

  const from = (page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order("name", { ascending: true, nullsFirst: false })
    .order("phone", { ascending: true })
    .range(from, from + PAGE_SIZE - 1);

  // Nome do responsável (profiles) só para exibição.
  const admin = createAdminClient();
  const [{ data: people }, { data: chips }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, full_name")
      .eq("org_id", profile.org_id)
      .eq("active", true)
      .order("full_name", { ascending: true }),
    isGestor
      ? supabase
          .from("whatsapp_instances")
          .select("id, label")
          .eq("org_id", profile.org_id)
          .eq("archived", false)
          .order("label", { ascending: true })
      : Promise.resolve({ data: [] as { id: string; label: string }[] }),
  ]);
  const nameById = new Map((people ?? []).map((p) => [p.id as string, p.full_name as string]));

  type Raw = {
    id: string;
    name: string | null;
    push_name: string | null;
    phone: string;
    owner_id: string | null;
    source: { label: string } | { label: string }[] | null;
  };
  const rows: ContactRow[] = ((data ?? []) as unknown as Raw[]).map((c) => {
    const src = Array.isArray(c.source) ? c.source[0] : c.source;
    return {
      id: c.id,
      name: c.name,
      push_name: c.push_name,
      phone: c.phone,
      chip: src?.label ?? null,
      owner: c.owner_id ? (nameById.get(c.owner_id) ?? null) : null,
    };
  });

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-subtle bg-panel px-5">
        <div>
          <p className="text-[10px] uppercase tracking-widest text-accent-text">
            CRM WhatsApp · RHOCAL
          </p>
          <p className="text-sm font-bold">Contatos · {profile.full_name}</p>
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

      <ContatosManager
        contacts={rows}
        total={count ?? 0}
        page={page}
        pageSize={PAGE_SIZE}
        isGestor={isGestor}
        chips={(chips ?? []) as { id: string; label: string }[]}
        people={(people ?? []).map((p) => ({ id: p.id as string, name: p.full_name as string }))}
        filters={{ q, chip, owner }}
        loadError={!!error}
      />
    </main>
  );
}
