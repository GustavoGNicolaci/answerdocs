import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createSupabaseServerClient } from "@/lib/supabase-auth";
import { GET } from "./route";

vi.mock("@/lib/supabase-auth", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("email confirmation route", () => {
  const exchangeCodeForSession = vi.fn();
  const verifyOtp = vi.fn();
  const getUser = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    exchangeCodeForSession.mockResolvedValue({ error: null });
    verifyOtp.mockResolvedValue({ error: null });
    getUser.mockResolvedValue({
      data: { user: { id: "user-id" } },
      error: null,
    });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { exchangeCodeForSession, verifyOtp, getUser },
    } as never);
  });

  it("exchanges a PKCE code and redirects to the requested safe path", async () => {
    const response = await GET(
      new NextRequest("http://localhost/auth/confirm?code=auth-code&next=/"),
    );
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/");
    expect(location.search).toBe("");
    expect(exchangeCodeForSession).toHaveBeenCalledWith("auth-code");
    expect(getUser).toHaveBeenCalled();
  });

  it("accepts token hash confirmation links", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost/auth/confirm?token_hash=confirm-token&type=email",
      ),
    );
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/");
    expect(verifyOtp).toHaveBeenCalledWith({
      type: "email",
      token_hash: "confirm-token",
    });
  });

  it("redirects to login with a friendly status if confirmation succeeds without a readable session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await GET(
      new NextRequest("http://localhost/auth/confirm?code=auth-code"),
    );
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/auth");
    expect(location.searchParams.get("auth")).toBe("confirmed");
  });

  it("redirects invalid links to the login confirmation error state", async () => {
    exchangeCodeForSession.mockResolvedValue({
      error: new Error("invalid link"),
    });

    const response = await GET(
      new NextRequest("http://localhost/auth/confirm?code=invalid-code"),
    );
    const location = new URL(response.headers.get("location")!);

    expect(response.status).toBe(307);
    expect(location.pathname).toBe("/auth");
    expect(location.searchParams.get("auth")).toBe("confirm-error");
  });
});
