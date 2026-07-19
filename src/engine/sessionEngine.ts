import type {
  BookIdentificationOutput,
  DiscussionFocusOutput,
  ReadingNotesOutput,
  RecapOutput,
  UtteranceOutput,
} from "../api/contracts";
import type {
  GenerationClient,
  RecapRequest,
  UtteranceRequest,
  UtteranceTask,
} from "../api/generationClient";
import {
  IncompleteGenerationError,
  InvalidStructuredOutputError,
} from "../api/errors";
import { selectPersonas } from "../personas";
import type {
  CompletedSession,
  AppLanguage,
  ConfirmedBook,
  PersonaCard,
  ReadingNotes,
  DiscussionFocus,
  DiscussionAction,
  RoomAtmosphere,
  SessionState,
  StageId,
  UserTurnKind,
  Utterance,
} from "../types";
import {
  validateReadingNotesQuality,
  validateRecapQuality,
  validateUtteranceQuality,
} from "./qualityValidation";
import { prepareTranscriptContext } from "./transcriptContext";
import {
  deriveInitialAtmosphere,
  updateAtmosphereForTask,
  updateAtmosphereFromUser,
} from "./roomAtmosphere";

export interface ScriptedUserInputs {
  intro: string;
  firstImpression: string;
  memorableScene: string;
  discussion: string;
  discussionReply: string;
  wrapUp: string;
}

export interface RunSessionOptions {
  language?: AppLanguage;
  title?: string;
  author?: string;
  scope?: "single_book" | "series";
  confirmedBook?: ConfirmedBook;
  seed?: string;
  userInputs?: Partial<ScriptedUserInputs>;
  onUtterance?: (utterance: Utterance) => void;
  onAtmosphereChange?: (atmosphere: RoomAtmosphere) => void;
  onStatus?: (message: string) => void;
  waitForAdvance?: (turn: {
    stage: StageId;
    task: UtteranceTask;
    speaker: PersonaCard | "moderator";
  }) => Promise<void>;
  requestUserInput?: (turn: {
    stage: StageId;
    target?: string;
    kind: UserTurnKind;
  }) => Promise<string>;
  requestDiscussionAction?: (turn: {
    round: number;
    canListen: boolean;
  }) => Promise<DiscussionAction>;
  waitForSessionComplete?: (summary: Utterance) => Promise<void>;
}

const SIMULATED_USER_INPUTS: ScriptedUserInputs = {
  intro:
    "I usually read alone, and I came because I wanted to hear how differently other people experienced the same book.",
  firstImpression:
    "My first response was mixed: I was drawn to the book's central tension, but I was not fully persuaded by how it framed that tension.",
  memorableScene:
    "The moment when the book's central tension became hardest to ignore stayed with me after I finished reading.",
  discussion:
    "I think the strongest interpretation has to account for both the book's choices and the consequences those choices leave unresolved.",
  discussionReply:
    "That objection matters, but I still think my reading holds if we distinguish the character's intention from the consequences the book shows us.",
  wrapUp:
    "I am leaving with a wider view of the book, although I still want to test my original response against the other readings I heard.",
};

export function toConfirmedBook(output: BookIdentificationOutput): ConfirmedBook {
  return {
    title: output.canonical_title,
    author: output.author,
    workScope: output.work_scope,
    includedTitles: output.included_titles,
    confirmedSummary: output.summary,
    mainCharacters: output.main_characters,
    candidateTopics: output.candidate_topics,
    verificationStatus: output.verification_status,
    verificationNote: output.verification_note,
    sources: output.sources,
  };
}

function normalizeNotes(output: ReadingNotesOutput): ReadingNotes {
  return {
    overallTake: output.overall_take,
    overallStance: output.overall_stance,
    stanceByTopic: output.stance_by_topic,
    keyScenes: output.key_scenes,
    shelfConnections: output.shelf_connections,
    personalReaction: output.personal_reaction,
    unresolvedQuestion: output.unresolved_question,
    possibleRevision: output.possible_revision,
    questionForTable: output.question_for_table,
  };
}

