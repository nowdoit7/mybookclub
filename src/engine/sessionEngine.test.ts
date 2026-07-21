import { describe, expect, it, vi } from "vitest";

import { MockGenerationClient } from "../api/mockGenerationClient";
import { IncompleteGenerationError } from "../api/errors";
import { countSentences } from "./sentenceValidation";
import { SessionEngine } from "./sessionEngine";
import { GUEST_PERSONAS, PERSONAS, selectPersonas } from "../personas";

describe("SessionEngine", () => {
  it("completes the five-stage deterministic demo session", async () => {
    const result = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
    });

    expect(result.state.stage).toBe("WRAP_UP");
    expect(result.state.transcript).toHaveLength(31);
    expect(Object.values(result.state.roomAtmosphere).every((value) => value >= 0 && value <= 1)).toBe(
      true,
    );
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
    expect(result.state.transcript.at(-1)?.text).toContain("written recap");

    const topicOpening = result.state.transcript.find(
      ({ stage, speaker }) => stage === "DISCUSSION" && speaker === "moderator",
    );
    expect(topicOpening?.text).toContain(result.state.activeTopic);
    expect(topicOpening?.text).toContain("earlier conversation");
  });

  it("uses an explicitly selected three-reader roster", async () => {
    const personas = selectPersonas("demo", GUEST_PERSONAS[0].id);
    const result = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
      personas,
    });

    expect(result.state.personas.map(({ id }) => id)).toEqual(personas.map(({ id }) => id));
    expect(result.state.transcript.some(({ speaker }) => speaker === GUEST_PERSONAS[0].id)).toBe(true);
    expect(
      result.state.transcript.find(
        ({ speaker, stage }) => speaker === GUEST_PERSONAS[0].id && stage === "INTRO",
      )?.text,
    ).toContain("imagined guest");
  });

  it("rejects an injected roster that breaks the three-category invariant", async () => {
    const personas = selectPersonas("demo");

    await expect(
      new SessionEngine(new MockGenerationClient()).run({
        title: "A Reader-Selected Book",
        personas: [personas[0], personas[1], PERSONAS.find(({ id }) => id === "eleanor")!],
      }),
    ).rejects.toThrow("three unique personas, one from each category");
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
        expect(sentenceCount).toBeLessThanOrEqual(
          utterance === state.transcript.at(-1) ? 4 : 3,
        );
      } else {
        expect(sentenceCount).toBeGreaterThanOrEqual(2);
        expect(sentenceCount).toBeLessThanOrEqual(4);
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

    expect(turns).toHaveLength(9);
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
    expect(turns[3]).toMatchObject({ speaker: "moderator" });
    expect(
      turns.slice(0, 3).filter(({ speaker }) => speaker !== "moderator"),
    ).toHaveLength(2);

    const challengeIndex = turns.findIndex(
      ({ speaker, refersTo }) =>
        speaker === state.discussionRoles?.challenger && refersTo === "user",
    );
    expect(challengeIndex).toBeGreaterThan(-1);
    expect(turns[challengeIndex].text.match(/[?？]/gu)).toHaveLength(1);
    expect(turns[challengeIndex + 1]?.speaker).toBe("user");
    expect(turns[challengeIndex + 2]?.speaker).toBe(state.discussionRoles?.challenger);
    expect(turns[challengeIndex + 3]?.speaker).toBe(state.discussionRoles?.bridgeReader);
    expect(
      new Set(
        turns
          .filter(({ speaker }) => state.personas.some(({ id }) => id === speaker))
          .map(({ speaker }) => speaker),
      ),
    ).toEqual(new Set(state.personas.map(({ id }) => id)));
  });

  it("uses a code-owned three-turn opening before the first discussion checkpoint", async () => {
    const client = new MockGenerationClient();
    const originalGenerateUtterance = client.generateUtterance.bind(client);
    const discussionTasks: string[] = [];
    let tasksAtCheckpoint: string[] = [];
    client.generateUtterance = async (input) => {
      if (input.stage === "DISCUSSION") discussionTasks.push(input.task);
      return originalGenerateUtterance(input);
    };

    await new SessionEngine(client).run({
      title: "A Reader-Selected Book",
      seed: "demo",
      requestDiscussionAction(turn) {
        if (turn.phase === "before_join") tasksAtCheckpoint = [...discussionTasks];
        return Promise.resolve("wrap");
      },
    });

    const committedTaskOrder = tasksAtCheckpoint.filter(
      (task, index) => index === 0 || task !== tasksAtCheckpoint[index - 1],
    );
    expect(committedTaskOrder).toEqual([
      "TOPIC_OPEN",
      "OPEN_PERSONA_POSITION",
      "CHALLENGE_PERSONA",
    ]);
  });

  it("weights a user-backed thread above a generally relevant but user-distant topic", async () => {
    const client = new MockGenerationClient();
    const originalExtractFocus = client.extractDiscussionFocus.bind(client);
    let expectedTopic = "";
    client.extractDiscussionFocus = async (input) => {
      const base = await originalExtractFocus(input);
      expectedTopic = input.book.candidateTopics[1];
      return {
        ...base,
        topic_scores: input.book.candidateTopics.map((topic, index) => ({
          topic,
          relevance: index === 0 ? 2 : index === 1 ? 1 : 0,
          evidence: `Table evidence ${index}`,
          user_relevance: index === 1 ? 2 : 0,
          user_evidence: index === 1 ? "The user's memorable scene supports this thread." : null,
        })),
        emergent_question: null,
        emergent_relevance: 0,
        emergent_evidence: null,
        emergent_user_relevance: 0,
      };
    };

    const { state } = await new SessionEngine(client).run({
      title: "A Reader-Selected Book",
      seed: "demo",
    });

    expect(state.activeTopic).toBe(expectedTopic);
  });

  it("lets the same challenger answer before a third reader bridges the exchange", async () => {
    const actions = ["join", "join", "wrap"] as const;
    let actionIndex = 0;
    const followUp = "I want to add one more distinction about responsibility.";
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
      userInputs: { discussionFollowUp: followUp },
      requestDiscussionAction() {
        return Promise.resolve(actions[actionIndex++] ?? "wrap");
      },
    });

    const discussion = state.transcript.filter(({ stage }) => stage === "DISCUSSION");
    const challengeIndex = discussion.findIndex(
      ({ speaker, refersTo }) =>
        speaker === state.discussionRoles?.challenger && refersTo === "user",
    );
    const followUpIndex = discussion.findIndex(({ text }) => text === followUp);
    expect(challengeIndex).toBeGreaterThan(-1);
    expect(discussion[challengeIndex + 1]?.speaker).toBe("user");
    expect(discussion[challengeIndex + 2]?.speaker).toBe(state.discussionRoles?.challenger);
    expect(discussion[challengeIndex + 3]?.speaker).toBe(state.discussionRoles?.bridgeReader);
    expect(followUpIndex).toBeGreaterThan(challengeIndex);
    expect(discussion[followUpIndex + 1]).toMatchObject({ refersTo: "user" });
  });

  it("uses a reader rather than the moderator when every stance is close to the user", async () => {
    const client = new MockGenerationClient();
    const originalGenerateNotes = client.generateReadingNotes.bind(client);
    client.generateReadingNotes = async (input) => {
      const output = await originalGenerateNotes(input);
      return {
        ...output,
        overall_stance: 0,
        stance_by_topic: output.stance_by_topic.map((item) => ({ ...item, stance: 0 })),
      };
    };
    client.extractUserStance = async (input) => ({
      stance: 0,
      paraphrase: input.text.trim().slice(0, 240) || "No position was offered.",
    });

    const { state } = await new SessionEngine(client).run({
      title: "A Reader-Selected Book",
      seed: "demo",
    });

    expect(state.discussionRoles?.challenger).not.toBe("moderator");
    expect(state.personas.some(({ id }) => id === state.discussionRoles?.challenger)).toBe(true);
  });

  it("gives an explicitly invited imagined guest a turn in the main discussion", async () => {
    const guest = GUEST_PERSONAS.find(({ id }) => id === "william-shakespeare")!;
    const personas = selectPersonas("demo", guest.id);
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
      personas,
    });

    expect(
      state.transcript.some(
        ({ stage, speaker }) => stage === "DISCUSSION" && speaker === guest.id,
      ),
    ).toBe(true);
    expect([state.discussionRoles?.leadA, state.discussionRoles?.leadB]).toContain(guest.id);
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
    expect(discussion).toHaveLength(5);
    expect(state.userStances[state.activeTopic!]).toBeUndefined();
  });

  it("lets the user extend the clash twice after joining and choose when to wrap", async () => {
    const checkpoints: Array<{ phase: string; canListen: boolean }> = [];
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
      async requestDiscussionAction(turn) {
        checkpoints.push({ phase: turn.phase, canListen: turn.canListen });
        return turn.phase === "before_join" ? "join" : "wrap";
      },
    });

    expect(checkpoints).toEqual([
      { phase: "before_join", canListen: true },
      { phase: "after_join", canListen: true },
    ]);
    expect(state.discussionListenCount).toBe(0);
  });

  it("caps post-join extensions at two reader exchanges", async () => {
    const checkpoints: Array<{ phase: string; canListen: boolean; round: number }> = [];
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
      async requestDiscussionAction(turn) {
        checkpoints.push({ phase: turn.phase, canListen: turn.canListen, round: turn.round });
        return turn.phase === "before_join" ? "join" : "listen";
      },
    });

    expect(checkpoints).toEqual([
      { phase: "before_join", canListen: true, round: 0 },
      { phase: "after_join", canListen: true, round: 1 },
      { phase: "after_join", canListen: true, round: 2 },
    ]);
    expect(state.discussionListenCount).toBe(2);
    const discussion = state.transcript.filter(({ stage }) => stage === "DISCUSSION");
    const extension = discussion.slice(-4);
    expect(extension).toHaveLength(4);
    for (let index = 0; index < extension.length; index += 2) {
      expect(extension[index].speaker).not.toBe(extension[index + 1].speaker);
      expect(extension[index + 1].refersTo).toBe(extension[index].speaker);
    }
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

  it("retries an author guest's first impression when the author opening is omitted", async () => {
    const client = new MockGenerationClient();
    const originalIdentifyBook = client.identifyBook.bind(client);
    const originalGenerateUtterance = client.generateUtterance.bind(client);
    let machiavelliFirstImpressionCalls = 0;
    let repairMessage = "";

    client.identifyBook = async (input) => ({
      ...(await originalIdentifyBook(input)),
      canonical_title: "군주론",
      author: "니콜로 마키아벨리",
      included_titles: ["군주론"],
      verification_status: "verified" as const,
      verification_note: "Verified author-mode test fixture",
      sources: [
        { url: "https://library.example/the-prince" },
        { url: "https://publisher.example/the-prince" },
      ],
    });
    client.generateUtterance = async (input) => {
      const output = await originalGenerateUtterance(input);
      if (input.task !== "FIRST_IMPRESSION" || input.speaker === "moderator" || input.speaker.id !== "machiavelli") {
        return output;
      }

      machiavelliFirstImpressionCalls += 1;
      repairMessage = input.validationError ?? repairMessage;
      return {
        ...output,
        utterance:
          machiavelliFirstImpressionCalls === 1
            ? "이 작품은 권력의 압박을 정직하게 바라봅니다. 그러나 진단이 면죄부가 되어서는 안 됩니다."
            : "내가 이 책을 쓸 때 권력의 압박을 미화하기보다 드러내고자 했습니다. 그러나 그 진단이 면죄부가 될 수 있다는 반론은 피하지 않겠습니다.",
      };
    };

    const { state } = await new SessionEngine(client).run({
      language: "ko",
      title: "군주론",
      author: "니콜로 마키아벨리",
      personas: selectPersonas("demo", "machiavelli"),
    });
    const authorTurn = state.transcript.find(
      ({ speaker, stage }) => speaker === "machiavelli" && stage === "FIRST_IMPRESSIONS",
    );

    expect(machiavelliFirstImpressionCalls).toBe(2);
    expect(repairMessage).toContain("exact author-perspective words");
    expect(authorTurn?.text).toMatch(/^내가 이 책을 쓸 때/u);
  });

  it("prepares both memorable scenes as independent testimony", async () => {
    const client = new MockGenerationClient();
    const originalGenerateNotes = client.generateReadingNotes.bind(client);
    const originalGenerateUtterance = client.generateUtterance.bind(client);
    const sceneContexts: string[][] = [];
    const sceneAnchors: string[] = [];
    client.generateReadingNotes = async (input) => {
      const output = await originalGenerateNotes(input);
      return {
        ...output,
        key_scenes: [
          "Yun Tianming tells the encoded fairy tales under surveillance.",
          `${input.persona.name} notices a different quiet turning point.`,
        ],
      };
    };
    client.generateUtterance = async (input) => {
      if (input.task === "MEMORABLE_SCENE") {
        sceneContexts.push(input.recentTranscript.map(({ speaker }) => speaker));
        sceneAnchors.push(input.discussionFocus ?? "");
      }
      return originalGenerateUtterance(input);
    };

    await new SessionEngine(client).run({ title: "A Reader-Selected Book", seed: "demo" });

    expect(sceneContexts).toHaveLength(2);
    expect(sceneContexts.every((speakers) => speakers.length === 1)).toBe(true);
    expect(sceneContexts.every(([speaker]) => speaker === "moderator")).toBe(true);
    expect(sceneAnchors).toHaveLength(2);
    expect(sceneAnchors[0]).toContain("Yun Tianming");
    expect(sceneAnchors[1]).not.toContain("Yun Tianming");
  });

  it("derives and updates room atmosphere without another model operation", async () => {
    const client = new MockGenerationClient();
    const originalGenerateUtterance = client.generateUtterance.bind(client);
    const atmospheres: string[] = [];
    client.generateUtterance = async (input) => {
      atmospheres.push(JSON.stringify(input.roomAtmosphere));
      return originalGenerateUtterance(input);
    };

    const { state } = await new SessionEngine(client).run({
      title: "A Reader-Selected Book",
      seed: "demo",
      userInputs: {
        intro: "반갑습니다. 다른 관점을 듣고 싶어서 왔어요 ㅎㅎ 재미있게 이야기해 봐요!",
      },
    });

    expect(atmospheres.length).toBeGreaterThan(0);
    expect(new Set(atmospheres).size).toBeGreaterThan(1);
    expect(state.roomAtmosphere.playfulness).toBeGreaterThan(0.4);
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

    expect(advanceCount).toBe(25);
    expect(inputCount).toBe(6);
    expect(completionWaitCount).toBe(1);
    expect(state.transcript.filter(({ speaker }) => speaker === "user").map(({ text }) => text)).toEqual(
      suppliedInputs,
    );
  });

  it("prefetches introductions while limiting private-note generation to two calls", async () => {
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
    let activeNoteCalls = 0;
    let maxActiveNoteCalls = 0;
    let welcomeGenerationStarted = false;
    const introductionsStarted: string[] = [];

    client.generateReadingNotes = async (input) => {
      noteCallsStarted += 1;
      activeNoteCalls += 1;
      maxActiveNoteCalls = Math.max(maxActiveNoteCalls, activeNoteCalls);
      try {
        await noteGates.get(input.persona.id);
        return originalGenerateNotes(input);
      } finally {
        activeNoteCalls -= 1;
      }
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
      expect(noteCallsStarted).toBe(2);
      expect(welcomeGenerationStarted).toBe(true);
    });

    await vi.waitFor(() => expect(introductionsStarted).toEqual(["maddie", "marcus", "dev"]));

    releaseWelcome();
    noteResolvers.get("maddie")?.();
    await vi.waitFor(() => expect(noteCallsStarted).toBe(3));
    noteResolvers.get("marcus")?.();
    noteResolvers.get("dev")?.();
    await expect(run).resolves.toMatchObject({ state: { stage: "WRAP_UP" } });
    expect(maxActiveNoteCalls).toBe(2);
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

  it("retries a transient reading-note connection failure once", async () => {
    const client = new MockGenerationClient();
    const originalGenerateNotes = client.generateReadingNotes.bind(client);
    const calls = new Map<string, number>();

    client.generateReadingNotes = async (input) => {
      const count = (calls.get(input.persona.id) ?? 0) + 1;
      calls.set(input.persona.id, count);
      if (input.persona.id === "marcus" && count === 1) {
        throw { code: "openai_connection_failed", status: 502 };
      }
      return originalGenerateNotes(input);
    };

    await expect(
      new SessionEngine(client).run({ title: "A Reader-Selected Book", seed: "demo" }),
    ).resolves.toMatchObject({ state: { stage: "WRAP_UP" } });
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
    expect(result.state.transcript).toHaveLength(31);
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
    expect(closings).toHaveLength(3);
    expect(new Set(closings.map(({ text }) => text)).size).toBe(3);
  });

  it("uses persona-specific fallbacks and reports them as operational diagnostics", async () => {
    const client = new MockGenerationClient();
    const originalGenerateNotes = client.generateReadingNotes.bind(client);
    const originalGenerateUtterance = client.generateUtterance.bind(client);
    client.generateReadingNotes = async (input) => {
      const output = await originalGenerateNotes(input);
      return {
        ...output,
        overall_take: "PRIVATE_SENTINEL must never appear in fallback dialogue. This remains private.",
        stance_by_topic: output.stance_by_topic.map((item) => ({
          ...item,
          reason: "PRIVATE_SENTINEL reason must stay private.",
        })),
      };
    };
    client.generateUtterance = async (input) =>
      input.speaker === "moderator"
        ? originalGenerateUtterance(input)
        : {
            utterance: "Too short.",
            stance: 0,
            refers_to: input.targetSpeaker ?? null,
            shelf_ref: null,
          };
    const statuses: string[] = [];
    const { state } = await new SessionEngine(client, {
      onStatus: (message) => statuses.push(message),
    }).run({ title: "Fallback Test Book", seed: "demo", language: "ko" });
    const introductions = state.transcript.filter(
      ({ stage, speaker }) => stage === "INTRO" && !["moderator", "user"].includes(speaker),
    );

    expect(new Set(introductions.map(({ text }) => text)).size).toBe(3);
    expect(introductions.map(({ text }) => text).join(" ")).toMatch(/북톡|형사 변호사|소프트웨어 엔지니어/u);
    const fallbackDialogue = state.transcript.map(({ text }) => text).join(" ");
    expect(fallbackDialogue).not.toContain("PRIVATE_SENTINEL");
    expect(fallbackDialogue).not.toContain("사용자");
    expect(fallbackDialogue).not.toContain("관점에서");
    const closings = state.transcript.filter(
      ({ stage, speaker }) => stage === "WRAP_UP" && !["moderator", "user"].includes(speaker),
    );
    expect(new Set(closings.map(({ text }) => text)).size).toBe(3);
    expect(statuses.some((message) => message.startsWith("Quality fallback: task="))).toBe(true);
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
