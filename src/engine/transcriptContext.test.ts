import { describe, expect, it } from "vitest";

import type { Utterance } from "../types";
import { prepareTranscriptContext } from "./transcriptContext";

describe("prepareTranscriptContext", () => {
  it("preserves a long latest user turn while compacting older context", () => {
    const longUserTurn = "가".repeat(753);
    const transcript: Utterance[] = [
      ...Array.from({ length: 14 }, (_, index) => ({
        speaker: index % 2 === 0 ? "maddie" : "marcus",
        text: `${index}-${"older context ".repeat(80)}`,
        stage: "MEMORABLE_SCENES" as const,
      })),
      { speaker: "user", text: longUserTurn, stage: "DISCUSSION" },
    ];

    const context = prepareTranscriptContext(transcript);

    expect(context).toHaveLength(12);
    expect(context.at(-1)?.text).toBe(longUserTurn);
    expect(context.slice(0, -1).every(({ text }) => text.length <= 320)).toBe(true);
    expect(context.reduce((total, { text }) => total + text.length, 0)).toBeLessThanOrEqual(9_000);
  });
});
