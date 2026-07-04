import { beforeEach, describe, expect, it, vi } from "vitest";
import { parseDocumentInput } from "@/lib/ingest";
import { extractImageDocument } from "@/lib/image";
import { extractPdfDocument } from "@/lib/pdf";
import {
  MAX_IMAGE_UPLOAD_BYTES,
  MAX_IMAGE_UPLOAD_MB,
  MAX_UPLOAD_FILE_BYTES,
  MAX_UPLOAD_FILE_MB,
} from "@/lib/upload-limits";

vi.mock("@/lib/image", () => ({
  extractImageDocument: vi.fn(),
}));

vi.mock("@/lib/pdf", () => ({
  extractPdfDocument: vi.fn(),
}));

const sessionId = "11111111-1111-4111-8111-111111111111";

describe("document ingestion", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(extractPdfDocument).mockResolvedValue({
      pages: [{ pageNumber: 1, text: "Readable PDF text." }],
      metadata: { ocr: { applied: false } },
    });
    vi.mocked(extractImageDocument).mockResolvedValue({
      pages: [
        {
          pageNumber: null,
          text: "Readable image text from OCR.",
          extractionMethod: "ocr",
        },
      ],
      metadata: { ocr: { applied: true }, image: { mimeType: "image/png" } },
    });
  });

  it("accepts a PDF file at the 20 MB limit", async () => {
    const input = await parseDocumentInput(
      createUploadRequest(createSizedPdfFile(MAX_UPLOAD_FILE_BYTES)),
    );

    expect(input.sourceType).toBe("pdf");
    expect(input.metadata.size).toBe(MAX_UPLOAD_FILE_BYTES);
    expect(input.metadata.ocr).toEqual({ applied: false });
    expect(extractPdfDocument).toHaveBeenCalledOnce();
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

    expect(extractPdfDocument).not.toHaveBeenCalled();
  });

  it("accepts an image with readable OCR text", async () => {
    const input = await parseDocumentInput(
      createUploadRequest(createSizedImageFile(1024)),
    );

    expect(input.sourceType).toBe("image");
    expect(input.pages).toEqual([
      {
        pageNumber: null,
        text: "Readable image text from OCR.",
        extractionMethod: "ocr",
      },
    ]);
    expect(input.metadata.size).toBe(1024);
    expect(input.metadata.mimeType).toBe("image/png");
    expect(extractImageDocument).toHaveBeenCalledOnce();
    expect(extractPdfDocument).not.toHaveBeenCalled();
  });

  it("rejects an image above the 8 MB limit before OCR", async () => {
    await expect(
      parseDocumentInput(
        createUploadRequest(createSizedImageFile(MAX_IMAGE_UPLOAD_BYTES + 1)),
      ),
    ).rejects.toMatchObject({
      message: `Images must be ${MAX_IMAGE_UPLOAD_MB} MB or smaller.`,
      statusCode: 400,
    });

    expect(extractImageDocument).not.toHaveBeenCalled();
  });

  it("validates scope before extracting PDF or image OCR text", async () => {
    await expect(
      parseDocumentInput(createUploadRequest(createSizedPdfFile(128)), {
        validateScope: () => {
          throw new Error("Invalid scope.");
        },
      }),
    ).rejects.toThrow("Invalid scope.");

    expect(extractPdfDocument).not.toHaveBeenCalled();
    expect(extractImageDocument).not.toHaveBeenCalled();
  });

  it("validates scope before extracting image OCR text", async () => {
    await expect(
      parseDocumentInput(createUploadRequest(createSizedImageFile(128)), {
        validateScope: () => {
          throw new Error("Invalid scope.");
        },
      }),
    ).rejects.toThrow("Invalid scope.");

    expect(extractImageDocument).not.toHaveBeenCalled();
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

function createSizedImageFile(sizeBytes: number) {
  return new File([new Uint8Array(sizeBytes)], "scan.png", {
    type: "image/png",
  });
}
