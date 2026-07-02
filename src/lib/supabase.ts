import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { configurationError } from "@/lib/errors";

let supabaseAdmin: SupabaseClient | null = null;

export function getSupabaseAdmin() {
  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw configurationError("SUPABASE_URL is missing.");
  }

  if (!serviceRoleKey) {
    throw configurationError("SUPABASE_SERVICE_ROLE_KEY is missing.");
  }

  if (!supabaseAdmin) {
    supabaseAdmin = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return supabaseAdmin;
}
