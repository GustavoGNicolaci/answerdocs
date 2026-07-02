import { describe, expect, it } from "vitest";
import { FALLBACK_ANSWER } from "@/lib/constants";
import {
  buildAnswerPrompt,
  createCitations,
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
];

describe("rag utilities", () => {
  it("builds a grounded answer prompt with numbered snippets", () => {
    const prompt = buildAnswerPrompt("What is the refund window?", matches);

    expect(prompt).toContain("[1]");
    expect(prompt).toContain("Policy.pdf");
    expect(prompt).toContain("Question: What is the refund window?");
    expect(prompt).toContain(FALLBACK_ANSWER);
  });

  it("maps retrieved chunks to public citations", () => {
    expect(createCitations(matches)).toEqual([
      {
        index: 1,
        chunkId: "chunk-1",
        documentId: "doc-1",
        documentTitle: "Policy.pdf",
        pageNumber: 3,
        similarity: 0.87,
        snippet: "Refunds are available within 30 days of purchase.",
      },
    ]);
  });

  it("falls back when the model returns empty text", () => {
    expect(normalizeAnswer("  ")).toBe(FALLBACK_ANSWER);
  });
});
