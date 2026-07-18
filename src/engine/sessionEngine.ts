import type {
  BookIdentificationOutput,
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
  SessionState,
  StageId,
  Utterance,
} from "../types";
import {
  validateReadingNotesQuality,
  validateRecapQuality,
  validateUtteranceQuality,
} from "./qualityValidation";

export interface ScriptedUserInputs {
  intro: string;
  firstImpression: string;
  memorableScene: string;
  discussion: string;
  wrapUp: string;
}

export interface RunSessionOptions {
  language?: AppLanguage;
  title?: string;
  author?: string;
  seed?: string;
  userInputs?: Partial<ScriptedUserInputs>;
  onUtterance?: (utterance: Utterance) => void;
  onStatus?: (message: string) => void;
  waitForAdvance?: (turn: {
    stage: StageId;
    task: UtteranceTask;
    speaker: PersonaCard | "moderator";
  }) => Promise<void>;
  requestUserInput?: (turn: {
    stage: StageId;
    target?: string;
  }) => Promise<string>;
  waitForSessionComplete?: (summary: Utterance) => Promise<void>;
}

const DEFAULT_USER_INPUTS: ScriptedUserInputs = {
  intro: "I came back to this book because its emotional flatness felt different after discussing grief with other readers.",
  firstImpression:
    "I read Meursault as emotionally honest but still morally responsible; refusing to perform grief does not excuse the harm he causes.",
  memorableScene:
    "The courtroom returning to the funeral stayed with me because everyone seemed more offended by his grief than interested in the killing.",
  discussion:
    "His detachment is partly honest, but it also becomes a refusal to examine how his actions affect anyone else.",
  wrapUp:
    "I am leaving with more sympathy for how society misreads him, but not less concern about the responsibility he avoids.",
};

function confirmBook(output: BookIdentificationOutput): ConfirmedBook {
  return {
    title: output.canonical_title,
    author: output.author,
    confirmedSummary: output.summary,
    mainCharacters: output.main_characters,
    candidateTopics: output.candidate_topics,
    confidence: output.confidence,
  };
}

function normalizeNotes(output: ReadingNotesOutput): ReadingNotes {
  return {
    overallTake: output.overall_take,
    overallStance: output.overall_stance,
    stanceByTopic: output.stance_by_topic,
    keyScenes: output.key_scenes,
    shelfConnections: output.shelf_connections,
  };
}

function getTopicStance(notes: ReadingNotes, topic: string): number {
  return notes.stanceByTopic.find((item) => item.topic === topic)?.stance ?? notes.overallStance;
}

type GenerationOptions = Partial<
  Pick<UtteranceRequest, "activeTopic" | "targetSpeaker" | "userArgument">
