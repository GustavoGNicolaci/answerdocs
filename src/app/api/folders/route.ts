import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth";
import { toResponseError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import {
  ensureWorkspace,
  listFolders,
  sanitizeWorkspaceName,
} from "@/lib/workspace";

export const runtime = "nodejs";

const folderSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export async function GET() {
  try {
    const user = await requireAuthenticatedUser();
    const supabase = getSupabaseAdmin();
    await ensureWorkspace(supabase, user.id);

    return Response.json({ folders: await listFolders(supabase, user.id) });
  } catch (error) {
    return toResponseError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const body = folderSchema.parse(await request.json());
    const { data, error } = await getSupabaseAdmin()
      .from("folders")
      .insert({
        user_id: user.id,
        name: sanitizeWorkspaceName(body.name, "New folder"),
      })
      .select("id,user_id,name,created_at,updated_at")
      .single();

    if (error) throw error;

    return Response.json({ folder: data }, { status: 201 });
  } catch (error) {
    return toResponseError(error);
  }
}
