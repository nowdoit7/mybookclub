import type { Utterance } from "../types";

const DEFAULT_MAX_UTTERANCES = 12;
const DEFAULT_MAX_CHARACTERS = 9_000;
const OLDER_TURN_LIMIT = 320;

function compactOlderTurn(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const safeLimit = Math.max(1, limit - 1);
  return `${text.slice(0, safeLimit).trimEnd()}…`;
}

export function prepareTranscriptContext(
  transcript: Utterance[],
  maxUtterances = DEFAULT_MAX_UTTERANCES,
  maxCharacters = DEFAULT_MAX_CHARACTERS,
): Utterance[] {
  const candidates = transcript.slice(-maxUtterances);
  const selected: Utterance[] = [];
  let remaining = maxCharacters;

  for (let index = candidates.length - 1; index >= 0; index -= 1) {
    const utterance = candidates[index];
    const isLatest = index === candidates.length - 1;
    const allowed = isLatest ? remaining : Math.min(remaining, OLDER_TURN_LIMIT);
    if (allowed <= 0) break;

    const text = isLatest ? utterance.text.slice(0, allowed) : compactOlderTurn(utterance.text, allowed);
    if (!text) break;
    selected.unshift({ ...utterance, text });
    remaining -= text.length;
  }

  return selected;
}