> & { allowShelfReference?: boolean };

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
  private readonly onStatus?: (message: string) => void;
  private language: AppLanguage = "en";
  private waitForAdvance?: RunSessionOptions["waitForAdvance"];
  private requestUserInput?: RunSessionOptions["requestUserInput"];
  private waitForSessionComplete?: RunSessionOptions["waitForSessionComplete"];

  constructor(
    private readonly client: GenerationClient,
    callbacks: Pick<RunSessionOptions, "onUtterance" | "onStatus"> = {},
  ) {
    this.onUtterance = callbacks.onUtterance;
    this.onStatus = callbacks.onStatus;
  }

  async run(options: RunSessionOptions = {}): Promise<CompletedSession> {
    this.language = options.language ?? "en";
    this.waitForAdvance = options.waitForAdvance;
    this.requestUserInput = options.requestUserInput;
    this.waitForSessionComplete = options.waitForSessionComplete;
    const seed = options.seed ?? "demo";
    const userInputs = { ...DEFAULT_USER_INPUTS, ...options.userInputs };
    this.onStatus?.("Identifying book");
    const identified = await this.client.identifyBook({
      title: options.title ?? "The Stranger",
      author: options.author,
      language: this.language,
    });
    const book = confirmBook(identified);
    const personas = selectPersonas(seed);

    this.state = {
      language: this.language,
      book,
      personas,
      notes: {},
      transcript: [],
      stage: "INTRO",
      stageTurnCount: 0,
      userStances: {},
      seed,
    };

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
    await this.runDiscussion(userInputs.discussion);
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
        book: this.state.book,
        speaker,
        notes: isModerator ? undefined : this.state.notes[speaker.id],
        stage: this.state.stage,
        task,
        recentTranscript: this.state.transcript.slice(-12),
        activeTopic: options.activeTopic,
        targetSpeaker: options.targetSpeaker,
        userArgument: options.userArgument,
        allowShelfReference,
        validationError,
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
      if (issues.length === 0) return { speaker, output, shelfKey };
      validationError = issues.join("; ");
    }

    this.onStatus?.(
      `Used validated fallback for ${isModerator ? "moderator" : speaker.name}: ${validationError}`,
    );
    const output: UtteranceOutput = isModerator
      ? {
          utterance: "Let's hold onto that tension and return to the book.",
          stance: null,
          refers_to: options.targetSpeaker ?? null,
          shelf_ref: null,
        }
      : {
          utterance:
            "I am not ready to abandon my position, but I want to test it against that scene. The disagreement is still worth keeping open.",
          stance: this.state.notes[speaker.id].overallStance,
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
    return this.commitGenerated(prepared.speaker, prepared.output, prepared.shelfKey);
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
    return this.commitGenerated(prepared.speaker, prepared.output, prepared.shelfKey);
  }

  private commitGenerated(
    speaker: PersonaCard | "moderator",
    output: UtteranceOutput,
    shelfKey: string,
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
    this.onUtterance?.(utterance);
    return utterance;
  }

  private async appendUser(text: string, target?: string): Promise<void> {
    const trimmed = text.trim();
    if (!trimmed) return;
    const utterance: Utterance = {
      speaker: "user",
      text: trimmed,
      stage: this.state.stage,
    };
    this.state.transcript.push(utterance);
    this.state.stageTurnCount += 1;
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

  private async requestAndAppendUser(fallback: string, target?: string): Promise<void> {
    const text = this.requestUserInput
      ? await this.requestUserInput({ stage: this.state.stage, target })
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

  private async challengeUser(target: string): Promise<void> {
    const userArgument = this.state.userStances[target];
    if (!userArgument) return;
    const challenger = this.selectChallenger(target, userArgument.stance);
    if (!challenger) {
      await this.appendGenerated("moderator", "DEVILS_ADVOCATE", {
        activeTopic: target,
        userArgument,
      });
      return;
    }
    const notes = this.state.notes[challenger.id];
    const personaReason =
      target === "overall_impression"
        ? notes.overallTake
        : notes.stanceByTopic.find((item) => item.topic === target)?.reason;
    await this.appendGenerated(challenger, "CHALLENGE_USER", {
      activeTopic: target,
      targetSpeaker: "user",
      userArgument: { ...userArgument, personaReason },
    });
  }

  private async runIntro(
    userInput: string,
    notePromises: Map<string, Promise<ReadingNotes>>,
  ): Promise<void> {
    this.setStage("INTRO");
    const introductionPromises = this.state.personas.map(async (persona) => {
      const notes = await notePromises.get(persona.id)!;
      this.state.notes[persona.id] = notes;
      return this.prepareGenerated(persona, "PERSONA_INTRODUCTION");
    });
    introductionPromises.forEach((promise) => void promise.catch(() => undefined));

    await this.appendGenerated("moderator", "WELCOME");
    for (const introductionPromise of introductionPromises) {
      await this.appendPrepared(await introductionPromise, "PERSONA_INTRODUCTION");
    }
    await this.appendGenerated("moderator", "INVITE_USER");
    await this.requestAndAppendUser(userInput);
  }

  private async runFirstImpressions(userInput: string): Promise<void> {
    this.setStage("FIRST_IMPRESSIONS");
    await this.appendGenerated("moderator", "FIRST_IMPRESSIONS_OPEN");
    for (const persona of this.state.personas) {
      await this.appendGenerated(persona, "FIRST_IMPRESSION");
    }
    await this.requestAndAppendUser(userInput, "overall_impression");
    await this.challengeUser("overall_impression");
  }

  private async runMemorableScenes(userInput: string): Promise<void> {
    this.setStage("MEMORABLE_SCENES");
    await this.appendGenerated("moderator", "SCENES_OPEN");
    for (const persona of this.state.personas) {
      await this.appendGenerated(persona, "MEMORABLE_SCENE", { allowShelfReference: true });
    }
    await this.requestAndAppendUser(userInput);
    for (const persona of this.state.personas.slice(0, 2)) {
      await this.appendGenerated(persona, "REACT_TO_USER_SCENE", { targetSpeaker: "user" });
    }
  }

  private async runDiscussion(userInput: string): Promise<void> {
    this.setStage("DISCUSSION");
    const topic = this.state.book.candidateTopics[0];
    this.state.activeTopic = topic;
    const ranked = [...this.state.personas].sort(
      (left, right) =>
        getTopicStance(this.state.notes[left.id], topic) -
        getTopicStance(this.state.notes[right.id], topic),
    );
    const openers = [ranked[0], ranked[ranked.length - 1]];
    await this.appendGenerated("moderator", "TOPIC_OPEN", { activeTopic: topic });
    for (const persona of openers) {
      await this.appendGenerated(persona, "TOPIC_POSITION", { activeTopic: topic });
    }
    await this.appendGenerated("moderator", "ASK_USER_POSITION", { activeTopic: topic });
    await this.requestAndAppendUser(userInput, topic);
    await this.challengeUser(topic);

    const third = this.state.personas.find(
      (persona) => !openers.some((opener) => opener.id === persona.id),
    )!;
    await this.appendGenerated(third, "PERSONA_EXCHANGE", {
      activeTopic: topic,
      targetSpeaker: openers[0].id,
    });
    await this.appendGenerated(openers[0], "PERSONA_EXCHANGE", {
      activeTopic: topic,
      targetSpeaker: third.id,
    });
    await this.appendGenerated("moderator", "TOPIC_CLOSE", { activeTopic: topic });
  }

  private async runWrapUp(userInput: string): Promise<void> {
    this.setStage("WRAP_UP");
    await this.appendGenerated("moderator", "WRAP_OPEN");
    for (const persona of this.state.personas) {
      await this.appendGenerated(persona, "CLOSING_REFLECTION", {
        activeTopic: this.state.activeTopic,
      });
    }
    await this.requestAndAppendUser(userInput);
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
