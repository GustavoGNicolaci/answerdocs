import { describe, expect, it } from "vitest";
import { chunkPages, chunkText, normalizeText } from "@/lib/text";

describe("text utilities", () => {
  it("normalizes whitespace without removing paragraph boundaries", () => {
    expect(normalizeText("One\t two\r\n\r\n\r\nthree")).toBe(
      "One two\n\nthree",
    );
  });

  it("chunks long text with overlap", () => {
    const text = Array.from({ length: 120 }, (_, index) => `word${index}`).join(
      " ",
    );
    const chunks = chunkText(text, 120, 30);

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]).toContain("word0");
    expect(chunks[1].length).toBeGreaterThan(30);
  });

  it("preserves page numbers while creating chunks", () => {
    const chunks = chunkPages(
      [
        { pageNumber: 1, text: "First page content." },
        { pageNumber: 2, text: "Second page content." },
      ],
      80,
      10,
    );

    expect(chunks).toEqual([
      { chunkIndex: 0, pageNumber: 1, content: "First page content." },
      { chunkIndex: 1, pageNumber: 2, content: "Second page content." },
    ]);
  });
});
