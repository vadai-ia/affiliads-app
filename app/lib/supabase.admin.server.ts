import { createClient } from "@supabase/supabase-js";
import type { Database } from "~/types/database";
import { getServerEnv } from "~/lib/env.server";

let admin: ReturnType<typeof createClient<Database>> | null = null;

export function getSupabaseAdmin() {
  if (admin) return admin;
  const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = getServerEnv();
  admin = createClient<Database>(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
  return admin;
}
