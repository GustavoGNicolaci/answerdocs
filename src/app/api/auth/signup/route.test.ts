import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-auth";
import { ensureProfile } from "@/lib/workspace";
import { POST } from "./route";

const originalSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase-auth", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/workspace", () => ({
  ensureProfile: vi.fn(),
}));

describe("signup route", () => {
  const signUp = vi.fn();
  const admin = {};

  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://answerdocs.example.com";
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { signUp },
    } as never);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    vi.mocked(ensureProfile).mockResolvedValue({} as never);
  });

  afterEach(() => {
    if (originalSiteUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SITE_URL;
    } else {
      process.env.NEXT_PUBLIC_SITE_URL = originalSiteUrl;
    }
  });

  it("returns a friendly confirmation message and configured email redirect", async () => {
    signUp.mockResolvedValue({
      data: {
        user: { id: "user-id", email: "user@example.com" },
        session: null,
      },
      error: null,
    });

    const response = await POST(
      jsonRequest({
        name: "Gustavo",
        email: "user@example.com",
        password: "secret123",
        confirmPassword: "secret123",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.needsConfirmation).toBe(true);
    expect(payload.message).toBe(
      "Account created successfully! We sent you a confirmation email. Please check your inbox to activate your account.",
    );
    expect(signUp).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "user@example.com",
        options: expect.objectContaining({
          data: { full_name: "Gustavo" },
          emailRedirectTo:
            "https://answerdocs.example.com/auth/confirm?next=%2F",
        }),
      }),
    );
    expect(ensureProfile).toHaveBeenCalledWith(
      admin,
      { id: "user-id", email: "user@example.com" },
      "Gustavo",
    );
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
