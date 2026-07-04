import { GoogleGenAI, Type, createPartFromBase64 } from "@google/genai";
import { z } from "zod";
import {
  EMBEDDING_DIMENSIONS,
  FALLBACK_ANSWER,
  GEMINI_CHAT_MODEL,
  GEMINI_EMBEDDING_MODEL,
  GEMINI_TRANSCRIPTION_MODEL,
  MAX_PUBLIC_CITATIONS,
} from "@/lib/constants";
import { configurationError } from "@/lib/errors";
import { getResponseLanguageName } from "@/lib/language";
import type { GroundedAnswerResult, ResponseLanguage } from "@/lib/types";

let geminiClient: GoogleGenAI | null = null;

type EmbeddingTask = "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";

type EmbedRequest = {
  text: string;
  title?: string;
  taskType: EmbeddingTask;
};

type GenerateAnswerOptions = {
  fallbackAnswer?: string;
  responseLanguage?: ResponseLanguage;
};

const groundedAnswerSchema = z.object({
  answer: z.string().catch(""),
  sourceIndexes: z.array(z.coerce.number().int()).catch([]),
});

const transcriptionSchema = z.object({
  text: z.string().catch(""),
});

export function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    throw configurationError("GEMINI_API_KEY is missing.");
  }

  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey });
  }

  return geminiClient;
}

export async function embedText(request: EmbedRequest) {
  const response = await getGeminiClient().models.embedContent({
    model: GEMINI_EMBEDDING_MODEL,
    contents: request.text,
    config: {
      outputDimensionality: EMBEDDING_DIMENSIONS,
      taskType: request.taskType,
      title: request.title,
    },
  });

  const values = response.embeddings?.[0]?.values;

  if (!values || values.length !== EMBEDDING_DIMENSIONS) {
    throw new Error("Gemini did not return a valid embedding.");
  }

  return values;
}

export async function embedTexts(requests: EmbedRequest[]) {
  const results = new Array<number[]>(requests.length);
  let cursor = 0;
  const workerCount = Math.min(3, requests.length);

  async function worker() {
    while (cursor < requests.length) {
      const current = cursor;
      cursor += 1;
      results[current] = await embedText(requests[current]);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

export async function generateGroundedAnswer(
  prompt: string,
  options: GenerateAnswerOptions | string = {},
): Promise<GroundedAnswerResult> {
  const fallbackAnswer =
    typeof options === "string"
      ? options
      : options.fallbackAnswer ?? FALLBACK_ANSWER;
  const responseLanguage =
    typeof options === "string" ? "en" : options.responseLanguage ?? "en";
  const languageName = getResponseLanguageName(responseLanguage);

  const response = await getGeminiClient().models.generateContent({
    model: GEMINI_CHAT_MODEL,
    contents: prompt,
    config: {
      maxOutputTokens: 900,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          answer: { type: Type.STRING },
          sourceIndexes: {
            type: Type.ARRAY,
            items: { type: Type.INTEGER },
          },
        },
        required: ["answer", "sourceIndexes"],
      },
      temperature: 0.2,
      systemInstruction:
        `You are AnswerDocs, a careful document question-answering assistant. Return JSON only. Answer in ${languageName}, matching the current user message. Use only the provided selected document context for document facts. Do not mention source file names in the answer text; put the supporting source indexes in sourceIndexes instead, with at least 1 and at most ${MAX_PUBLIC_CITATIONS} indexes when the answer uses document facts. Never put bracketed numeric citation markers in the answer text. Never mention similarity, precision, confidence, ranking, scores, or percentages. If the context is insufficient, set answer exactly to: ${fallbackAnswer} and sourceIndexes to [].`,
    },
  });

  return parseGroundedAnswer(response.text ?? "");
}

export async function generateConversationalAnswer(
  prompt: string,
  options: GenerateAnswerOptions,
) {
  const fallbackAnswer = options.fallbackAnswer ?? FALLBACK_ANSWER;
  const languageName = getResponseLanguageName(options.responseLanguage ?? "en");

  const response = await getGeminiClient().models.generateContent({
    model: GEMINI_CHAT_MODEL,
    contents: prompt,
    config: {
      maxOutputTokens: 700,
      responseMimeType: "text/plain",
      temperature: 0.2,
      systemInstruction:
        `You are AnswerDocs, a careful assistant. Answer in ${languageName}, matching the current user message. Use only the provided conversation history for continuity. Do not use external knowledge, do not invent document facts, and do not cite references. If the available history is insufficient, say exactly: ${fallbackAnswer}`,
    },
  });

  return response.text?.trim() || "";
}

export async function transcribeAudio(input: {
  data: Buffer;
  mimeType: "audio/wav";
}) {
  const response = await getGeminiClient().models.generateContent({
    model: GEMINI_TRANSCRIPTION_MODEL,
    contents: [
      [
        "Transcribe only the spoken words in this audio.",
        "Keep the original language.",
        "Do not answer the question, summarize, translate, or add commentary.",
        "Return JSON only, matching the provided schema.",
        "If speech is not understandable, return an empty string for text.",
      ].join("\n"),
      createPartFromBase64(input.data.toString("base64"), input.mimeType),
    ],
    config: {
      maxOutputTokens: 512,
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          text: { type: Type.STRING },
        },
        required: ["text"],
      },
      temperature: 0,
    },
  });

  return parseTranscription(response.text ?? "");
}

function parseGroundedAnswer(value: string): GroundedAnswerResult {
  const trimmed = value.trim();
  if (!trimmed) return { answer: "", sourceIndexes: [] };

  try {
    const parsed = groundedAnswerSchema.parse(JSON.parse(extractJson(trimmed)));
    return {
      answer: parsed.answer.trim(),
      sourceIndexes: parsed.sourceIndexes,
    };
  } catch {
    return {
      answer: trimmed,
      sourceIndexes: [],
    };
  }
}

function parseTranscription(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";

  try {
    const parsed = transcriptionSchema.parse(JSON.parse(extractJson(trimmed)));
    return normalizeTranscription(parsed.text);
  } catch {
    return normalizeTranscription(trimmed);
  }
}

function normalizeTranscription(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function extractJson(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced?.[1]) return fenced[1].trim();

  const firstBrace = value.indexOf("{");
  const lastBrace = value.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return value.slice(firstBrace, lastBrace + 1);
  }

  return value;
}
