import { describe, expect, it } from "vitest";

import { bookIdentificationSchema } from "../api/contracts";
import {
  validateBookIdentificationQuality,
  validateUtteranceQuality,
} from "./qualityValidation";

describe("book identification quality validation", () => {
  it("rejects structurally valid but broken discussion topics", () => {
    const output = bookIdentificationSchema.parse({
      canonical_title: "The Stranger",
      author: "Albert Camus",
      summary:
        "The first sentence establishes the character. The second describes the conflict. The third frames the trial. The fourth identifies the themes.",
      main_characters: ["Meursault"],
      candidate_topics: [
        "Is emotional detachment honesty or refusal?",
        "What is the court truly judging?",
        "Mortality and society broken quotation”",
      ],
      confidence: "high",
    });

    expect(validateBookIdentificationQuality(output)).toContain(
      "candidate topic 3 must be a complete discussion question",
    );
  });
});

describe("utterance quality validation", () => {
  it("rejects shelf metadata that is not spoken aloud", () => {
    expect(
      validateUtteranceQuality(
        {
          utterance: "This is a useful comparison. It clarifies the moral stakes.",
          stance: 1,
          refers_to: null,
          shelf_ref: "Beloved",
        },
        "persona",
        true,
      ),
    ).toContain("shelf_ref must name a book that is explicitly mentioned in the utterance");
  });
});
