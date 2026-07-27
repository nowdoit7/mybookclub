import { countSentences } from "../../src/engine/sentenceValidation";
import type { RealBookDialogueLogEntry } from "./realBookModel";

export const VISIBLE_DIALOGUE_INTERNAL_TERMS = [
  "근거팩",
  "사용자 발제",
  "검증된 작품 사실",
] as const;

const INTERROGATIVE_ENDINGS =
  /(?:맞나요|맞습니까|그런가요|그렇습니까|인가요|일까요|할까요|될까요|됩니까|나요|까요|습니까)(?:[?？.!]|$)/u;

const COMMON_MOJIBAKE =
  /(?:\uFFFD|Ã.|Â.|â(?:€|€™|€œ|€|€“|€”|€¦)|ï¿½|ðŸ)/u;

function hasUnpairedSurrogate(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) return true;
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      return true;
    }
  }
  return false;
}

function hasDisallowedControl(text: string): boolean {
  for (const character of text) {
    const code = character.codePointAt(0);
    if (code === undefined) continue;
    const disallowedC0 = code <= 0x1f && code !== 0x09 && code !== 0x0a && code !== 0x0d;
    const disallowedC1 = code >= 0x7f && code <= 0x9f;
    if (disallowedC0 || disallowedC1) return true;
  }
  return false;
}

export function findVisibleInternalTerms(dialogue: string): string[] {
  return VISIBLE_DIALOGUE_INTERNAL_TERMS.filter((term) => dialogue.includes(term));
}

export function hasVisibleQuestionOrConfirmation(dialogue: string): boolean {
  return /[?？]/u.test(dialogue) || INTERROGATIVE_ENDINGS.test(dialogue);
}

export function findCorruptTextSignals(dialogue: string): string[] {
  const signals: string[] = [];
  if (COMMON_MOJIBAKE.test(dialogue)) signals.push("mojibake");
  if (hasDisallowedControl(dialogue)) signals.push("control-character");
  if (hasUnpairedSurrogate(dialogue)) signals.push("unpaired-surrogate");
  if (/(?:\?\s*){6,}/u.test(dialogue)) signals.push("question-mark-run");
  return signals;
}

export function sentenceCountIsAllowed(dialogue: string): boolean {
  const sentenceCount = countSentences(dialogue);
  return sentenceCount >= 1 && sentenceCount <= 3;
}

export function largestSentenceCountBucketShare(dialogues: string[]): number {
  if (dialogues.length === 0) return 0;
  const buckets = new Map<number, number>();
  for (const dialogue of dialogues) {
    const sentenceCount = countSentences(dialogue);
    buckets.set(sentenceCount, (buckets.get(sentenceCount) ?? 0) + 1);
  }
  return Math.max(...buckets.values()) / dialogues.length;
}

export function groundingSupportIsLinked(
  log: Pick<
    RealBookDialogueLogEntry,
    | "allowedEvidence"
    | "groundingDecision"
    | "usedEvidenceIds"
    | "variant"
    | "selectedValueIds"
    | "valueConflict"
  >,
): boolean {
  const grounding = log.groundingDecision;
  if (!grounding || grounding.evidenceBackedBookClaim.trim().length === 0) return false;
  if (grounding.personaInference.trim().length === 0) return false;
  if (grounding.uncertainty !== null && grounding.uncertainty.trim().length === 0) return false;

  const allowedIds = new Set(log.allowedEvidence.map(({ id }) => id));
  const supportIds = new Set(grounding.supportIds);
  const usedEvidenceIds = new Set(log.usedEvidenceIds);
  if (supportIds.size === 0 || supportIds.size !== grounding.supportIds.length) return false;
  if (![...supportIds].every((id) => allowedIds.has(id))) return false;
  if (
    supportIds.size !== usedEvidenceIds.size ||
    ![...supportIds].every((id) => usedEvidenceIds.has(id))
  ) {
    return false;
  }

  if (
    log.variant === "legacy_card" &&
    (log.selectedValueIds.length > 0 || log.valueConflict !== undefined)
  ) {
    return false;
  }
  return log.variant !== "character_core" || log.selectedValueIds.length > 0;
}
