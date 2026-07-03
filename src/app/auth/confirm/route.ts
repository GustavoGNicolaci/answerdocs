import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { getSafeRedirectPath } from "@/lib/auth-redirect";
import { createSupabaseServerClient } from "@/lib/supabase-auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const successRedirect = request.nextUrl.clone();
  const authRedirect = request.nextUrl.clone();

  successRedirect.pathname = getSafeRedirectPath(searchParams.get("next"));
  successRedirect.search = "";

  authRedirect.pathname = "/auth";
  authRedirect.search = "";

  const supabase = await createSupabaseServerClient();
  let confirmed = false;

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    confirmed = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });
    confirmed = !error;
  }

  if (confirmed) {
    const { data } = await supabase.auth.getUser();

    if (data.user) {
      return NextResponse.redirect(successRedirect);
    }

    authRedirect.searchParams.set("auth", "confirmed");
    return NextResponse.redirect(authRedirect);
  }

  authRedirect.searchParams.set("auth", "confirm-error");
  return NextResponse.redirect(authRedirect);
}
