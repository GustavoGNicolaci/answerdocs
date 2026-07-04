import { afterEach, describe, expect, it } from "vitest";
import {
  buildEmailConfirmationRedirectUrl,
  getConfiguredRequestOrigin,
} from "@/lib/auth-redirect";

const trackedEnvKeys = [
  "NEXT_PUBLIC_SITE_URL",
  "SITE_URL",
  "VERCEL_PROJECT_PRODUCTION_URL",
  "VERCEL_URL",
] as const;

const originalEnv = Object.fromEntries(
  trackedEnvKeys.map((key) => [key, process.env[key]]),
) as Record<(typeof trackedEnvKeys)[number], string | undefined>;

describe("auth redirects", () => {
  afterEach(() => {
    for (const key of trackedEnvKeys) {
      const originalValue = originalEnv[key];
      if (originalValue === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = originalValue;
      }
    }
  });

  it("uses the configured site URL before the request origin", () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://answerdocs.example.com/";

    expect(
      getConfiguredRequestOrigin(
        new Request("http://localhost/api/auth/signup"),
      ),
    ).toBe("https://answerdocs.example.com");
  });

  it("can use Vercel production URLs without an explicit protocol", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.SITE_URL;
    process.env.VERCEL_PROJECT_PRODUCTION_URL = "answerdocs.example.com";

    expect(
      buildEmailConfirmationRedirectUrl(
        new Request("http://localhost/api/auth/signup"),
      ),
    ).toBe("https://answerdocs.example.com/auth/confirm?next=%2F");
  });
});
