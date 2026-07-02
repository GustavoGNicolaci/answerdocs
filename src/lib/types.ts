export type SourceType = "pdf" | "text";
export type DocumentStatus = "indexing" | "ready" | "failed";

export type SourcePage = {
  pageNumber: number | null;
  text: string;
};

export type DocumentInput = {
  sessionId: string;
  title: string;
  sourceType: SourceType;
  pages: SourcePage[];
  metadata: Record<string, unknown>;
};

export type DocumentChunk = {
  chunkIndex: number;
  pageNumber: number | null;
  content: string;
};

export type DocumentRecord = {
  id: string;
  title: string;
  source_type: SourceType;
  status: DocumentStatus;
  chunk_count: number;
  error_message: string | null;
  created_at: string;
  updated_at: string;
};

export type MatchDocumentChunk = {
  chunk_id: string;
  document_id: string;
  document_title: string;
  chunk_index: number;
  page_number: number | null;
  content: string;
  similarity: number;
};

export type Citation = {
  index: number;
  chunkId: string;
  documentId: string;
  documentTitle: string;
  pageNumber: number | null;
  chunkIndex: number;
  snippet: string;
};
