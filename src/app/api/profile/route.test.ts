import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyCurrentPassword } from "@/lib/account";
import { requireAuthenticatedUser } from "@/lib/auth";
import { badRequest, unauthorized } from "@/lib/errors";
import { getSupabaseAdmin } from "@/lib/supabase";
import { createSupabaseServerClient } from "@/lib/supabase-auth";
import { ensureProfile } from "@/lib/workspace";
import { DELETE, GET, PATCH } from "./route";

vi.mock("@/lib/account", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/account")>();

  return {
    ...actual,
    verifyCurrentPassword: vi.fn(),
  };
});

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/supabase-auth", () => ({
  createSupabaseServerClient: vi.fn(),
}));

vi.mock("@/lib/workspace", () => ({
  ensureProfile: vi.fn(),
}));

const userId = "66666666-6666-4666-8666-666666666666";
const profile = {
  id: userId,
  full_name: "Gustavo",
  email: "user@example.com",
  created_at: "2026-07-02T00:00:00.000Z",
  updated_at: "2026-07-02T00:00:00.000Z",
  interface_language: "en" as const,
};

describe("profile route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireAuthenticatedUser).mockResolvedValue({
      id: userId,
      email: "user@example.com",
    });
    vi.mocked(ensureProfile).mockResolvedValue(profile);
    vi.mocked(verifyCurrentPassword).mockResolvedValue(undefined);
    vi.mocked(createSupabaseServerClient).mockResolvedValue({
      auth: {
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
    } as never);
  });

  it("blocks guests from reading profile data", async () => {
    vi.mocked(requireAuthenticatedUser).mockRejectedValue(
      unauthorized("Sign in."),
    );

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(401);
    expect(payload.error).toBe("Sign in.");
  });

  it("returns the authenticated user's profile", async () => {
    vi.mocked(getSupabaseAdmin).mockReturnValue({} as never);

    const response = await GET();
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      user: { id: userId, email: "user@example.com" },
      profile,
    });
    expect(ensureProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: userId }),
    );
  });

  it("updates only the authenticated user's profile fields", async () => {
    const single = vi.fn().mockResolvedValue({
      data: { ...profile, full_name: "Gus", interface_language: "pt" },
      error: null,
    });
    const select = vi.fn(() => ({ single }));
    const eq = vi.fn(() => ({ select }));
    const update = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ update }));
    vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);

    const response = await PATCH(
      jsonRequest({
        fullName: "  Gus  ",
        interfaceLanguage: "pt",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.profile.full_name).toBe("Gus");
    expect(payload.profile.interface_language).toBe("pt");
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        full_name: "Gus",
        interface_language: "pt",
      }),
    );
    expect(eq).toHaveBeenCalledWith("id", userId);
  });

  it("requires typed confirmation before deleting the account", async () => {
    const response = await DELETE(
      jsonRequest({
        currentPassword: "secret123",
        confirmation: "delete",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("DELETE");
    expect(verifyCurrentPassword).not.toHaveBeenCalled();
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
  });

  it("verifies the current password and deletes only the authenticated user", async () => {
    const deleteUser = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      auth: {
        admin: { deleteUser },
      },
    } as never);

    const response = await DELETE(
      jsonRequest({
        currentPassword: "secret123",
        confirmation: "DELETE",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(verifyCurrentPassword).toHaveBeenCalledWith({
      email: "user@example.com",
      password: "secret123",
    });
    expect(deleteUser).toHaveBeenCalledWith(userId, false);
  });

  it("does not delete the user when the current password is wrong", async () => {
    vi.mocked(verifyCurrentPassword).mockRejectedValue(
      badRequest("Current password is incorrect."),
    );

    const response = await DELETE(
      jsonRequest({
        currentPassword: "wrong",
        confirmation: "DELETE",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Current password is incorrect.");
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/profile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
