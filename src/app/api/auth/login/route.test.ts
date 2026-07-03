import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-auth";
import { ensureProfile } from "@/lib/workspace";
import { POST } from "./route";

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase-auth", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/workspace", () => ({
  ensureProfile: vi.fn(),
}));

describe("login route", () => {
  const signInWithPassword = vi.fn();
  const admin = {};

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { signInWithPassword },
    } as never);
    vi.mocked(getSupabaseAdmin).mockReturnValue(admin as never);
    vi.mocked(ensureProfile).mockResolvedValue({} as never);
  });

  it("does not overwrite the saved profile name from stale auth metadata", async () => {
    signInWithPassword.mockResolvedValue({
      data: {
        user: {
          id: "user-id",
          email: "user@example.com",
          user_metadata: { full_name: "Old name" },
        },
      },
      error: null,
    });

    const response = await POST(
      jsonRequest({
        email: "user@example.com",
        password: "secret123",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.message).toBe("Signed in.");
    expect(ensureProfile).toHaveBeenCalledWith(admin, {
      id: "user-id",
      email: "user@example.com",
    });
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
