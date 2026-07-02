import type { SourcePage } from "@/lib/types";

export async function extractPdfPages(buffer: Buffer): Promise<SourcePage[]> {
  const { PDFParse } = await import("pdf-parse");
  const parser = new PDFParse({ data: buffer });

  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    const totalPages = info.total ?? 0;

    if (totalPages <= 0) {
      const result = await parser.getText();
      return [{ pageNumber: null, text: result.text }];
    }

    const pages: SourcePage[] = [];

    for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
      const result = await parser.getText({ partial: [pageNumber] });
      pages.push({ pageNumber, text: result.text });
    }

    return pages;
  } finally {
    await parser.destroy();
  }
}
