import { FALLBACK_ANSWER } from "@/lib/constants";
import type { Citation, MatchDocumentChunk } from "@/lib/types";

export function buildAnswerPrompt(
  question: string,
  matches: MatchDocumentChunk[],
) {
  const context = matches
    .map((match, index) => {
      const page = match.page_number ? `Page: ${match.page_number}` : "Page: n/a";

      return [
        `[${index + 1}]`,
        `Document: ${match.document_title}`,
        page,
        `Similarity: ${match.similarity.toFixed(3)}`,
        "Snippet:",
        match.content,
      ].join("\n");
    })
    .join("\n\n");

  return [
    "Answer the user's question using only the context below.",
    "Requirements:",
    "- Write a concise answer in English.",
    "- Cite every factual claim using bracketed citations from the context, for example [1].",
    "- Do not invent facts, file names, page numbers, or citations.",
    `- If the context does not answer the question, reply exactly: ${FALLBACK_ANSWER}`,
    "",
    "Context:",
    context,
    "",
    `Question: ${question}`,
  ].join("\n");
}

export function createCitations(matches: MatchDocumentChunk[]): Citation[] {
  return matches.map((match, index) => ({
    index: index + 1,
    chunkId: match.chunk_id,
    documentId: match.document_id,
    documentTitle: match.document_title,
    pageNumber: match.page_number,
    similarity: match.similarity,
    snippet: match.content,
  }));
}

export function normalizeAnswer(answer: string) {
  const trimmed = answer.trim();
  return trimmed.length > 0 ? trimmed : FALLBACK_ANSWER;
}
