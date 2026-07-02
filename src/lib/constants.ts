export const GEMINI_CHAT_MODEL =
  process.env.GEMINI_CHAT_MODEL ?? "gemini-3.1-flash-lite";

export const GEMINI_EMBEDDING_MODEL =
  process.env.GEMINI_EMBEDDING_MODEL ?? "gemini-embedding-2";

export const EMBEDDING_DIMENSIONS = 768;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_CHARACTERS = 150_000;
export const MAX_CHUNKS_PER_DOCUMENT = 120;
export const CHUNK_TARGET_CHARACTERS = 1_200;
export const CHUNK_OVERLAP_CHARACTERS = 200;
export const MATCH_COUNT = 6;
export const MATCH_THRESHOLD = 0.5;
export const MAX_PUBLIC_CITATIONS = 3;
export const FALLBACK_ANSWER =
  "I could not find enough information in the uploaded documents to answer that.";
export const NO_CONTEXT_ANSWER =
  "There is no file or context loaded to consult. Upload a document or paste text so I can answer from it.";
