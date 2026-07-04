import { z } from "zod";
import {
  hasSupportedImageExtension,
  isSupportedImageMimeType,
  resolveImageMimeType,
} from "@/lib/document-file-types";
import { MAX_TEXT_CHARACTERS } from "@/lib/constants";
import { badRequest } from "@/lib/errors";
import { extractImageDocument } from "@/lib/image";
import { extractPdfDocument } from "@/lib/pdf";
import { parseSessionId, sessionIdSchema } from "@/lib/session";
import { normalizeText } from "@/lib/text";
import type { DocumentInput } from "@/lib/types";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_MB,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_FILE_MB,
} from "@/lib/upload-limits";

const jsonDocumentSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  chatId: z.uuid().optional(),
  folderId: z.uuid().optional(),
  title: z.string().trim().max(120).optional(),
  text: z.string().trim().min(1).max(MAX_TEXT_CHARACTERS),
});

export type DocumentInputScope = {
  sessionId: string | null;
  chatId: string | null;
  folderId: string | null;
};

type ParseDocumentInputOptions = {
  validateScope?: (scope: DocumentInputScope) => Promise<void> | void;
};

export async function parseDocumentInput(
  request: Request,
  options: ParseDocumentInputOptions = {},
): Promise<DocumentInput> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    const body = jsonDocumentSchema.parse(await request.json());
    const scope = toInputScope(body);
    await options.validateScope?.(scope);
    return createTextInput(body.text, scope, body.title);
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
  await options.validateScope?.(scope);

  if (file instanceof File && file.size > 0) {
    return parseFileInput(file, scope, title);
  }

  if (pastedText) {
    return createTextInput(pastedText, scope, title);
  }

  throw badRequest(
    "Upload a PDF, image, or text file, or paste text to index.",
  );
}

async function parseFileInput(
  file: File,
  scope: DocumentInputScope,
  title?: string,
): Promise<DocumentInput> {
  const filename = sanitizeTitle(file.name);
  const documentTitle = sanitizeTitle(title || filename);
  const lowerName = file.name.toLowerCase();
  const imageMimeType = resolveImageMimeType({
    mimeType: file.type,
    filename: file.name,
  });

  if (imageMimeType) {
    if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
      throw badRequest(`Images must be ${MAX_IMAGE_UPLOAD_MB} MB or smaller.`);
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const extraction = await extractImageDocument({
      buffer,
      mimeType: imageMimeType,
      displayName: filename,
    });

    return {
      ...scope,
      title: documentTitle,
      sourceType: "image",
      pages: extraction.pages,
      metadata: {
        ...extraction.metadata,
        originalName: filename,
        size: file.size,
        mimeType: file.type || imageMimeType,
      },
    };
  }

  if (file.size > MAX_UPLOAD_FILE_BYTES) {
    throw badRequest(`Files must be ${MAX_UPLOAD_FILE_MB} MB or smaller.`);
  }

  if (file.type === "application/pdf" || lowerName.endsWith(".pdf")) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const extraction = await extractPdfDocument(buffer, filename);

    return {
      ...scope,
      title: documentTitle,
      sourceType: "pdf",
      pages: extraction.pages,
      metadata: {
        ...extraction.metadata,
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

  if (
    file.type.startsWith("image/") ||
    isSupportedImageMimeType(file.type) ||
    hasSupportedImageExtension(file.name)
  ) {
    throw badRequest("Only PNG, JPG, JPEG, and WEBP images are supported.");
  }

  throw badRequest("Only PDF, image, and .txt files are supported.");
}

function createTextInput(
  value: string,
  scope: DocumentInputScope,
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
