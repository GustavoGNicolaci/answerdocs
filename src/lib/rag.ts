import { FALLBACK_ANSWER, MAX_PUBLIC_CITATIONS } from "@/lib/constants";
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
    `- Use only the citations needed to support the answer and never cite more than ${MAX_PUBLIC_CITATIONS} snippets.`,
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
  const visibleIndexes = answer
    ? getVisibleCitationIndexes(answer, matches.length)
    : matches
        .slice(0, MAX_PUBLIC_CITATIONS)
        .map((_, index) => index + 1);
  const visibleIndexSet = new Set(visibleIndexes);
  const seenChunkIds = new Set<string>();

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
    .filter((citation) => {
      if (!visibleIndexSet.has(citation.index)) return false;
      if (seenChunkIds.has(citation.chunkId)) return false;
      seenChunkIds.add(citation.chunkId);
      return true;
    });
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

export function removeHiddenCitationMarkers(
  answer: string,
  citations: Citation[],
) {
  const visibleIndexes = new Set(citations.map((citation) => citation.index));

  return answer
    .replace(/\s*\[(\d+)\]/g, (match, rawIndex: string) =>
      visibleIndexes.has(Number(rawIndex)) ? match : "",
    )
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

function getVisibleCitationIndexes(answer: string, sourceCount: number) {
  const citedIndexes = getCitedIndexes(answer);
  const visibleIndexes: number[] = [];

  for (let index = 1; index <= sourceCount; index += 1) {
    if (citedIndexes.has(index)) visibleIndexes.push(index);
    if (visibleIndexes.length === MAX_PUBLIC_CITATIONS) break;
  }

  return visibleIndexes;
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
