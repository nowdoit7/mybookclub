import { describe, expect, it, vi } from "vitest";

import { MockGenerationClient } from "../api/mockGenerationClient";
import { IncompleteGenerationError } from "../api/errors";
import { countSentences } from "./sentenceValidation";
import { SessionEngine } from "./sessionEngine";
import { PERSONAS } from "../personas";

describe("SessionEngine", () => {
  it("completes the five-stage deterministic demo session", async () => {
    const result = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
    });

    expect(result.state.stage).toBe("WRAP_UP");
    expect(result.state.transcript).toHaveLength(32);
    expect(result.state.tableMood).toBe("warm");
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
      result.state.activeTopic,
    ]);
    expect(result.recapMarkdown).toContain("## A question to sleep on");
    expect(result.recapMarkdown).toContain("## From the shelves");
    expect(result.state.transcript.at(-1)).toMatchObject({
      speaker: "moderator",
      stage: "WRAP_UP",
    });
    expect(result.state.transcript.at(-1)?.text).toContain("The recap");

    const topicOpening = result.state.transcript.find(
      ({ stage, speaker }) => stage === "DISCUSSION" && speaker === "moderator",
    );
    expect(topicOpening?.text).toContain(result.state.activeTopic);
    expect(topicOpening?.text).toContain("earlier conversation");
  });

  it("enforces speaker length and per-stage shelf budgets", async () => {
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
    });
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

  it("keeps first impressions non-adversarial and challenges the discussion position", async () => {
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
    });
    const firstImpressionChallenges = state.transcript.filter(
      (utterance) =>
        utterance.refersTo === "user" &&
        utterance.speaker !== "moderator" &&
        utterance.stage === "FIRST_IMPRESSIONS",
    );
    const discussionRepliesToUser = state.transcript.filter(
      (utterance) =>
        utterance.refersTo === "user" &&
        utterance.speaker !== "moderator" &&
        utterance.stage === "DISCUSSION",
    );

    expect(firstImpressionChallenges).toHaveLength(0);
    expect(discussionRepliesToUser).toHaveLength(2);
  });

  it("opens with a directed reader clash before the user joins", async () => {
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
    });
    const turns = state.transcript.filter(({ stage }) => stage === "DISCUSSION");
    const userIndexes = turns.flatMap((turn, index) =>
      turn.speaker === "user" ? [index] : [],
    );

    expect(turns).toHaveLength(11);
    expect(userIndexes).toHaveLength(2);
    expect(state.discussionRoles).toBeDefined();
    expect(turns[1]).toMatchObject({
      speaker: state.discussionRoles?.leadA,
      refersTo: state.discussionRoles?.leadB,
    });
    expect(turns[2]).toMatchObject({
      speaker: state.discussionRoles?.leadB,
      refersTo: state.discussionRoles?.leadA,
    });
    expect(turns[3]).toMatchObject({
      speaker: state.discussionRoles?.leadA,
      refersTo: state.discussionRoles?.leadB,
    });

    const challengeIndex = turns.findIndex(
      ({ speaker, refersTo }) =>
        speaker === state.discussionRoles?.challenger && refersTo === "user",
    );
    expect(challengeIndex).toBeGreaterThan(-1);
    expect(turns[challengeIndex].text.match(/[?？]/gu)).toHaveLength(1);
    expect(turns[challengeIndex + 1]?.speaker).toBe("user");
    expect(turns[challengeIndex + 2]?.speaker).toBe(state.discussionRoles?.challenger);
    expect(turns[challengeIndex + 3]?.speaker).toBe(state.discussionRoles?.supporter);

  });

  it("lets the user observe one bounded extension and then wrap without a forced position", async () => {
    const decisions = ["listen", "wrap"] as const;
    let decisionIndex = 0;
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
      async requestDiscussionAction({ canListen }) {
        const decision = decisions[decisionIndex];
        decisionIndex += 1;
        if (!canListen) expect(decision).not.toBe("listen");
        return decision;
      },
    });

    const discussion = state.transcript.filter(({ stage }) => stage === "DISCUSSION");
    expect(state.discussionListenCount).toBe(1);
    expect(decisionIndex).toBe(2);
    expect(discussion.filter(({ speaker }) => speaker === "user")).toHaveLength(0);
    expect(discussion).toHaveLength(7);
    expect(state.userStances[state.activeTopic!]).toBeUndefined();
  });

  it("continues safely when the user passes both discussion turns", async () => {
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
      userInputs: { discussion: "", discussionReply: "" },
    });

    expect(state.stage).toBe("WRAP_UP");
    expect(state.discussionRoles?.challenger).toBe("moderator");
    expect(
      state.transcript.filter(
        ({ stage, speaker }) => stage === "DISCUSSION" && speaker === "user",
      ),
    ).toHaveLength(0);
  });

  it("prepares every first impression before revealing any of them", async () => {
    const client = new MockGenerationClient();
    const originalGenerateUtterance = client.generateUtterance.bind(client);
    const firstImpressionContexts: string[][] = [];
    client.generateUtterance = async (input) => {
      if (input.task === "FIRST_IMPRESSION") {
        firstImpressionContexts.push(
          input.recentTranscript
            .filter(({ stage }) => stage === "FIRST_IMPRESSIONS")
            .map(({ speaker }) => speaker),
        );
      }
      return originalGenerateUtterance(input);
    };

    await new SessionEngine(client).run({ title: "A Reader-Selected Book", seed: "demo" });

    expect(firstImpressionContexts).toHaveLength(3);
    expect(firstImpressionContexts.every((speakers) => speakers.length === 1)).toBe(true);
    expect(firstImpressionContexts.every(([speaker]) => speaker === "moderator")).toBe(true);
  });

  it("prepares both memorable scenes as independent testimony", async () => {
    const client = new MockGenerationClient();
    const originalGenerateUtterance = client.generateUtterance.bind(client);
    const sceneContexts: string[][] = [];
    client.generateUtterance = async (input) => {
      if (input.task === "MEMORABLE_SCENE") {
        sceneContexts.push(input.recentTranscript.map(({ speaker }) => speaker));
      }
      return originalGenerateUtterance(input);
    };

    await new SessionEngine(client).run({ title: "A Reader-Selected Book", seed: "demo" });

    expect(sceneContexts).toHaveLength(2);
    expect(sceneContexts.every((speakers) => speakers.length === 1)).toBe(true);
    expect(sceneContexts.every(([speaker]) => speaker === "moderator")).toBe(true);
  });

  it("passes the user-selected table mood to every generated turn", async () => {
    const client = new MockGenerationClient();
    const originalGenerateUtterance = client.generateUtterance.bind(client);
    const moods: string[] = [];
    client.generateUtterance = async (input) => {
      moods.push(input.tableMood);
      return originalGenerateUtterance(input);
    };

    const { state } = await new SessionEngine(client).run({
      title: "A Reader-Selected Book",
      seed: "demo",
      tableMood: "playful",
    });

    expect(state.tableMood).toBe("playful");
    expect(moods.length).toBeGreaterThan(0);
    expect(new Set(moods)).toEqual(new Set(["playful"]));
  });

  it("pauses before every generated turn and accepts interactive user input", async () => {
    const suppliedInputs = [
      "Intro input",
      "First impression",
      "Scene input",
      "Topic position",
      "Answer to the challenge",
      "Closing thought",
    ];
    let advanceCount = 0;
    let inputCount = 0;
    let completionWaitCount = 0;
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
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

    expect(advanceCount).toBe(26);
    expect(inputCount).toBe(6);
    expect(completionWaitCount).toBe(1);
    expect(state.transcript.filter(({ speaker }) => speaker === "user").map(({ text }) => text)).toEqual(
      suppliedInputs,
    );
  });

  it("prefetches social introductions while private notes are still running", async () => {
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
      title: "A Reader-Selected Book",
      seed: "demo",
      waitForAdvance(turn) {
        return turn.task === "WELCOME" ? welcomeGate : Promise.resolve();
      },
    });

    await vi.waitFor(() => {
      expect(noteCallsStarted).toBe(3);
      expect(welcomeGenerationStarted).toBe(true);
    });

    await vi.waitFor(() => expect(introductionsStarted).toEqual(["maddie", "marcus", "dev"]));

    releaseWelcome();
    noteResolvers.get("maddie")?.();
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

    await expect(
      new SessionEngine(client).run({ title: "A Reader-Selected Book", seed: "demo" }),
    ).resolves.toMatchObject({
      state: { stage: "WRAP_UP" },
    });
    expect(Object.fromEntries(calls)).toEqual({ maddie: 1, marcus: 2, dev: 1 });
  });

  it("completes the same session contract in Korean", async () => {
    const result = await new SessionEngine(new MockGenerationClient()).run({
      title: "최근에 읽은 책",
      author: "독자가 입력한 저자",
      seed: "demo",
      language: "ko",
      userInputs: {
        intro: "혼자 읽을 때와 다른 관점을 듣고 싶어 참여했습니다.",
        firstImpression: "책이 던진 질문은 흥미로웠지만 제시 방식에는 조금 거리감이 있었습니다.",
        memorableScene: "앞에서 이해한 내용이 뒤집히는 대목이 가장 오래 남았습니다.",
        discussion: "한 가지 해석보다는 서로 다른 결과를 함께 설명하는 해석이 더 설득력 있다고 봅니다.",
        discussionReply: "그 반론에도 불구하고 결과까지 설명해야 한다는 생각은 유지하고 싶습니다.",
        wrapUp: "다른 관점을 들으며 처음 판단을 다시 확인하게 됐습니다.",
      },
    });

    expect(result.state.book.title).toBe("최근에 읽은 책");
    expect(result.state.transcript).toHaveLength(32);
    expect(result.state.transcript[0].text).toMatch(/[가-힣]/u);
    expect(result.recapMarkdown).toContain("## 토론 요약");
    expect(result.recapMarkdown).toContain("## 잠들기 전 생각할 질문");
  });

  it("keeps long user input in model context without rejecting the next turn", async () => {
    const client = new MockGenerationClient();
    const originalGenerateUtterance = client.generateUtterance.bind(client);
    const longArgument = "책임과 식민 맥락을 함께 살펴야 합니다. ".repeat(45).slice(0, 753);
    let capturedLatestUserTurn = "";
    client.generateUtterance = async (input) => {
      if (input.task === "CHALLENGE_USER") {
        capturedLatestUserTurn = [...input.recentTranscript]
          .reverse()
          .find(({ speaker }) => speaker === "user")?.text ?? "";
      }
      return originalGenerateUtterance(input);
    };

    await expect(
      new SessionEngine(client).run({
        title: "긴 문장으로 토론한 책",
        seed: "demo",
        language: "ko",
        userInputs: { discussion: longArgument },
      }),
    ).resolves.toMatchObject({ state: { stage: "WRAP_UP" } });
    expect(capturedLatestUserTurn).toBe(longArgument);
  });

  it("introduces the people and their work before anyone analyzes the book", async () => {
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "서로 소개하며 시작한 책",
      seed: "demo",
      language: "ko",
    });
    const introductions = state.transcript.filter(
      ({ stage, speaker }) => stage === "INTRO" && !["moderator", "user"].includes(speaker),
    );

    expect(introductions.map(({ text }) => text)).toEqual([
      expect.stringContaining("북톡"),
      expect.stringContaining("형사 변호사"),
      expect.stringContaining("소프트웨어 엔지니어"),
    ]);
    expect(introductions.every(({ text }) => !text.includes("서로 소개하며 시작한 책"))).toBe(true);

    const closings = state.transcript.filter(
      ({ stage, speaker }) => stage === "WRAP_UP" && !["moderator", "user"].includes(speaker),
    );
    expect(closings).toHaveLength(2);
    expect(new Set(closings.map(({ text }) => text)).size).toBe(2);
  });

  it("keeps every generated artifact independent from unrelated books", async () => {
    const title = "The Cartographer's Lantern";
    const result = await new SessionEngine(new MockGenerationClient()).run({
      title,
      author: "R. Vale",
      seed: "cross-book-regression",
      userInputs: {
        intro: "I joined to compare interpretations.",
        firstImpression: "The framing interested me, although I remain uncertain about its conclusion.",
        memorableScene: "The passage that changed the scale of the central question stayed with me.",
        discussion: "The strongest reading should explain both the form and its consequences.",
        wrapUp: "I am leaving with a more complicated version of my original view.",
      },
    });
    const serialized = JSON.stringify(result);

    expect(result.state.book).toMatchObject({ title, author: "R. Vale" });
    expect(result.recapMarkdown).toContain(title);
    expect(serialized).not.toMatch(/Meursault|Camus|courtroom|funeral/iu);
    for (const persona of PERSONAS.filter(
      ({ id }) => !result.state.personas.some((selected) => selected.id === id),
    )) {
      expect(result.recapMarkdown).not.toContain(persona.name);
    }
    for (const persona of result.state.personas) {
      expect(result.recapMarkdown).toContain(persona.name);
    }
  });
});
