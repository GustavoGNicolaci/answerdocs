import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDocumentInput } from "@/lib/ingest";
import { extractPdfPages } from "@/lib/pdf";
import {
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_FILE_MB,
} from "@/lib/upload-limits";

vi.mock("@/lib/pdf", () => ({
  extractPdfPages: vi.fn(),
}));

const sessionId = "11111111-1111-4111-8111-111111111111";

describe("document ingestion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(extractPdfPages).mockResolvedValue([
      { pageNumber: 1, text: "Readable PDF text." },
    ]);
  });

  it("accepts a PDF file at the 20 MB limit", async () => {
    const input = await parseDocumentInput(
      createUploadRequest(createSizedPdfFile(MAX_UPLOAD_FILE_BYTES)),
    );

    expect(input.sourceType).toBe("pdf");
    expect(input.metadata.size).toBe(MAX_UPLOAD_FILE_BYTES);
    expect(extractPdfPages).toHaveBeenCalledOnce();
  });

  it("rejects a PDF file above the 20 MB limit before extracting text", async () => {
    await expect(
      parseDocumentInput(
        createUploadRequest(createSizedPdfFile(MAX_UPLOAD_FILE_BYTES + 1)),
      ),
    ).rejects.toMatchObject({
      message: `Files must be ${MAX_UPLOAD_FILE_MB} MB or smaller.`,
      statusCode: 400,
    });

    expect(extractPdfPages).not.toHaveBeenCalled();
  });
});

function createUploadRequest(file: File) {
  const formData = new FormData();
  formData.append("sessionId", sessionId);
  formData.append("file", file);

  return new Request("http://localhost/api/documents", {
    method: "POST",
    body: formData,
  });
}

function createSizedPdfFile(sizeBytes: number) {
  return new File([new Uint8Array(sizeBytes)], "large.pdf", {
    type: "application/pdf",
  });
}
