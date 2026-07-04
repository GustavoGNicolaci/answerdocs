export type SourceType = "pdf" | "text";
export type DocumentStatus = "indexing" | "ready" | "failed";
export type SourceExtractionMethod = "native" | "ocr" | "combined";

export type SourcePage = {
  pageNumber: number | null;
  text: string;
  extractionMethod?: SourceExtractionMethod;
};

export type DocumentInput = {
  sessionId: string | null;
  chatId: string | null;
  folderId: string | null;
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
  selected: boolean;
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

export type ResponseLanguage = "pt" | "en";

export type GroundedAnswerResult = {
  answer: string;
  sourceIndexes: number[];
};

export type ChatContextAction = "upload_document";

export type ConversationHistoryItem = {
  question: string;
  answer: string;
};
