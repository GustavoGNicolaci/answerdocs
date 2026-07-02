import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth";
import { toResponseError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ensureFolderHasChat,
  listChats,
  requireOwnedFolder,
  sanitizeWorkspaceName,
} from "@/lib/workspace";

export const runtime = "nodejs";

const chatSchema = z.object({
  folderId: z.uuid(),
  title: z.string().trim().min(1).max(120).optional(),
});

export async function GET(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const { searchParams } = new URL(request.url);
    const folderId = searchParams.get("folderId");
    const supabase = getSupabaseAdmin();
    let chats = await listChats(supabase, user.id);

    if (folderId) {
      await requireOwnedFolder(supabase, user.id, folderId);
      await ensureFolderHasChat(supabase, user.id, folderId);
      chats = await listChats(supabase, user.id);
      chats = chats.filter((chat) => chat.folder_id === folderId);
    }

    return Response.json({ chats });
  } catch (error) {
    return toResponseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const body = chatSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    await requireOwnedFolder(supabase, user.id, body.folderId);

    const { data, error } = await supabase
      .from("chats")
      .insert({
        user_id: user.id,
        folder_id: body.folderId,
        title: sanitizeWorkspaceName(body.title ?? "New chat", "New chat"),
      })
      .select("id,user_id,folder_id,title,created_at,updated_at")
      .single();

    if (error) throw error;

    return Response.json({ chat: data }, { status: 201 });
  } catch (error) {
    return toResponseError(error);
  }
}
