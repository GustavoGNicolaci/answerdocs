import { unauthorized } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase-auth";

export type AuthenticatedUser = {
  id: string;
  email: string | null;
};

export async function getOptionalAuthenticatedUser(): Promise<AuthenticatedUser | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getClaims();

  if (error || !data?.claims?.sub) {
    return null;
  }

  return {
    id: String(data.claims.sub),
    email: typeof data.claims.email === "string" ? data.claims.email : null,
  };
}

export async function requireAuthenticatedUser() {
  const user = await getOptionalAuthenticatedUser();

  if (!user) {
    throw unauthorized("Sign in to use saved workspaces.");
  }

  return user;
}
