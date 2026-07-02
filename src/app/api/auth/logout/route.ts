import { toResponseError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase-auth";

export const runtime = "nodejs";

export async function POST() {
  try {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();

    return Response.json({ ok: true });
  } catch (error) {
    return toResponseError(error);
  }
}
