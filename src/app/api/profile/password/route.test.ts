import { beforeEach, describe, expect, it, vi } from "vitest";
import { updatePasswordWithCurrentPassword } from "@/lib/account";
import { requireAuthenticatedUser } from "@/lib/auth";
import { badRequest } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import { ensureProfile } from "@/lib/workspace";
import { POST } from "./route";

vi.mock("@/lib/account", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/account")>();

  return {
    ...actual,
    updatePasswordWithCurrentPassword: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/workspace", () => ({
  ensureProfile: vi.fn(),
}));

const userId = "66666666-6666-4666-8666-666666666666";

describe("profile password route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireAuthenticatedUser).mockResolvedValue({
      id: userId,
      email: "user@example.com",
    });
    vi.mocked(updatePasswordWithCurrentPassword).mockResolvedValue(undefined);
    vi.mocked(getSupabaseAdmin).mockReturnValue({} as never);
    vi.mocked(ensureProfile).mockResolvedValue({
      id: userId,
      full_name: "Gustavo",
      email: "profile@example.com",
      created_at: "2026-07-02T00:00:00.000Z",
      updated_at: "2026-07-02T00:00:00.000Z",
      interface_language: "en",
    });
  });

  it("requires matching password confirmation", async () => {
    const response = await POST(
      jsonRequest({
        currentPassword: "secret123",
        newPassword: "newpass123",
        confirmPassword: "different123",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Passwords do not match.");
    expect(updatePasswordWithCurrentPassword).not.toHaveBeenCalled();
  });

  it("verifies the current password before updating the password", async () => {
    const response = await POST(
      jsonRequest({
        currentPassword: "secret123",
        newPassword: "newpass123",
        confirmPassword: "newpass123",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true, message: "Password updated." });
    expect(updatePasswordWithCurrentPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      currentPassword: "secret123",
      newPassword: "newpass123",
    });
  });

  it("does not update the password when the current password is wrong", async () => {
    vi.mocked(updatePasswordWithCurrentPassword).mockRejectedValue(
      badRequest("Current password is incorrect."),
    );

    const response = await POST(
      jsonRequest({
        currentPassword: "wrong",
        newPassword: "newpass123",
        confirmPassword: "newpass123",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Current password is incorrect.");
  });

  it("uses the saved profile email when the auth claim has no email", async () => {
    vi.mocked(requireAuthenticatedUser).mockResolvedValue({
      id: userId,
      email: null,
    });

    const response = await POST(
      jsonRequest({
        currentPassword: "secret123",
        newPassword: "newpass123",
        confirmPassword: "newpass123",
      }),
    );

    expect(response.status).toBe(200);
    expect(updatePasswordWithCurrentPassword).toHaveBeenCalledWith({
      email: "profile@example.com",
      currentPassword: "secret123",
      newPassword: "newpass123",
    });
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/profile/password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
