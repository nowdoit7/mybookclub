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
  ko: 105,
  en: 170,
};

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
    const candidate = current ? `${current} ${sentence}` : sentence;
    if (current && (candidate.length > limit || sentenceCount >= 2)) {
      pages.push(current);
      current = sentence;
      sentenceCount = 1;
    } else {
      current = candidate;
      sentenceCount += 1;
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
