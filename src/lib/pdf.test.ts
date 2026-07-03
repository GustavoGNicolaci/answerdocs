import { describe, expect, it } from "vitest";
import {
  getPdfOcrCandidatePageNumbers,
  mergePdfOcrPages,
} from "@/lib/pdf";

describe("PDF OCR helpers", () => {
  it("selects only low-text pages for OCR", () => {
    const pageNumbers = getPdfOcrCandidatePageNumbers(
      [
        {
          pageNumber: 1,
          text: "This page has enough selectable text to skip OCR entirely.",
        },
        { pageNumber: 2, text: "Scan" },
        { pageNumber: null, text: "" },
      ],
      20,
    );

    expect(pageNumbers).toEqual([2]);
  });

  it("adds OCR text to pages that had no readable native text", () => {
    const pages = mergePdfOcrPages(
      [{ pageNumber: 3, text: "   ", extractionMethod: "native" }],
      [{ pageNumber: 3, text: "Scanned invoice total: $42.00" }],
    );

    expect(pages).toEqual([
      {
        pageNumber: 3,
        text: "Scanned invoice total: $42.00",
        extractionMethod: "ocr",
      },
    ]);
  });

  it("keeps native text when OCR returns duplicate content", () => {
    const pages = mergePdfOcrPages(
      [{ pageNumber: 1, text: "Refunds are available within 30 days." }],
      [{ pageNumber: 1, text: "Refunds are available within 30 days." }],
    );

    expect(pages).toEqual([
      {
        pageNumber: 1,
        text: "Refunds are available within 30 days.",
        extractionMethod: "native",
      },
    ]);
  });

  it("combines native and OCR text when both contain unique content", () => {
    const pages = mergePdfOcrPages(
      [{ pageNumber: 4, text: "Native paragraph." }],
      [{ pageNumber: 4, text: "Text inside a scanned table." }],
    );

    expect(pages).toEqual([
      {
        pageNumber: 4,
        text: "Native paragraph.\n\nText inside a scanned table.",
        extractionMethod: "combined",
      },
    ]);
  });
});
