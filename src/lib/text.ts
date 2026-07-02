import {
  CHUNK_OVERLAP_CHARACTERS,
  CHUNK_TARGET_CHARACTERS,
} from "@/lib/constants";
import type { DocumentChunk, SourcePage } from "@/lib/types";

export function normalizeText(value: string) {
  return value
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\t/g, " ")
    .replace(/[^\S\n]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export function toPlainText(value: string) {
  return normalizeText(value).replace(/\n+/g, " ").trim();
}

export function chunkPages(
  pages: SourcePage[],
  targetCharacters = CHUNK_TARGET_CHARACTERS,
  overlapCharacters = CHUNK_OVERLAP_CHARACTERS,
) {
  const chunks: DocumentChunk[] = [];

  for (const page of pages) {
    const pageText = toPlainText(page.text);
    if (!pageText) continue;

    for (const content of chunkText(
      pageText,
      targetCharacters,
      overlapCharacters,
    )) {
      chunks.push({
        chunkIndex: chunks.length,
        pageNumber: page.pageNumber,
        content,
      });
    }
  }

  return chunks;
}

export function chunkText(
  text: string,
  targetCharacters = CHUNK_TARGET_CHARACTERS,
  overlapCharacters = CHUNK_OVERLAP_CHARACTERS,
) {
  const words = toPlainText(text).split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current: string[] = [];
  let currentLength = 0;

  for (const word of words) {
    const nextLength = currentLength + word.length + (current.length ? 1 : 0);

    if (current.length > 0 && nextLength > targetCharacters) {
      chunks.push(current.join(" "));
      current = getOverlapWords(current, overlapCharacters);
      currentLength = current.join(" ").length;
    }

    current.push(word);
    currentLength += word.length + (current.length > 1 ? 1 : 0);
  }

  if (current.length > 0) {
    chunks.push(current.join(" "));
  }

  return chunks.filter((chunk) => chunk.trim().length > 0);
}

function getOverlapWords(words: string[], overlapCharacters: number) {
  const overlap: string[] = [];
  let length = 0;

  for (let index = words.length - 1; index >= 0; index -= 1) {
    const word = words[index];
    const nextLength = length + word.length + (overlap.length ? 1 : 0);
    if (nextLength > overlapCharacters) break;
    overlap.unshift(word);
    length = nextLength;
  }

  return overlap;
}