function normalizeDiscussionFocus(output: DiscussionFocusOutput): DiscussionFocus {
  return {
    topicScores: output.topic_scores,
    emergentQuestion: output.emergent_question ?? undefined,
    emergentRelevance: output.emergent_relevance,
    emergentEvidence: output.emergent_evidence ?? undefined,
  };
}

function getTopicStance(notes: ReadingNotes, topic: string): number {
  return notes.stanceByTopic.find((item) => item.topic === topic)?.stance ?? notes.overallStance;
}

type GenerationOptions = Partial<
  Pick<UtteranceRequest, "activeTopic" | "targetSpeaker" | "userArgument" | "discussionFocus">
> & { allowShelfReference?: boolean };

export function selectDiscussionTopic(
  book: ConfirmedBook,
  personas: PersonaCard[],
  notes: Record<string, ReadingNotes>,
  focus?: DiscussionFocus,
): { topic: string; evidence?: string } {
  const phraseOnly = (value?: string) =>
    value?.replace(/[.!?。？！]+/gu, ",").replace(/,+$/u, "").slice(0, 180);
  const topicSpread = (topic: string) => {
    const stances = personas.map((persona) => getTopicStance(notes[persona.id], topic));
    return Math.max(...stances) - Math.min(...stances);
  };
  const candidates = book.candidateTopics.map((topic) => {
    const extracted = focus?.topicScores.find((item) => item.topic === topic);
    return {
      topic,
      evidence: phraseOnly(extracted?.evidence),
      score: (extracted?.relevance ?? 0) * 2 + topicSpread(topic),
    };
  });

  if (focus?.emergentQuestion && focus.emergentRelevance >= 1.5) {
    const overallStances = personas.map((persona) => notes[persona.id].overallStance);
    candidates.push({
      topic: focus.emergentQuestion,
      evidence: phraseOnly(focus.emergentEvidence),
      score:
        focus.emergentRelevance * 2 +
        Math.max(...overallStances) -
        Math.min(...overallStances) -
        0.35,
    });
  }

  candidates.sort((left, right) => right.score - left.score);
  return { topic: candidates[0].topic, evidence: candidates[0].evidence };
}

export function selectLeadDebaters(
  topic: string,
  personas: PersonaCard[],
  notes: Record<string, ReadingNotes>,
): [PersonaCard, PersonaCard] {
  if (personas.length < 2) throw new Error("At least two personas are required for a debate.");
  let selected: [PersonaCard, PersonaCard] = [personas[0], personas[1]];
  let largestDistance = -1;
  for (let left = 0; left < personas.length - 1; left += 1) {
    for (let right = left + 1; right < personas.length; right += 1) {
      const distance = Math.abs(
        getTopicStance(notes[personas[left].id], topic) -
          getTopicStance(notes[personas[right].id], topic),
      );
      if (distance > largestDistance) {
        largestDistance = distance;
        selected = [personas[left], personas[right]];
      }
    }
  }
  return selected.sort(
    (left, right) => getTopicStance(notes[left.id], topic) - getTopicStance(notes[right.id], topic),
  ) as [PersonaCard, PersonaCard];
}

interface PreparedUtterance {
  speaker: PersonaCard | "moderator";
  output: UtteranceOutput;
  shelfKey: string;
}

function isRetryableReadingNotesError(error: unknown): boolean {
  if (
    error instanceof IncompleteGenerationError ||
    error instanceof InvalidStructuredOutputError
  ) {
    return true;
  }
  if (typeof error !== "object" || error === null || !("code" in error)) return false;
  return error.code === "incomplete_output" || error.code === "invalid_structured_output";
}

