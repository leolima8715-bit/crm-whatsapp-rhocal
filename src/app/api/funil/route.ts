import { NextResponse } from "next/server";
import { errorResponse, requireProfile } from "@/lib/auth";
import { loadFunilData } from "@/lib/funil-server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { supabase, profile } = await requireProfile();
    return NextResponse.json(await loadFunilData(createAdminClient(), supabase, profile));
  } catch (e) {
    return errorResponse(e);
  }
}
