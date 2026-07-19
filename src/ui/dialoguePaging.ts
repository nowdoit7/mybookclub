import type { AppLanguage, Utterance } from "../types";

export interface DialoguePage {
  key: string;
  utterance: Utterance;
  utteranceIndex: number;
  pageIndex: number;
  pageCount: number;
  text: string;
}

const PAGE_CHARACTER_LIMIT: Record<AppLanguage, number> = {
  ko: 150,
  en: 240,
};

function splitLongSegment(segment: string, limit: number): string[] {
  if (segment.length <= limit) return [segment];

  const words = segment.split(/\s+/u).filter(Boolean);
  if (words.length <= 1) {
    const chunks: string[] = [];
    for (let index = 0; index < segment.length; index += limit) {
      chunks.push(segment.slice(index, index + limit));
    }
    return chunks;
  }

  const chunks: string[] = [];
  let current = "";
  for (const word of words) {
    if (word.length > limit) {
      if (current) chunks.push(current);
      chunks.push(...splitLongSegment(word, limit));
      current = "";
      continue;
    }
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length > limit) {
      chunks.push(current);
      current = word;
    } else {
      current = candidate;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export function paginateDialogue(
  text: string,
  language: AppLanguage,
): string[] {
  const normalized = text.trim().replace(/\s+/gu, " ");
  if (!normalized) return [""];

  const limit = PAGE_CHARACTER_LIMIT[language];
  const sentences =
    normalized.match(/[^.!?。！？]+(?:[.!?。！？]+|$)/gu)?.map((sentence) => sentence.trim()) ??
    [normalized];
  const pages: string[] = [];
  let current = "";
  let sentenceCount = 0;

  for (const sentence of sentences) {
    const pieces = splitLongSegment(sentence, limit);
    for (const piece of pieces) {
      const candidate = current ? `${current} ${piece}` : piece;
      if (current && (candidate.length > limit || sentenceCount >= 2)) {
        pages.push(current);
        current = piece;
        sentenceCount = 1;
      } else {
        current = candidate;
        sentenceCount += 1;
      }
    }
  }
  if (current) pages.push(current);
  return pages;
}

export function buildDialoguePages(
  transcript: Utterance[],
  language: AppLanguage,
): DialoguePage[] {
  return transcript.flatMap((utterance, utteranceIndex) => {
    const pages = paginateDialogue(utterance.text, language);
    return pages.map((text, pageIndex) => ({
      key: `${utteranceIndex}:${pageIndex}`,
      utterance,
      utteranceIndex,
      pageIndex,
      pageCount: pages.length,
      text,
    }));
  });
}
