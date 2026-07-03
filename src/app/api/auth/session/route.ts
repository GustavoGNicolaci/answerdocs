import { getOptionalAuthenticatedUser } from "@/lib/auth";
import { toResponseError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await getOptionalAuthenticatedUser();

    if (!user) {
      return Response.json({ user: null, profile: null });
    }

    const { data, error } = await getSupabaseAdmin()
      .from("profiles")
      .select("id,full_name,email,created_at,updated_at,interface_language")
      .eq("id", user.id)
      .maybeSingle();

    if (error) throw error;

    return Response.json({ user, profile: data ?? null });
  } catch (error) {
    return toResponseError(error);
  }
}
