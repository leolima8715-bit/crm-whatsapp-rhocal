import { createClient } from "@supabase/supabase-js";

// ATENÇÃO: usa a service_role. Importar SOMENTE em rotas de API e código de servidor.
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}