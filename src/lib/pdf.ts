import { PDF_OCR_PAGE_TEXT_MIN_CHARACTERS } from "@/lib/constants";
import { configurationError } from "@/lib/errors";
import { extractPdfOcrPages } from "@/lib/pdf-ocr";
import { normalizeText, toPlainText } from "@/lib/text";
import type { SourceExtractionMethod, SourcePage } from "@/lib/types";

export type PdfExtractionResult = {
  pages: SourcePage[];
  metadata: Record<string, unknown>;
};

export async function extractPdfDocument(
  buffer: Buffer,
  displayName = "document.pdf",
): Promise<PdfExtractionResult> {
  const nativePages = await extractPdfPages(buffer);
  const candidatePageNumbers = getPdfOcrCandidatePageNumbers(nativePages);

  if (candidatePageNumbers.length === 0) {
    return {
      pages: nativePages,
      metadata: {
        ocr: {
          applied: false,
          pageTextMinCharacters: PDF_OCR_PAGE_TEXT_MIN_CHARACTERS,
          requestedPages: [],
          extractedPages: [],
          failedPages: [],
        },
      },
    };
  }

  try {
    const ocrResult = await extractPdfOcrPages(
      buffer,
      candidatePageNumbers,
      displayName,
    );
    const pages = mergePdfOcrPages(nativePages, ocrResult.pages);
    const extractedPages = ocrResult.pages
      .filter((page) => normalizeText(page.text).length > 0)
      .map((page) => page.pageNumber);
    const returnedPages = new Set(ocrResult.pages.map((page) => page.pageNumber));

    return {
      pages,
      metadata: {
        ocr: {
          applied: true,
          pageTextMinCharacters: PDF_OCR_PAGE_TEXT_MIN_CHARACTERS,
          requestedPages: candidatePageNumbers,
          extractedPages,
          failedPages: candidatePageNumbers.filter(
            (pageNumber) => !returnedPages.has(pageNumber),
          ),
          warnings: ocrResult.warnings,
        },
      },
    };
  } catch (error) {
    return {
      pages: nativePages,
      metadata: {
        ocr: {
          applied: false,
          pageTextMinCharacters: PDF_OCR_PAGE_TEXT_MIN_CHARACTERS,
          requestedPages: candidatePageNumbers,
          extractedPages: [],
          failedPages: candidatePageNumbers,
          error: getOcrErrorMessage(error),
        },
      },
    };
  }
}

export async function extractPdfPages(buffer: Buffer): Promise<SourcePage[]> {
  await ensurePdfCanvasPolyfills();

  const { PDFParse } = await import("pdf-parse");
  const { getData: getPdfWorkerData } = await import("pdf-parse/worker");
  PDFParse.setWorker(getPdfWorkerData());

  const parser = new PDFParse({ data: buffer });

  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    const totalPages = info.total ?? 0;

    if (totalPages <= 0) {
      const result = await parser.getText();
      return [
        {
          pageNumber: null,
          text: result.text,
          extractionMethod: "native",
        },
      ];
    }

    const pages: SourcePage[] = [];

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const result = await parser.getText({ partial: [pageNumber] });
      pages.push({
        pageNumber,
        text: result.text,
        extractionMethod: "native",
      });
    }

    return pages;
  } finally {
    await parser.destroy();
  }
}

export function getPdfOcrCandidatePageNumbers(
  pages: SourcePage[],
  minCharacters = PDF_OCR_PAGE_TEXT_MIN_CHARACTERS,
) {
  return pages
    .filter((page) => page.pageNumber !== null)
    .filter((page) => countReadableCharacters(page.text) < minCharacters)
    .map((page) => page.pageNumber as number);
}

export function mergePdfOcrPages(
  nativePages: SourcePage[],
  ocrPages: Array<{ pageNumber: number; text: string }>,
) {
  const ocrByPage = new Map(
    ocrPages.map((page) => [page.pageNumber, normalizeText(page.text)]),
  );
  const nativePageNumbers = new Set(
    nativePages
      .map((page) => page.pageNumber)
      .filter((pageNumber): pageNumber is number => pageNumber !== null),
  );
  const pages = nativePages.map((page) => {
    const ocrText =
      page.pageNumber === null ? "" : ocrByPage.get(page.pageNumber) ?? "";
    const nativeText = normalizeText(page.text);
    const mergedText = mergeNativeAndOcrText(nativeText, ocrText);

    return {
      ...page,
      text: mergedText,
      extractionMethod: getExtractionMethod(nativeText, ocrText, mergedText),
    };
  });
  const extraOcrPages = ocrPages
    .filter((page) => !nativePageNumbers.has(page.pageNumber))
    .map((page) => ({
      pageNumber: page.pageNumber,
      text: normalizeText(page.text),
      extractionMethod: "ocr" as const,
    }))
    .filter((page) => page.text.length > 0);

  return [...pages, ...extraOcrPages].sort(
    (left, right) => (left.pageNumber ?? 0) - (right.pageNumber ?? 0),
  );
}

function mergeNativeAndOcrText(nativeText: string, ocrText: string) {
  if (!nativeText) return ocrText;
  if (!ocrText) return nativeText;

  const nativePlain = toPlainText(nativeText).toLowerCase();
  const ocrPlain = toPlainText(ocrText).toLowerCase();

  if (nativePlain.includes(ocrPlain)) return nativeText;
  if (ocrPlain.includes(nativePlain)) return ocrText;

  return `${nativeText}\n\n${ocrText}`;
}

function getExtractionMethod(
  nativeText: string,
  ocrText: string,
  mergedText: string,
): SourceExtractionMethod {
  if (!nativeText && ocrText) return "ocr";
  if (nativeText && ocrText && mergedText !== nativeText) return "combined";
  return "native";
}

function countReadableCharacters(value: string) {
  return toPlainText(value).replace(/\s/g, "").length;
}

async function ensurePdfCanvasPolyfills() {
  const globals = globalThis as typeof globalThis & {
    DOMMatrix?: typeof DOMMatrix;
    Path2D?: typeof Path2D;
    ImageData?: typeof ImageData;
  };

  if (globals.DOMMatrix && globals.Path2D && globals.ImageData) {
    return;
  }

  try {
    const canvas = await import("@napi-rs/canvas");

    globals.DOMMatrix ??= canvas.DOMMatrix as unknown as typeof DOMMatrix;
    globals.Path2D ??= canvas.Path2D as unknown as typeof Path2D;
    globals.ImageData ??= canvas.ImageData as unknown as typeof ImageData;
  } catch (error) {
    throw configurationError(
      `Could not load PDF canvas support: ${getOcrErrorMessage(error)}`,
    );
  }
}

function getOcrErrorMessage(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : "OCR failed.";
}
