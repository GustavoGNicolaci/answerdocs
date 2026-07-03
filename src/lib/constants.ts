import { MAX_UPLOAD_FILE_BYTES } from "@/lib/upload-limits";

export {
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_FILE_MB,
} from "@/lib/upload-limits";

export const GEMINI_CHAT_MODEL =
  process.env.GEMINI_CHAT_MODEL ?? "gemini-3.1-flash-lite";

export const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2";

export const EMBEDDING_DIMENSIONS = 768;
export const MAX_FILE_BYTES = MAX_UPLOAD_FILE_BYTES;
export const MAX_TEXT_CHARACTERS = 150_000;
export const MAX_CHUNKS_PER_DOCUMENT = 120;
export const CHUNK_TARGET_CHARACTERS = 1_200;
export const CHUNK_OVERLAP_CHARACTERS = 200;
export const MATCH_COUNT = 6;
export const MATCH_THRESHOLD = 0.5;
export const MAX_PUBLIC_CITATIONS = 3;
export const FALLBACK_ANSWER =
  "I could not find enough information in the uploaded documents to answer that.";
export const SELECTED_DOCUMENTS_FALLBACK_ANSWER =
  "I could not find enough information in the selected documents to answer that.";
export const NO_CONTEXT_ANSWER =
  "There is no file or context loaded to consult. Upload a document or paste text so I can answer from it.";
export const NO_SELECTED_DOCUMENT_ANSWER =
  "There are documents available, but none are selected. Select at least one document to ask from it.";

export const LOCALIZED_CHAT_MESSAGES = {
  en: {
    noContext: NO_CONTEXT_ANSWER,
    noSelectedDocument: NO_SELECTED_DOCUMENT_ANSWER,
    selectedDocumentsFallback: SELECTED_DOCUMENTS_FALLBACK_ANSWER,
    copied: "Copied",
  },
  pt: {
    noContext:
      "Não há nenhum arquivo ou contexto carregado para consultar. Envie um documento ou cole um texto para que eu possa responder com base nele.",
    noSelectedDocument:
      "Há documentos disponíveis, mas nenhum está selecionado. Selecione pelo menos um documento para fazer perguntas sobre ele.",
    selectedDocumentsFallback:
      "Não encontrei informações suficientes nos documentos selecionados para responder a isso.",
    copied: "Copiado",
  },
} as const;
