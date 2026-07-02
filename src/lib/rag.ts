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
        `Block: ${match.chunk_index + 1}`,
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
    "- Mention the source file name when citing a fact.",
    "- Do not invent facts, file names, page numbers, or citations.",
    "- Do not mention similarity, precision, confidence, ranking, scores, or percentages.",
    `- If the context does not answer the question, reply exactly: ${FALLBACK_ANSWER}`,
    "",
    "Context:",
    context,
    "",
    `Question: ${question}`,
  ].join("\n");
}

export function createCitations(
  matches: MatchDocumentChunk[],
  answer?: string,
): Citation[] {
  const citedIndexes = answer ? getCitedIndexes(answer) : null;

  return matches
    .map((match, index) => ({
      index: index + 1,
      chunkId: match.chunk_id,
      documentId: match.document_id,
      documentTitle: match.document_title,
      pageNumber: match.page_number,
      chunkIndex: match.chunk_index,
      snippet: match.content,
    }))
    .filter((citation) => !citedIndexes || citedIndexes.has(citation.index));
}

export function normalizeAnswer(answer: string) {
  const trimmed = answer.trim();
  return trimmed.length > 0 ? trimmed : FALLBACK_ANSWER;
}

export function hasInvalidCitationIndexes(answer: string, sourceCount: number) {
  return [...getCitedIndexes(answer)].some(
    (index) => index < 1 || index > sourceCount,
  );
}

function getCitedIndexes(answer: string) {
  const indexes = new Set<number>();
  const matches = answer.matchAll(/\[(\d+)\]/g);

  for (const match of matches) {
    const index = Number(match[1]);
    if (Number.isInteger(index)) indexes.add(index);
  }

  return indexes;
}
