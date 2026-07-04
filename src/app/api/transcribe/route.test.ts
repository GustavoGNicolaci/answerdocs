import { beforeEach, describe, expect, it, vi } from "vitest";
import { transcribeAudio } from "@/lib/gemini";
import { MAX_VOICE_AUDIO_BYTES } from "@/lib/voice-limits";
import { POST } from "./route";

vi.mock("@/lib/gemini", () => ({
  transcribeAudio: vi.fn(),
}));

describe("transcribe route", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("requires an audio file", async () => {
    const response = await POST(formRequest(new FormData()));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Audio file is required.");
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it("rejects empty audio", async () => {
    const formData = new FormData();
    formData.append("audio", new File([], "voice.wav", { type: "audio/wav" }));

    const response = await POST(formRequest(formData));

    expect(response.status).toBe(400);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it("rejects oversized audio before transcription", async () => {
    const formData = new FormData();
    formData.append(
      "audio",
      new File([new Uint8Array(MAX_VOICE_AUDIO_BYTES + 1)], "voice.wav", {
        type: "audio/wav",
      }),
    );

    const response = await POST(formRequest(formData));

    expect(response.status).toBe(400);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it("rejects unsupported audio MIME types", async () => {
    const formData = new FormData();
    formData.append(
      "audio",
      new File([new Uint8Array([1, 2, 3])], "voice.webm", {
        type: "audio/webm",
      }),
    );

    const response = await POST(formRequest(formData));

    expect(response.status).toBe(400);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it("returns transcribed text", async () => {
    vi.mocked(transcribeAudio).mockResolvedValue("What is in this document?");
    const formData = new FormData();
    formData.append(
      "audio",
      new File([new Uint8Array([1, 2, 3])], "voice.wav", {
        type: "audio/wav",
      }),
    );

    const response = await POST(formRequest(formData));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({ text: "What is in this document?" });
    expect(transcribeAudio).toHaveBeenCalledWith({
      data: expect.any(Buffer),
      mimeType: "audio/wav",
    });
  });

  it("returns a friendly error for empty transcriptions", async () => {
    vi.mocked(transcribeAudio).mockResolvedValue("");
    const formData = new FormData();
    formData.append(
      "audio",
      new File([new Uint8Array([1, 2, 3])], "voice.wav", {
        type: "audio/wav",
      }),
    );

    const response = await POST(formRequest(formData));
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe(
      "Could not understand the audio. Try recording again.",
    );
  });
});

function formRequest(formData: FormData) {
  return new Request("http://localhost/api/transcribe", {
    method: "POST",
    body: formData,
  });
}
