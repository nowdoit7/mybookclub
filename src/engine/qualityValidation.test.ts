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

  it("rejects essay-like punctuation in substantive discussion", () => {
    expect(
      validateUtteranceQuality(
        {
          utterance: "그 반론은 이해합니다; 하지만 이 장면의 결과는 다르게 봐야 해요. 저는 아직 책임의 경계가 남는다고 생각합니다.",
          stance: 1,
          refers_to: "marcus",
          shelf_ref: null,
        },
        "persona",
        false,
        { language: "ko", task: "RESPOND_TO_PERSONA" },
      ),
    ).toContain("spoken discussion dialogue must not use semicolons");
  });

  it("rejects an overlong spoken sentence without calling another model", () => {
    const overlongSentence = `${"이 장면의 책임을 다른 각도에서 살펴보면 ".repeat(5)}결론이 달라집니다.`;
    expect(
      validateUtteranceQuality(
        {
          utterance: `${overlongSentence} 그래서 저는 그 판단을 그대로 받아들이기 어렵습니다.`,
          stance: -1,
          refers_to: "maddie",
          shelf_ref: null,
        },
        "persona",
        false,
        { language: "ko", task: "CHALLENGE_PERSONA" },
      ),
    ).toContain("spoken discussion sentence 1 exceeds 110 characters");
  });

  it("enforces the exact two-sentence contract for a directed reader clash", () => {
    expect(
      validateUtteranceQuality(
        {
          utterance: "I disagree with that reading. The later scene points elsewhere. What makes your evidence decisive?",
          stance: -1,
          refers_to: "jamal",
          shelf_ref: null,
        },
        "persona",
        false,
        { language: "en", task: "CHALLENGE_PERSONA" },
      ),
    ).toContain("CHALLENGE_PERSONA utterance must contain exactly 2 sentences; received 3");
  });

  it("rejects dialogue that stops before the final sentence is complete", () => {
    expect(
      validateUtteranceQuality(
        {
          utterance: "I agree that the evidence changes the question. What later scene proves that rather than simply—",
          stance: 0.5,
          refers_to: "marcus",
          shelf_ref: null,
        },
        "persona",
        false,
        { language: "en", task: "RESPOND_TO_PERSONA" },
      ),
    ).toContain("utterance must end with a complete sentence");
  });

  it("rejects an incomplete moderator summary", () => {
    expect(
      validateUtteranceQuality(
        {
          utterance: "The central disagreement remained open. David clarified what the evidence could prove. Jam,",
          stance: null,
          refers_to: null,
          shelf_ref: null,
        },
        "moderator",
        false,
        { language: "en", task: "DISCUSSION_SUMMARY" },
      ),
    ).toContain("utterance must end with a complete sentence");
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

  it("requires every named participant in the final-position section", () => {
    expect(validateRecapQuality(recap, "en", ["You", "Maddie"])).toContain(
      "recap final-position section must include participant: Maddie",
    );
  });
});
