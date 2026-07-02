import { beforeEach, describe, expect, it, vi } from "vitest";
import { FALLBACK_ANSWER } from "@/lib/constants";
import { embedText, generateGroundedAnswer } from "@/lib/gemini";
import { getSupabaseAdmin } from "@/lib/supabase";
import { POST } from "./route";

vi.mock("@/lib/gemini", () => ({
  embedText: vi.fn(),
  generateGroundedAnswer: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: vi.fn(),
}));

const sessionId = "11111111-1111-4111-8111-111111111111";

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

  it("passes the session id to semantic search", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [], error: null });
    vi.mocked(embedText).mockResolvedValue(new Array(768).fill(0));
    vi.mocked(getSupabaseAdmin).mockReturnValue({ rpc } as never);

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
});

function jsonRequest(body: unknown) {
  return new Request("http://localhost/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}
