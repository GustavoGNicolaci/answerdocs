import { z } from "zod";
import { requireAuthenticatedUser } from "@/lib/auth";
import {
  LOCALIZED_CHAT_MESSAGES,
  MATCH_COUNT,
  MATCH_THRESHOLD,
} from "@/lib/constants";
import { badRequest, toResponseError } from "@/lib/errors";
import {
  embedText,
  generateConversationalAnswer,
  generateGroundedAnswer,
} from "@/lib/gemini";
import { detectResponseLanguage } from "@/lib/language";
import {
  buildAnswerPrompt,
  buildHistoryAnswerPrompt,
  buildRetrievalQuery,
  createCitations,
  hasInvalidCitationIndexes,
  normalizeAnswer,
  removeHiddenCitationMarkers,
} from "@/lib/rag";
import { sessionIdSchema } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getSystemHelpAnswer } from "@/lib/system-help";
import type { ConversationHistoryItem, MatchDocumentChunk } from "@/lib/types";
import {
  loadSavedChatTurns,
  requireOwnedChat,
  saveChatExchange,
} from "@/lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_QUESTION_CHARACTERS = 500;
const MAX_HISTORY_ANSWER_CHARACTERS = 1_000;

const chatRequestSchema = z.object({
  sessionId: sessionIdSchema.optional(),
  chatId: z.uuid().optional(),
  question: z.string().trim().min(1).max(2_000),
  documentIds: z.array(z.uuid()).max(50).optional(),
  history: z
    .array(
      z.object({
        question: z.string().max(4_000),
        answer: z.string().max(8_000),
      }),
    )
    .max(10)
    .optional(),
});

export async function POST(request: Request) {
  try {
    const body = chatRequestSchema.parse(await request.json());
    const responseLanguage = detectResponseLanguage(body.question);
    const messages = LOCALIZED_CHAT_MESSAGES[responseLanguage];
    const systemHelpAnswer = getSystemHelpAnswer(
      body.question,
      responseLanguage,
    );
    const selectedDocumentIds = body.documentIds ?? [];

    if (!body.chatId && systemHelpAnswer) {
      return Response.json({ answer: systemHelpAnswer, citations: [] });
    }

    const supabase = getSupabaseAdmin();

    if (body.chatId) {
      const user = await requireAuthenticatedUser();
      const chat = await requireOwnedChat(supabase, user.id, body.chatId);
      const savedTurns = await loadSavedChatTurns(supabase, user.id, chat.id);
      const history = sanitizeConversationHistory(
        savedTurns.map((turn) => ({
          question: turn.question,
          answer: turn.answer,
        })),
      );
      const result = systemHelpAnswer
        ? { answer: systemHelpAnswer, citations: [] }
        : await answerFromScope({
            supabase,
            question: body.question,
            selectedDocumentIds,
            responseLanguage,
            messages,
            history,
            scope: {
              kind: "user",
              userId: user.id,
              chatId: chat.id,
              folderId: chat.folder_id,
            },
          });

      await saveChatExchange(supabase, {
        userId: user.id,
        chat,
        question: body.question,
        answer: result.answer,
        language: responseLanguage,
        citations: result.citations,
      });

      return Response.json(result);
    }

    if (!body.sessionId) {
      throw badRequest("A valid sessionId or chatId is required.");
    }

    return Response.json(
      await answerFromScope({
        supabase,
        question: body.question,
        selectedDocumentIds,
        responseLanguage,
        messages,
        history: sanitizeConversationHistory(body.history),
        scope: { kind: "guest", sessionId: body.sessionId },
      }),
    );
  } catch (error) {
    return toResponseError(error);
  }
}

type AnswerScope =
  | { kind: "guest"; sessionId: string }
  | { kind: "user"; userId: string; chatId: string; folderId: string };

type LocalizedMessages = {
  noContext: string;
  noSelectedDocument: string;
  selectedDocumentsFallback: string;
  copied: string;
};

