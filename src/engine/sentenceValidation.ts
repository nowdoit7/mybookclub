export interface SentenceCountRange {
  min: number;
  max: number;
}

export function countSentences(text: string): number {
  const trimmed = text.trim();
  if (!trimmed) return 0;

  if (typeof Intl.Segmenter === "function") {
    const segmenter = new Intl.Segmenter(undefined, { granularity: "sentence" });
    return [...segmenter.segment(trimmed)].filter((part) => part.segment.trim()).length;
  }

  return trimmed.split(/(?<=[.!?])(?:["')\]]*)\s+/u).filter(Boolean).length;
}

export function validateSentenceCount(text: string, range: SentenceCountRange): boolean {
  const count = countSentences(text);
  return count >= range.min && count <= range.max;
}
