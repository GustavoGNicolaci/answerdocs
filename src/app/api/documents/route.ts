import {
  MAX_CHUNKS_PER_DOCUMENT,
} from "@/lib/constants";
import { badRequest, getErrorMessage, toResponseError } from "@/lib/errors";
import { embedTexts } from "@/lib/gemini";
import { parseDocumentInput } from "@/lib/ingest";
import { getSupabaseAdmin } from "@/lib/supabase";
import { chunkPages } from "@/lib/text";
import type { DocumentRecord } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET() {
  try {
    const supabase = getSupabaseAdmin();
    const { data, error } = await supabase
      .from("documents")
      .select(
        "id,title,source_type,status,chunk_count,error_message,created_at,updated_at",
      )
      .order("created_at", { ascending: false });

    if (error) throw error;

    return Response.json({ documents: (data ?? []) as DocumentRecord[] });
  } catch (error) {
    return toResponseError(error);
  }
}

export async function POST(request: Request) {
  let documentId: string | null = null;

  try {
    const input = await parseDocumentInput(request);
    const chunks = chunkPages(input.pages);

    if (chunks.length === 0) {
      throw badRequest("The document does not contain readable text.");
    }

    if (chunks.length > MAX_CHUNKS_PER_DOCUMENT) {
      throw badRequest(
        `This document produced ${chunks.length} chunks. Please upload a smaller document or split it into multiple files.`,
      );
    }

    const characterCount = input.pages.reduce(
      (total, page) => total + page.text.length,
      0,
    );
    const supabase = getSupabaseAdmin();

    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert({
        title: input.title,
        source_type: input.sourceType,
        status: "indexing",
        chunk_count: 0,
        metadata: {
          ...input.metadata,
          characterCount,
          pageCount: input.pages.length,
        },
      })
      .select(
        "id,title,source_type,status,chunk_count,error_message,created_at,updated_at",
      )
      .single();

    if (documentError) throw documentError;
    documentId = document.id;

    const embeddings = await embedTexts(
      chunks.map((chunk) => ({
        text: chunk.content,
        title: input.title,
        taskType: "RETRIEVAL_DOCUMENT",
      })),
    );

    const rows = chunks.map((chunk, index) => ({
      document_id: document.id,
      chunk_index: chunk.chunkIndex,
      page_number: chunk.pageNumber,
      content: chunk.content,
      embedding: embeddings[index],
    }));

    const { error: chunksError } = await supabase
      .from("document_chunks")
      .insert(rows);

    if (chunksError) throw chunksError;

    const { data: readyDocument, error: updateError } = await supabase
      .from("documents")
      .update({
        status: "ready",
        chunk_count: chunks.length,
        error_message: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", document.id)
      .select(
        "id,title,source_type,status,chunk_count,error_message,created_at,updated_at",
      )
      .single();

    if (updateError) throw updateError;

    return Response.json(
      { document: readyDocument as DocumentRecord },
      { status: 201 },
    );
  } catch (error) {
    if (documentId) {
      await markDocumentFailed(documentId, getErrorMessage(error));
    }

    return toResponseError(error);
  }
}

async function markDocumentFailed(documentId: string, message: string) {
  try {
    await getSupabaseAdmin()
      .from("documents")
      .update({
        status: "failed",
        error_message: message.slice(0, 500),
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);
  } catch {
    // The original request error is more useful than a cleanup failure.
  }
}