export class SessionEngine {
  private state!: SessionState;
  private readonly shelfCitations = new Set<string>();
  private lastChallengerId?: string;
  private readonly onUtterance?: (utterance: Utterance) => void;
  private readonly onAtmosphereChange?: (atmosphere: RoomAtmosphere) => void;
  private readonly onStatus?: (message: string) => void;
  private language: AppLanguage = "en";
  private waitForAdvance?: RunSessionOptions["waitForAdvance"];
  private requestUserInput?: RunSessionOptions["requestUserInput"];
  private waitForSessionComplete?: RunSessionOptions["waitForSessionComplete"];
  private requestDiscussionAction?: RunSessionOptions["requestDiscussionAction"];
  private discussionFocusPromise?: Promise<DiscussionFocus | undefined>;

  constructor(
    private readonly client: GenerationClient,
    callbacks: Pick<
      RunSessionOptions,
      "onUtterance" | "onStatus" | "onAtmosphereChange"
    > = {},
  ) {
    this.onUtterance = callbacks.onUtterance;
    this.onAtmosphereChange = callbacks.onAtmosphereChange;
    this.onStatus = callbacks.onStatus;
  }

  async run(options: RunSessionOptions = {}): Promise<CompletedSession> {
    this.language = options.language ?? "en";
    this.waitForAdvance = options.waitForAdvance;
    this.requestUserInput = options.requestUserInput;
    this.waitForSessionComplete = options.waitForSessionComplete;
    this.requestDiscussionAction = options.requestDiscussionAction;
    this.shelfCitations.clear();
    this.lastChallengerId = undefined;
    this.discussionFocusPromise = undefined;
    const seed = options.seed ?? "session";
    const userInputs = { ...SIMULATED_USER_INPUTS, ...options.userInputs };
    let book = options.confirmedBook;
    if (!book) {
      const title = options.title?.trim();
      if (!title) throw new Error("A book title is required to start a session.");
      this.onStatus?.("Identifying book");
      const identified = await this.client.identifyBook({
        title,
        author: options.author,
        scope: options.scope ?? "single_book",
        language: this.language,
      });
      book = toConfirmedBook(identified);
    }
    const personas = selectPersonas(seed);

    this.state = {
      language: this.language,
      roomAtmosphere: deriveInitialAtmosphere(personas),
      book,
      personas,
      notes: {},
      transcript: [],
      stage: "INTRO",
      stageTurnCount: 0,
      userStances: {},
      discussionListenCount: 0,
      seed,
    };
    this.onAtmosphereChange?.(structuredClone(this.state.roomAtmosphere));

    this.onStatus?.("Generating private reading notes in parallel");
    let readyNoteCount = 0;
    const notePromises = new Map(
      personas.map((persona) => {
        const promise = this.generateNotes(persona).then((notes) => {
          readyNoteCount += 1;
          this.onStatus?.(`Reading notes ready: ${readyNoteCount}/${personas.length}`);
          return notes;
        });
        // Later personas may fail before their ordered reveal is reached. Attach a
        // handler now while preserving the original rejection for that reveal.
        void promise.catch(() => undefined);
        return [persona.id, promise] as const;
      }),
    );

    await this.runIntro(userInputs.intro, notePromises);
    await this.runFirstImpressions(userInputs.firstImpression);
    await this.runMemorableScenes(userInputs.memorableScene);
    await this.runDiscussion(userInputs.discussion, userInputs.discussionReply);
    await this.runWrapUp(userInputs.wrapUp);

    this.onStatus?.("Generating meeting recap");
    const recapMarkdown = await this.generateRecap();
    return { state: structuredClone(this.state), recapMarkdown };
  }

  private setStage(stage: StageId): void {
    this.state.stage = stage;
    this.state.stageTurnCount = 0;
    this.onStatus?.(`Stage: ${stage}`);
  }

