import { describe, expect, it } from "vitest";

import {
  guestAuditionCaseSchema,
  guestAuditionEvaluationSchema,
} from "../scripts/guestAuditionSchema";
import {
  buildLiveAuditionCase,
  liveGuestOutputSchema,
  toBlindPacket,
} from "../scripts/guestAuditionLive";

const scores = {
  bookSpecificity: 4,
  novelInterpretation: 4,
  personaCoherence: 4,
  conversationalParticipation: 4,
  humanNaturalness: 4,
  authorityBalance: 4,
  bookCenteredness: 4,
  repeatResistance: 4,
  discussionContribution: 4,
  returnInterest: 4,
};

describe("guest audition contracts", () => {
  it("accepts a genre-grounded blind comparison case", () => {
    expect(
      guestAuditionCaseSchema.parse({
        version: 1,
        id: "sample-case",
        language: "en",
        book: {
          title: "A Book",
          author: "A Reader",
          genreFamily: "science_fiction",
          sourceArtifacts: ["fixtures/a-book.md"],
        },
        guestCandidate: {
          id: "guest-reader",
          displayName: "An Imagined Reader",
          category: "analytical",
          portrayalBasis: [
            "The portrayal treats mathematical order as a method for testing claims.",
            "The reader distinguishes observed evidence from speculative explanation.",
            "The reader remains fallible and answers challenges from other participants.",
          ],
          sourceUrls: ["https://example.com/source-a", "https://example.com/source-b"],
        },
        fixedContext: {
          topic: "Which claim best explains the evidence raised at the table?",
          userClaims: ["The user's interpretation separates intention from consequence."],
          allowedBookEvidence: [
            "The table discussed one decision under uncertainty.",
            "Two readers disagreed about measurable consequences.",
            "The user asked how responsibility should be distributed.",
          ],
        },
        guestSampleId: "sample-b",
        samples: [
          {
            id: "sample-a",
            turns: [
              { id: "a1", speaker: "Reader A", speakerType: "candidate", text: "One claim remains contested. The evidence does not settle it." },
              { id: "a2", speaker: "User", speakerType: "user", text: "I still disagree." },
              { id: "a3", speaker: "Reader B", speakerType: "reader", text: "Then let us test the consequence." },
            ],
          },
          {
            id: "sample-b",
            turns: [
              { id: "b1", speaker: "Reader A", speakerType: "candidate", text: "The premise needs a test. Its prediction matters here." },
              { id: "b2", speaker: "User", speakerType: "user", text: "I still disagree." },
              { id: "b3", speaker: "Reader B", speakerType: "reader", text: "Then let us test the consequence." },
            ],
          },
        ],
      }).guestSampleId,
    ).toBe("sample-b");
  });

  it("rejects an A/B case that changes a fixed turn", () => {
    const candidate = {
      version: 1 as const,
      id: "changed-context",
      language: "en" as const,
      book: {
        title: "A Book",
        author: "A Reader",
        genreFamily: "science_fiction" as const,
        sourceArtifacts: ["fixtures/a-book.md"],
      },
      guestCandidate: {
        id: "guest-reader",
        displayName: "An Imagined Reader",
        category: "analytical" as const,
        portrayalBasis: [
          "The portrayal tests claims against evidence before accepting a general rule.",
          "The reader distinguishes observations from explanations that go beyond them.",
          "The reader remains fallible and answers challenges from other participants.",
        ],
        sourceUrls: ["https://example.com/source-a", "https://example.com/source-b"],
      },
      fixedContext: {
        topic: "Which claim best explains the evidence raised at the table?",
        userClaims: ["The user's interpretation separates intention from consequence."],
        allowedBookEvidence: [
          "The table discussed one decision under uncertainty.",
          "Two readers disagreed about measurable consequences.",
          "The user asked how responsibility should be distributed.",
        ],
      },
      guestSampleId: "sample-b",
      samples: [
        {
          id: "sample-a",
          turns: [
            { id: "a1", speaker: "Reader A", speakerType: "candidate", text: "One claim remains contested. The evidence does not settle it." },
            { id: "a2", speaker: "User", speakerType: "user", text: "I still disagree." },
            { id: "a3", speaker: "Reader B", speakerType: "reader", text: "Then let us test the consequence." },
          ],
        },
        {
          id: "sample-b",
          turns: [
            { id: "b1", speaker: "Reader A", speakerType: "candidate", text: "The premise needs a test. Its prediction matters here." },
            { id: "b2", speaker: "User", speakerType: "user", text: "I changed my mind." },
            { id: "b3", speaker: "Reader B", speakerType: "reader", text: "Then let us test the consequence." },
          ],
        },
      ],
    };

    expect(() => guestAuditionCaseSchema.parse(candidate)).toThrow(/non-candidate turns/u);
  });

  it("requires a documented speech fingerprint for Round 2 cases", () => {
    const roundTwoWithoutFingerprint = {
      version: 1,
      id: "sample-case-r2",
      language: "en",
      book: {
        title: "A Book",
        author: "A Reader",
        genreFamily: "science_fiction",
        sourceArtifacts: ["fixtures/a-book.md"],
      },
      guestCandidate: {
        id: "guest-reader",
        displayName: "An Imagined Reader",
        category: "analytical",
        portrayalBasis: [
          "The portrayal tests claims against evidence before accepting a general rule.",
          "The reader distinguishes observations from explanations that go beyond them.",
          "The reader remains fallible and answers challenges from other participants.",
        ],
        sourceUrls: ["https://example.com/source-a", "https://example.com/source-b"],
      },
      fixedContext: {
        topic: "Which claim best explains the evidence raised at the table?",
        userClaims: ["The user's interpretation separates intention from consequence."],
        allowedBookEvidence: [
          "The table discussed one decision under uncertainty.",
          "Two readers disagreed about measurable consequences.",
          "The user asked how responsibility should be distributed.",
        ],
      },
      guestSampleId: "sample-b",
      samples: [
        {
          id: "sample-a",
          turns: [
            { id: "a1", speaker: "Reader A", speakerType: "candidate", text: "One claim remains contested. The evidence does not settle it." },
            { id: "a2", speaker: "User", speakerType: "user", text: "I still disagree." },
            { id: "a3", speaker: "Reader B", speakerType: "reader", text: "Then let us test the consequence." },
          ],
        },
        {
          id: "sample-b",
          turns: [
            { id: "b1", speaker: "Reader A", speakerType: "candidate", text: "The premise needs a test. Its prediction matters here." },
            { id: "b2", speaker: "User", speakerType: "user", text: "I still disagree." },
            { id: "b3", speaker: "Reader B", speakerType: "reader", text: "Then let us test the consequence." },
          ],
        },
      ],
    };

    expect(() => guestAuditionCaseSchema.parse(roundTwoWithoutFingerprint)).toThrow(
      /speechFingerprint/u,
    );
  });

  it("rejects an evaluation whose preference is not one of its samples", () => {
    expect(() =>
      guestAuditionEvaluationSchema.parse({
        version: 1,
        caseId: "sample-case",
        evaluatorId: "blind-reader-1",
        evaluations: [
          { sampleId: "sample-a", scores, citedTurnIds: ["a1"], rationale: "This sample stays specific to the evidence and answers the other participant directly." },
          { sampleId: "sample-b", scores, citedTurnIds: ["b1"], rationale: "This sample also stays specific to the evidence and answers the other participant directly." },
        ],
        preferredSampleId: "sample-c",
        hardFailures: [],
        redTeamNotes: "No disclosed safety violation was identified in the supplied exchange.",
      }),
    ).toThrow();
  });

  it("rejects live guest output outside the 2-4 sentence contract", () => {
    expect(() =>
      liveGuestOutputSchema.parse({
        turns: [
          { utterance: "This is only one sentence." },
          { utterance: "First. Second. Third. Fourth. Fifth." },
        ],
      }),
    ).toThrow(/2-4 sentences/u);
  });

  it("builds a blind live case without exposing the guest identity or mapping", () => {
    const template = guestAuditionCaseSchema.parse({
      version: 1,
      id: "template-case",
      language: "en",
      book: {
        title: "A Book",
        author: "A Reader",
        genreFamily: "science_fiction",
        sourceArtifacts: ["fixtures/a-book.md"],
      },
      guestCandidate: {
        id: "template-reader",
        displayName: "A Template Reader",
        category: "analytical",
        portrayalBasis: [
          "The portrayal tests claims against evidence before accepting a general rule.",
          "The reader distinguishes observations from explanations that go beyond them.",
          "The reader remains fallible and answers challenges from other participants.",
        ],
        sourceUrls: ["https://example.com/source-a", "https://example.com/source-b"],
      },
      fixedContext: {
        topic: "Which claim best explains the evidence raised at the table?",
        userClaims: ["The user's interpretation separates intention from consequence."],
        allowedBookEvidence: [
          "The table discussed one decision under uncertainty.",
          "Two readers disagreed about measurable consequences.",
          "The user asked how responsibility should be distributed.",
        ],
      },
      guestSampleId: "sample-b",
      samples: [
        {
          id: "sample-a",
          turns: [
            { id: "a1", speaker: "User", speakerType: "user", text: "I still disagree." },
            { id: "a2", speaker: "Reader X", speakerType: "candidate", text: "One claim remains contested. The evidence does not settle it." },
            { id: "a3", speaker: "User", speakerType: "user", text: "I need a clearer test." },
            { id: "a4", speaker: "Reader X", speakerType: "candidate", text: "Then test the premise. Its prediction matters here." },
          ],
        },
        {
          id: "sample-b",
          turns: [
            { id: "b1", speaker: "User", speakerType: "user", text: "I still disagree." },
            { id: "b2", speaker: "Reader X", speakerType: "candidate", text: "The premise needs a test. Its prediction matters here." },
            { id: "b3", speaker: "User", speakerType: "user", text: "I need a clearer test." },
            { id: "b4", speaker: "Reader X", speakerType: "candidate", text: "Another claim remains contested. The evidence still does not settle it." },
          ],
        },
      ],
    });
    const liveCase = buildLiveAuditionCase({
      id: "live-a-book-guest-reader-r3",
      template,
      candidate: {
        ...template.guestCandidate,
        id: "guest-reader",
        displayName: "An Imagined Historical Reader",
      },
      generatedTurns: [
        "The observation is useful. The verdict still needs support.",
        "That example narrows the claim. It does not settle the remaining risk.",
      ],
    });
    const packet = toBlindPacket(liveCase);

    expect(packet.samples).toHaveLength(2);
    expect(packet).not.toHaveProperty("guestCandidate");
    expect(packet).not.toHaveProperty("guestSampleId");
  });
});