async function answerFromScope({
  supabase,
  question,
  selectedDocumentIds,
  responseLanguage,
  messages,
  history,
  scope,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  question: string;
  selectedDocumentIds: string[];
  responseLanguage: "pt" | "en";
  messages: LocalizedMessages;
  history: ConversationHistoryItem[];
  scope: AnswerScope;
}) {
  const fallbackAnswer = messages.selectedDocumentsFallback;

  if (selectedDocumentIds.length > 0) {
    const hasSelectedContext = await hasReadyDocumentContext(
      supabase,
      scope,
      selectedDocumentIds,
    );

    if (!hasSelectedContext) {
      return { answer: fallbackAnswer, citations: [] };
    }

    return answerFromSelectedDocuments({
      supabase,
      question,
      selectedDocumentIds,
      responseLanguage,
      fallbackAnswer,
      history,
      scope,
    });
  }

  const hasAnyReadyContext = await hasReadyDocumentContext(supabase, scope);
  const noDocumentFallback = hasAnyReadyContext
    ? messages.noSelectedDocument
    : messages.noContext;

  if (history.length > 0) {
    const answer = normalizeAnswer(
      await generateConversationalAnswer(
        buildHistoryAnswerPrompt(question, history, {
          fallbackAnswer: noDocumentFallback,
          responseLanguage,
        }),
        {
          fallbackAnswer: noDocumentFallback,
          responseLanguage,
        },
      ),
      noDocumentFallback,
    );

    return { answer, citations: [] };
  }

  return { answer: noDocumentFallback, citations: [] };
}

async function answerFromSelectedDocuments({
  supabase,
  question,
  selectedDocumentIds,
  responseLanguage,
  fallbackAnswer,
  history,
  scope,
}: {
  supabase: ReturnType<typeof getSupabaseAdmin>;
  question: string;
  selectedDocumentIds: string[];
  responseLanguage: "pt" | "en";
  fallbackAnswer: string;
  history: ConversationHistoryItem[];
  scope: AnswerScope;
}) {
  const queryEmbedding = await embedText({
    text: buildRetrievalQuery(question, history),
    taskType: "RETRIEVAL_QUERY",
  });

  const { data, error } = await supabase.rpc("match_document_chunks", {
    query_embedding: queryEmbedding,
    filter_session_id: scope.kind === "guest" ? scope.sessionId : null,
    filter_user_id: scope.kind === "user" ? scope.userId : null,
    filter_folder_id: scope.kind === "user" ? scope.folderId : null,
    match_threshold: MATCH_THRESHOLD,
    match_count: MATCH_COUNT,
    filter_document_ids: selectedDocumentIds,
  });

  if (error) throw error;

  const matches = (data ?? []) as MatchDocumentChunk[];

  if (matches.length === 0) {
    return { answer: fallbackAnswer, citations: [] };
  }

  const answer = normalizeAnswer(
    await generateGroundedAnswer(
      buildAnswerPrompt(question, matches, {
        fallbackAnswer,
        responseLanguage,
        history,
      }),
      {
        fallbackAnswer,
        responseLanguage,
      },
    ),
    fallbackAnswer,
  );
  const citations =
    answer === fallbackAnswer || hasInvalidCitationIndexes(answer, matches.length)
      ? []
      : createCitations(matches, answer);

  if (answer !== fallbackAnswer && citations.length === 0) {
    return { answer: fallbackAnswer, citations: [] };
  }

  return {
    answer:
      citations.length > 0
        ? removeHiddenCitationMarkers(answer, citations)
        : fallbackAnswer,
    citations,
  };
}

async function hasReadyDocumentContext(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  scope: AnswerScope,
  documentIds?: string[],
) {
  let query = supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("status", "ready");

  if (scope.kind === "guest") {
    query = query.eq("session_id", scope.sessionId).is("user_id", null);
  } else {
    query = query.eq("user_id", scope.userId).eq("folder_id", scope.folderId);
  }

  if (documentIds && documentIds.length > 0) {
    query = query.in("id", documentIds);
  }

  const { count, error } = await query;
  if (error) throw error;

  return (count ?? 0) > 0;
}

function sanitizeConversationHistory(
  history: ConversationHistoryItem[] | undefined,
) {
  if (!history) return [];

  return history
    .map((turn) => ({
      question: truncateText(turn.question, MAX_HISTORY_QUESTION_CHARACTERS),
      answer: truncateText(turn.answer, MAX_HISTORY_ANSWER_CHARACTERS),
    }))
    .filter((turn) => turn.question.length > 0 && turn.answer.length > 0)
    .slice(-MAX_HISTORY_TURNS);
}

function truncateText(value: string, maxCharacters: number) {
  const trimmed = value.trim();
  if (trimmed.length <= maxCharacters) return trimmed;

  return `${trimmed.slice(0, maxCharacters - 3).trimEnd()}...`;
}
