import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireAuthenticatedUser } from "@/lib/auth";
import { getSupabaseAdmin } from "@/lib/supabase";
import { requireOwnedChat, requireOwnedFolder } from "@/lib/workspace";
import { GET, PATCH } from "./route";

vi.mock("@/lib/auth", () => ({
  requireAuthenticatedUser: vi.fn(),
}));

vi.mock("@/lib/gemini", () => ({
  embedTexts: vi.fn(),
}));

vi.mock("@/lib/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/session")>();

  return {
    ...actual,
    getSessionIdFromRequest: vi.fn(() => "guest-session"),
  };
});

vi.mock("@/lib/supabase", () => ({
  getSupabaseAdmin: vi.fn(),
}));

vi.mock("@/lib/workspace", () => ({
  requireOwnedChat: vi.fn(),
  requireOwnedFolder: vi.fn(),
}));

const userId = "66666666-6666-4666-8666-666666666666";
const folderId = "77777777-7777-4777-8777-777777777777";
const chatId = "88888888-8888-4888-8888-888888888888";
const documentId = "22222222-2222-4222-8222-222222222222";

describe("documents route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(requireAuthenticatedUser).mockResolvedValue({
      id: userId,
      email: "user@example.com",
    });
    vi.mocked(requireOwnedFolder).mockResolvedValue({
      id: folderId,
      user_id: userId,
      name: "Project",
      created_at: "2026-07-02T00:00:00.000Z",
      updated_at: "2026-07-02T00:00:00.000Z",
    });
    vi.mocked(requireOwnedChat).mockResolvedValue({
      id: chatId,
      user_id: userId,
      folder_id: folderId,
      title: "New chat",
      created_at: "2026-07-02T00:00:00.000Z",
      updated_at: "2026-07-02T00:00:00.000Z",
    });
  });

  it("lists authenticated documents by folder", async () => {
    const query = createQuery({
      data: [
        {
          id: documentId,
          title: "Policy.pdf",
          source_type: "pdf",
          status: "ready",
          chunk_count: 1,
          error_message: null,
          selected: true,
          created_at: "2026-07-02T00:00:00.000Z",
          updated_at: "2026-07-02T00:00:00.000Z",
        },
      ],
      error: null,
    });
    const { from } = mockSupabase({ query });

    const response = await GET(
      new Request(`http://localhost/api/documents?folderId=${folderId}`),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.documents).toHaveLength(1);
    expect(requireOwnedFolder).toHaveBeenCalledWith(
      expect.anything(),
      userId,
      folderId,
    );
    expect(requireOwnedChat).not.toHaveBeenCalled();
    expect(from).toHaveBeenCalledWith("documents");
    expect(query.eq).toHaveBeenCalledWith("user_id", userId);
    expect(query.eq).toHaveBeenCalledWith("folder_id", folderId);
  });

  it("updates authenticated document selection by folder", async () => {
    const query = createQuery({ data: null, error: null });
    const { update } = mockSupabase({ query });

    const response = await PATCH(
      new Request("http://localhost/api/documents", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          folderId,
          documentIds: [documentId],
          selected: false,
        }),
      }),
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ ok: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ selected: false }),
    );
    expect(query.eq).toHaveBeenCalledWith("user_id", userId);
    expect(query.eq).toHaveBeenCalledWith("folder_id", folderId);
    expect(query.in).toHaveBeenCalledWith("id", [documentId]);
  });
});

function mockSupabase({ query }: { query: ReturnType<typeof createQuery> }) {
  const select = vi.fn(() => ({
    order: vi.fn(() => query),
  }));
  const update = vi.fn(() => query);
  const from = vi.fn(() => ({ select, update }));

  vi.mocked(getSupabaseAdmin).mockReturnValue({ from } as never);

  return { from, select, update };
}

function createQuery(result: { data: unknown; error: unknown }) {
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    is: vi.fn(),
    then: vi.fn(),
  };

  query.eq.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.then.mockImplementation((resolve, reject) =>
    Promise.resolve(result).then(resolve, reject),
  );

  return query;
}
