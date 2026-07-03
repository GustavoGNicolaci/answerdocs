import { z } from "zod";
import { toResponseError } from "@/lib/errors";
import {
  buildPasswordResetRedirectUrl,
  PASSWORD_RESET_REQUEST_MESSAGE,
} from "@/lib/password-reset";
import { createSupabaseServerClient } from "@/lib/supabase-auth";

export const runtime = "nodejs";

const forgotPasswordSchema = z.object({
  email: z.email().max(254),
});

export async function POST(request: Request) {
  try {
    const body = forgotPasswordSchema.parse(await request.json());
    const supabase = await createSupabaseServerClient();

    await supabase.auth.resetPasswordForEmail(body.email, {
      redirectTo: buildPasswordResetRedirectUrl(request),
    });

    return Response.json({
      ok: true,
      message: PASSWORD_RESET_REQUEST_MESSAGE,
    });
  } catch (error) {
    return toResponseError(error);
  }
}
