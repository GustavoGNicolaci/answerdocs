import { requireAuthenticatedUser } from "@/lib/auth";
import { toResponseError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import { loadSavedChatTurns, requireOwnedChat } from "@/lib/workspace";

export const runtime = "nodejs";

type ChatMessagesContext = {
  params: Promise<{ id: string }>;
};

export async function GET(_request: Request, context: ChatMessagesContext) {
  try {
    const { id } = await context.params;
    const user = await requireAuthenticatedUser();
    const supabase = getSupabaseAdmin();
    await requireOwnedChat(supabase, user.id, id);

    return Response.json({
      turns: await loadSavedChatTurns(supabase, user.id, id),
    });
  } catch (error) {
    return toResponseError(error);
  }
}
