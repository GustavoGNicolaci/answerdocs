import { describe, expect, it } from "vitest";
import {
  FALLBACK_ANSWER,
  LOCALIZED_CHAT_MESSAGES,
  SELECTED_DOCUMENTS_FALLBACK_ANSWER,
} from "@/lib/constants";
import {
  buildAnswerPrompt,
  buildHistoryAnswerPrompt,
  buildRetrievalQuery,
  createCitations,
  getValidSourceIndexes,
  hasInvalidCitationIndexes,
  hasInvalidSourceIndexes,
  normalizeAnswer,
  removeDocumentTitleMentions,
  removeInlineCitationMarkers,
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

const manyMatches: MatchDocumentChunk[] = [
  ...matches,
  {
    chunk_id: "chunk-3",
    document_id: "doc-3",
    document_title: "Guide.pdf",
    chunk_index: 1,
    page_number: 8,
    content: "Enterprise plans include priority onboarding.",
    similarity: 0.72,
  },
  {
    chunk_id: "chunk-4",
    document_id: "doc-4",
    document_title: "Terms.pdf",
    chunk_index: 2,
    page_number: 12,
    content: "Contracts renew annually unless cancelled.",
    similarity: 0.69,
  },
];

describe("rag utilities", () => {
  it("builds a grounded answer prompt with internal source indexes", () => {
    const prompt = buildAnswerPrompt("What is the refund window?", matches);

    expect(prompt).toContain("Source index: 1");
    expect(prompt).toContain("Policy.pdf");
    expect(prompt).toContain("Block: 1");
    expect(prompt).toContain("Question: What is the refund window?");
    expect(prompt).toContain(FALLBACK_ANSWER);
    expect(prompt).toContain("sourceIndexes");
    expect(prompt).toContain("bracketed numeric citation markers");
    expect(prompt).toContain("Do not mention source file names");
    expect(prompt).not.toContain("Similarity:");
    expect(prompt).not.toContain("0.87");
  });

  it("builds a Portuguese prompt with clean conversation history", () => {
    const prompt = buildAnswerPrompt("Explique melhor isso.", matches, {
      fallbackAnswer: LOCALIZED_CHAT_MESSAGES.pt.selectedDocumentsFallback,
      responseLanguage: "pt",
      history: [
        {
          question: "Qual e a janela de reembolso?",
          answer:
            "O arquivo Policy.pdf diz que reembolsos estao disponiveis em 30 dias [1].",
        },
      ],
    });

    expect(prompt).toContain("Write a concise answer in Portuguese");
    expect(prompt).toContain("Conversation history:");
    expect(prompt).toContain("User: Qual e a janela de reembolso?");
    expect(prompt).not.toContain("[1]");
    expect(prompt).toContain("Selected document context:");
    expect(prompt).toContain(LOCALIZED_CHAT_MESSAGES.pt.selectedDocumentsFallback);
    expect(prompt).not.toContain("Similarity:");
  });

  it("supports a selected-document fallback in the grounded prompt", () => {
    const prompt = buildAnswerPrompt(
      "What is the refund window?",
      matches,
      SELECTED_DOCUMENTS_FALLBACK_ANSWER,
    );

    expect(prompt).toContain(SELECTED_DOCUMENTS_FALLBACK_ANSWER);
    expect(prompt).not.toContain(FALLBACK_ANSWER);
  });

  it("builds a retrieval query with recent conversation turns", () => {
    const query = buildRetrievalQuery("Explain that in more detail.", [
      {
        question: "What is the refund window?",
        answer: "Policy.pdf says refunds are available within 30 days [1].",
      },
    ]);

    expect(query).toContain("Recent conversation:");
    expect(query).toContain("Turn 1 user: What is the refund window?");
    expect(query).toContain(
      "Turn 1 assistant: Policy.pdf says refunds are available within 30 days.",
    );
    expect(query).not.toContain("[1]");
    expect(query).toContain("Current question: Explain that in more detail.");
  });

  it("builds a history-only prompt without document citations", () => {
    const prompt = buildHistoryAnswerPrompt(
      "Explain that in more detail.",
      [
        {
          question: "What is the refund window?",
          answer: "The refund window is 30 days.",
        },
      ],
      {
        fallbackAnswer: LOCALIZED_CHAT_MESSAGES.en.noContext,
        responseLanguage: "en",
      },
    );

    expect(prompt).toContain("using only the conversation history");
    expect(prompt).toContain("Do not invent citations or references.");
    expect(prompt).toContain("The refund window is 30 days.");
    expect(prompt).toContain(LOCALIZED_CHAT_MESSAGES.en.noContext);
    expect(prompt).not.toContain("Selected document context:");
  });

  it("maps only selected source indexes to public citations", () => {
    expect(
      createCitations(matches, [1], {
        question: "What is the refund window?",
        answer: "Policy.pdf says refunds are available within 30 days.",
      }),
    ).toEqual([
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
    expect(createCitations(matches, [2])).toEqual([
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

  it("limits public citations to the first three valid source indexes", () => {
    const citations = createCitations(manyMatches, [1, 2, 3, 4]);

    expect(citations).toHaveLength(3);
    expect(citations.map((citation) => citation.index)).toEqual([1, 2, 3]);
  });

  it("deduplicates repeated source indexes", () => {
    const citations = createCitations(manyMatches, [1, 1]);

    expect(citations).toHaveLength(1);
    expect(citations[0]?.index).toBe(1);
  });

  it("removes residual inline citation markers from answers", () => {
    expect(
      removeInlineCitationMarkers(
        "Policy.pdf covers refunds [1]. Terms.pdf covers renewals [4].",
      ),
    ).toBe("Policy.pdf covers refunds. Terms.pdf covers renewals.");
  });

  it("removes source file names from the final answer text", () => {
    expect(
      removeDocumentTitleMentions(
        "Refunds are available within 30 days, as stated in Policy.pdf. Support requests are answered according to Handbook.pdf.",
        matches,
      ),
    ).toBe(
      "Refunds are available within 30 days. Support requests are answered.",
    );
  });

  it("detects invented citation indexes", () => {
    expect(hasInvalidCitationIndexes("Answer [3].", matches.length)).toBe(true);
    expect(hasInvalidCitationIndexes("Answer [1] [2].", matches.length)).toBe(
      false,
    );
  });

  it("validates source indexes returned by the model", () => {
    expect(getValidSourceIndexes([1, 1, 4, 2], matches.length)).toEqual([1, 2]);
    expect(hasInvalidSourceIndexes([1, 3], matches.length)).toBe(true);
  });

  it("focuses long snippets on the most relevant text", () => {
    const longMatches: MatchDocumentChunk[] = [
      {
        ...matches[0],
        content: [
          "This opening paragraph only contains general policy language with no useful details.",
          "Refunds are available within 30 days of purchase when the customer keeps the original receipt.",
          "The final paragraph describes unrelated support hours and office locations.",
        ].join("\n"),
      },
    ];

    const [citation] = createCitations(longMatches, [1], {
      question: "What is the refund window?",
      answer: "Refunds are available within 30 days.",
    });

    expect(citation?.snippet).toContain("Refunds are available within 30 days");
    expect(citation?.snippet.length).toBeLessThanOrEqual(420);
  });

  it("falls back when the model returns empty text", () => {
    expect(normalizeAnswer("  ")).toBe(FALLBACK_ANSWER);
  });

  it("normalizes empty text with a selected-document fallback", () => {
    expect(normalizeAnswer("  ", SELECTED_DOCUMENTS_FALLBACK_ANSWER)).toBe(
      SELECTED_DOCUMENTS_FALLBACK_ANSWER,
    );
  });
});
