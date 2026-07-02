# AnswerDocs

AnswerDocs is a minimal RAG chatbot. It accepts PDFs, text files, or pasted chat context, chunks and embeds the content with Gemini, stores vectors in Supabase pgvector, and returns grounded answers with cited snippets.

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

Apply the migrations in `supabase/migrations` to your Supabase project. They create:

- `documents`
- `document_chunks`
- `match_document_chunks(...)`
- HNSW cosine vector index
- Session-scoped document filtering
- RLS with service-role-only access

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Each browser tab creates its own chat session with `sessionStorage`. Documents from another tab or an older session are not used unless they share the same session id.

## API

Upload a file:

```bash
SESSION_ID="11111111-1111-4111-8111-111111111111"

curl -X POST http://localhost:3000/api/documents \
  -F "sessionId=$SESSION_ID" \
  -F "title=Sample policy" \
  -F "file=@sample.pdf"
```

Upload pasted text:

```bash
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"title\":\"Notes\",\"text\":\"Refunds are available within 30 days.\"}"
```

Ask a question:

```bash
curl -X POST http://localhost:3000/api/chat \
  -H "Content-Type: application/json" \
  -d "{\"sessionId\":\"$SESSION_ID\",\"question\":\"What is the refund window?\"}"
```

In the UI, PDFs can also be attached from the chat composer by dragging a PDF into the chat area or using the PDF attachment button. Large pasted text in the chat composer is indexed as chat context automatically.

## Verification

```bash
npm run test
npm run lint
npm run build
```
