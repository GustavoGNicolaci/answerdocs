# AnswerDocs

AnswerDocs is a minimal RAG chatbot. It accepts PDFs, text files, or pasted text, chunks and embeds the content with Gemini, stores vectors in Supabase pgvector, and returns grounded answers with cited snippets.

## Stack

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- Radix/shadcn-style UI primitives
- Supabase Postgres with pgvector
- Gemini API via `@google/genai`

## Environment

Create `.env.local` from `.env.example`:

```bash
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_CHAT_MODEL=gemini-3.1-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
```

Use non-sensitive demo documents when testing on Gemini's free tier.

## Database

Apply the migration in `supabase/migrations/20260701231140_initial_rag_schema.sql` to your Supabase project. It creates:

- `documents`
- `document_chunks`
- `match_document_chunks(...)`
- HNSW cosine vector index
- RLS with service-role-only access

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## API

Upload a file:

```bash
curl -X POST http://localhost:3000/api/documents \
  -F "title=Sample policy" \
  -F "file=@sample.pdf"
```

Upload pasted text:

```bash
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -d "{\"title\":\"Notes\",\"text\":\"Refunds are available within 30 days.\"}"
```

Ask a question:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"question\":\"What is the refund window?\"}"
```

## Verification

```bash
npm run test
npm run lint
npm run build
```
