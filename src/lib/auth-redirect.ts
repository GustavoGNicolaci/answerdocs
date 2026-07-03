export function getConfiguredRequestOrigin(request: Request) {
  const configuredOrigin =
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL;

  return configuredOrigin?.trim()
    ? configuredOrigin.trim().replace(/\/+$/, "")
    : new URL(request.url).origin;
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
