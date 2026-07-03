import { cookies } from "next/headers";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  PASSWORD_RESET_COOKIE,
  PASSWORD_RESET_SUCCESS_MESSAGE,
} from "@/lib/password-reset";
import { createSupabaseServerClient } from "@/lib/supabase-auth";
import { POST } from "./route";

vi.mock("next/headers", () => ({
  cookies: vi.fn(),
}));

vi.mock("@/lib/supabase-auth", () => ({
  createSupabaseServerClient: vi.fn(),
}));

const user = {
  id: "66666666-6666-4666-8666-666666666666",
  email: "user@example.com",
};

describe("reset password route", () => {
  const getCookie = vi.fn();
  const deleteCookie = vi.fn();
  const getUser = vi.fn();
  const updateUser = vi.fn();
  const signOut = vi.fn();

  beforeEach(() => {
    vi.resetAllMocks();
    getCookie.mockReturnValue({ value: "1" });
    getUser.mockResolvedValue({ data: { user }, error: null });
    updateUser.mockResolvedValue({ error: null });
    signOut.mockResolvedValue({ error: null });
    vi.mocked(cookies).mockResolvedValue({
      get: getCookie,
      delete: deleteCookie,
    } as never);
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: { getUser, updateUser, signOut },
    } as never);
  });

  it("requires matching password confirmation", async () => {
    const response = await POST(
      jsonRequest({
        newPassword: "newpass123",
        confirmPassword: "different123",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Passwords do not match.");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("requires a recovery session marker", async () => {
    getCookie.mockReturnValue(undefined);

    const response = await POST(
      jsonRequest({
        newPassword: "newpass123",
        confirmPassword: "newpass123",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Open the password reset link again.");
    expect(getCookie).toHaveBeenCalledWith(PASSWORD_RESET_COOKIE);
    expect(createSupabaseServerClient).not.toHaveBeenCalled();
  });

  it("requires the recovery link to create an authenticated session", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: null });

    const response = await POST(
      jsonRequest({
        newPassword: "newpass123",
        confirmPassword: "newpass123",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Open the password reset link again.");
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("updates the password and signs out the recovery session", async () => {
    const response = await POST(
      jsonRequest({
        newPassword: "newpass123",
        confirmPassword: "newpass123",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      ok: true,
      message: PASSWORD_RESET_SUCCESS_MESSAGE,
    });
    expect(updateUser).toHaveBeenCalledWith({ password: "newpass123" });
    expect(signOut).toHaveBeenCalled();
    expect(deleteCookie).toHaveBeenCalledWith(PASSWORD_RESET_COOKIE);
  });

  it("returns a friendly error when Supabase rejects the update", async () => {
    updateUser.mockResolvedValue({ error: new Error("weak password") });

    const response = await POST(
      jsonRequest({
        newPassword: "newpass123",
        confirmPassword: "newpass123",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Could not reset password.");
    expect(signOut).not.toHaveBeenCalled();
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
