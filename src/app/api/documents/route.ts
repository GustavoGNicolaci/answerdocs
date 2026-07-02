import { z } from "zod";
import { MAX_CHUNKS_PER_DOCUMENT } from "@/lib/constants";
import { requireAuthenticatedUser } from "@/lib/auth";
import { badRequest, getErrorMessage, toResponseError } from "@/lib/errors";
import { embedTexts } from "@/lib/gemini";
import { parseDocumentInput } from "@/lib/ingest";
import { getSessionIdFromRequest } from "@/lib/session";
import { getSupabaseAdmin } from "@/lib/supabase";
import { chunkPages } from "@/lib/text";
import type { DocumentRecord } from "@/lib/types";
import { requireOwnedChat, requireOwnedFolder } from "@/lib/workspace";

export const runtime = "nodejs";
export const maxDuration = 60;

const documentSelect =
  "id,title,source_type,status,chunk_count,error_message,selected,created_at,updated_at";

const selectionSchema = z.object({
  folderId: z.uuid().optional(),
  chatId: z.uuid().optional(),
  documentIds: z.array(z.uuid()).max(100),
  selected: z.boolean(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const folderId = url.searchParams.get("folderId");
    const chatId = url.searchParams.get("chatId");
    const supabase = getSupabaseAdmin();
    let query = supabase
      .from("documents")
      .select(documentSelect)
      .order("created_at", { ascending: false });

    if (folderId) {
      const user = await requireAuthenticatedUser();
      await requireOwnedFolder(supabase, user.id, folderId);
      query = query.eq("user_id", user.id).eq("folder_id", folderId);
    } else if (chatId) {
      const user = await requireAuthenticatedUser();
      const chat = await requireOwnedChat(supabase, user.id, chatId);
      query = query.eq("user_id", user.id).eq("folder_id", chat.folder_id);
    } else {
      const sessionId = getSessionIdFromRequest(request);
      query = query.eq("session_id", sessionId).is("user_id", null);
    }

    const { data, error } = await query;

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
    const supabase = getSupabaseAdmin();
    let userId: string | null = null;
    let folderId: string | null = null;

    if (input.folderId) {
      const user = await requireAuthenticatedUser();
      const folder = await requireOwnedFolder(supabase, user.id, input.folderId);
      userId = user.id;
      folderId = folder.id;
    } else if (input.chatId) {
      const user = await requireAuthenticatedUser();
      const chat = await requireOwnedChat(supabase, user.id, input.chatId);
      userId = user.id;
      folderId = chat.folder_id;
    } else if (!input.sessionId) {
      throw badRequest("A valid sessionId or folderId is required.");
    }

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
    const { data: document, error: documentError } = await supabase
      .from("documents")
      .insert({
        title: input.title,
        session_id: input.sessionId,
        user_id: userId,
        folder_id: folderId,
        chat_id: input.chatId,
        selected: true,
        source_type: input.sourceType,
        status: "indexing",
        chunk_count: 0,
        metadata: {
          ...input.metadata,
          characterCount,
          pageCount: input.pages.length,
        },
      })
      .select(documentSelect)
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
      .select(documentSelect)
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

export async function PATCH(request: Request) {
  try {
    const body = selectionSchema.parse(await request.json());
    const user = await requireAuthenticatedUser();
    const supabase = getSupabaseAdmin();
    let folderId = body.folderId ?? null;

    if (folderId) {
      await requireOwnedFolder(supabase, user.id, folderId);
    } else if (body.chatId) {
      const chat = await requireOwnedChat(supabase, user.id, body.chatId);
      folderId = chat.folder_id;
    }

    if (!folderId) {
      throw badRequest("A valid folderId is required.");
    }

    if (body.documentIds.length === 0) {
      return Response.json({ ok: true });
    }

    const { error } = await supabase
      .from("documents")
      .update({
        selected: body.selected,
        updated_at: new Date().toISOString(),
      })
      .eq("user_id", user.id)
      .eq("folder_id", folderId)
      .in("id", body.documentIds);

    if (error) throw error;

    return Response.json({ ok: true });
  } catch (error) {
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
