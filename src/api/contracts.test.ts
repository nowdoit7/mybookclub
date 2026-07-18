import { describe, expect, it } from "vitest";

import {
  bookIdentificationSchema,
  readingNotesSchema,
  recapSchema,
  userStanceSchema,
  utteranceSchema,
} from "./contracts";

describe("structured output contracts", () => {
  it("accepts a strict book identification", () => {
    const result = bookIdentificationSchema.parse({
      canonical_title: "The Stranger",
      author: "Albert Camus",
      summary:
        "A detached clerk in French Algeria faces social judgment after a killing, while the novel examines absurdity, alienation, responsibility, and the demand for conventional emotion.",
      main_characters: ["Meursault"],
      candidate_topics: ["Detachment", "Judgment", "The absurd"],
      confidence: "high",
    });

    expect(result.candidate_topics).toHaveLength(3);
  });

  it("rejects undeclared properties", () => {
    expect(() =>
      userStanceSchema.parse({ stance: 1, paraphrase: "Mostly sympathetic", extra: true }),
    ).toThrow();
  });

  it("accepts every remaining contract shape", () => {
    expect(
      readingNotesSchema.parse({
        overall_take:
          "The emotional distance is not emptiness; it is a refusal to perform what society expects.",
        overall_stance: 1,
        stance_by_topic: [
          { topic: "A", stance: -1, reason: "Reason A" },
          { topic: "B", stance: 0, reason: "Reason B" },
          { topic: "C", stance: 2, reason: "Reason C" },
        ],
        key_scenes: ["The funeral", "The final confrontation"],
        shelf_connections: [],
      }).overall_stance,
    ).toBe(1);

    expect(
      utteranceSchema.parse({
        utterance: "I disagree with that reading. What in the scene supports it?",
        stance: -1,
        refers_to: "user",
        shelf_ref: null,
      }).refers_to,
    ).toBe("user");

    expect(
      recapSchema.parse({ markdown: `# Recap\n\n${"A careful discussion. ".repeat(12)}` }).markdown,
    ).toContain("# Recap");
  });
});
