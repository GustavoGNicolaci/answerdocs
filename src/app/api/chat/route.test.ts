import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LOCALIZED_CHAT_MESSAGES,
  NO_CONTEXT_ANSWER,
  NO_SELECTED_DOCUMENT_ANSWER,
  SELECTED_DOCUMENTS_FALLBACK_ANSWER,
} from "@/lib/constants";
import { embedText, generateGroundedAnswer } from "@/lib/gemini";
import { getSupabaseAdmin } from "@/lib/supabase";
import type { MatchDocumentChunk } from "@/lib/types";
import { POST } from "./route";

vi.mock("@/lib/gemini", () => ({
  embedText: vi.fn(),
  generateGroundedAnswer: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: vi.fn(),
}));

const sessionId = "11111111-1111-4111-8111-111111111111";
const documentId = "22222222-2222-4222-8222-222222222222";

const matches: MatchDocumentChunk[] = [
  {
    chunk_id: "chunk-1",
    document_id: documentId,
    document_title: "Policy.pdf",
    chunk_index: 0,
    page_number: 2,
    content: "Refunds are available within 30 days.",
    similarity: 0.9,
  },
  {
    chunk_id: "chunk-2",
    document_id: "33333333-3333-4333-8333-333333333333",
    document_title: "Handbook.pdf",
    chunk_index: 1,
    page_number: null,
    content: "Support requests are answered in two business days.",
    similarity: 0.86,
  },
  {
    chunk_id: "chunk-3",
    document_id: "44444444-4444-4444-8444-444444444444",
    document_title: "Guide.pdf",
    chunk_index: 2,
    page_number: 8,
    content: "Enterprise plans include priority onboarding.",
    similarity: 0.8,
  },
  {
    chunk_id: "chunk-4",
    document_id: "55555555-5555-4555-8555-555555555555",
    document_title: "Terms.pdf",
    chunk_index: 3,
    page_number: 12,
    content: "Contracts renew annually unless cancelled.",
    similarity: 0.75,
  },
];

