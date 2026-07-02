import { z } from "zod";
import { badRequest } from "@/lib/errors";

export const sessionIdSchema = z.uuid("A valid sessionId is required.");

export function parseSessionId(value: unknown) {
  const parsed = sessionIdSchema.safeParse(value);

  if (!parsed.success) {
    throw badRequest("A valid sessionId is required.");
  }

  return parsed.data;
}

export function getSessionIdFromRequest(request: Request) {
  const url = new URL(request.url);
  return parseSessionId(url.searchParams.get("sessionId"));
}
