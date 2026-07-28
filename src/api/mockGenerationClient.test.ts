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
const participants = [
  { id: "moderator", displayName: "Alex", role: "moderator" as const },
  { id: "maddie", displayName: "Maddie", role: "reader" as const },
  { id: "marcus", displayName: "Marcus", role: "reader" as const },
  { id: "jamal", displayName: "Jamal", role: "reader" as const },
  { id: "user", displayName: "You", role: "user" as const },
];

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

  it("prepares distinct perspective entrances without assigning conclusions", async () => {
    const personas = [persona("maddie"), persona("marcus"), persona("jamal")];
    const plan = await new MockGenerationClient().prepareMeetingPlan({
      language: "ko",
      book,
      personas,
    });

    expect(plan.anchors).toHaveLength(8);
    expect(plan.assignments.map(({ persona_id }) => persona_id)).toEqual(
      personas.map(({ id }) => id),
    );
    expect(new Set(plan.assignments.map(({ anchor_id }) => anchor_id)).size).toBe(3);
    expect(plan.primary_prompt.match(/[?？]/gu)).toHaveLength(1);
    expect(JSON.stringify(plan.assignments)).not.toMatch(/찬성|반대|승리|정답|pro|con/iu);
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
            participants,
            activeTopic: book.candidateTopics[0],
            allowShelfReference: false,
          }),
        ),
      );

      expect(
        outputs.every(({ utterance }) => {
          const sentenceCount = countSentences(utterance);
          return sentenceCount >= 2 && sentenceCount <= 3;
        }),
      ).toBe(true);
      expect(new Set(outputs.map(({ utterance }) => utterance)).size).toBe(3);
      expect(
        outputs.every(({ utterance }) =>
          language === "ko"
            ? /즐거|좋았|만나/u.test(utterance)
            : /enjoy|loved|see you|until/iu.test(utterance),
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
      participants,
      activeTopic: book.candidateTopics[0],
      allowShelfReference: false,
    });

    expect(countSentences(output.utterance)).toBe(4);
    expect(output.utterance).toMatch(language === "ko" ? /고맙/u : /Thank you/iu);
    expect(output.utterance).toMatch(language === "ko" ? /모임 기록/u : /written recap/iu);
  });

  it.each(["en", "ko"] as const)(
    "asks the user about their scene without forcing debate in %s",
    async (language) => {
      const output = await new MockGenerationClient().generateUtterance({
        language,
        roomAtmosphere,
        book,
        speaker: persona("marcus"),
        stage: "DISCUSSION",
        task: "CHALLENGE_USER",
        recentTranscript: transcript(language),
        participants,
        activeTopic: book.candidateTopics[0],
        targetSpeaker: "user",
        userArgument: { stance: 0, paraphrase: language === "ko" ? "저는 슬펐어요." : "I felt sad." },
        allowShelfReference: false,
      });

      expect(output.utterance.match(/[?？]/gu)).toHaveLength(1);
      expect(output.utterance).not.toMatch(
        language === "ko"
          ? /반론|반박|반례|입증|증명|범위|근거/u
          : /rebut|counterexample|prove|evidence|scope|defend/iu,
      );
    },
  );

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
      participants,
      discussionFocus: sceneAnchor,
      allowShelfReference: false,
    });

    expect(output.utterance).toContain(sceneAnchor);
    expect(output.utterance).not.toContain("the book's central tension becomes clearest");
  });
});
