import { describe, expect, it } from "vitest";
import { FALLBACK_ANSWER } from "@/lib/constants";
import {
  buildAnswerPrompt,
  createCitations,
  hasInvalidCitationIndexes,
  normalizeAnswer,
} from "@/lib/rag";
import type { MatchDocumentChunk } from "@/lib/types";

const matches: MatchDocumentChunk[] = [
  {
    chunk_id: "chunk-1",
    document_id: "doc-1",
    document_title: "Policy.pdf",
    chunk_index: 0,
    page_number: 3,
    content: "Refunds are available within 30 days of purchase.",
    similarity: 0.87,
  },
  {
    chunk_id: "chunk-2",
    document_id: "doc-2",
    document_title: "Handbook.pdf",
    chunk_index: 4,
    page_number: null,
    content: "Support requests are answered within two business days.",
    similarity: 0.76,
  },
];

describe("rag utilities", () => {
  it("builds a grounded answer prompt with numbered snippets", () => {
    const prompt = buildAnswerPrompt("What is the refund window?", matches);

    expect(prompt).toContain("[1]");
    expect(prompt).toContain("Policy.pdf");
    expect(prompt).toContain("Block: 1");
    expect(prompt).toContain("Question: What is the refund window?");
    expect(prompt).toContain(FALLBACK_ANSWER);
    expect(prompt).not.toContain("Similarity:");
    expect(prompt).not.toContain("0.87");
  });

  it("maps only cited chunks to public citations", () => {
    expect(createCitations(matches, "Use Policy.pdf for refunds [1].")).toEqual([
      {
        index: 1,
        chunkId: "chunk-1",
        documentId: "doc-1",
        documentTitle: "Policy.pdf",
        pageNumber: 3,
        chunkIndex: 0,
        snippet: "Refunds are available within 30 days of purchase.",
      },
    ]);
  });

  it("does not expose internal similarity values in citations", () => {
    expect(createCitations(matches, "See Handbook.pdf [2].")).toEqual([
      {
        index: 2,
        chunkId: "chunk-2",
        documentId: "doc-2",
        documentTitle: "Handbook.pdf",
        pageNumber: null,
        chunkIndex: 4,
        snippet: "Support requests are answered within two business days.",
      },
    ]);
  });

  it("detects invented citation indexes", () => {
    expect(hasInvalidCitationIndexes("Answer [3].", matches.length)).toBe(true);
    expect(hasInvalidCitationIndexes("Answer [1] [2].", matches.length)).toBe(
      false,
    );
  });

  it("falls back when the model returns empty text", () => {
    expect(normalizeAnswer("  ")).toBe(FALLBACK_ANSWER);
  });
});
