import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth";
import { toResponseError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ensureWorkspace,
  requireOwnedFolder,
  sanitizeWorkspaceName,
} from "@/lib/workspace";

export const runtime = "nodejs";

type FolderContext = {
  params: Promise<{ id: string }>;
};

const updateFolderSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export async function PATCH(request: Request, context: FolderContext) {
  try {
    const { id } = await context.params;
    const user = await requireAuthenticatedUser();
    const body = updateFolderSchema.parse(await request.json());
    const supabase = getSupabaseAdmin();
    await requireOwnedFolder(supabase, user.id, id);

    const { data, error } = await supabase
      .from("folders")
      .update({
        name: sanitizeWorkspaceName(body.name, "Untitled folder"),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id,user_id,name,created_at,updated_at")
      .single();

    if (error) throw error;

    return Response.json({ folder: data });
  } catch (error) {
    return toResponseError(error);
  }
}

export async function DELETE(_request: Request, context: FolderContext) {
  try {
    const { id } = await context.params;
    const user = await requireAuthenticatedUser();
    const supabase = getSupabaseAdmin();
    await requireOwnedFolder(supabase, user.id, id);

    const { error } = await supabase
      .from("folders")
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
