import {
  createPartFromUri,
  FileState,
  Type,
  type File as GeminiFile,
} from "@google/genai";
import { z } from "zod";
import { GEMINI_OCR_MODEL } from "@/lib/constants";
import { getGeminiClient } from "@/lib/gemini";

const OCR_FILE_POLL_INTERVAL_MS = 1_000;
const OCR_FILE_MAX_WAIT_MS = 45_000;

const ocrResponseSchema = z.object({
  pages: z.array(
    z.object({
      pageNumber: z.coerce.number().int().positive(),
      text: z.string().catch(""),
    }),
  ),
  warnings: z.array(z.string()).optional().default([]),
});

type PdfOcrPage = {
  pageNumber: number;
  text: string;
};

export type PdfOcrResult = {
  pages: PdfOcrPage[];
  warnings: string[];
};

export async function extractPdfOcrPages(
  buffer: Buffer,
  pageNumbers: number[],
  displayName: string,
): Promise<PdfOcrResult> {
  if (pageNumbers.length === 0) {
    return { pages: [], warnings: [] };
  }

  const ai = getGeminiClient();
  let uploadedFile: GeminiFile | null = null;

  try {
    uploadedFile = await ai.files.upload({
      file: new Blob([new Uint8Array(buffer)], { type: "application/pdf" }),
      config: {
        displayName,
        mimeType: "application/pdf",
      },
    });

    const activeFile = await waitForActiveFile(uploadedFile);
    if (!activeFile.uri) {
      throw new Error("Gemini did not return a file URI for OCR.");
    }

    const response = await ai.models.generateContent({
      model: GEMINI_OCR_MODEL,
      contents: [
        buildOcrPrompt(pageNumbers),
        createPartFromUri(
          activeFile.uri,
          activeFile.mimeType ?? "application/pdf",
        ),
      ],
      config: {
        maxOutputTokens: 12_000,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            pages: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  pageNumber: { type: Type.INTEGER },
                  text: { type: Type.STRING },
                },
                required: ["pageNumber", "text"],
              },
            },
            warnings: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ["pages"],
        },
        temperature: 0,
      },
    });

    return parseOcrResponse(response.text ?? "");
  } finally {
    if (uploadedFile?.name) {
      await deleteUploadedFile(uploadedFile.name);
    }
  }
}

async function waitForActiveFile(file: GeminiFile) {
  if (!file.name) {
    throw new Error("Gemini did not return a file name for OCR.");
  }

  const ai = getGeminiClient();
  let currentFile = file;
  const startedAt = Date.now();

  while (currentFile.state === FileState.PROCESSING) {
    if (Date.now() - startedAt > OCR_FILE_MAX_WAIT_MS) {
      throw new Error("Gemini OCR file processing timed out.");
    }

    await delay(OCR_FILE_POLL_INTERVAL_MS);
    currentFile = await ai.files.get({ name: file.name });
  }

  if (currentFile.state === FileState.FAILED) {
    throw new Error(
      currentFile.error?.message || "Gemini could not process this PDF.",
    );
  }

  return currentFile;
}

function buildOcrPrompt(pageNumbers: number[]) {
  const pageList = pageNumbers.join(", ");

  return [
    "Extract visible text from the specified PDF pages for a RAG indexing system.",
    `Only inspect these page numbers: ${pageList}.`,
    "Return JSON only, matching the provided schema.",
    "For each requested page, return the exact pageNumber and the visible text in natural reading order.",
    "Include scanned text, text inside images, tables, forms, headers, and footers when legible.",
    "Do not summarize, translate, infer, or add commentary.",
    "If a requested page has no readable visual text, return an empty string for that page.",
  ].join("\n");
}

function parseOcrResponse(value: string): PdfOcrResult {
  const parsed = ocrResponseSchema.parse(JSON.parse(extractJson(value)));

  return {
    pages: parsed.pages.map((page) => ({
      pageNumber: page.pageNumber,
      text: page.text,
    })),
    warnings: parsed.warnings,
  };
}

function extractJson(value: string) {
  const trimmed = value.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  return trimmed;
}

async function deleteUploadedFile(name: string) {
  try {
    await getGeminiClient().files.delete({ name });
  } catch {
    // OCR upload cleanup should not hide the original extraction result.
  }
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
