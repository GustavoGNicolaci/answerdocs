import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth";
import { toResponseError } from "@/lib/errors";
import { getSessionIdFromRequest } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireOwnedChat } from "@/lib/workspace";

export const runtime = "nodejs";

type DeleteContext = {
  params: Promise<{ id: string }>;
};

const updateDocumentSchema = z.object({
  chatId: z.uuid(),
  selected: z.boolean(),
});

export async function PATCH(request: Request, context: DeleteContext) {
  try {
    const { id } = await context.params;
    const body = updateDocumentSchema.parse(await request.json());
    const user = await requireAuthenticatedUser();
    const supabase = getSupabaseAdmin();
    await requireOwnedChat(supabase, user.id, body.chatId);

    const { error } = await supabase
      .from("documents")
      .update({
        selected: body.selected,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("chat_id", body.chatId);

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    return toResponseError(error);
  }
}

export async function DELETE(request: Request, context: DeleteContext) {
  try {
    const { id } = await context.params;
    const url = new URL(request.url);
    const chatId = url.searchParams.get("chatId");
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("documents")
      .delete()
      .eq("id", id);

    if (chatId) {
      const user = await requireAuthenticatedUser();
      await requireOwnedChat(supabase, user.id, chatId);
      query = query.eq("user_id", user.id).eq("chat_id", chatId);
    } else {
      const sessionId = getSessionIdFromRequest(request);
      query = query.eq("session_id", sessionId).is("user_id", null);
    }

    const { error } = await query;

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    return toResponseError(error);
  }
}
