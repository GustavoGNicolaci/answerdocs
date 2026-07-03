import { describe, expect, it } from "vitest";
import {
  extractPdfPages,
  getPdfOcrCandidatePageNumbers,
  mergePdfOcrPages,
} from "@/lib/pdf";

describe("PDF OCR helpers", () => {
  it("extracts text with the bundled PDF worker", async () => {
    const pages = await extractPdfPages(createTextPdf("Hello PDF"));

    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({
      pageNumber: 1,
      extractionMethod: "native",
    });
    expect(pages[0]?.text).toContain("Hello PDF");
  });

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

function createTextPdf(text: string) {
  const escapedText = text.replace(/[\\()]/g, "\\$&");
  const content = `BT /F1 24 Tf 72 720 Td (${escapedText}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    [
      "<< /Type /Page /Parent 2 0 R",
      "/MediaBox [0 0 612 792]",
      "/Resources << /Font << /F1 5 0 R >> >>",
      "/Contents 4 0 R >>",
    ].join(" "),
    `<< /Length ${Buffer.byteLength(content, "ascii")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, "ascii"));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, "ascii");
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.forEach((offset) => {
    pdf += `${offset.toString().padStart(10, "0")} 00000 n \n`;
  });
  pdf += [
    "trailer",
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    "startxref",
    String(xrefOffset),
    "%%EOF",
    "",
  ].join("\n");

  return Buffer.from(pdf, "ascii");
}
