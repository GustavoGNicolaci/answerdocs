import { requireAuthenticatedUser } from "@/lib/auth";
import { toResponseError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ensureProfile, ensureWorkspace } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const supabase = getSupabaseAdmin();
    const profile = await ensureProfile(supabase, user);
    const workspace = await ensureWorkspace(supabase, user.id);

    return Response.json({
      user,
      profile,
      folders: workspace.folders,
      chats: workspace.chats,
    });
  } catch (error) {
    return toResponseError(error);
  }
}