describe("chat route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires a session id", async () => {
    const response = await POST(
      jsonRequest({ question: "What does the document say?" }),
    );

    expect(response.status).toBe(400);
    expect(embedText).not.toHaveBeenCalled();
  });

  it("returns a clear no-context answer without calling Gemini or RPC", async () => {
    const { rpc } = mockSupabase({ readyDocumentCounts: [0] });

    const response = await POST(
      jsonRequest({
        sessionId,
        question: "What is the refund window?",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ answer: NO_CONTEXT_ANSWER, citations: [] });
    expect(embedText).not.toHaveBeenCalled();
    expect(generateGroundedAnswer).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("localizes the no-context answer in Portuguese", async () => {
    const { rpc } = mockSupabase({ readyDocumentCounts: [0] });

    const response = await POST(
      jsonRequest({
        sessionId,
        question: "Qual é a janela de reembolso?",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      answer: LOCALIZED_CHAT_MESSAGES.pt.noContext,
      citations: [],
    });
    expect(embedText).not.toHaveBeenCalled();
    expect(generateGroundedAnswer).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("answers system usage questions without Gemini or Supabase", async () => {
    const response = await POST(
      jsonRequest({
        sessionId,
        question: "How can I attach a PDF?",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.answer).toContain("uploading a PDF or .txt file");
    expect(payload.answer).toContain("dragging a PDF");
    expect(payload.answer).toContain("pasting a PDF");
    expect(payload.citations).toEqual([]);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(embedText).not.toHaveBeenCalled();
  });

  it("answers system usage questions in Portuguese without Gemini or Supabase", async () => {
    const response = await POST(
      jsonRequest({
        sessionId,
        question: "Como posso enviar um PDF?",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.answer).toContain("Você pode adicionar contexto");
    expect(payload.citations).toEqual([]);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(embedText).not.toHaveBeenCalled();
  });

  it("does not search ready documents when none are selected", async () => {
    const { rpc } = mockSupabase({ readyDocumentCounts: [1] });

    const response = await POST(
      jsonRequest({
        sessionId,
        question: "What does the document say?",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      answer: NO_SELECTED_DOCUMENT_ANSWER,
      citations: [],
    });
    expect(embedText).not.toHaveBeenCalled();
    expect(generateGroundedAnswer).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("localizes the no-selection answer in Portuguese", async () => {
    const { rpc } = mockSupabase({ readyDocumentCounts: [1] });

    const response = await POST(
      jsonRequest({
        sessionId,
        question: "O que o documento diz?",
        documentIds: [],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      answer: LOCALIZED_CHAT_MESSAGES.pt.noSelectedDocument,
      citations: [],
    });
    expect(embedText).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("treats an empty document selection as no active document scope", async () => {
    const { rpc } = mockSupabase({ readyDocumentCounts: [1] });

    const response = await POST(
      jsonRequest({
        sessionId,
        question: "What does the document say?",
        documentIds: [],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      answer: NO_SELECTED_DOCUMENT_ANSWER,
      citations: [],
    });
    expect(embedText).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("filters ready context checks by selected document ids", async () => {
    const { countQueries, rpc } = mockSupabase({
      readyDocumentCounts: [1, 0],
    });

    const response = await POST(
      jsonRequest({
        sessionId,
        question: "What does the selected file say?",
        documentIds: [documentId],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      answer: SELECTED_DOCUMENTS_FALLBACK_ANSWER,
      citations: [],
    });
    expect(countQueries[1]?.in).toHaveBeenCalledWith("id", [documentId]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes selected document ids to semantic search", async () => {
    const { countQueries, rpc } = mockSupabase({
      readyDocumentCounts: [1, 1],
    });
    vi.mocked(embedText).mockResolvedValue(new Array(768).fill(0));

    const response = await POST(
      jsonRequest({
        sessionId,
        question: "What does the selected document say?",
        documentIds: [documentId],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      answer: SELECTED_DOCUMENTS_FALLBACK_ANSWER,
      citations: [],
    });
    expect(countQueries[1]?.in).toHaveBeenCalledWith("id", [documentId]);
    expect(generateGroundedAnswer).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "match_document_chunks",
      expect.objectContaining({
        filter_session_id: sessionId,
        filter_document_ids: [documentId],
      }),
    );
  });

  it("passes recent conversation history to retrieval and answer prompts", async () => {
    const { rpc } = mockSupabase({
      readyDocumentCounts: [1, 1],
      rpcData: matches,
    });
    vi.mocked(embedText).mockResolvedValue(new Array(768).fill(0));
    vi.mocked(generateGroundedAnswer).mockResolvedValue(
      "Policy.pdf says refunds are available within 30 days [1].",
    );

    const response = await POST(
      jsonRequest({
        sessionId,
        question: "Explain that in more detail.",
        documentIds: [documentId],
        history: [
          {
            question: "What is the refund window?",
            answer: "Policy.pdf says refunds are available within 30 days [1].",
          },
        ],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.citations).toHaveLength(1);
    expect(embedText).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Turn 1 user: What is the refund window?"),
      }),
    );
    expect(generateGroundedAnswer).toHaveBeenCalledWith(
      expect.stringContaining("Conversation history:"),
      expect.objectContaining({
        fallbackAnswer: SELECTED_DOCUMENTS_FALLBACK_ANSWER,
        responseLanguage: "en",
      }),
    );
    expect(rpc).toHaveBeenCalledWith(
      "match_document_chunks",
      expect.objectContaining({
        filter_document_ids: [documentId],
      }),
    );
  });

  it("limits returned citations and removes hidden markers", async () => {
    mockSupabase({ readyDocumentCounts: [4, 1], rpcData: matches });
    vi.mocked(embedText).mockResolvedValue(new Array(768).fill(0));
    vi.mocked(generateGroundedAnswer).mockResolvedValue(
      "Policy.pdf covers refunds [1]. Handbook.pdf covers support [2]. Guide.pdf covers onboarding [3]. Terms.pdf covers renewal [4].",
    );

    const response = await POST(
      jsonRequest({
        sessionId,
        question: "Summarize the policies.",
        documentIds: [documentId],
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.citations).toHaveLength(3);
    expect(payload.answer).toContain("[1]");
    expect(payload.answer).toContain("[2]");
    expect(payload.answer).toContain("[3]");
    expect(payload.answer).not.toContain("[4]");
  });
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockSupabase({
  readyDocumentCounts,
  rpcData = [],
}: {
  readyDocumentCounts: number[];
  rpcData?: MatchDocumentChunk[];
}) {
  const countQueries: Array<ReturnType<typeof createCountQuery>> = [];
  const select = vi.fn(() => {
    const count =
      readyDocumentCounts[
        Math.min(countQueries.length, readyDocumentCounts.length - 1)
      ] ?? 0;
    const countQuery = createCountQuery(count);
    countQueries.push(countQuery);
    return countQuery;
  });
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn().mockResolvedValue({ data: rpcData, error: null });

  vi.mocked(getSupabaseAdmin).mockReturnValue({ from, rpc } as never);

  return { countQueries, from, rpc, select };
}

function createCountQuery(count: number) {
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    then: vi.fn(),
  };

  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.then.mockImplementation((resolve, reject) =>
    Promise.resolve({ count, error: null }).then(resolve, reject),
  );

  return query;
}
