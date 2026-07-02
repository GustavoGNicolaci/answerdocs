import { z } from "zod";
import { badRequest, toResponseError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ensureProfile } from "@/lib/workspace";

export const runtime = "nodejs";

const loginSchema = z.object({
  email: z.email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  try {
    const body = loginSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword(body);

    if (error) throw badRequest(error.message);
    if (!data.user) throw badRequest("Could not sign in.");

    await ensureProfile(
      getSupabaseAdmin(),
      { id: data.user.id, email: data.user.email ?? body.email },
      typeof data.user.user_metadata.full_name === "string"
        ? data.user.user_metadata.full_name
        : "",
    );

    return Response.json({
      user: { id: data.user.id, email: data.user.email ?? body.email },
      message: "Signed in.",
    });
  } catch (error) {
    return toResponseError(error);
  }
}
