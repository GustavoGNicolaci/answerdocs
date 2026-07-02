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
  normalizeAnswer,
} from "@/lib/rag";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { MatchDocumentChunk } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const chatRequestSchema = z.object({
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

    return Response.json({
      answer,
      citations: answer === FALLBACK_ANSWER ? [] : createCitations(matches),
    });
  } catch (error) {
    return toResponseError(error);
  }
}
