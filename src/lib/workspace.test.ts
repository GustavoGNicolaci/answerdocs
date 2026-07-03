import { describe, expect, it, vi } from "vitest";
import { ensureProfile } from "@/lib/workspace";

describe("ensureProfile", () => {
  it("keeps an existing profile name instead of overwriting it with auth metadata", async () => {
    const existingProfile = {
      id: "user-id",
      full_name: "Updated Name",
      email: "old@example.com",
      created_at: "2026-07-01T00:00:00.000Z",
      updated_at: "2026-07-01T00:00:00.000Z",
      interface_language: "en",
    };
    const updatedProfile = {
      ...existingProfile,
      email: "user@example.com",
      updated_at: "2026-07-02T00:00:00.000Z",
    };
    const maybeSingle = vi.fn().mockResolvedValue({
      data: existingProfile,
      error: null,
    });
    const existingEq = vi.fn(() => ({ maybeSingle }));
    const existingSelect = vi.fn(() => ({ eq: existingEq }));
    const single = vi.fn().mockResolvedValue({
      data: updatedProfile,
      error: null,
    });
    const updateSelect = vi.fn(() => ({ single }));
    const updateEq = vi.fn(() => ({ select: updateSelect }));
    const update = vi.fn(() => ({ eq: updateEq }));
    const from = vi
      .fn()
      .mockReturnValueOnce({ select: existingSelect })
      .mockReturnValueOnce({ update });

    const result = await ensureProfile(
      { from } as never,
      { id: "user-id", email: "user@example.com" },
      "Old Metadata Name",
    );

    expect(result.full_name).toBe("Updated Name");
    expect(update).toHaveBeenCalledWith(
      expect.not.objectContaining({ full_name: expect.any(String) }),
    );
  });
});
