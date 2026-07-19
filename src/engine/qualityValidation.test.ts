import { describe, expect, it } from "vitest";

import { bookIdentificationSchema } from "../api/contracts";
import {
  validateBookIdentificationQuality,
  validateRecapQuality,
  validateUtteranceQuality,
} from "./qualityValidation";

describe("book identification quality validation", () => {
  it("requires two retrieved sources before a live book can be verified", () => {
    const output = bookIdentificationSchema.parse({
      canonical_title: "A Reader-Selected Book",
      author: "A. Reader",
      work_scope: "single_book",
      included_titles: ["A Reader-Selected Book"],
      summary:
        "The first sentence establishes the subject. The second describes a central tension. The third frames a change in perspective. The fourth identifies broader themes.",
      main_characters: ["Ari"],
      candidate_topics: [
        "How does the opening shape the reader's attention?",
        "Which interpretation best explains the central change?",
        "What human tension remains unresolved at the end?",
      ],
      verification_status: "verified",
      verification_note: "The title and author match a retrieved source.",
      sources: [{ url: "https://publisher.example/book" }],
    });

    expect(validateBookIdentificationQuality(output)).toContain(
      "verified books must include at least two retrieved web sources",
    );
  });

  it("rejects structurally valid but broken discussion topics", () => {
    const output = bookIdentificationSchema.parse({
      canonical_title: "A Reader-Selected Book",
      author: "A. Reader",
      work_scope: "single_book",
      included_titles: ["A Reader-Selected Book"],
      summary:
        "The first sentence establishes the subject. The second describes a central tension. The third frames a change in perspective. The fourth identifies broader themes.",
      main_characters: ["Ari"],
      candidate_topics: [
        "How does the opening shape the reader's attention?",
        "Which interpretation best explains the central change?",
        "Context and meaning broken quotation”",
      ],
      verification_status: "verified",
      verification_note: "The title and author match independent sources.",
      sources: [
        { url: "https://publisher.example/book" },
        { url: "https://library.example/record" },
      ],
    });

    expect(validateBookIdentificationQuality(output)).toContain(
      "candidate topic 3 must be a complete discussion question",
    );
  });

  it("requires a verified series to list its component books", () => {
    const output = bookIdentificationSchema.parse({
      canonical_title: "A Reader-Selected Series",
      author: "A. Reader",
      work_scope: "series",
      included_titles: ["Volume One"],
      summary:
        "The first volume establishes the central conflict. Later events expand its scale. The series changes how the original problem is understood. Its ending returns to the cost of that expansion.",
      main_characters: ["Ari"],
      candidate_topics: [
        "How does the central conflict change across the series?",
        "Which volume most strongly revises the opening assumptions?",
        "What human cost remains unresolved by the final volume?",
      ],
      verification_status: "verified",
      verification_note: "The series and author match independent sources.",
      sources: [
        { url: "https://publisher.example/series" },
        { url: "https://library.example/series" },
      ],
    });

    expect(validateBookIdentificationQuality(output)).toContain(
      "a verified series must include at least two component titles",
    );
  });

  it("rejects URLs and inline citation markup inside the summary", () => {
    const output = bookIdentificationSchema.parse({
      canonical_title: "A Reader-Selected Book",
      author: "A. Reader",
      work_scope: "single_book",
      included_titles: ["A Reader-Selected Book"],
      summary:
        "The story establishes a difficult choice. A publisher describes its consequences at [this page](https://publisher.example/book). The characters disagree about responsibility. The ending leaves that disagreement unresolved.",
      main_characters: ["Ari"],
      candidate_topics: [
        "How does the opening shape the reader's attention?",
        "Which interpretation best explains the central change?",
        "What human tension remains unresolved at the end?",
      ],
      verification_status: "verified",
      verification_note: "The title and author match independent sources.",
      sources: [
        { url: "https://publisher.example/book" },
        { url: "https://library.example/record" },
      ],
    });

    expect(validateBookIdentificationQuality(output)).toContain(
      "book summary must not contain URLs or inline citation markup",
    );
  });
});

describe("utterance quality validation", () => {
  it("accepts the fourth sentence allowed for persona dialogue", () => {
    expect(
      validateUtteranceQuality(
        {
          utterance: "First point. Second point. Third point. Fourth point.",
          stance: 1,
          refers_to: null,
          shelf_ref: null,
        },
        "persona",
        false,
      ),
    ).toEqual([]);
  });

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

describe("recap quality validation", () => {
  const recap = `# A Book — Reading Table Recap, 2026-07-18

## Discussion summary
Summary.
## Where everyone landed
| Reader | Position |\n| --- | --- |\n| You | A view |
## Sparks — moments of real disagreement
- A disagreement.
## Scenes you might have missed
- A scene.
## From the shelves
No shelf comparison was used.
## A question to sleep on
What would change your mind?`;

  it("requires exactly one final question", () => {
    expect(validateRecapQuality(recap)).toEqual([]);
    expect(validateRecapQuality(`${recap}\nWhat remains unresolved?`)).toContain(
      "recap must end with exactly one question to sleep on",
    );
  });
});
