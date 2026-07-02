# AnswerDocs

AnswerDocs is a minimal RAG chatbot. It accepts PDFs, text files, or pasted chat context, chunks and embeds the content with Gemini, stores vectors in Supabase pgvector, and returns grounded answers with cited snippets.

The app works in guest mode without an account. Signed-in users get saved folders, chats, messages, document selections, and references.

## Stack

- Next.js App Router
- React and TypeScript
- Tailwind CSS
- Radix/shadcn-style UI primitives
- Supabase Postgres with pgvector
- Supabase Auth
- Gemini API via `@google/genai`

## Environment

Create `.env.local` from `.env.example`:

```bash
GEMINI_API_KEY=
SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
GEMINI_CHAT_MODEL=gemini-3.1-flash-lite
GEMINI_EMBEDDING_MODEL=gemini-embedding-2
```

`SUPABASE_SERVICE_ROLE_KEY` must stay server-only. The publishable key is used for Supabase Auth cookie handling.

Use non-sensitive demo documents when testing on Gemini's free tier.

## Database

Apply the migrations in `supabase/migrations` to your Supabase project. They create:

- `documents`
- `document_chunks`
- `profiles`
- `folders`
- `chats`
- `chat_messages`
- `message_references`
- `match_document_chunks(...)`
- HNSW cosine vector index
- Session-scoped guest document filtering
- User and chat-scoped saved workspaces
- RLS ownership policies for authenticated user data

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

Guest mode creates a temporary chat session with `sessionStorage`. Signed-in users can create folders and saved chats. Each saved chat loads only its own messages, documents, selected documents, and references.

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
  -d "{\"sessionId\":\"$SESSION_ID\",\"question\":\"What is the refund window?\",\"documentIds\":[\"DOCUMENT_ID\"]}"
```

For saved chats, send `chatId` instead of `sessionId`. In the UI, PDFs can also be added by dragging a PDF into the chat area or pasting a copied PDF file into the composer. Large pasted text in the chat composer is indexed as chat context automatically.

## Verification

```bash
npm run test
npm run lint
npm run build
```
