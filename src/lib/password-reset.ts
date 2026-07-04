import { getConfiguredRequestOrigin } from "@/lib/auth-redirect";

export const PASSWORD_RESET_COOKIE = "answerdocs-password-recovery";
export const PASSWORD_RESET_COOKIE_MAX_AGE_SECONDS = 10 * 60;
export const PASSWORD_RESET_REQUEST_MESSAGE =
  "If this email is registered, we will send a reset link.";
export const PASSWORD_RESET_SUCCESS_MESSAGE = "Password reset successfully.";

export function buildPasswordResetRedirectUrl(request: Request) {
  const origin = getConfiguredRequestOrigin(request);
  return new URL("/auth/reset-password/confirm", `${origin}/`).toString();
}
