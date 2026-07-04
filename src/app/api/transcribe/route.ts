import { badRequest, toResponseError } from "@/lib/errors";
import { transcribeAudio } from "@/lib/gemini";
import { MAX_VOICE_AUDIO_BYTES, MAX_VOICE_AUDIO_MB } from "@/lib/voice-limits";

export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const audio = formData.get("audio");

    if (!(audio instanceof File)) {
      throw badRequest("Audio file is required.");
    }

    if (audio.size === 0) {
      throw badRequest("The recording is empty. Try recording again.");
    }

    if (audio.size > MAX_VOICE_AUDIO_BYTES) {
      throw badRequest(
        `Voice recordings must be ${MAX_VOICE_AUDIO_MB} MB or smaller.`,
      );
    }

    if (!isWavAudio(audio)) {
      throw badRequest("Only WAV audio recordings are supported.");
    }

    const text = await transcribeAudio({
      data: Buffer.from(await audio.arrayBuffer()),
      mimeType: "audio/wav",
    });

    if (!text) {
      throw badRequest("Could not understand the audio. Try recording again.");
    }

    return Response.json({ text });
  } catch (error) {
    return toResponseError(error);
  }
}

function isWavAudio(file: File) {
  const mimeType = file.type.toLowerCase();
  return (
    mimeType === "audio/wav" ||
    mimeType === "audio/x-wav" ||
    file.name.toLowerCase().endsWith(".wav")
  );
}