  private async generateNotes(persona: PersonaCard): Promise<ReadingNotes> {
    let validationError: string | undefined;
    let lastError: unknown;
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const output = await this.client.generateReadingNotes({
          language: this.language,
          book: this.state.book,
          persona,
          validationError,
        });
        const issues = validateReadingNotesQuality(output, this.state.book.candidateTopics);
        if (issues.length === 0) return normalizeNotes(output);
        validationError = issues.join("; ");
        lastError = undefined;
      } catch (error) {
        if (!isRetryableReadingNotesError(error) || attempt === 2) throw error;
        lastError = error;
        this.onStatus?.(`Retrying reading notes: ${persona.name} (${attempt + 1}/2)`);
      }
    }
    if (lastError) throw lastError;
    throw new Error(`${persona.name}'s reading notes failed validation: ${validationError}`);
  }

  private async prepareGenerated(
    speaker: PersonaCard | "moderator",
    task: UtteranceTask,
    options: GenerationOptions = {},
  ): Promise<PreparedUtterance> {
    const isModerator = speaker === "moderator";
    const shelfKey = isModerator ? "" : `${this.state.stage}:${speaker.id}`;
    const allowShelfReference =
      !isModerator && options.allowShelfReference === true && !this.shelfCitations.has(shelfKey);
    let validationError: string | undefined;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const output = await this.client.generateUtterance({
        language: this.language,
        roomAtmosphere: updateAtmosphereForTask(this.state.roomAtmosphere, task),
        book: this.state.book,
        speaker,
        notes:
          isModerator || task === "PERSONA_INTRODUCTION"
            ? undefined
            : this.state.notes[speaker.id],
        stage: this.state.stage,
        task,
        recentTranscript: prepareTranscriptContext(
          task === "FIRST_IMPRESSION" || task === "MEMORABLE_SCENE"
            ? this.state.transcript.filter(
                ({ stage, speaker }) => stage === this.state.stage && speaker === "moderator",
              )
            : this.state.transcript,
        ),
        activeTopic: options.activeTopic,
        targetSpeaker: options.targetSpeaker,
        userArgument: options.userArgument,
        allowShelfReference,
        validationError,
        discussionFocus: options.discussionFocus,
      });
      const issues = validateUtteranceQuality(
        output,
        isModerator ? "moderator" : "persona",
        allowShelfReference,
      );
      if (
        task === "TOPIC_OPEN" &&
        options.activeTopic &&
        !output.utterance.includes(options.activeTopic)
      ) {
        issues.push("TOPIC_OPEN must state the code-selected active topic verbatim");
      }
      if (
        (task === "CHALLENGE_USER" || task === "DEVILS_ADVOCATE") &&
        (output.utterance.match(/[?？]/gu)?.length ?? 0) !== 1
      ) {
        issues.push("a user challenge must ask exactly one pointed question");
      }
      if (options.targetSpeaker && output.refers_to !== options.targetSpeaker) {
        issues.push("a directed turn must preserve the code-selected target speaker");
      }
      if (issues.length === 0) return { speaker, output, shelfKey };
      validationError = issues.join("; ");
    }

    this.onStatus?.(
      `Used validated fallback for ${isModerator ? "moderator" : speaker.name}: ${validationError}`,
    );
    const output: UtteranceOutput = isModerator
      ? {
          utterance:
            task === "DEVILS_ADVOCATE"
              ? this.language === "ko"
                ? "잠시 반대편에서 묻겠습니다. 지금의 해석이 놓치고 있는 가장 강한 반례는 무엇일까요?"
                : "Let me push from the other side. What is the strongest counterexample this reading might miss?"
              : this.language === "ko"
                ? "그 긴장을 잠시 붙잡고 다시 책으로 돌아가 보겠습니다."
                : "Let's hold onto that tension and return to the book.",
          stance: null,
          refers_to: options.targetSpeaker ?? null,
          shelf_ref: null,
        }
      : {
          utterance:
            task === "CHALLENGE_USER"
              ? this.language === "ko"
                ? "저는 아직 그 결론에 동의하기 어렵습니다. 가장 강한 반대 사례도 같은 해석으로 설명할 수 있나요?"
                : "I am not ready to accept that conclusion. Can the same reading explain the strongest counterexample?"
              : this.language === "ko"
                ? "제 입장을 아직 버리지는 않겠지만, 그 장면에 비춰 다시 살펴보겠습니다. 이 차이는 계속 이야기할 가치가 있습니다."
                : "I am not ready to abandon my position, but I want to test it against that scene. The disagreement is still worth keeping open.",
          stance: this.state.notes[speaker.id]?.overallStance ?? 0,
          refers_to: options.targetSpeaker ?? null,
          shelf_ref: null,
        };
    return { speaker, output, shelfKey };
  }

  private async appendGenerated(
    speaker: PersonaCard | "moderator",
    task: UtteranceTask,
    options: GenerationOptions = {},
  ): Promise<Utterance> {
    const advancePromise =
      this.waitForAdvance?.({ stage: this.state.stage, task, speaker }) ?? Promise.resolve();
    const [prepared] = await Promise.all([
      this.prepareGenerated(speaker, task, options),
      advancePromise,
    ]);
    return this.commitGenerated(prepared.speaker, prepared.output, prepared.shelfKey, task);
  }

  private async appendPrepared(
    prepared: PreparedUtterance,
    task: UtteranceTask,
  ): Promise<Utterance> {
    await this.waitForAdvance?.({
      stage: this.state.stage,
      task,
      speaker: prepared.speaker,
    });
    return this.commitGenerated(prepared.speaker, prepared.output, prepared.shelfKey, task);
  }

  private commitGenerated(
    speaker: PersonaCard | "moderator",
    output: UtteranceOutput,
    shelfKey: string,
    task: UtteranceTask,
  ): Utterance {
    const utterance: Utterance = {
      speaker: speaker === "moderator" ? "moderator" : speaker.id,
      text: output.utterance,
      stance: output.stance ?? undefined,
      refersTo: output.refers_to ?? undefined,
      shelfRef: output.shelf_ref ?? undefined,
      stage: this.state.stage,
    };
    if (output.shelf_ref && shelfKey) this.shelfCitations.add(shelfKey);
    this.state.transcript.push(utterance);
    this.state.stageTurnCount += 1;
    this.state.roomAtmosphere = updateAtmosphereForTask(this.state.roomAtmosphere, task);
    this.onAtmosphereChange?.(structuredClone(this.state.roomAtmosphere));
    this.onUtterance?.(utterance);
    return utterance;
  }

  private async appendUser(text: string, target?: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    if (trimmed.length > 4_000) {
      throw new Error("User input must be 4,000 characters or fewer.");
    }
    const utterance: Utterance = {
      speaker: "user",
      text: trimmed,
      stage: this.state.stage,
    };
    this.state.transcript.push(utterance);
    this.state.stageTurnCount += 1;
    this.state.roomAtmosphere = updateAtmosphereFromUser(
      this.state.roomAtmosphere,
      trimmed,
    );
    this.onAtmosphereChange?.(structuredClone(this.state.roomAtmosphere));
    this.onUtterance?.(utterance);

    if (!target) return;
    const extracted = await this.client.extractUserStance({
      language: this.language,
      text: trimmed,
      target,
      book: this.state.book,
    });
    this.state.userStance = extracted.stance;
    this.state.userStances[target] = extracted;
  }

  private async requestAndAppendUser(
    fallback: string,
    kind: UserTurnKind,
    target?: string,
  ): Promise<void> {
    const text = this.requestUserInput
      ? await this.requestUserInput({ stage: this.state.stage, target, kind })
      : fallback;
    await this.appendUser(text, target);
  }

  private selectChallenger(target: string, userStance: number): PersonaCard | undefined {
    const scored = this.state.personas.map((persona) => ({
      persona,
      distance: Math.abs(
        userStance -
          (target === "overall_impression"
            ? this.state.notes[persona.id].overallStance
            : getTopicStance(this.state.notes[persona.id], target)),
      ),
    }));
    if (scored.every(({ distance }) => distance < 0.5)) return undefined;
    scored.sort((left, right) => right.distance - left.distance);
    const alternative = scored.find(({ persona }) => persona.id !== this.lastChallengerId);
    const challenger = (alternative ?? scored[0]).persona;
    this.lastChallengerId = challenger.id;
    return challenger;
  }

  private personaReasonFor(persona: PersonaCard, target: string): string | undefined {
    const notes = this.state.notes[persona.id];
    return target === "overall_impression"
      ? notes.overallTake
      : notes.stanceByTopic.find((item) => item.topic === target)?.reason;
  }

  private selectSupporter(
    target: string,
    userStance: number,
    challenger: PersonaCard | "moderator",
  ): PersonaCard {
    return [...this.state.personas]
      .filter((persona) => challenger === "moderator" || persona.id !== challenger.id)
      .sort((left, right) => {
        const leftDistance = Math.abs(
          userStance -
            (target === "overall_impression"
              ? this.state.notes[left.id].overallStance
              : getTopicStance(this.state.notes[left.id], target)),
        );
        const rightDistance = Math.abs(
          userStance -
            (target === "overall_impression"
              ? this.state.notes[right.id].overallStance
              : getTopicStance(this.state.notes[right.id], target)),
        );
        return leftDistance - rightDistance;
      })[0];
  }

  private async challengeUser(target: string): Promise<PersonaCard | "moderator"> {
    const userArgument = this.state.userStances[target];
    if (!userArgument) {
      await this.appendGenerated("moderator", "DEVILS_ADVOCATE", {
        activeTopic: target,
        userArgument: {
          stance: 0,
          paraphrase:
            this.language === "ko" ? "사용자가 첫 입장을 건너뛰었습니다." : "The user passed the first position turn.",
        },
      });
      return "moderator";
    }
    const challenger = this.selectChallenger(target, userArgument.stance);
    if (!challenger) {
      await this.appendGenerated("moderator", "DEVILS_ADVOCATE", {
        activeTopic: target,
        userArgument,
      });
      return "moderator";
    }
    await this.appendGenerated(challenger, "CHALLENGE_USER", {
      activeTopic: target,
      targetSpeaker: "user",
      userArgument: { ...userArgument, personaReason: this.personaReasonFor(challenger, target) },
    });
    return challenger;
  }

  private async runIntro(
    userInput: string,
    notePromises: Map<string, Promise<ReadingNotes>>,
  ): Promise<void> {
    this.setStage("INTRO");
    const introductionPromises = this.state.personas.map((persona) =>
      this.prepareGenerated(persona, "PERSONA_INTRODUCTION"),
    );
    introductionPromises.forEach((promise) => void promise.catch(() => undefined));

    await this.appendGenerated("moderator", "WELCOME");
    for (const introductionPromise of introductionPromises) {
      await this.appendPrepared(await introductionPromise, "PERSONA_INTRODUCTION");
    }
    await this.appendGenerated("moderator", "INVITE_USER");
    await this.requestAndAppendUser(userInput, "intro");
    await Promise.all(
      this.state.personas.map(async (persona) => {
        this.state.notes[persona.id] = await notePromises.get(persona.id)!;
      }),
    );
  }

  private async runFirstImpressions(userInput: string): Promise<void> {
    this.setStage("FIRST_IMPRESSIONS");
    await this.appendGenerated("moderator", "FIRST_IMPRESSIONS_OPEN");
    const impressions = this.state.personas.map((persona) =>
      this.prepareGenerated(persona, "FIRST_IMPRESSION"),
    );
    impressions.forEach((promise) => void promise.catch(() => undefined));
    for (const impression of impressions) {
      await this.appendPrepared(await impression, "FIRST_IMPRESSION");
    }
    await this.requestAndAppendUser(userInput, "first_impression", "overall_impression");
  }

  private async runMemorableScenes(userInput: string): Promise<void> {
    this.setStage("MEMORABLE_SCENES");
    await this.appendGenerated("moderator", "SCENES_OPEN");
    const ranked = [...this.state.personas].sort(
      (left, right) =>
        this.state.notes[left.id].overallStance - this.state.notes[right.id].overallStance,
    );
    const sceneReaders = [ranked[0], ranked[ranked.length - 1]];
    const scenePromises = sceneReaders.map((persona) =>
      this.prepareGenerated(persona, "MEMORABLE_SCENE", { allowShelfReference: true }),
    );
    scenePromises.forEach((promise) => void promise.catch(() => undefined));
    for (const scenePromise of scenePromises) {
      await this.appendPrepared(await scenePromise, "MEMORABLE_SCENE");
    }
    await this.requestAndAppendUser(userInput, "memorable_scene");
    this.discussionFocusPromise = this.client
      .extractDiscussionFocus({
        language: this.language,
        book: this.state.book,
        transcript: prepareTranscriptContext(
          this.state.transcript.filter(
            ({ stage }) => stage === "FIRST_IMPRESSIONS" || stage === "MEMORABLE_SCENES",
          ),
        ),
      })
      .then((output) => {
        const topics = output.topic_scores.map(({ topic }) => topic);
        if (
          topics.length !== this.state.book.candidateTopics.length ||
          topics.some((topic, index) => topic !== this.state.book.candidateTopics[index])
        ) {
          throw new Error("Discussion focus did not preserve candidate topics.");
        }
        return normalizeDiscussionFocus(output);
      })
      .catch(() => {
        this.onStatus?.("Discussion focus extraction failed; using stance spread");
        return undefined;
      });
    await this.appendGenerated(sceneReaders[0], "REACT_TO_USER_SCENE", {
      targetSpeaker: "user",
    });
  }

  private async runDiscussion(userInput: string, userReply: string): Promise<void> {
    this.setStage("DISCUSSION");
    const focus = await this.discussionFocusPromise;
    const selected = selectDiscussionTopic(
      this.state.book,
      this.state.personas,
      this.state.notes,
      focus,
    );
    const topic = selected.topic;
    this.state.activeTopic = topic;
    const [leadA, leadB] = selectLeadDebaters(
      topic,
      this.state.personas,
      this.state.notes,
    );
    const observer = this.state.personas.find(
      (persona) => persona.id !== leadA.id && persona.id !== leadB.id,
    );
    this.state.discussionRoles = {
      leadA: leadA.id,
      leadB: leadB.id,
      observer: observer?.id,
    };
    await this.appendGenerated("moderator", "TOPIC_OPEN", {
      activeTopic: topic,
      discussionFocus: selected.evidence,
    });
    await this.appendGenerated(leadA, "OPEN_PERSONA_POSITION", {
      activeTopic: topic,
      targetSpeaker: leadB.id,
    });
    await this.appendGenerated(leadB, "CHALLENGE_PERSONA", {
      activeTopic: topic,
      targetSpeaker: leadA.id,
    });
    await this.appendGenerated(leadA, "RESPOND_TO_PERSONA", {
      activeTopic: topic,
      targetSpeaker: leadB.id,
    });

    let action = this.requestDiscussionAction
      ? await this.requestDiscussionAction({ round: 0, canListen: true })
      : "join";
    if (action === "listen") {
      this.state.discussionListenCount = 1;
      await this.appendGenerated(leadB, "RESPOND_TO_PERSONA", {
        activeTopic: topic,
        targetSpeaker: leadA.id,
      });
      await this.appendGenerated(leadA, "RESPOND_TO_PERSONA", {
        activeTopic: topic,
        targetSpeaker: leadB.id,
      });
      action = this.requestDiscussionAction
        ? await this.requestDiscussionAction({ round: 1, canListen: false })
        : "join";
      if (action === "listen") action = "join";
    }

    if (action === "join") {
      await this.appendGenerated("moderator", "ASK_USER_POSITION", { activeTopic: topic });
      await this.requestAndAppendUser(userInput, "discussion_position", topic);
      const challenger = await this.challengeUser(topic);
      await this.requestAndAppendUser(userReply, "discussion_reply", topic);

      const updatedUserArgument = this.state.userStances[topic] ?? {
        stance: 0,
        paraphrase:
          this.language === "ko"
            ? "사용자가 이 질문에 대한 입장을 건너뛰었습니다."
            : "The user passed the position turn for this question.",
      };
      await this.appendGenerated(challenger, "RESPOND_TO_USER_REPLY", {
        activeTopic: topic,
        targetSpeaker: "user",
        userArgument:
          challenger === "moderator"
            ? updatedUserArgument
            : {
                ...updatedUserArgument,
                personaReason: this.personaReasonFor(challenger, topic),
              },
      });

      const supporter = this.selectSupporter(topic, updatedUserArgument.stance, challenger);
      this.state.discussionRoles = {
        ...this.state.discussionRoles,
        challenger: challenger === "moderator" ? "moderator" : challenger.id,
        supporter: supporter.id,
      };
      await this.appendGenerated(supporter, "SUPPORT_USER", {
        activeTopic: topic,
        targetSpeaker: challenger === "moderator" ? "moderator" : challenger.id,
        userArgument: {
          ...updatedUserArgument,
          personaReason: this.personaReasonFor(supporter, topic),
        },
      });
    }
    await this.appendGenerated("moderator", "TOPIC_CLOSE", { activeTopic: topic });
  }

  private async runWrapUp(userInput: string): Promise<void> {
    this.setStage("WRAP_UP");
    await this.appendGenerated("moderator", "WRAP_OPEN");
    await this.requestAndAppendUser(userInput, "wrap_up");
    const closingIds = [
      this.state.discussionRoles?.challenger,
      this.state.discussionRoles?.supporter,
      this.state.discussionRoles?.leadA,
      this.state.discussionRoles?.leadB,
    ].filter((id): id is string => Boolean(id) && id !== "moderator");
    const closingPersonas = [...new Set(closingIds)]
      .map((id) => this.state.personas.find((persona) => persona.id === id))
      .filter((persona): persona is PersonaCard => Boolean(persona))
      .slice(0, 2);
    for (const persona of closingPersonas) {
      await this.appendGenerated(persona, "CLOSING_REFLECTION", {
        activeTopic: this.state.activeTopic,
        targetSpeaker: "user",
      });
    }
    const summary = await this.appendGenerated("moderator", "DISCUSSION_SUMMARY", {
      activeTopic: this.state.activeTopic,
    });
    await this.waitForSessionComplete?.(summary);
  }

  private async generateRecap(): Promise<string> {
    const topic = this.state.activeTopic ?? this.state.book.candidateTopics[0];
    const baseRequest: RecapRequest = {
      language: this.language,
      date: new Date().toISOString().slice(0, 10),
      book: this.state.book,
      personas: this.state.personas,
      transcript: this.state.transcript,
      personaStances: Object.fromEntries(
        this.state.personas.map((persona) => [
          persona.id,
          getTopicStance(this.state.notes[persona.id], topic),
        ]),
      ),
      userStances: this.state.userStances,
    };
    let validationError: string | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const output: RecapOutput = await this.client.generateRecap({
        ...baseRequest,
        validationError,
      });
      const issues = validateRecapQuality(output.markdown, this.language);
      if (issues.length === 0) return output.markdown;
      validationError = issues.join("; ");
    }
    throw new Error(`Recap failed validation: ${validationError}`);
  }
}
