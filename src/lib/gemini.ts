import { GoogleGenAI } from "@google/genai";
import {
  EMBEDDING_DIMENSIONS,
  FALLBACK_ANSWER,
  GEMINI_CHAT_MODEL,
  GEMINI_EMBEDDING_MODEL,
  MAX_PUBLIC_CITATIONS,
} from "@/lib/constants";
import { configurationError } from "@/lib/errors";
import { getResponseLanguageName } from "@/lib/language";
import type { ResponseLanguage } from "@/lib/types";

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
) {
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
      responseMimeType: "text/plain",
      temperature: 0.2,
      systemInstruction:
        `You are AnswerDocs, a careful document question-answering assistant. Answer in ${languageName}, matching the current user message. Use only the provided selected document context for document facts. Mention source file names when using facts, and cite only the necessary supporting snippets with bracketed citation numbers such as [1] and [2]. Never use more than ${MAX_PUBLIC_CITATIONS} citations. Never mention similarity, precision, confidence, ranking, scores, or percentages. If the context is insufficient, say exactly: ${fallbackAnswer}`,
    },
  });

  return response.text?.trim() || "";
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
