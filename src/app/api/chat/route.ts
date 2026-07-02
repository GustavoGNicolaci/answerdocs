import { z } from "zod";
import {
  LOCALIZED_CHAT_MESSAGES,
  MATCH_COUNT,
  MATCH_THRESHOLD,
} from "@/lib/constants";
import { toResponseError } from "@/lib/errors";
import { embedText, generateGroundedAnswer } from "@/lib/gemini";
import { detectResponseLanguage } from "@/lib/language";
import {
  buildAnswerPrompt,
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

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_HISTORY_TURNS = 6;
const MAX_HISTORY_QUESTION_CHARACTERS = 500;
const MAX_HISTORY_ANSWER_CHARACTERS = 1_000;

const chatRequestSchema = z.object({
  sessionId: sessionIdSchema,
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
    const fallbackAnswer = messages.selectedDocumentsFallback;
    const history = sanitizeConversationHistory(body.history);
    const systemHelpAnswer = getSystemHelpAnswer(
      body.question,
      responseLanguage,
    );

    if (systemHelpAnswer) {
      return Response.json({ answer: systemHelpAnswer, citations: [] });
    }

    const supabase = getSupabaseAdmin();
    const selectedDocumentIds = body.documentIds ?? [];
    const hasAnyReadyContext = await hasReadyDocumentContext(
      supabase,
      body.sessionId,
    );

    if (!hasAnyReadyContext) {
      return Response.json({ answer: messages.noContext, citations: [] });
    }

    if (selectedDocumentIds.length === 0) {
      return Response.json({
        answer: messages.noSelectedDocument,
        citations: [],
      });
    }

    const hasSelectedContext = await hasReadyDocumentContext(
      supabase,
      body.sessionId,
      selectedDocumentIds,
    );

    if (!hasSelectedContext) {
      return Response.json({
        answer: fallbackAnswer,
        citations: [],
      });
    }

    const queryEmbedding = await embedText({
      text: buildRetrievalQuery(body.question, history),
      taskType: "RETRIEVAL_QUERY",
    });

    const { data, error } = await supabase.rpc("match_document_chunks", {
      query_embedding: queryEmbedding,
      filter_session_id: body.sessionId,
      match_threshold: MATCH_THRESHOLD,
      match_count: MATCH_COUNT,
      filter_document_ids: selectedDocumentIds,
    });

    if (error) throw error;

    const matches = (data ?? []) as MatchDocumentChunk[];

    if (matches.length === 0) {
      return Response.json({
        answer: fallbackAnswer,
        citations: [],
      });
    }

    const answer = normalizeAnswer(
      await generateGroundedAnswer(
        buildAnswerPrompt(
          body.question,
          matches,
          {
            fallbackAnswer,
            responseLanguage,
            history,
          },
        ),
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
      return Response.json({
        answer: fallbackAnswer,
        citations: [],
      });
    }

    return Response.json({
      answer:
        citations.length > 0
          ? removeHiddenCitationMarkers(answer, citations)
          : fallbackAnswer,
      citations,
    });
  } catch (error) {
    return toResponseError(error);
  }
}

async function hasReadyDocumentContext(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  sessionId: string,
  documentIds?: string[],
) {
  let query = supabase
    .from("documents")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId)
    .eq("status", "ready");

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
