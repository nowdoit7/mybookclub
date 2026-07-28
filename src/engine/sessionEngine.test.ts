import { describe, expect, it, vi } from "vitest";

import { MockGenerationClient } from "../api/mockGenerationClient";
import { IncompleteGenerationError } from "../api/errors";
import { countSentences } from "./sentenceValidation";
import {
  resolveDirectlyAddressedPersona,
  selectAgendaRounds,
  SessionEngine,
} from "./sessionEngine";
import { GUEST_PERSONAS, PERSONAS, selectPersonas } from "../personas";

describe("SessionEngine", () => {
  it("completes the five-stage deterministic demo session", async () => {
    const result = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
    });

    expect(result.state.stage).toBe("WRAP_UP");
    expect(result.state.transcript).toHaveLength(37);
    expect(result.state.meetingPlan.assignments).toHaveLength(3);
    expect(new Set(result.state.meetingPlan.assignments.map(({ anchorId }) => anchorId)).size).toBe(3);
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
      result.state.meetingPlan.primaryPrompt,
      result.state.meetingPlan.reservePrompt,
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
    expect(topicOpening?.text).toContain(result.state.meetingPlan.primaryPrompt);
    expect(result.state.activeTopic).toBe(result.state.meetingPlan.reservePrompt);
    expect(result.state.agendaRounds.map(({ topic }) => topic)).toEqual([
      result.state.meetingPlan.primaryPrompt,
      result.state.meetingPlan.reservePrompt,
    ]);
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

  it("prepares one meeting plan before persona notes and passes each reader only their entrance", async () => {
    const client = new MockGenerationClient();
    const originalPrepareMeetingPlan = client.prepareMeetingPlan.bind(client);
    const originalGenerateNotes = client.generateReadingNotes.bind(client);
    const events: string[] = [];
    const assignedReaders: string[] = [];

    client.prepareMeetingPlan = async (input) => {
      events.push("plan");
      return originalPrepareMeetingPlan(input);
    };
    client.generateReadingNotes = async (input) => {
      events.push(`notes:${input.persona.id}`);
      expect(input.meetingPlan?.assignments).toHaveLength(3);
      expect(input.perspectiveAssignment?.personaId).toBe(input.persona.id);
      assignedReaders.push(input.perspectiveAssignment!.personaId);
      return originalGenerateNotes(input);
    };

    const { state } = await new SessionEngine(client).run({
      title: "A Reader-Selected Book",
      seed: "demo",
    });

    expect(events[0]).toBe("plan");
    expect(events.filter((event) => event.startsWith("plan"))).toHaveLength(1);
    expect(new Set(assignedReaders)).toEqual(new Set(state.personas.map(({ id }) => id)));
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

  it("keeps first impressions non-adversarial and expands the user's discussion response", async () => {
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
    expect(
      state.transcript
        .filter(
          ({ stage, speaker }) =>
            stage === "DISCUSSION" && !["moderator", "user"].includes(speaker),
        )
        .map(({ text }) => text)
        .join(" "),
    ).not.toMatch(
      /\b(?:counterexample|evidence|scope|defend|rebut)\b|반론|반박|반례|입증|증명|범위|근거/iu,
    );
  });

  it("runs two complete agenda rounds and invites the user once in each", async () => {
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
    });
    const turns = state.transcript.filter(({ stage }) => stage === "DISCUSSION");
    const personaIds = new Set(state.personas.map(({ id }) => id));

    expect(turns).toHaveLength(14);
    expect(state.agendaRounds).toHaveLength(2);
    expect(new Set(state.agendaRounds.map(({ lead }) => lead)).size).toBe(2);

    for (const [index, round] of state.agendaRounds.entries()) {
      const agenda = turns.slice(index * 7, index * 7 + 7);
      expect(agenda.map(({ speaker }) => speaker)).toEqual([
        "moderator",
        round.lead,
        round.responder,
        "moderator",
        "user",
        round.reflector,
        "moderator",
      ]);
      expect(agenda[1].refersTo).toBeUndefined();
      expect(agenda[2]).toMatchObject({ refersTo: round.lead });
      expect(agenda[5]).toMatchObject({ refersTo: "user" });
      expect(new Set(agenda.filter(({ speaker }) => personaIds.has(speaker)).map(({ speaker }) => speaker)))
        .toEqual(personaIds);
    }
  });

  it("assigns distinct prepared leads to the primary and reserve prompts", async () => {
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
    });

    const rounds = selectAgendaRounds(state.meetingPlan, state.personas, state.notes);
    expect(rounds.map(({ topic }) => topic)).toEqual([
      state.meetingPlan.primaryPrompt,
      state.meetingPlan.reservePrompt,
    ]);
    expect(rounds[0].lead).not.toBe(rounds[1].lead);
    rounds.forEach((round) => {
      expect(new Set([round.lead, round.responder, round.reflector])).toEqual(
        new Set(state.personas.map(({ id }) => id)),
      );
    });
  });

  it("keeps code-selected discussion targets when the model returns a different refers_to", async () => {
    const client = new MockGenerationClient();
    const originalGenerateUtterance = client.generateUtterance.bind(client);
    client.generateUtterance = async (input) => ({
      ...(await originalGenerateUtterance(input)),
      refers_to: input.targetSpeaker ? "wrong-reader" : null,
    });

    const { state } = await new SessionEngine(client).run({
      title: "A Reader-Selected Book",
      seed: "demo",
    });
    const directedTurns = state.transcript.filter(
      ({ stage, refersTo }) => stage === "DISCUSSION" && refersTo,
    );

    expect(directedTurns).not.toHaveLength(0);
    expect(directedTurns.every(({ refersTo }) => refersTo !== "wrong-reader")).toBe(true);
    expect(directedTurns[0]).toMatchObject({
      speaker: state.agendaRounds[0].responder,
      refersTo: state.agendaRounds[0].lead,
    });
  });

  it("recognizes one direct addressee but avoids guessing when several readers are named", () => {
    const personas = ["maddie", "marcus", "dev"].map(
      (id) => PERSONAS.find((persona) => persona.id === id)!,
    );

    expect(
      resolveDirectlyAddressedPersona("데브님, 이 부분은 어떻게 보셨어요?", personas, "ko")
        ?.id,
    ).toBe("dev");
    expect(
      resolveDirectlyAddressedPersona(
        "마커스님과 데브님 의견을 모두 듣고 싶어요.",
        personas,
        "ko",
      ),
    ).toBeUndefined();
  });

  it("keeps both agenda schedules in code-owned task order", async () => {
    const client = new MockGenerationClient();
    const originalGenerateUtterance = client.generateUtterance.bind(client);
    const discussionTasks: string[] = [];
    client.generateUtterance = async (input) => {
      if (input.stage === "DISCUSSION") discussionTasks.push(input.task);
      return originalGenerateUtterance(input);
    };

    await new SessionEngine(client).run({
      title: "A Reader-Selected Book",
      seed: "demo",
    });

    const committedTasks = discussionTasks.filter(
      (task, index) => index === 0 || task !== discussionTasks[index - 1],
    );
    expect(committedTasks).toEqual([
      "TOPIC_OPEN", "OPEN_PERSONA_POSITION", "CHALLENGE_PERSONA",
      "ASK_USER_POSITION", "BRIDGE_EXCHANGE", "TOPIC_CLOSE",
      "TOPIC_OPEN", "OPEN_PERSONA_POSITION", "CHALLENGE_PERSONA",
      "ASK_USER_POSITION", "BRIDGE_EXCHANGE", "TOPIC_CLOSE",
    ]);
  });

  it("uses both privately prepared prompts without re-ranking them mid-session", async () => {
    const client = new MockGenerationClient();
    const originalPrepareMeetingPlan = client.prepareMeetingPlan.bind(client);
    const firstTopic = "Which choice changed meaning after you saw its consequence?";
    const secondTopic = "Who gets to explain another person's life in this book?";
    client.prepareMeetingPlan = async (input) => {
      const base = await originalPrepareMeetingPlan(input);
      return {
        ...base,
        primary_prompt: firstTopic,
        reserve_prompt: secondTopic,
      };
    };

    const { state } = await new SessionEngine(client).run({
      title: "A Reader-Selected Book",
      seed: "demo",
    });

    expect(state.agendaRounds.map(({ topic }) => topic)).toEqual([firstTopic, secondTopic]);
    expect(state.activeTopic).toBe(secondTopic);
  });

  it("gives every reader, including an invited guest, a role in both agendas", async () => {
    const guest = GUEST_PERSONAS.find(({ id }) => id === "william-shakespeare")!;
    const personas = selectPersonas("demo", guest.id);
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
      personas,
    });

    state.agendaRounds.forEach((round) => {
      expect([round.lead, round.responder, round.reflector]).toContain(guest.id);
    });
  });

  it("continues safely when the user passes both discussion turns", async () => {
    const { state } = await new SessionEngine(new MockGenerationClient()).run({
      title: "A Reader-Selected Book",
      seed: "demo",
      userInputs: { discussion: "", discussionSecond: "" },
    });

    expect(state.stage).toBe("WRAP_UP");
    expect(
      state.transcript.filter(
        ({ stage, speaker }) => stage === "DISCUSSION" && speaker === "user",
      ),
    ).toHaveLength(0);
    expect(
      state.transcript.filter(
        ({ stage, speaker }) =>
          stage === "DISCUSSION" && state.personas.some(({ id }) => id === speaker),
      ),
    ).toHaveLength(6);
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

  it("prepares all three memorable scenes as independent, assigned testimony", async () => {
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

    expect(sceneContexts).toHaveLength(3);
    expect(sceneContexts.every((speakers) => speakers.length === 1)).toBe(true);
    expect(sceneContexts.every(([speaker]) => speaker === "moderator")).toBe(true);
    expect(sceneAnchors).toHaveLength(3);
    expect(new Set(sceneAnchors).size).toBe(3);
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

    expect(advanceCount).toBe(31);
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

  it("retries an incomplete recap once without rerunning the conversation", async () => {
    const client = new MockGenerationClient();
    const originalGenerateRecap = client.generateRecap.bind(client);
    let recapCalls = 0;
    client.generateRecap = async (input) => {
      recapCalls += 1;
      if (recapCalls === 1) throw new IncompleteGenerationError("max_output_tokens");
      return originalGenerateRecap(input);
    };

    await expect(
      new SessionEngine(client).run({ title: "A Reader-Selected Book", seed: "demo" }),
    ).resolves.toMatchObject({ state: { stage: "WRAP_UP" } });
    expect(recapCalls).toBe(2);
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
        memorableScene: "앞에서 이해한 내용이 뒤집히는 대목이 가장 기억에 남았습니다.",
        discussion: "한 가지 해석보다는 서로 다른 결과를 함께 설명하는 해석이 더 설득력 있다고 봅니다.",
        discussionSecond: "두 번째 발제에서는 의도와 결과를 나누어 살펴보고 싶습니다.",
        wrapUp: "다른 관점을 들으며 처음 판단을 다시 확인하게 됐습니다.",
      },
    });

    expect(result.state.book.title).toBe("최근에 읽은 책");
    expect(result.state.transcript).toHaveLength(37);
    expect(result.state.transcript[0].text).toMatch(/[가-힣]/u);
    expect(result.recapMarkdown).toContain("## 오늘 나눈 이야기");
    expect(result.recapMarkdown).toContain("## 잠들기 전 생각할 질문");
  });

  it("keeps long user input in model context without rejecting the next turn", async () => {
    const client = new MockGenerationClient();
    const originalGenerateUtterance = client.generateUtterance.bind(client);
    const longArgument = "책임과 식민 맥락을 함께 살펴야 합니다. ".repeat(45).slice(0, 753);
    let capturedLatestUserTurn = "";
    client.generateUtterance = async (input) => {
      if (input.task === "BRIDGE_EXCHANGE" && !capturedLatestUserTurn) {
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
      expect.stringContaining("책 영상"),
      expect.stringContaining("법정"),
      expect.stringContaining("소프트웨어"),
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
    expect(introductions.map(({ text }) => text).join(" ")).toMatch(/책 영상|법정|소프트웨어/u);
    const fallbackDialogue = state.transcript.map(({ text }) => text).join(" ");
    expect(fallbackDialogue).not.toContain("PRIVATE_SENTINEL");
    expect(fallbackDialogue).not.toContain("사용자");
    expect(fallbackDialogue).not.toContain("관점에서");
    expect(
      state.transcript
        .filter(({ stage, speaker }) => stage !== "INTRO" && !["moderator", "user"].includes(speaker))
        .map(({ text }) => text)
        .join(" "),
    ).not.toMatch(/(?:인 저는|인 제게|As a )/u);
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
