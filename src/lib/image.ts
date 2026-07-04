import { Type, createPartFromBase64 } from "@google/genai";
import { z } from "zod";
import { GEMINI_OCR_MODEL } from "@/lib/constants";
import {
  IMAGE_NO_TEXT_ERROR,
  type SupportedImageMimeType,
} from "@/lib/document-file-types";
import { badRequest } from "@/lib/errors";
import { getGeminiClient } from "@/lib/gemini";
import { normalizeText } from "@/lib/text";
import type { SourcePage } from "@/lib/types";

const MIN_IMAGE_OCR_USEFUL_CHARACTERS = 20;
const MIN_IMAGE_OCR_TOKENS = 3;

const imageOcrResponseSchema = z.object({
  text: z.string().catch(""),
  warnings: z.array(z.string()).optional().default([]),
});

export type ImageExtractionResult = {
  pages: SourcePage[];
  metadata: Record<string, unknown>;
};

export async function extractImageDocument(input: {
  buffer: Buffer;
  mimeType: SupportedImageMimeType;
  displayName: string;
}): Promise<ImageExtractionResult> {
  const ocr = await extractImageOcrText(input);
  const text = normalizeText(ocr.text);

  if (!hasUsefulImageText(text)) {
    throw badRequest(IMAGE_NO_TEXT_ERROR);
  }

  return {
    pages: [
      {
        pageNumber: null,
        text,
        extractionMethod: "ocr",
      },
    ],
    metadata: {
      image: {
        mimeType: input.mimeType,
      },
      ocr: {
        applied: true,
        method: "gemini-image",
        minimumReadableCharacters: MIN_IMAGE_OCR_USEFUL_CHARACTERS,
        minimumReadableTokens: MIN_IMAGE_OCR_TOKENS,
        warnings: ocr.warnings,
      },
    },
  };
}

export function hasUsefulImageText(text: string) {
  const normalized = normalizeText(text);
  const usefulCharacters =
    normalized.match(/[\p{L}\p{N}]/gu)?.join("").length ?? 0;
  const readableTokens =
    normalized
      .match(/[\p{L}\p{N}]+/gu)
      ?.filter((token) => token.length >= 2 || /\p{N}/u.test(token)).length ??
    0;

  return (
    usefulCharacters >= MIN_IMAGE_OCR_USEFUL_CHARACTERS &&
    readableTokens >= MIN_IMAGE_OCR_TOKENS
  );
}

async function extractImageOcrText(input: {
  buffer: Buffer;
  mimeType: SupportedImageMimeType;
  displayName: string;
}) {
  const response = await getGeminiClient().models.generateContent({
    model: GEMINI_OCR_MODEL,
    contents: [
      buildImageOcrPrompt(input.displayName),
      createPartFromBase64(input.buffer.toString("base64"), input.mimeType),
    ],
    config: {
      maxOutputTokens: 8_000,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
          warnings: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
        },
        required: ["text"],
      },
      temperature: 0,
    },
  });

  return parseImageOcrResponse(response.text ?? "");
}

function buildImageOcrPrompt(displayName: string) {
  return [
    "Extract visible readable text from this image for a RAG indexing system.",
    `Image name: ${displayName}`,
    "Return JSON only, matching the provided schema.",
    "Return the visible text in natural reading order.",
    "Include text in screenshots, scanned pages, receipts, tables, forms, labels, and handwritten notes only when legible.",
    "Do not summarize, translate, infer, answer questions, or add commentary.",
    "If the image has no readable text, return an empty string for text.",
  ].join("\n");
}

function parseImageOcrResponse(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return { text: "", warnings: [] };

  try {
    const parsed = imageOcrResponseSchema.parse(
      JSON.parse(extractJson(trimmed)),
    );
    return {
      text: parsed.text,
      warnings: parsed.warnings,
    };
  } catch {
    return {
      text: "",
      warnings: ["Gemini returned an invalid OCR response."],
    };
  }
}

function extractJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return value.slice(firstBrace, lastBrace + 1);
  }

  return value;
}
