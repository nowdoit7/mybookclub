import { describe, expect, it } from "vitest";

import { countSentences } from "../engine/sentenceValidation";
import { PERSONAS } from "../personas";
import type { AppLanguage, ConfirmedBook, PersonaCard, Utterance } from "../types";
import { MockGenerationClient } from "./mockGenerationClient";

const book: ConfirmedBook = {
  title: "A Reader-Selected Book",
  author: "A. Reader",
  workScope: "single_book",
  includedTitles: ["A Reader-Selected Book"],
  confirmedSummary: "A verified summary supplied for a deterministic mock session.",
  mainCharacters: [],
  candidateTopics: ["What remains unresolved?", "What changed?", "What matters most?"],
  verificationStatus: "mock",
  verificationNote: "Mock fixture",
  sources: [],
};

function persona(id: string): PersonaCard {
  const found = PERSONAS.find((candidate) => candidate.id === id);
  if (!found) throw new Error(`Missing persona fixture: ${id}`);
  return found;
}

function transcript(language: AppLanguage): Utterance[] {
  return ["maddie", "marcus", "jamal"].map((speaker) => ({
    speaker,
    text: language === "ko" ? "서로 다른 근거가 남았습니다." : "Different evidence remained in play.",
    stage: "DISCUSSION",
  }));
}

const roomAtmosphere = { warmth: 0.7, playfulness: 0.4, tension: 0.35, energy: 0.5 };

describe("MockGenerationClient", () => {
  it("returns deterministic, book-agnostic identification for any title", async () => {
    const client = new MockGenerationClient();
    const first = await client.identifyBook({ title: "A Reader-Selected Book", author: "A. Reader" });
    const second = await client.identifyBook({ title: "A Reader-Selected Book", author: "A. Reader" });

    expect(first).toEqual(second);
    expect(first.canonical_title).toBe("A Reader-Selected Book");
    expect(first.author).toBe("A. Reader");
    expect(first.work_scope).toBe("single_book");
    expect(first.included_titles).toEqual(["A Reader-Selected Book"]);
    expect(first.main_characters).toEqual([]);
    expect(first.candidate_topics).toHaveLength(3);
    expect(first.verification_status).toBe("mock");
    expect(first.sources).toEqual([]);
    expect(JSON.stringify(first)).not.toMatch(/Meursault|Camus|courtroom|funeral/iu);
  });

  it("keeps a requested series scope without inventing component volumes", async () => {
    const series = await new MockGenerationClient().identifyBook({
      title: "A Reader-Selected Series",
      author: "A. Reader",
      scope: "series",
    });

    expect(series.work_scope).toBe("series");
    expect(series.included_titles).toEqual([]);
    expect(series.verification_status).toBe("mock");
  });

  it("does not carry content from one arbitrary title into another", async () => {
    const client = new MockGenerationClient();
    const essay = await client.identifyBook({ title: "Notes on Attention", language: "en" });
    const novel = await client.identifyBook({ title: "달의 정원", language: "ko" });

    expect(essay.canonical_title).toBe("Notes on Attention");
    expect(novel.canonical_title).toBe("달의 정원");
    expect(essay.summary).not.toContain("달의 정원");
    expect(novel.summary).not.toContain("Notes on Attention");
  });

  it.each(["en", "ko"] as const)(
    "gives short, distinct closing takeaways with natural farewells in %s",
    async (language) => {
      const client = new MockGenerationClient();
      const outputs = await Promise.all(
        [persona("maddie"), persona("marcus"), persona("jamal")].map((speaker) =>
          client.generateUtterance({
            language,
            roomAtmosphere,
            book,
            speaker,
            stage: "WRAP_UP",
            task: "CLOSING_REFLECTION",
            recentTranscript: transcript(language),
            activeTopic: book.candidateTopics[0],
            allowShelfReference: false,
          }),
        ),
      );

      expect(outputs.every(({ utterance }) => countSentences(utterance) === 2)).toBe(true);
      expect(new Set(outputs.map(({ utterance }) => utterance)).size).toBe(3);
      expect(
        outputs.every(({ utterance }) =>
          language === "ko" ? /즐거/u.test(utterance) : /enjoy|loved/iu.test(utterance),
        ),
      ).toBe(true);
      expect(outputs.map(({ utterance }) => utterance).join(" ")).not.toMatch(/\b(?:should|must)\b|해야/u);
    },
  );

  it.each(["en", "ko"] as const)("has Alex thank the whole table before the written recap in %s", async (language) => {
    const output = await new MockGenerationClient().generateUtterance({
      language,
      roomAtmosphere,
      book,
      speaker: "moderator",
      stage: "WRAP_UP",
      task: "DISCUSSION_SUMMARY",
      recentTranscript: transcript(language),
      activeTopic: book.candidateTopics[0],
      allowShelfReference: false,
    });

    expect(countSentences(output.utterance)).toBeGreaterThanOrEqual(2);
    expect(countSentences(output.utterance)).toBeLessThanOrEqual(3);
    expect(output.utterance).toMatch(language === "ko" ? /모든 분께 고맙습니다/u : /Thank you all/iu);
    expect(output.utterance).toMatch(language === "ko" ? /모임 기록/u : /written recap/iu);
  });

  it("uses the supplied discussion focus as the memorable-scene anchor", async () => {
    const sceneAnchor = "the silent exchange at the station";
    const output = await new MockGenerationClient().generateUtterance({
      language: "en",
      roomAtmosphere,
      book,
      speaker: persona("maddie"),
      stage: "MEMORABLE_SCENES",
      task: "MEMORABLE_SCENE",
      recentTranscript: [],
      discussionFocus: sceneAnchor,
      allowShelfReference: false,
    });

    expect(output.utterance).toContain(sceneAnchor);
    expect(output.utterance).not.toContain("the book's central tension becomes clearest");
  });
});
