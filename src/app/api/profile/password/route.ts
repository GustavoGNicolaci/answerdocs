import { z } from "zod";
import {
  MIN_ACCOUNT_PASSWORD_LENGTH,
  updatePasswordWithCurrentPassword,
} from "@/lib/account";
import { requireAuthenticatedUser } from "@/lib/auth";
import { badRequest, toResponseError } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ensureProfile } from "@/lib/workspace";

export const runtime = "nodejs";

const passwordUpdateSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: z.string().min(MIN_ACCOUNT_PASSWORD_LENGTH).max(128),
    confirmPassword: z.string().min(MIN_ACCOUNT_PASSWORD_LENGTH).max(128),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });

export async function POST(request: Request) {
  try {
    const user = await requireAuthenticatedUser();
    const body = passwordUpdateSchema.parse(await request.json());

    if (body.currentPassword === body.newPassword) {
      throw badRequest("Choose a new password that is different.");
    }

    const profile = await ensureProfile(getSupabaseAdmin(), user);
    await updatePasswordWithCurrentPassword({
      email: user.email ?? profile.email,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
    });

    return Response.json({ ok: true, message: "Password updated." });
  } catch (error) {
    return toResponseError(error);
  }
}
