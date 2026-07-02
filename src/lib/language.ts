import type { ResponseLanguage } from "@/lib/types";

const PORTUGUESE_MARKERS = [
  "arquivo",
  "arquivos",
  "como",
  "com",
  "de",
  "documento",
  "documentos",
  "em",
  "essa",
  "esse",
  "está",
  "explique",
  "isso",
  "mensagem",
  "melhor",
  "não",
  "o",
  "para",
  "pergunta",
  "pode",
  "por",
  "porque",
  "qual",
  "quais",
  "que",
  "responda",
  "sobre",
  "um",
  "uma",
];

const ENGLISH_MARKERS = [
  "about",
  "answer",
  "can",
  "document",
  "documents",
  "explain",
  "file",
  "files",
  "from",
  "how",
  "is",
  "message",
  "more",
  "question",
  "selected",
  "tell",
  "that",
  "the",
  "this",
  "what",
  "which",
  "why",
  "with",
];

export function detectResponseLanguage(input: string): ResponseLanguage {
  const normalized = input.trim().toLowerCase();
  if (!normalized) return "en";

  let portugueseScore = /[áàâãéêíóôõúç]/i.test(normalized) ? 2 : 0;
  let englishScore = 0;

  for (const marker of PORTUGUESE_MARKERS) {
    if (hasWord(normalized, marker)) portugueseScore += 1;
  }

  for (const marker of ENGLISH_MARKERS) {
    if (hasWord(normalized, marker)) englishScore += 1;
  }

  return portugueseScore > englishScore ? "pt" : "en";
}

export function getResponseLanguageName(language: ResponseLanguage) {
  return language === "pt" ? "Portuguese" : "English";
}

function hasWord(value: string, word: string) {
  return new RegExp(`(^|[^\\p{L}])${escapeRegExp(word)}($|[^\\p{L}])`, "iu").test(
    value,
  );
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
