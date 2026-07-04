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
const MAX_REFERENCE_SNIPPET_CHARACTERS = 420;

const REFERENCE_STOP_WORDS = new Set([
  "about",
  "above",
  "after",
  "also",
  "and",
  "are",
  "because",
  "com",
  "como",
  "das",
  "dos",
  "ela",
  "ele",
  "for",
  "from",
  "has",
  "have",
  "isso",
  "its",
  "mais",
  "mas",
  "not",
  "para",
  "por",
  "que",
  "the",
  "this",
  "uma",
  "was",
  "what",
  "when",
  "where",
  "which",
  "with",
]);

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
        `Source index: ${index + 1}`,
        `Document: ${match.document_title}`,
        `Source type: ${match.document_source_type}`,
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
    "- Do not put bracketed numeric citation markers in the answer text.",
    `- Choose only the sourceIndexes needed to support the answer and never return more than ${MAX_PUBLIC_CITATIONS} source indexes.`,
    "- Do not mention source file names in the answer text; the references panel will show the files used.",
    "- Do not invent facts, file names, page numbers, source indexes, or references.",
    "- Do not mention similarity, precision, confidence, ranking, scores, or percentages.",
    "- Return the fallback answer with an empty sourceIndexes array if the context is insufficient.",
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
        removeInlineCitationMarkers(turn.answer),
        MAX_HISTORY_ANSWER_CHARACTERS,
      )}`,
    ]),
    "",
    `Current question: ${question}`,
  ].join("\n");
}

export function buildHistoryAnswerPrompt(
  question: string,
  history: ConversationHistoryItem[],
  options: {
    fallbackAnswer: string;
    responseLanguage: ResponseLanguage;
  },
) {
  const languageName = getResponseLanguageName(options.responseLanguage);

  return [
    "Answer the user's current question using only the conversation history below.",
    "Requirements:",
    `- Write a concise answer in ${languageName}. Do not switch languages unless the user explicitly asks.`,
    "- Use the history only for conversational continuity and clarification.",
    "- Do not introduce new document facts, file details, legal claims, prices, dates, or external knowledge that are not already present in the history.",
    "- Do not invent citations or references.",
    "- If the question requires unavailable document information, reply exactly:",
    options.fallbackAnswer,
    "",
    "Conversation history:",
    formatConversationHistory(history),
    "",
    `Question: ${question}`,
  ].join("\n");
}

export function createCitations(
  matches: MatchDocumentChunk[],
  sourceIndexes?: number[],
  options: { question?: string; answer?: string } = {},
): Citation[] {
  const visibleIndexes =
    sourceIndexes === undefined
      ? matches
        .slice(0, MAX_PUBLIC_CITATIONS)
        .map((_, index) => index + 1)
      : getValidSourceIndexes(sourceIndexes, matches.length);
  const visibleIndexSet = new Set(visibleIndexes);
  const seenChunkIds = new Set<string>();

  return matches
    .map((match, index) => ({
      index: index + 1,
      chunkId: match.chunk_id,
      documentId: match.document_id,
      documentTitle: match.document_title,
      sourceType: match.document_source_type,
      pageNumber: match.page_number,
      chunkIndex: match.chunk_index,
      snippet: createFocusedSnippet(match.content, {
        question: options.question,
        answer: options.answer,
      }),
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

export function hasInvalidSourceIndexes(
  sourceIndexes: number[],
  sourceCount: number,
) {
  return sourceIndexes.some(
    (index) => !Number.isInteger(index) || index < 1 || index > sourceCount,
  );
}

export function getValidSourceIndexes(
  sourceIndexes: number[],
  sourceCount: number,
) {
  const seen = new Set<number>();
  const validIndexes: number[] = [];

  for (const index of sourceIndexes) {
    if (!Number.isInteger(index)) continue;
    if (index < 1 || index > sourceCount) continue;
    if (seen.has(index)) continue;

    seen.add(index);
    validIndexes.push(index);
    if (validIndexes.length === MAX_PUBLIC_CITATIONS) break;
  }

  return validIndexes;
}

export function removeInlineCitationMarkers(answer: string) {
  return answer
    .replace(/\s*\[(\d+)\]/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/\n[ \t]+/g, "\n")
    .trim();
}

export function removeHiddenCitationMarkers(answer: string) {
  return removeInlineCitationMarkers(answer);
}

export function removeDocumentTitleMentions(
  answer: string,
  matches: MatchDocumentChunk[],
) {
  const documentTitles = [
    ...new Set(
      matches
        .map((match) => match.document_title.trim())
        .filter((title) => title.length > 0),
    ),
  ];

  return documentTitles
    .reduce((currentAnswer, title) => {
      const escapedTitle = escapeRegExp(title);
      const attributionPattern = new RegExp(
        `\\s*,?\\s*(?:as\\s+(?:stated|shown|detailed|described|mentioned)\\s+in|according\\s+to|as\\s+per|from|in)\\s+(?:the\\s+document\\s+)?${escapedTitle}`,
        "gi",
      );
      const directTitlePattern = new RegExp(escapedTitle, "gi");

      return currentAnswer
        .replace(attributionPattern, "")
        .replace(directTitlePattern, "the selected document");
    }, answer)
    .replace(/\s+([,.])/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
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

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

function createFocusedSnippet(
  content: string,
  context: { question?: string; answer?: string },
) {
  const normalizedContent = normalizeSnippetWhitespace(content);
  if (normalizedContent.length <= MAX_REFERENCE_SNIPPET_CHARACTERS) {
    return normalizedContent;
  }

  const segments = splitReferenceSegments(normalizedContent);
  if (segments.length === 0) {
    return truncateFocusedText(normalizedContent, [], MAX_REFERENCE_SNIPPET_CHARACTERS);
  }

  const focusTerms = getFocusTerms(`${context.question ?? ""} ${context.answer ?? ""}`);
  const scoredSegments = segments.map((segment, index) => ({
    index,
    segment,
    score: scoreSegment(segment, focusTerms),
  }));
  const bestSegment =
    scoredSegments.sort((a, b) => b.score - a.score || a.index - b.index)[0] ??
    scoredSegments[0];

  if (!bestSegment || bestSegment.score === 0) {
    return truncateFocusedText(
      normalizedContent,
      focusTerms,
      MAX_REFERENCE_SNIPPET_CHARACTERS,
    );
  }

  const chosenIndexes = new Set([bestSegment.index]);
  const previous = scoredSegments.find(
    (segment) => segment.index === bestSegment.index - 1,
  );
  const next = scoredSegments.find(
    (segment) => segment.index === bestSegment.index + 1,
  );

  for (const neighbor of [previous, next]) {
    if (!neighbor || neighbor.score === 0) continue;

    const candidate = [...chosenIndexes, neighbor.index]
      .sort((a, b) => a - b)
      .map((index) => segments[index])
      .join("\n");

    if (candidate.length <= MAX_REFERENCE_SNIPPET_CHARACTERS) {
      chosenIndexes.add(neighbor.index);
    }
  }

  const focused = [...chosenIndexes]
    .sort((a, b) => a - b)
    .map((index) => segments[index])
    .join("\n");

  return truncateFocusedText(
    focused,
    focusTerms,
    MAX_REFERENCE_SNIPPET_CHARACTERS,
  );
}

function normalizeSnippetWhitespace(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function splitReferenceSegments(value: string) {
  const lineSegments = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lineSegments.length > 1) return lineSegments;

  return value
    .split(/(?<=[.!?])\s+/)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function getFocusTerms(value: string) {
  const terms = tokenize(value).filter((term) => !REFERENCE_STOP_WORDS.has(term));
  return [...new Set(terms)].slice(0, 40);
}

function scoreSegment(segment: string, focusTerms: string[]) {
  if (focusTerms.length === 0) return 0;

  const segmentTerms = new Set(tokenize(segment));
  return focusTerms.reduce(
    (score, term) => score + (segmentTerms.has(term) ? 1 : 0),
    0,
  );
}

function tokenize(value: string) {
  return (
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .match(/[a-z0-9]{3,}/g) ?? []
  );
}

function truncateFocusedText(
  value: string,
  focusTerms: string[],
  maxCharacters: number,
) {
  if (value.length <= maxCharacters) return value;

  const normalizedValue = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const lowerValue = normalizedValue.toLowerCase();
  const firstTermIndex = focusTerms
    .map((term) => lowerValue.indexOf(term))
    .filter((index) => index >= 0)
    .sort((a, b) => a - b)[0];

  if (firstTermIndex === undefined) {
    return `${value.slice(0, maxCharacters - 3).trimEnd()}...`;
  }

  const start = Math.max(0, firstTermIndex - Math.floor(maxCharacters / 3));
  const end = Math.min(value.length, start + maxCharacters);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < value.length ? "..." : "";
  const availableCharacters = maxCharacters - prefix.length - suffix.length;

  return `${prefix}${value
    .slice(start, start + availableCharacters)
    .trim()}${suffix}`;
}

function formatConversationHistory(history: ConversationHistoryItem[]) {
  if (history.length === 0) return "No previous conversation.";

  return history
    .map((turn, index) =>
      [
        `Turn ${index + 1}`,
        `User: ${truncateText(turn.question, MAX_HISTORY_QUESTION_CHARACTERS)}`,
        `Assistant: ${truncateText(
          removeInlineCitationMarkers(turn.answer),
          MAX_HISTORY_ANSWER_CHARACTERS,
        )}`,
      ].join("\n"),
    )
    .join("\n\n");
}

function truncateText(value: string, maxCharacters: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxCharacters) return trimmed;

  return `${trimmed.slice(0, maxCharacters - 3).trimEnd()}...`;
}
