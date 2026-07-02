import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth";
import { toResponseError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ensureWorkspace,
  requireOwnedChat,
  sanitizeWorkspaceName,
} from "@/lib/workspace";

export const runtime = "nodejs";

type ChatContext = {
  params: Promise<{ id: string }>;
};

const updateChatSchema = z.object({
  title: z.string().trim().min(1).max(120),
});

export async function PATCH(request: Request, context: ChatContext) {
  try {
    const { id } = await context.params;
    const user = await requireAuthenticatedUser();
    const body = updateChatSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    await requireOwnedChat(supabase, user.id, id);

    const { data, error } = await supabase
      .from("chats")
      .update({
        title: sanitizeWorkspaceName(body.title, "Untitled chat"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id,user_id,folder_id,title,created_at,updated_at")
      .single();

    if (error) throw error;

    return Response.json({ chat: data });
  } catch (error) {
    return toResponseError(error);
  }
}

export async function DELETE(_request: Request, context: ChatContext) {
  try {
    const { id } = await context.params;
    const user = await requireAuthenticatedUser();
    const supabase = getSupabaseAdmin();
    await requireOwnedChat(supabase, user.id, id);

    const { error } = await supabase
      .from("chats")
      .delete()
      .eq("id", id)
      .eq("user_id", user.id);

    if (error) throw error;

    await ensureWorkspace(supabase, user.id);
    return Response.json({ ok: true });
  } catch (error) {
    return toResponseError(error);
  }
}
