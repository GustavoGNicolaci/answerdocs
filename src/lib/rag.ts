import { FALLBACK_ANSWER, MAX_PUBLIC_CITATIONS } from "@/lib/constants";
import { getResponseLanguageName } from "@/lib/language";
import type {
  Citation,
  ConversationHistoryItem,
  MatchDocumentChunk,
  ResponseLanguage,
} from "@/lib/types";

const MAX_RETRIEVAL_HISTORY_TURNS = 3;
const MAX_HISTORY_QUESTION_CHARACTERS = 500;
const MAX_HISTORY_ANSWER_CHARACTERS = 900;

type BuildAnswerPromptOptions = {
  fallbackAnswer?: string;
  responseLanguage?: ResponseLanguage;
  history?: ConversationHistoryItem[];
};

export function buildAnswerPrompt(
  question: string,
  matches: MatchDocumentChunk[],
  options: BuildAnswerPromptOptions | string = {},
) {
  const {
    fallbackAnswer,
    responseLanguage = "en",
    history = [],
  } = normalizePromptOptions(options);
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
  const conversationHistory = formatConversationHistory(history);
  const languageName = getResponseLanguageName(responseLanguage);

  return [
    "Answer the user's current question using the selected document context below.",
    "Requirements:",
    `- Write a concise answer in ${languageName}. Do not switch languages unless the user explicitly asks.`,
    "- Use the conversation history only to understand follow-up questions and references such as 'that', 'this', 'isso', or 'aquilo'.",
    "- Treat the selected document context as the only source for document facts.",
    "- Cite every factual claim using bracketed citations from the context, for example [1].",
    `- Use only the citations needed to support the answer and never cite more than ${MAX_PUBLIC_CITATIONS} snippets.`,
    "- Mention the source file name when citing a fact.",
    "- Do not invent facts, file names, page numbers, or citations.",
    "- Do not mention similarity, precision, confidence, ranking, scores, or percentages.",
    `- If the context does not answer the question, reply exactly: ${fallbackAnswer}`,
    "",
    "Conversation history:",
    conversationHistory,
    "",
    "Selected document context:",
    context,
    "",
    `Question: ${question}`,
  ].join("\n");
}

export function buildRetrievalQuery(
  question: string,
  history: ConversationHistoryItem[] = [],
) {
  const recentHistory = history.slice(-MAX_RETRIEVAL_HISTORY_TURNS);
  if (recentHistory.length === 0) return question;

  return [
    "Recent conversation:",
    ...recentHistory.flatMap((turn, index) => [
      `Turn ${index + 1} user: ${truncateText(
        turn.question,
        MAX_HISTORY_QUESTION_CHARACTERS,
      )}`,
      `Turn ${index + 1} assistant: ${truncateText(
        turn.answer,
        MAX_HISTORY_ANSWER_CHARACTERS,
      )}`,
    ]),
    "",
    `Current question: ${question}`,
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

export function normalizeAnswer(answer: string, fallbackAnswer = FALLBACK_ANSWER) {
  const trimmed = answer.trim();
  return trimmed.length > 0 ? trimmed : fallbackAnswer;
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

function normalizePromptOptions(options: BuildAnswerPromptOptions | string) {
  if (typeof options === "string") {
    return {
      fallbackAnswer: options,
      responseLanguage: "en" as const,
      history: [],
    };
  }

  return {
    fallbackAnswer: options.fallbackAnswer ?? FALLBACK_ANSWER,
    responseLanguage: options.responseLanguage ?? "en",
    history: options.history ?? [],
  };
}

function formatConversationHistory(history: ConversationHistoryItem[]) {
  if (history.length === 0) return "No previous conversation.";

  return history
    .map((turn, index) =>
      [
        `Turn ${index + 1}`,
        `User: ${truncateText(turn.question, MAX_HISTORY_QUESTION_CHARACTERS)}`,
        `Assistant: ${truncateText(turn.answer, MAX_HISTORY_ANSWER_CHARACTERS)}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function truncateText(value: string, maxCharacters: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxCharacters) return trimmed;

  return `${trimmed.slice(0, maxCharacters - 3).trimEnd()}...`;
}
