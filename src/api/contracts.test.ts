import { describe, expect, it } from "vitest";

import {
  bookIdentificationSchema,
  discussionFocusSchema,
  readingNotesSchema,
  recapSchema,
  userStanceSchema,
  utteranceSchema,
} from "./contracts";

describe("structured output contracts", () => {
  it("accepts a strict book identification", () => {
    const result = bookIdentificationSchema.parse({
      canonical_title: "A Reader-Selected Book",
      author: "A. Reader",
      work_scope: "single_book",
      included_titles: ["A Reader-Selected Book"],
      summary:
        "A reader-selected book is represented by a sufficiently detailed summary for this schema boundary test, without depending on any particular published work or its characters.",
      main_characters: ["Ari"],
      candidate_topics: ["Form", "Interpretation", "Context"],
      verification_status: "verified",
      verification_note: "Two independent sources match the title and author.",
      sources: [
        { url: "https://publisher.example/book" },
        { url: "https://library.example/record" },
      ],
    });

    expect(result.candidate_topics).toHaveLength(3);
    expect(result.verification_status).toBe("verified");
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
        key_scenes: ["The opening passage", "A later turning point"],
        shelf_connections: [],
        personal_reaction: "The silence around the victim stayed with this reader.",
        unresolved_question: "Is this lens hiding another part of the scene?",
        possible_revision: "Stronger scene evidence could revise this position.",
        question_for_table: "What did another reader notice first in this scene?",
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

    expect(
      discussionFocusSchema.parse({
        topic_scores: ["A", "B", "C"].map((topic, index) => ({
          topic,
          relevance: index,
          evidence: `Evidence ${index}`,
        })),
        emergent_question: null,
        emergent_relevance: 0,
        emergent_evidence: null,
      }).topic_scores,
    ).toHaveLength(3);
  });
});
