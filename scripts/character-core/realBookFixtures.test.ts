import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  STABILITY_CELLS,
  validateRealBookDialogueLogs,
  validateRealBookEvidencePacks,
} from "./realBookEvaluator";
import type {
  RealBookDialogueLogEntry,
  RealBookEvidencePack,
} from "./realBookModel";

const fixtureRoot = resolve("fixtures", "character-core", "real-books");

function readJsonLines<T>(path: string): T[] {
  return readFileSync(path, "utf8")
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as T);
}

const packs = [
  ...readJsonLines<RealBookEvidencePack>(resolve(fixtureRoot, "evidence-packs.dev.jsonl")),
  ...readJsonLines<RealBookEvidencePack>(
    resolve(fixtureRoot, "evidence-packs.holdout.jsonl"),
  ),
];
const logs = [
  "dialogues.core.dev-a.jsonl",
  "dialogues.core.dev-b.jsonl",
  "dialogues.core.holdout.jsonl",
  "dialogues.legacy-ab.jsonl",
  "dialogues.repeats.jsonl",
].flatMap((fileName) =>
  readJsonLines<RealBookDialogueLogEntry>(resolve(fixtureRoot, fileName)),
);

describe("real-book Character Core fixture integrity", () => {
  it("keeps the evidence-pack and 261-output matrices valid", () => {
    const errors = [
      ...validateRealBookEvidencePacks(packs),
      ...validateRealBookDialogueLogs(logs, packs),
    ].filter(({ passed, severity }) => !passed && severity === "error");

    expect(errors).toEqual([]);
  });

  it("resolves every locked stability cell to an actual pack question and base output", () => {
    for (const cell of STABILITY_CELLS) {
      const pack = packs.find(({ bookId }) => bookId === cell.bookId);
      expect(pack?.fiveQuestions.some(({ id }) => id === cell.questionId)).toBe(true);
      expect(
        logs.some(
          ({ bookId, personaId, questionId, repeatIndex, variant }) =>
            bookId === cell.bookId &&
            personaId === cell.personaId &&
            questionId === cell.questionId &&
            repeatIndex === 0 &&
            variant === "character_core",
        ),
      ).toBe(true);
    }
  });

  it("contains no repeat-output encoding corruption", () => {
    const repeats = logs.filter(({ repeatIndex }) => repeatIndex > 0);
    expect(repeats).toHaveLength(36);
    expect(
      repeats.filter(
        ({ dialogue }) =>
          dialogue.includes("\uFFFD") || (dialogue.match(/\?/gu)?.length ?? 0) > 5,
      ),
    ).toEqual([]);
  });

  it("keeps persona and variant labels out of public blind packets", () => {
    const packets = readJsonLines<Record<string, unknown>>(
      resolve(fixtureRoot, "blind", "blind-packets.jsonl"),
    );
    expect(packets).toHaveLength(261);
    for (const packet of packets) {
      expect(packet).not.toHaveProperty("personaId");
      expect(packet).not.toHaveProperty("sampleId");
      expect(packet).not.toHaveProperty("variant");
      expect(packet).not.toHaveProperty("repeatIndex");
      expect(packet).not.toHaveProperty("selectedValueIds");
    }
  });
});
