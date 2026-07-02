import { toResponseError } from "@/lib/errors";
import { getSessionIdFromRequest } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

type DeleteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(request: Request, context: DeleteContext) {
  try {
    const { id } = await context.params;
    const sessionId = getSessionIdFromRequest(request);
    const { error } = await getSupabaseAdmin()
      .from("documents")
      .delete()
      .eq("id", id)
      .eq("session_id", sessionId);

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    return toResponseError(error);
  }
}
