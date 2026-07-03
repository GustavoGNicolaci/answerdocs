import { cookies } from "next/headers";
import { z } from "zod";
import { MIN_ACCOUNT_PASSWORD_LENGTH } from "@/lib/account-constants";
import { badRequest, toResponseError, unauthorized } from "@/lib/errors";
import {
  PASSWORD_RESET_COOKIE,
  PASSWORD_RESET_SUCCESS_MESSAGE,
} from "@/lib/password-reset";
import { createSupabaseServerClient } from "@/lib/supabase-auth";

export const runtime = "nodejs";

const resetPasswordSchema = z
  .object({
    newPassword: z.string().min(MIN_ACCOUNT_PASSWORD_LENGTH).max(128),
    confirmPassword: z.string().min(MIN_ACCOUNT_PASSWORD_LENGTH).max(128),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function POST(request: Request) {
  try {
    const body = resetPasswordSchema.parse(await request.json());
    const cookieStore = await cookies();

    if (cookieStore.get(PASSWORD_RESET_COOKIE)?.value !== "1") {
      throw unauthorized("Open the password reset link again.");
    }

    const supabase = await createSupabaseServerClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      throw unauthorized("Open the password reset link again.");
    }

    const { error } = await supabase.auth.updateUser({
      password: body.newPassword,
    });

    if (error) {
      throw badRequest("Could not reset password.");
    }

    await supabase.auth.signOut();
    cookieStore.delete(PASSWORD_RESET_COOKIE);

    return Response.json({
      ok: true,
      message: PASSWORD_RESET_SUCCESS_MESSAGE,
    });
  } catch (error) {
    return toResponseError(error);
  }
}
