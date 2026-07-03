import { createClient } from "@supabase/supabase-js";
import {
  ACCOUNT_DELETE_CONFIRMATION,
  MIN_ACCOUNT_PASSWORD_LENGTH,
} from "@/lib/account-constants";
import { badRequest } from "@/lib/errors";
import { getSupabaseAuthConfig } from "@/lib/supabase-auth";

export { ACCOUNT_DELETE_CONFIRMATION, MIN_ACCOUNT_PASSWORD_LENGTH };

export async function verifyCurrentPassword(input: {
  email: string | null;
  password: string;
}) {
  const supabase = await createVerifiedPasswordClient(input);
  await supabase.auth.signOut();
}

export async function updatePasswordWithCurrentPassword(input: {
  email: string | null;
  currentPassword: string;
  newPassword: string;
}) {
  const supabase = await createVerifiedPasswordClient({
    email: input.email,
    password: input.currentPassword,
  });

  const { error } = await supabase.auth.updateUser({
    password: input.newPassword,
  });

  await supabase.auth.signOut();

  if (error) {
    throw badRequest("Could not update password.");
  }
}

async function createVerifiedPasswordClient(input: {
  email: string | null;
  password: string;
}) {
  const email = input.email?.trim();

  if (!email) {
    throw badRequest("Could not verify this account.");
  }

  if (!input.password) {
    throw badRequest("Enter your current password.");
  }

  const { url, publishableKey } = getSupabaseAuthConfig();
  const supabase = createClient(url, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: input.password,
  });

  if (error || !data.user) {
    throw badRequest("Current password is incorrect.");
  }

  return supabase;
}

export function sanitizeDisplayName(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 120);
}
