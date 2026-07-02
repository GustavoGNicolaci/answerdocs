import { z } from "zod";
import {
  MAX_FILE_BYTES,
  MAX_TEXT_CHARACTERS,
} from "@/lib/constants";
import { badRequest } from "@/lib/errors";
import { extractPdfPages } from "@/lib/pdf";
import { parseSessionId, sessionIdSchema } from "@/lib/session";
import { normalizeText } from "@/lib/text";
import type { DocumentInput } from "@/lib/types";

const jsonDocumentSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  chatId: z.uuid().optional(),
  folderId: z.uuid().optional(),
  title: z.string().trim().max(120).optional(),
  text: z.string().trim().min(1).max(MAX_TEXT_CHARACTERS),
});

type InputScope = {
  sessionId: string | null;
  chatId: string | null;
  folderId: string | null;
};

export async function parseDocumentInput(request: Request): Promise<DocumentInput> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = jsonDocumentSchema.parse(await request.json());
    return createTextInput(body.text, toInputScope(body), body.title);
  }

  const formData = await request.formData();
  const sessionId = parseOptionalSessionId(stringValue(formData.get("sessionId")));
  const chatId = parseOptionalUuid(stringValue(formData.get("chatId")), "chatId");
  const folderId = parseOptionalUuid(
    stringValue(formData.get("folderId")),
    "folderId",
  );
  const title = stringValue(formData.get("title"));
  const pastedText = stringValue(formData.get("text"));
  const file = formData.get("file");
  const scope = { sessionId, chatId, folderId };

  if (file instanceof File && file.size > 0) {
    return parseFileInput(file, scope, title);
  }

  if (pastedText) {
    return createTextInput(pastedText, scope, title);
  }

  throw badRequest("Upload a PDF, upload a text file, or paste text to index.");
}

async function parseFileInput(
  file: File,
  scope: InputScope,
  title?: string,
): Promise<DocumentInput> {
  if (file.size > MAX_FILE_BYTES) {
    throw badRequest("Files must be 10 MB or smaller.");
  }

  const filename = sanitizeTitle(file.name);
  const documentTitle = sanitizeTitle(title || filename);
  const lowerName = file.name.toLowerCase();

  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const pages = await extractPdfPages(buffer);

    return {
      ...scope,
      title: documentTitle,
      sourceType: "pdf",
      pages,
      metadata: {
        originalName: filename,
        size: file.size,
        mimeType: file.type || "application/pdf",
      },
    };
  }

  if (file.type === "text/plain" || lowerName.endsWith(".txt")) {
    const text = await file.text();
    return createTextInput(
      text,
      scope,
      documentTitle,
      {
        originalName: filename,
        size: file.size,
        mimeType: file.type || "text/plain",
      },
    );
  }

  throw badRequest("Only PDF and .txt files are supported.");
}

function createTextInput(
  value: string,
  scope: InputScope,
  title = "Pasted text",
  metadata: Record<string, unknown> = {},
): DocumentInput {
  const text = normalizeText(value);

  if (!text) {
    throw badRequest("The document does not contain readable text.");
  }

  if (text.length > MAX_TEXT_CHARACTERS) {
    throw badRequest("Text input is too large.");
  }

  return {
    ...scope,
    title: sanitizeTitle(title),
    sourceType: "text",
    pages: [{ pageNumber: null, text }],
    metadata,
  };
}

function stringValue(value: FormDataEntryValue | null) {
  return typeof value === "string" ? value.trim() : undefined;
}

function parseOptionalSessionId(value: string | undefined) {
  return value ? parseSessionId(value) : null;
}

function parseOptionalUuid(value: string | undefined, fieldName: string) {
  if (!value) return null;

  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) {
    throw badRequest(`A valid ${fieldName} is required.`);
  }

  return parsed.data;
}

function toInputScope(input: {
  sessionId?: string;
  chatId?: string;
  folderId?: string;
}) {
  return {
    sessionId: input.sessionId ?? null,
    chatId: input.chatId ?? null,
    folderId: input.folderId ?? null,
  };
}

function sanitizeTitle(value: string) {
  const title = value.replace(/\s+/g, " ").trim();
  return title.slice(0, 120) || "Untitled document";
}
