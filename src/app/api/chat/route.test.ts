import { beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_ANSWER, NO_CONTEXT_ANSWER } from "@/lib/constants";
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
    const { rpc } = mockSupabase({ readyDocumentCount: 0 });

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

  it("answers system usage questions without Gemini or Supabase", async () => {
    const response = await POST(
      jsonRequest({
        sessionId,
        question: "How can I attach a PDF?",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.answer).toContain("attaching a PDF");
    expect(payload.citations).toEqual([]);
    expect(getSupabaseAdmin).not.toHaveBeenCalled();
    expect(embedText).not.toHaveBeenCalled();
  });

  it("passes the session id to semantic search", async () => {
    const { rpc } = mockSupabase({ readyDocumentCount: 1 });
    vi.mocked(embedText).mockResolvedValue(new Array(768).fill(0));

    const response = await POST(
      jsonRequest({
        sessionId,
        question: "What does the document say?",
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ answer: FALLBACK_ANSWER, citations: [] });
    expect(generateGroundedAnswer).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith(
      "match_document_chunks",
      expect.objectContaining({
        filter_session_id: sessionId,
        filter_document_ids: null,
      }),
    );
  });

  it("filters ready context checks by selected document ids", async () => {
    const { countQuery, rpc } = mockSupabase({
      readyDocumentCount: 0,
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
    expect(payload).toEqual({ answer: NO_CONTEXT_ANSWER, citations: [] });
    expect(countQuery.in).toHaveBeenCalledWith("id", [documentId]);
    expect(rpc).not.toHaveBeenCalled();
  });

  it("limits returned citations and removes hidden markers", async () => {
    mockSupabase({ readyDocumentCount: 4, rpcData: matches });
    vi.mocked(embedText).mockResolvedValue(new Array(768).fill(0));
    vi.mocked(generateGroundedAnswer).mockResolvedValue(
      "Policy.pdf covers refunds [1]. Handbook.pdf covers support [2]. Guide.pdf covers onboarding [3]. Terms.pdf covers renewal [4].",
    );

    const response = await POST(
      jsonRequest({
        sessionId,
        question: "Summarize the policies.",
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
  readyDocumentCount,
  rpcData = [],
}: {
  readyDocumentCount: number;
  rpcData?: MatchDocumentChunk[];
}) {
  const countQuery = createCountQuery(readyDocumentCount);
  const select = vi.fn(() => countQuery);
  const from = vi.fn(() => ({ select }));
  const rpc = vi.fn().mockResolvedValue({ data: rpcData, error: null });

  vi.mocked(getSupabaseAdmin).mockReturnValue({ from, rpc } as never);

  return { countQuery, from, rpc, select };
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
