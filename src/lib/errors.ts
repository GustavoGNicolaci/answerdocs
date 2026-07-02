import { ZodError } from "zod";

export class AppError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 500,
    public readonly code = "APP_ERROR",
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function badRequest(message: string, code = "BAD_REQUEST") {
  return new AppError(message, 400, code);
}

export function unauthorized(message: string, code = "UNAUTHORIZED") {
  return new AppError(message, 401, code);
}

export function forbidden(message: string, code = "FORBIDDEN") {
  return new AppError(message, 403, code);
}

export function notFound(message: string, code = "NOT_FOUND") {
  return new AppError(message, 404, code);
}

export function configurationError(message: string) {
  return new AppError(message, 500, "CONFIGURATION_ERROR");
}

export function toResponseError(error: unknown) {
  if (error instanceof ZodError) {
    return Response.json(
      {
        error: error.issues[0]?.message ?? "Invalid request body.",
        code: "VALIDATION_ERROR",
      },
      { status: 400 },
    );
  }

  if (error instanceof AppError) {
    return Response.json(
      { error: error.message, code: error.code },
      { status: error.statusCode },
    );
  }

  const message =
    error instanceof Error ? error.message : "An unexpected error occurred.";

  return Response.json(
    { error: message, code: "INTERNAL_SERVER_ERROR" },
    { status: 500 },
  );
}

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Unknown error";
}
