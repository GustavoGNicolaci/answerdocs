import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@supabase/supabase-js", () => ({
  createClient: vi.fn(() => ({ ok: true })),
}));

const originalSupabaseUrl = process.env.SUPABASE_URL;
const originalPublicSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const originalServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("getSupabaseAdmin", () => {
  afterEach(() => {
    restoreEnv();
    vi.resetModules();
    vi.clearAllMocks();
  });

  it("uses NEXT_PUBLIC_SUPABASE_URL when SUPABASE_URL is not configured", async () => {
    delete process.env.SUPABASE_URL;
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://project.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-key";

    const { createClient } = await import("@supabase/supabase-js");
    const { getSupabaseAdmin } = await import("@/lib/supabase");

    expect(getSupabaseAdmin()).toEqual({ ok: true });
    expect(createClient).toHaveBeenCalledWith(
      "https://project.supabase.co",
      "service-role-key",
      expect.objectContaining({
        auth: expect.objectContaining({
          autoRefreshToken: false,
          persistSession: false,
        }),
      }),
    );
  });
});

function restoreEnv() {
  restoreEnvValue("SUPABASE_URL", originalSupabaseUrl);
  restoreEnvValue("NEXT_PUBLIC_SUPABASE_URL", originalPublicSupabaseUrl);
  restoreEnvValue("SUPABASE_SERVICE_ROLE_KEY", originalServiceRoleKey);
}

function restoreEnvValue(key: string, value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
  } else {
    process.env[key] = value;
  }
}
