import { describe, expect, it, vi } from "vitest";

import { MockGenerationClient } from "../api/mockGenerationClient";
import { IncompleteGenerationError } from "../api/errors";
import { countSentences } from "./sentenceValidation";
import { SessionEngine } from "./sessionEngine";

describe("SessionEngine", () => {
  it("completes the five-stage deterministic demo session", async () => {
    const result = await new SessionEngine(new MockGenerationClient()).run({ seed: "demo" });

    expect(result.state.stage).toBe("WRAP_UP");
    expect(result.state.transcript).toHaveLength(34);
    expect(new Set(result.state.transcript.map(({ stage }) => stage))).toEqual(
      new Set([
        "INTRO",
        "FIRST_IMPRESSIONS",
        "MEMORABLE_SCENES",
        "DISCUSSION",
        "WRAP_UP",
      ]),
    );
    expect(Object.keys(result.state.userStances)).toEqual([
      "overall_impression",
      result.state.book.candidateTopics[0],
    ]);
    expect(result.recapMarkdown).toContain("## A question to sleep on");
    expect(result.recapMarkdown).toContain("*A Little Life*");
    expect(result.recapMarkdown).not.toContain("*Twelve Angry Men*");
    expect(result.state.transcript.at(-1)).toMatchObject({
      speaker: "moderator",
      stage: "WRAP_UP",
    });
    expect(result.state.transcript.at(-1)?.text).toContain("meeting recap");

    const topicOpening = result.state.transcript.find(
      ({ stage, speaker }) => stage === "DISCUSSION" && speaker === "moderator",
    );
    expect(topicOpening?.text).toContain(result.state.book.candidateTopics[0]);
  });

  it("enforces speaker length and per-stage shelf budgets", async () => {
    const { state } = await new SessionEngine(new MockGenerationClient()).run({ seed: "demo" });
    const shelfKeys = state.transcript
      .filter(({ shelfRef }) => shelfRef)
      .map(({ stage, speaker }) => `${stage}:${speaker}`);

    expect(new Set(shelfKeys).size).toBe(shelfKeys.length);
    for (const utterance of state.transcript) {
      if (utterance.speaker === "user") continue;
      const sentenceCount = countSentences(utterance.text);
      if (utterance.speaker === "moderator") {
        expect(sentenceCount).toBeGreaterThanOrEqual(1);
        expect(sentenceCount).toBeLessThanOrEqual(3);
      } else {
        expect(sentenceCount).toBeGreaterThanOrEqual(2);
        expect(sentenceCount).toBeLessThanOrEqual(3);
      }
    }
  });

  it("always challenges the user's two extracted positions", async () => {
    const { state } = await new SessionEngine(new MockGenerationClient()).run({ seed: "demo" });
    const challengedUserTurns = state.transcript.filter(
      (utterance) =>
        utterance.refersTo === "user" &&
        utterance.speaker !== "moderator" &&
        (utterance.stage === "FIRST_IMPRESSIONS" || utterance.stage === "DISCUSSION"),
    );

    expect(challengedUserTurns).toHaveLength(2);
    expect(challengedUserTurns.map(({ stage }) => stage)).toEqual([
      "FIRST_IMPRESSIONS",
      "DISCUSSION",
    ]);
  });

  it("pauses before every generated turn and accepts interactive user input", async () => {
    const suppliedInputs = ["Intro input", "First impression", "Scene input", "Topic position", "Closing thought"];
    let advanceCount = 0;
    let inputCount = 0;
    let completionWaitCount = 0;
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      seed: "demo",
      async waitForAdvance() {
        advanceCount += 1;
      },
      async requestUserInput() {
        const value = suppliedInputs[inputCount];
        inputCount += 1;
        return value;
      },
      async waitForSessionComplete() {
        completionWaitCount += 1;
      },
    });

    expect(advanceCount).toBe(29);
    expect(inputCount).toBe(5);
    expect(completionWaitCount).toBe(1);
    expect(state.transcript.filter(({ speaker }) => speaker === "user").map(({ text }) => text)).toEqual(
      suppliedInputs,
    );
  });

  it("prefetches each introduction as that persona's note becomes ready", async () => {
    const client = new MockGenerationClient();
    const originalGenerateNotes = client.generateReadingNotes.bind(client);
    const originalGenerateUtterance = client.generateUtterance.bind(client);
    let releaseWelcome!: () => void;
    const welcomeGate = new Promise<void>((resolve) => {
      releaseWelcome = resolve;
    });
    const noteResolvers = new Map<string, () => void>();
    const noteGates = new Map(
      ["maddie", "marcus", "dev"].map((id) => [
        id,
        new Promise<void>((resolve) => noteResolvers.set(id, resolve)),
      ]),
    );
    let noteCallsStarted = 0;
    let welcomeGenerationStarted = false;
    const introductionsStarted: string[] = [];

    client.generateReadingNotes = async (input) => {
      noteCallsStarted += 1;
      await noteGates.get(input.persona.id);
      return originalGenerateNotes(input);
    };
    client.generateUtterance = async (input) => {
      if (input.task === "WELCOME") welcomeGenerationStarted = true;
      if (input.task === "PERSONA_INTRODUCTION" && input.speaker !== "moderator") {
        introductionsStarted.push(input.speaker.id);
      }
      return originalGenerateUtterance(input);
    };

    const run = new SessionEngine(client).run({
      seed: "demo",
      waitForAdvance(turn) {
        return turn.task === "WELCOME" ? welcomeGate : Promise.resolve();
      },
    });

    await vi.waitFor(() => {
      expect(noteCallsStarted).toBe(3);
      expect(welcomeGenerationStarted).toBe(true);
    });

    noteResolvers.get("maddie")?.();
    await vi.waitFor(() => expect(introductionsStarted).toContain("maddie"));
    expect(introductionsStarted).not.toContain("marcus");
    expect(introductionsStarted).not.toContain("dev");

    releaseWelcome();
    noteResolvers.get("marcus")?.();
    noteResolvers.get("dev")?.();
    await expect(run).resolves.toMatchObject({ state: { stage: "WRAP_UP" } });
  });

  it("retries only an incomplete persona note and preserves the other results", async () => {
    const client = new MockGenerationClient();
    const originalGenerateNotes = client.generateReadingNotes.bind(client);
    const calls = new Map<string, number>();

    client.generateReadingNotes = async (input) => {
      const count = (calls.get(input.persona.id) ?? 0) + 1;
      calls.set(input.persona.id, count);
      if (input.persona.id === "marcus" && count === 1) {
        throw new IncompleteGenerationError("max_output_tokens");
      }
      return originalGenerateNotes(input);
    };

    await expect(new SessionEngine(client).run({ seed: "demo" })).resolves.toMatchObject({
      state: { stage: "WRAP_UP" },
    });
    expect(Object.fromEntries(calls)).toEqual({ maddie: 1, marcus: 2, dev: 1 });
  });

  it("completes the same session contract in Korean", async () => {
    const result = await new SessionEngine(new MockGenerationClient()).run({
      seed: "demo",
      language: "ko",
      userInputs: {
        intro: "슬픔에 대해 다시 생각하려고 이 책을 펼쳤습니다.",
        firstImpression: "뫼르소는 정직하지만 여전히 책임이 있습니다.",
        memorableScene: "재판정 장면이 가장 오래 남았습니다.",
        discussion: "거리두기가 타인의 피해를 외면하는 태도가 됩니다.",
        wrapUp: "공감은 커졌지만 면죄할 수는 없습니다.",
      },
    });

    expect(result.state.book.title).toBe("이방인");
    expect(result.state.transcript).toHaveLength(34);
    expect(result.state.transcript[0].text).toMatch(/[가-힣]/u);
    expect(result.recapMarkdown).toContain("## 토론 요약");
    expect(result.recapMarkdown).toContain("## 잠들기 전 생각할 질문");
  });
});
