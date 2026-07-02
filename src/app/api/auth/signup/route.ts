import { z } from "zod";
import { badRequest, toResponseError } from "@/lib/errors";
import { createSupabaseServerClient } from "@/lib/supabase-auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ensureProfile } from "@/lib/workspace";

export const runtime = "nodejs";

const signupSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    email: z.email().max(254),
    password: z.string().min(6).max(128),
    confirmPassword: z.string().min(6).max(128),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function POST(request: Request) {
  try {
    const body = signupSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();
    const redirectTo = new URL("/auth/confirm", request.url).toString();

    const { data, error } = await supabase.auth.signUp({
      email: body.email,
      password: body.password,
      options: {
        data: { full_name: body.name },
        emailRedirectTo: redirectTo,
      },
    });

    if (error) throw badRequest(error.message);

    if (data.user) {
      await ensureProfile(
        getSupabaseAdmin(),
        { id: data.user.id, email: data.user.email ?? body.email },
        body.name,
      );
    }

    return Response.json({
      user: data.user
        ? { id: data.user.id, email: data.user.email ?? body.email }
        : null,
      needsConfirmation: !data.session,
      message: data.session
        ? "Account created."
        : "Account created. Check your email if confirmation is enabled.",
    });
  } catch (error) {
    return toResponseError(error);
  }
}
