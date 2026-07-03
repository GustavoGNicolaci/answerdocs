import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PASSWORD_RESET_COOKIE } from "@/lib/password-reset";
import { createSupabaseServerClient } from "@/lib/supabase-auth";
import { GET } from "./route";

vi.mock("@/lib/supabase-auth", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("reset password confirmation route", () => {
  const exchangeCodeForSession = vi.fn();
  const verifyOtp = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    exchangeCodeForSession.mockResolvedValue({ error: null });
    verifyOtp.mockResolvedValue({ error: null });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { exchangeCodeForSession, verifyOtp },
    } as never);
  });

  it("exchanges a recovery code for a session", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/auth/reset-password/confirm?code=recovery-code",
      ),
    );

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).pathname).toBe(
      "/auth/reset-password",
    );
    expect(new URL(response.headers.get("location")!).searchParams.get("status"))
      .toBe("ready");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("recovery-code");
    expect(response.headers.get("set-cookie")).toContain(
      PASSWORD_RESET_COOKIE,
    );
  });

  it("accepts a recovery token hash fallback", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/auth/reset-password/confirm?token_hash=recovery-token&type=recovery",
      ),
    );

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).searchParams.get("status"))
      .toBe("ready");
    expect(verifyOtp).toHaveBeenCalledWith({
      token_hash: "recovery-token",
      type: "recovery",
    });
  });

  it("redirects invalid links to the reset error state", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: new Error("invalid link"),
    });

    const response = await GET(
      new NextRequest(
        "http://localhost/auth/reset-password/confirm?code=invalid-code",
      ),
    );

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get("location")!).searchParams.get("status"))
      .toBe("error");
    expect(response.headers.get("set-cookie")).toContain(
      PASSWORD_RESET_COOKIE,
    );
  });
});
