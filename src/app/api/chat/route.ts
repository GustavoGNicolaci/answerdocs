import { z } from "zod";
import {
  MATCH_COUNT,
  MATCH_THRESHOLD,
  NO_CONTEXT_ANSWER,
  NO_SELECTED_DOCUMENT_ANSWER,
  SELECTED_DOCUMENTS_FALLBACK_ANSWER,
} from "@/lib/constants";
import { toResponseError } from "@/lib/errors";
import { embedText, generateGroundedAnswer } from "@/lib/gemini";
import {
  buildAnswerPrompt,
  createCitations,
  hasInvalidCitationIndexes,
  normalizeAnswer,
  removeHiddenCitationMarkers,
} from "@/lib/rag";
import { sessionIdSchema } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getSystemHelpAnswer } from "@/lib/system-help";
import type { MatchDocumentChunk } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const chatRequestSchema = z.object({
  sessionId: sessionIdSchema,
  question: z.string().trim().min(1).max(2_000),
  documentIds: z.array(z.uuid()).max(50).optional(),
});

export async function POST(request: Request) {
  try {
    const body = chatRequestSchema.parse(await request.json());
    const systemHelpAnswer = getSystemHelpAnswer(body.question);

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
      return Response.json({ answer: NO_CONTEXT_ANSWER, citations: [] });
    }

    if (selectedDocumentIds.length === 0) {
      return Response.json({
        answer: NO_SELECTED_DOCUMENT_ANSWER,
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
        answer: SELECTED_DOCUMENTS_FALLBACK_ANSWER,
        citations: [],
      });
    }

    const queryEmbedding = await embedText({
      text: body.question,
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
        answer: SELECTED_DOCUMENTS_FALLBACK_ANSWER,
        citations: [],
      });
    }

    const answer = normalizeAnswer(
      await generateGroundedAnswer(
        buildAnswerPrompt(
          body.question,
          matches,
          SELECTED_DOCUMENTS_FALLBACK_ANSWER,
        ),
        SELECTED_DOCUMENTS_FALLBACK_ANSWER,
      ),
      SELECTED_DOCUMENTS_FALLBACK_ANSWER,
    );
    const citations =
      answer === SELECTED_DOCUMENTS_FALLBACK_ANSWER ||
      hasInvalidCitationIndexes(answer, matches.length)
        ? []
        : createCitations(matches, answer);

    if (answer !== SELECTED_DOCUMENTS_FALLBACK_ANSWER && citations.length === 0) {
      return Response.json({
        answer: SELECTED_DOCUMENTS_FALLBACK_ANSWER,
        citations: [],
      });
    }

    return Response.json({
      answer:
        citations.length > 0
          ? removeHiddenCitationMarkers(answer, citations)
          : SELECTED_DOCUMENTS_FALLBACK_ANSWER,
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
