import { describe, expect, it } from "vitest";

import { countSentences, validateSentenceCount } from "./sentenceValidation";

describe("sentence validation", () => {
  it("counts normal English sentences", () => {
    expect(countSentences("I disagree. Where is the evidence? Let's look again.")) .toBe(3);
  });

  it("enforces the persona range", () => {
    expect(validateSentenceCount("One point. A second point.", { min: 2, max: 4 })).toBe(true);
    expect(validateSentenceCount("Only one.", { min: 2, max: 4 })).toBe(false);
    expect(
      validateSentenceCount("One. Two. Three. Four. Five.", { min: 2, max: 4 }),
    ).toBe(false);
  });

  it("treats blank output as zero sentences", () => {
    expect(countSentences("   ")).toBe(0);
  });
});
