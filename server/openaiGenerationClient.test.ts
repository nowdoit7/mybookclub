import { describe, expect, it } from "vitest";

import {
  IncompleteGenerationError,
  InvalidStructuredOutputError,
  ModelRefusalError,
} from "../src/api/errors";
import {
  extractWebSearchSources,
  guestSignatureMomentRule,
  localizedRecapParticipants,
  personaPromptData,
  requireParsedOutput,
} from "./openaiGenerationClient";
import { GUEST_PERSONAS, selectPersonas } from "../src/personas";
import type { UtteranceRequest } from "../src/api/generationClient";

describe("OpenAI structured response handling", () => {
  it("recognizes an explicit safety refusal", () => {
    expect(() =>
      requireParsedOutput({
        status: "completed",
        output_parsed: null,
        output: [
          {
            content: [{ type: "refusal", refusal: "I cannot help with that." }],
          },
        ],
      }),
    ).toThrow(ModelRefusalError);
  });

  it("distinguishes token-limited incomplete output from a refusal", () => {
    expect(() =>
      requireParsedOutput({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_parsed: null,
        output: [],
      }),
    ).toThrow(IncompleteGenerationError);
  });

  it("distinguishes a completed but unparsed response from a refusal", () => {
    expect(() =>
      requireParsedOutput({
        status: "completed",
        incomplete_details: null,
        output_parsed: null,
        output: [],
      }),
    ).toThrow(InvalidStructuredOutputError);
  });

  it("returns parsed structured output", () => {
    const parsed = { value: "ready" };
    expect(
      requireParsedOutput({
        status: "completed",
        incomplete_details: null,
        output_parsed: parsed,
        output: [],
      }),
    ).toBe(parsed);
  });
});

describe("book verification source extraction", () => {
  it("uses only actual HTTPS sources returned by web search and removes duplicates", () => {
    expect(
      extractWebSearchSources({
        output: [
          {
            type: "web_search_call",
            action: {
              type: "search",
              sources: [
                { type: "url", url: "https://publisher.example/book" },
                { type: "url", url: "http://unsafe.example/book" },
              ],
            },
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://publisher.example/book",
                    title: "Publisher",
                  },
                  {
                    type: "url_citation",
                    url: "https://library.example/record",
                    title: "Library",
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual([
      { url: "https://publisher.example/book" },
      { url: "https://library.example/record" },
    ]);
  });
});

describe("recap participant labels", () => {
  it("uses localized display names instead of internal English persona names", () => {
    const newton = GUEST_PERSONAS.find(({ id }) => id === "isaac-newton")!;
    const dev = selectPersonas("demo").find(({ id }) => id === "dev")!;

    expect(localizedRecapParticipants([newton, dev], "ko")).toEqual([
      { id: "isaac-newton", name: "아이작 뉴턴" },
      { id: "dev", name: "데브" },
    ]);
  });
});

describe("imagined guest signature moment", () => {
  const requestFor = (
    speaker: UtteranceRequest["speaker"],
    task: UtteranceRequest["task"],
  ): UtteranceRequest => ({
    language: "en",
    roomAtmosphere: { warmth: 0.5, playfulness: 0.5, tension: 0.4, energy: 0.5 },
    book: {
      title: "A Neutral Reader-Selected Work",
      author: "A. Writer",
      workScope: "single_book",
      includedTitles: ["A Neutral Reader-Selected Work"],
      confirmedSummary: "A neutral fixture that supplies no genre, plot, character, or historical assumptions and exists only to exercise the prompt contract.",
      mainCharacters: ["A character"],
      candidateTopics: ["How should change be judged?", "What makes an action responsible?", "Which evidence changes an interpretation?"],
      verificationStatus: "mock",
      verificationNote: "Test fixture",
      sources: [],
    },
    speaker,
    stage: "FIRST_IMPRESSIONS",
    task,
    recentTranscript: [],
    allowShelfReference: false,
  });

  it.each(GUEST_PERSONAS)("offers $name one signature opportunity only in first impressions", (guest) => {
    const firstImpressionRule = guestSignatureMomentRule(
      requestFor(guest, "FIRST_IMPRESSION"),
    );
    expect(firstImpressionRule).toContain("single signature moment");
    expect(firstImpressionRule).toContain("Perform the characteristic move instead of explaining it");
    expect(firstImpressionRule).toContain("never say 'my reading method'");
    expect(firstImpressionRule).toContain("announce that the guest is imaginary");
    expect(guestSignatureMomentRule(requestFor(guest, "OPEN_PERSONA_POSITION"))).toContain(
      "Do not mention biography",
    );
  });

  it("does not add the guest rule to a regular reader", () => {
    const regular = selectPersonas("demo")[0];
    expect(guestSignatureMomentRule(requestFor(regular, "FIRST_IMPRESSION"))).toBe("");
  });

  it.each(GUEST_PERSONAS)("hides $name's achievement metadata after the signature turn", (guest) => {
    expect(personaPromptData(guest, true)).toHaveProperty(
      "imaginedGuest.documentedAchievement",
    );
    expect(personaPromptData(guest, false)).toEqual(
      expect.objectContaining({ imaginedGuest: { kind: guest.imaginedGuest?.kind } }),
    );
    expect(JSON.stringify(personaPromptData(guest, false))).not.toContain(
      guest.imaginedGuest?.documentedAchievement.en,
    );
  });
});
