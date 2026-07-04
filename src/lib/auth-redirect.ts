import { configurationError } from "@/lib/errors";

export function getConfiguredRequestOrigin(request: Request) {
  const configuredOrigin = getConfiguredSiteOrigin();
  const origin = configuredOrigin ?? new URL(request.url).origin;
  const normalizedOrigin = normalizeOrigin(origin);

  if (
    process.env.NODE_ENV === "production" &&
    isLocalhostOrigin(normalizedOrigin)
  ) {
    throw configurationError(
      "Set NEXT_PUBLIC_SITE_URL or SITE_URL to your production URL before sending auth emails.",
    );
  }

  return normalizedOrigin;
}

function getConfiguredSiteOrigin() {
  return firstPresent(
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.SITE_URL,
    process.env.VERCEL_PROJECT_PRODUCTION_URL,
    process.env.VERCEL_URL,
  );
}

function normalizeOrigin(value: string) {
  const trimmed = value.trim().replace(/\/+$/, "");
  const withProtocol = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  try {
    return new URL(withProtocol).origin;
  } catch {
    throw configurationError(
      "NEXT_PUBLIC_SITE_URL or SITE_URL must be a valid URL.",
    );
  }
}

function firstPresent(...values: Array<string | undefined>) {
  return values.find((value) => value?.trim());
}

function isLocalhostOrigin(origin: string) {
  const hostname = new URL(origin).hostname;
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1"
  );
}

export function buildEmailConfirmationRedirectUrl(request: Request) {
  const url = new URL(
    "/auth/confirm",
    `${getConfiguredRequestOrigin(request)}/`,
  );
  url.searchParams.set("next", "/");

  return url.toString();
}

export function getSafeRedirectPath(value: string | null | undefined) {
  if (value?.startsWith("/") && !value.startsWith("//")) {
    return value;
  }

  return "/";
}
