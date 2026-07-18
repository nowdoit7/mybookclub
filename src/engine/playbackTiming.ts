import type { AppLanguage } from "../types";

const MIN_READING_DELAY_MS = 3_000;
const MAX_READING_DELAY_MS = 10_000;

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

export function calculateReadingDelay(text: string, language: AppLanguage): number {
  const sentenceCount = Math.max(1, (text.match(/[.!?。！？]+/gu) ?? []).length);

  if (language === "ko") {
    const characterCount = text.replace(/\s/gu, "").length;
    return clamp(
      1_400 + characterCount * 35 + sentenceCount * 450,
      MIN_READING_DELAY_MS,
      MAX_READING_DELAY_MS,
    );
  }

  const wordCount = text.trim().split(/\s+/u).filter(Boolean).length;
  return clamp(
    1_200 + wordCount * 220 + sentenceCount * 350,
    MIN_READING_DELAY_MS,
    MAX_READING_DELAY_MS,
  );
}
