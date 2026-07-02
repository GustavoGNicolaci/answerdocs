import { toResponseError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

type DeleteContext = {
  params: Promise<{ id: string }>;
};

export async function DELETE(_request: Request, context: DeleteContext) {
  try {
    const { id } = await context.params;
    const { error } = await getSupabaseAdmin()
      .from("documents")
      .delete()
      .eq("id", id);

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
    return toResponseError(error);
  }
}
