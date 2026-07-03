import { beforeEach, describe, expect, it, vi } from "vitest";
import { PASSWORD_RESET_REQUEST_MESSAGE } from "@/lib/password-reset";
import { createSupabaseServerClient } from "@/lib/supabase-auth";
import { POST } from "./route";

vi.mock("@/lib/supabase-auth", () => ({
  createSupabaseServerClient: vi.fn(),
}));

describe("forgot password route", () => {
  const resetPasswordForEmail = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    resetPasswordForEmail.mockResolvedValue({ error: null });
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { resetPasswordForEmail },
    } as never);
  });

  it("rejects invalid email addresses", async () => {
    const response = await POST(jsonRequest({ email: "not-an-email" }));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.code).toBe("VALIDATION_ERROR");
    expect(resetPasswordForEmail).not.toHaveBeenCalled();
  });

  it("sends a reset email with the recovery callback URL", async () => {
    const response = await POST(
      jsonRequest({ email: "person@example.com" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      message: PASSWORD_RESET_REQUEST_MESSAGE,
    });
    expect(resetPasswordForEmail).toHaveBeenCalledWith("person@example.com", {
      redirectTo: "http://localhost/auth/reset-password/confirm",
    });
  });

  it("does not reveal whether the email exists", async () => {
    resetPasswordForEmail.mockResolvedValue({
      error: new Error("User not found"),
    });

    const response = await POST(
      jsonRequest({ email: "missing@example.com" }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.message).toBe(PASSWORD_RESET_REQUEST_MESSAGE);
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
