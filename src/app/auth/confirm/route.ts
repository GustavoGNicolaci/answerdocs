import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase-auth";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const redirectTo = request.nextUrl.clone();

  redirectTo.pathname = "/";
  redirectTo.searchParams.delete("token_hash");
  redirectTo.searchParams.delete("type");

  if (tokenHash && type) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.verifyOtp({
      type,
      token_hash: tokenHash,
    });

    if (!error) {
      redirectTo.searchParams.set("auth", "confirmed");
      return NextResponse.redirect(redirectTo);
    }
  }

  redirectTo.searchParams.set("auth", "error");
  return NextResponse.redirect(redirectTo);
}
