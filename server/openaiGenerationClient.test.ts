import { describe, expect, it } from "vitest";

import {
  IncompleteGenerationError,
  InvalidStructuredOutputError,
  ModelRefusalError,
} from "../src/api/errors";
import {
  extractWebSearchSources,
  guestReadingNotesRule,
  guestSignatureMomentRule,
  localizedRecapParticipants,
  personaPromptData,
  requireParsedOutput,
} from "./openaiGenerationClient";
import { GUEST_PERSONAS, selectPersonas } from "../src/personas";
import type { UtteranceRequest } from "../src/api/generationClient";
import type { ConfirmedBook } from "../src/types";

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

    expect(localizedRecapParticipants([newton, dev], "ko", "우찬")).toEqual([
      { id: "isaac-newton", name: "아이작 뉴턴" },
      { id: "dev", name: "데브" },
      { id: "user", name: "우찬" },
    ]);
  });
});

describe("imagined guest signature moment", () => {
  const requestFor = (
    speaker: UtteranceRequest["speaker"],
    task: UtteranceRequest["task"],
    bookOverrides: Partial<ConfirmedBook> = {},
    language: UtteranceRequest["language"] = "en",
  ): UtteranceRequest => ({
    language,
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
      ...bookOverrides,
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

  it("gives Machiavelli one author-perspective moment for a verified edition of The Prince", () => {
    const machiavelli = GUEST_PERSONAS.find(({ id }) => id === "machiavelli")!;
    const firstImpressionRule = guestSignatureMomentRule(
      requestFor(machiavelli, "FIRST_IMPRESSION", {
        title: "군주론",
        author: "니콜로 마키아벨리",
        includedTitles: ["군주론"],
        verificationStatus: "verified",
      }, "ko"),
    );

    expect(firstImpressionRule).toContain("only author-perspective moment");
    expect(firstImpressionRule).toContain("내가 이 책을 쓸 때");
    expect(firstImpressionRule).toContain("first sentence must begin with the exact words");
    expect(firstImpressionRule).toContain("contestable interpretive claim");
    expect(firstImpressionRule).toContain("authorship does not make their interpretation final");
    expect(firstImpressionRule).toContain("undocumented hidden intention");

    const laterRule = guestSignatureMomentRule(
      requestFor(machiavelli, "OPEN_PERSONA_POSITION", {
        title: "군주론",
        author: "니콜로 마키아벨리",
        includedTitles: ["군주론"],
        verificationStatus: "verified",
      }, "ko"),
    );
    expect(laterRule).toContain("Do not repeat");
    expect(laterRule).toContain("without using authorship as proof");
  });

  it("keeps posthumous compilations historically constrained", () => {
    const pascal = GUEST_PERSONAS.find(({ id }) => id === "blaise-pascal")!;
    const request = requestFor(pascal, "FIRST_IMPRESSION", {
      title: "팡세",
      author: "블레즈 파스칼",
      includedTitles: ["팡세"],
      verificationStatus: "verified",
    }, "ko");

    const utteranceRule = guestSignatureMomentRule(request);
    expect(utteranceRule).toContain("남긴 단상");
    expect(utteranceRule).toContain("assembled or published after");
    expect(utteranceRule).toContain("Never claim the guest completed");
    expect(guestReadingNotesRule(pascal, request.book, "ko")).toContain(
      "present-day readers may reasonably resist",
    );
  });

  it("keeps traditionally attributed works distinct from certain singular authorship", () => {
    const homer = GUEST_PERSONAS.find(({ id }) => id === "homer")!;
    const rule = guestSignatureMomentRule(
      requestFor(homer, "FIRST_IMPRESSION", {
        title: "오디세이아",
        author: "호메로스",
        includedTitles: ["오디세이아"],
        verificationStatus: "verified",
      }, "ko"),
    );

    expect(rule).toContain("내 이름으로 전해진");
    expect(rule).toContain("traditionally attributed");
    expect(rule).toContain("Never claim certain singular authorship");
  });

  it("does not mistake a depicted figure for the book's author", () => {
    const socrates = GUEST_PERSONAS.find(({ id }) => id === "socrates")!;
    const request = requestFor(socrates, "FIRST_IMPRESSION", {
        title: "소크라테스의 변명",
        author: "플라톤",
        includedTitles: ["소크라테스의 변명"],
        verificationStatus: "verified",
      }, "ko");
    const rule = guestSignatureMomentRule(request);

    expect(rule).toContain("single signature moment");
    expect(rule).not.toContain("author-perspective");
    expect(guestReadingNotesRule(socrates, request.book, "ko")).toBe("");
  });
});
