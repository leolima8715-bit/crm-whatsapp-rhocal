import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import LogoutButton from "@/components/LogoutButton";
import NumerosManager from "@/components/numeros/NumerosManager";

export const dynamic = "force-dynamic";

export default async function NumerosPage() {
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

  const { data: instances } = await supabase
    .from("whatsapp_instances")
    .select("id, label, phone, status, sector_id")
    .eq("org_id", profile.org_id)
    .eq("archived", false)
    .order("created_at", { ascending: true });

  const { data: sectors } = await supabase
    .from("sectors")
    .select("id, name, color")
    .eq("org_id", profile.org_id)
    .eq("archived", false)
    .order("name", { ascending: true });

  return (
    <main className="flex min-h-screen flex-col">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-cyber-line bg-cyber-panel px-5">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-widest text-cyber-cyan">
            CRM WhatsApp · RHOCAL
          </p>
          <p className="text-sm font-bold">Números · {profile.full_name}</p>
        </div>

        <Link
          href="/inbox"
          className="rounded-lg border border-cyber-line px-4 py-2 text-sm text-cyber-white/80 transition hover:border-cyber-cyan hover:text-cyber-cyan"
        >
          Voltar ao Inbox
        </Link>

        <LogoutButton />
      </header>

      <NumerosManager
        instances={
          (instances ?? []) as {
            id: string;
            label: string;
            phone: string | null;
            status: "disconnected" | "connecting" | "connected";
            sector_id: string | null;
          }[]
        }
        sectors={(sectors ?? []) as { id: string; name: string; color: string | null }[]}
      />
    </main>
  );
}
