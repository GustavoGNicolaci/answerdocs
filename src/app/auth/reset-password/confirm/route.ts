import { NextResponse, type NextRequest } from "next/server";
import {
  PASSWORD_RESET_COOKIE,
  PASSWORD_RESET_COOKIE_MAX_AGE_SECONDS,
} from "@/lib/password-reset";
import { createSupabaseServerClient } from "@/lib/supabase-auth";

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const redirectTo = request.nextUrl.clone();

  redirectTo.pathname = "/auth/reset-password";
  redirectTo.search = "";

  const supabase = await createSupabaseServerClient();
  let recoverySessionReady = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    recoverySessionReady = !error;
  } else if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: "recovery",
    });
    recoverySessionReady = !error;
  }

  redirectTo.searchParams.set(
    "status",
    recoverySessionReady ? "ready" : "error",
  );

  const response = NextResponse.redirect(redirectTo);

  if (recoverySessionReady) {
    response.cookies.set(PASSWORD_RESET_COOKIE, "1", {
      httpOnly: true,
      maxAge: PASSWORD_RESET_COOKIE_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: request.nextUrl.protocol === "https:",
    });
  } else {
    response.cookies.delete(PASSWORD_RESET_COOKIE);
  }

  return response;
}
