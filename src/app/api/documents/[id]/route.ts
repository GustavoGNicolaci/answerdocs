import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth";
import { badRequest, toResponseError } from "@/lib/errors";
import { getSessionIdFromRequest } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireOwnedChat, requireOwnedFolder } from "@/lib/workspace";

export const runtime = "nodejs";

type DeleteContext = {
  params: Promise<{ id: string }>;
};

const updateDocumentSchema = z.object({
  folderId: z.uuid().optional(),
  chatId: z.uuid().optional(),
  selected: z.boolean(),
});

export async function PATCH(request: Request, context: DeleteContext) {
  try {
    const { id } = await context.params;
    const body = updateDocumentSchema.parse(await request.json());
    const user = await requireAuthenticatedUser();
    const supabase = getSupabaseAdmin();
    let folderId = body.folderId ?? null;

    if (folderId) {
      await requireOwnedFolder(supabase, user.id, folderId);
    } else if (body.chatId) {
      const chat = await requireOwnedChat(supabase, user.id, body.chatId);
      folderId = chat.folder_id;
    }

    if (!folderId) {
      throw badRequest("A valid folderId is required.");
    }

    const { error } = await supabase
      .from("documents")
      .update({
        selected: body.selected,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .eq("folder_id", folderId);

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
    const folderId = url.searchParams.get("folderId");
    const chatId = url.searchParams.get("chatId");
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("documents")
      .delete()
      .eq("id", id);

    if (folderId) {
      const user = await requireAuthenticatedUser();
      await requireOwnedFolder(supabase, user.id, folderId);
      query = query.eq("user_id", user.id).eq("folder_id", folderId);
    } else if (chatId) {
      const user = await requireAuthenticatedUser();
      const chat = await requireOwnedChat(supabase, user.id, chatId);
      query = query.eq("user_id", user.id).eq("folder_id", chat.folder_id);
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
