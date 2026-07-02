import { z } from "zod";
import {
  FALLBACK_ANSWER,
  MATCH_COUNT,
  MATCH_THRESHOLD,
} from "@/lib/constants";
import { toResponseError } from "@/lib/errors";
import { embedText, generateGroundedAnswer } from "@/lib/gemini";
import {
  buildAnswerPrompt,
  createCitations,
  hasInvalidCitationIndexes,
  normalizeAnswer,
} from "@/lib/rag";
import { sessionIdSchema } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
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
    const queryEmbedding = await embedText({
      text: body.question,
      taskType: "RETRIEVAL_QUERY",
    });

    const { data, error } = await getSupabaseAdmin().rpc(
      "match_document_chunks",
      {
        query_embedding: queryEmbedding,
        filter_session_id: body.sessionId,
        match_threshold: MATCH_THRESHOLD,
        match_count: MATCH_COUNT,
        filter_document_ids:
          body.documentIds && body.documentIds.length > 0
            ? body.documentIds
            : null,
      },
    );

    if (error) throw error;

    const matches = (data ?? []) as MatchDocumentChunk[];

    if (matches.length === 0) {
      return Response.json({ answer: FALLBACK_ANSWER, citations: [] });
    }

    const answer = normalizeAnswer(
      await generateGroundedAnswer(buildAnswerPrompt(body.question, matches)),
    );
    const citations =
      answer === FALLBACK_ANSWER || hasInvalidCitationIndexes(answer, matches.length)
        ? []
        : createCitations(matches, answer);

    if (answer !== FALLBACK_ANSWER && citations.length === 0) {
      return Response.json({ answer: FALLBACK_ANSWER, citations: [] });
    }

    return Response.json({
      answer: citations.length > 0 ? answer : FALLBACK_ANSWER,
      citations,
    });
  } catch (error) {
    return toResponseError(error);
  }
}
