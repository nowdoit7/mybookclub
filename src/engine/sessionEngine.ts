import type {
  BookIdentificationOutput,
  MeetingPlanOutput,
  ReadingNotesOutput,
  RecapOutput,
  UtteranceOutput,
} from "../api/contracts";
import type {
  GenerationClient,
  ParticipantLabel,
  RecapRequest,
  UtteranceRequest,
  UtteranceTask,
} from "../api/generationClient";
import {
  IncompleteGenerationError,
  InvalidStructuredOutputError,
} from "../api/errors";
import { isImaginedGuestId, selectPersonas } from "../personas";
import { resolveGuestAuthorPerspective } from "../personas/guestWorkRelations";
import { localizedSpeakerName } from "../localization";
import type {
  CompletedSession,
  AppLanguage,
  ConfirmedBook,
  MeetingPlan,
  PersonaCard,
  ReadingNotes,
  DiscussionFocus,
  DiscussionAction,
  DiscussionDecisionTurn,
  RoomAtmosphere,
  SessionState,
  StageId,
  UserTurnKind,
  Utterance,
} from "../types";
import {
  validateReadingNotesQuality,
  validateMeetingPlanQuality,
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
  discussionFollowUp: string;
  wrapUp: string;
}

export interface RunSessionOptions {
  language?: AppLanguage;
  title?: string;
  author?: string;
  scope?: "single_book" | "series";
  confirmedBook?: ConfirmedBook;
  seed?: string;
  personas?: PersonaCard[];
  userDisplayName?: string;
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
  requestDiscussionAction?: (turn: DiscussionDecisionTurn) => Promise<DiscussionAction>;
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
  discussionFollowUp:
    "I want to add that this distinction changes how I weigh the responsibility, even though it does not remove the cost.",
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

function getTopicStance(notes: ReadingNotes, topic: string): number {
  return notes.stanceByTopic.find((item) => item.topic === topic)?.stance ?? notes.overallStance;
}

function normalizeMeetingPlan(output: MeetingPlanOutput): MeetingPlan {
  return {
    researchBrief: output.research_brief,
    anchors: output.anchors.map((anchor) => ({
      id: anchor.id,
      kind: anchor.kind,
      label: anchor.label,
      detail: anchor.detail,
      isCommonInterpretation: anchor.is_common_interpretation,
    })),
    primaryPrompt: output.primary_prompt,
    reservePrompt: output.reserve_prompt ?? undefined,
    assignments: output.assignments.map((assignment) => ({
      personaId: assignment.persona_id,
      anchorId: assignment.anchor_id,
      emotionalDoor: assignment.emotional_door,
      questionToExplore: assignment.question_to_explore,
    })),
    uncertainties: output.uncertainties,
    connectionConcepts: output.connection_concepts,
    sources: output.sources,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

export function resolveDirectlyAddressedPersona(
  text: string,
  personas: PersonaCard[],
  language: AppLanguage,
): PersonaCard | undefined {
  const normalized = text.normalize("NFKC");
  const matches = personas.filter((persona) => {
    const aliases = new Set([
      persona.name.trim(),
      localizedSpeakerName(persona.id, language).trim(),
    ]);
    return [...aliases].some((alias) => {
      if (!alias) return false;
      if (language === "ko") {
        return new RegExp(
          `(?:^|[\\s,，.!?])${escapeRegExp(alias)}(?:님)?(?:에게|한테|께|은|는|이|가|도|와|과|[\\s,:，.!?]|$)`,
          "iu",
        ).test(normalized);
      }
      return new RegExp(`(?:^|[^\\p{L}\\p{N}])${escapeRegExp(alias)}(?:[^\\p{L}\\p{N}]|$)`, "iu")
        .test(normalized);
    });
  });
  return matches.length === 1 ? matches[0] : undefined;
}

type GenerationOptions = Partial<
  Pick<
    UtteranceRequest,
    "activeTopic" | "targetSpeaker" | "userArgument" | "discussionFocus" | "discussionOrigin"
  >
> & { allowShelfReference?: boolean };

const MAX_DISCUSSION_EXTENSIONS = 2;
const MAX_CONCURRENT_READING_NOTES = 2;
const TRANSIENT_READING_NOTE_CODES = new Set([
  "network_error",
  "openai_connection_failed",
  "openai_rate_limited",
  "openai_unavailable",
]);

function sceneTokens(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/u)
      .filter((token) => token.length > 1),
  );
}

function sceneSimilarity(left: string, right: string): number {
  const leftTokens = sceneTokens(left);
  const rightTokens = sceneTokens(right);
  const union = new Set([...leftTokens, ...rightTokens]);
  if (union.size === 0) return 0;
  const overlap = [...leftTokens].filter((token) => rightTokens.has(token)).length;
  return overlap / union.size;
}

export function selectDistinctSceneAnchors(
  readers: [PersonaCard, PersonaCard],
  notes: Record<string, ReadingNotes>,
): [string, string] {
  const first = notes[readers[0].id].keyScenes[0];
  const second = [...notes[readers[1].id].keyScenes].sort(
    (left, right) => sceneSimilarity(first, left) - sceneSimilarity(first, right),
  )[0];
  return [first, second];
}

export function selectDiscussionTopic(
  book: ConfirmedBook,
  _personas: PersonaCard[],
  _notes: Record<string, ReadingNotes>,
  focus?: DiscussionFocus,
): { topic: string; evidence?: string; origin: "user" | "table" } {
  const phraseOnly = (value?: string) =>
    value?.replace(/[.!?。？！]+/gu, ",").replace(/,+$/u, "").slice(0, 180);
  const candidates = book.candidateTopics.map((topic) => {
    const extracted = focus?.topicScores.find((item) => item.topic === topic);
    return {
      topic,
      evidence: phraseOnly(extracted?.userEvidence ?? extracted?.evidence),
      origin: extracted?.userEvidence ? "user" as const : "table" as const,
      score:
        (extracted?.relevance ?? 0) * 2 +
        (extracted?.userRelevance ?? 0) * 3,
    };
  });

  if (focus?.emergentQuestion && focus.emergentRelevance >= 1.5) {
    candidates.push({
      topic: focus.emergentQuestion,
      evidence: phraseOnly(focus.emergentEvidence),
      origin: focus.emergentUserRelevance >= 1.5 ? "user" : "table",
      score:
        focus.emergentRelevance * 2 +
        focus.emergentUserRelevance * 3 +
        0.35,
    });
  }

  candidates.sort((left, right) => right.score - left.score);
  return {
    topic: candidates[0].topic,
    evidence: candidates[0].evidence,
    origin: candidates[0].origin,
  };
}

function perspectiveText(notes: ReadingNotes, topic: string): string {
  const topicReason = notes.stanceByTopic.find((item) => item.topic === topic)?.reason;
  return [
    notes.overallTake,
    topicReason,
    notes.personalReaction,
    notes.unresolvedQuestion,
    ...notes.keyScenes,
  ]
    .filter(Boolean)
    .join(" ");
}

export function selectPerspectiveReaders(
  topic: string,
  personas: PersonaCard[],
  notes: Record<string, ReadingNotes>,
): [PersonaCard, PersonaCard] {
  if (personas.length < 2) {
    throw new Error("At least two personas are required to share perspectives.");
  }
  const invitedGuest = personas.find(({ imaginedGuest }) => Boolean(imaginedGuest));
  if (invitedGuest) {
    const guestPerspective = perspectiveText(notes[invitedGuest.id], topic);
    const companion = personas
      .filter(({ id }) => id !== invitedGuest.id)
      .sort(
        (left, right) =>
          sceneSimilarity(
            guestPerspective,
            perspectiveText(notes[left.id], topic),
          ) -
          sceneSimilarity(
            guestPerspective,
            perspectiveText(notes[right.id], topic),
          ),
      )[0];
    return [invitedGuest, companion];
  }
  let selected: [PersonaCard, PersonaCard] = [personas[0], personas[1]];
  let lowestSimilarity = Number.POSITIVE_INFINITY;
  for (let left = 0; left < personas.length - 1; left += 1) {
    for (let right = left + 1; right < personas.length; right += 1) {
      const similarity = sceneSimilarity(
        perspectiveText(notes[personas[left].id], topic),
        perspectiveText(notes[personas[right].id], topic),
      );
      if (similarity < lowestSimilarity) {
        lowestSimilarity = similarity;
        selected = [personas[left], personas[right]];
      }
    }
  }
  return selected;
}

/** @deprecated Use selectPerspectiveReaders. Kept for checkpoint fixture compatibility. */
export const selectLeadDebaters = selectPerspectiveReaders;

interface PreparedUtterance {
  speaker: PersonaCard | "moderator";
  output: UtteranceOutput;
  shelfKey: string;
  targetSpeaker?: string;
}

function createTaskLimiter(limit: number): <T>(task: () => Promise<T>) => Promise<T> {
  let activeCount = 0;
  const pending: Array<() => void> = [];

  const startNext = () => {
    if (activeCount >= limit) return;
    pending.shift()?.();
  };

  return <T>(task: () => Promise<T>) =>
    new Promise<T>((resolve, reject) => {
      const start = () => {
        activeCount += 1;
        void task()
          .then(resolve, reject)
          .finally(() => {
            activeCount -= 1;
            startNext();
          });
      };

      if (activeCount < limit) start();
      else pending.push(start);
    });
}

function errorField(error: unknown, key: string): unknown {
  return typeof error === "object" && error !== null ? Reflect.get(error, key) : undefined;
}

function isTransientReadingNotesError(error: unknown): boolean {
  const code = errorField(error, "code");
  const status = errorField(error, "status");
  return (
    (typeof code === "string" && TRANSIENT_READING_NOTE_CODES.has(code)) ||
    (typeof status === "number" && [429, 502, 503, 504].includes(status))
  );
}

function isRetryableReadingNotesError(error: unknown): boolean {
  if (
    error instanceof IncompleteGenerationError ||
    error instanceof InvalidStructuredOutputError
  ) {
    return true;
  }
  const code = errorField(error, "code");
  return (
    code === "incomplete_output" ||
    code === "invalid_structured_output" ||
    isTransientReadingNotesError(error)
  );
}

export class SessionEngine {
  private state!: SessionState;
  private readonly shelfCitations = new Set<string>();
  private lastChallengerId?: string;
  private readonly onUtterance?: (utterance: Utterance) => void;
  private readonly onAtmosphereChange?: (atmosphere: RoomAtmosphere) => void;
  private readonly onStatus?: (message: string) => void;
  private language: AppLanguage = "en";
  private userDisplayName = "You";
  private waitForAdvance?: RunSessionOptions["waitForAdvance"];
  private requestUserInput?: RunSessionOptions["requestUserInput"];
  private waitForSessionComplete?: RunSessionOptions["waitForSessionComplete"];
  private requestDiscussionAction?: RunSessionOptions["requestDiscussionAction"];
  private participantLabels(): ParticipantLabel[] {
    return [
      {
        id: "moderator",
        displayName: localizedSpeakerName("moderator", this.language),
        role: "moderator",
      },
      ...this.state.personas.map((persona) => ({
        id: persona.id,
        displayName: localizedSpeakerName(persona.id, this.language),
        role: "reader" as const,
      })),
      { id: "user", displayName: this.userDisplayName, role: "user" },
    ];
  }

  private displayNameFor(speakerId: string): string {
    return (
      this.participantLabels().find(({ id }) => id === speakerId)?.displayName ??
      localizedSpeakerName(speakerId, this.language)
    );
  }

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
    this.userDisplayName =
      options.userDisplayName?.trim() || (this.language === "ko" ? "나" : "You");
    this.waitForAdvance = options.waitForAdvance;
    this.requestUserInput = options.requestUserInput;
    this.waitForSessionComplete = options.waitForSessionComplete;
    this.requestDiscussionAction = options.requestDiscussionAction;
    this.shelfCitations.clear();
    this.lastChallengerId = undefined;
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
    const personas = options.personas ?? selectPersonas(seed);
    const categories = personas.map(({ category }) => category);
    if (
      personas.length !== 3 ||
      new Set(personas.map(({ id }) => id)).size !== 3 ||
      !(["emotional", "analytical", "contextual"] as const).every((category) =>
        categories.includes(category),
      )
    ) {
      throw new Error("A session requires three unique personas, one from each category.");
    }

    this.onStatus?.("Researching the book and preparing the meeting prompt");
    const meetingPlanOutput = await this.client.prepareMeetingPlan({
      language: this.language,
      book,
      personas,
    });
    const meetingPlanIssues = validateMeetingPlanQuality(
      meetingPlanOutput,
      personas.map(({ id }) => id),
      book.verificationStatus !== "mock",
    );
    if (meetingPlanIssues.length > 0) {
      throw new Error(`Meeting plan failed validation: ${meetingPlanIssues.join("; ")}`);
    }
    const meetingPlan = normalizeMeetingPlan(meetingPlanOutput);

    this.state = {
      language: this.language,
      roomAtmosphere: deriveInitialAtmosphere(personas),
      book,
      meetingPlan,
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
    const limitReadingNotes = createTaskLimiter(MAX_CONCURRENT_READING_NOTES);
    const notePromises = new Map(
      personas.map((persona) => {
        const promise = limitReadingNotes(() => this.generateNotes(persona)).then((notes) => {
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
    await this.runDiscussion(
      userInputs.discussion,
      userInputs.discussionReply,
      userInputs.discussionFollowUp,
    );
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
          meetingPlan: this.state.meetingPlan,
          perspectiveAssignment: this.state.meetingPlan.assignments.find(
            ({ personaId }) => personaId === persona.id,
          ),
          validationError,
        });
        const issues = validateReadingNotesQuality(output, this.state.book.candidateTopics);
        if (issues.length === 0) return normalizeNotes(output);
        validationError = issues.join("; ");
        lastError = undefined;
      } catch (error) {
        const isTransient = isTransientReadingNotesError(error);
        const finalAttempt = isTransient ? attempt === 1 : attempt === 2;
        if (!isRetryableReadingNotesError(error) || finalAttempt) throw error;
        lastError = error;
        this.onStatus?.(
          `Retrying reading notes: ${persona.name} (${attempt + 1}/${isTransient ? 1 : 2})`,
        );
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
        meetingPlan: this.state.meetingPlan,
        perspectiveAssignment:
          isModerator
            ? undefined
            : this.state.meetingPlan.assignments.find(
                ({ personaId }) => personaId === speaker.id,
              ),
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
        participants: this.participantLabels(),
        activeTopic: options.activeTopic,
        targetSpeaker: options.targetSpeaker,
        userArgument: options.userArgument,
        allowShelfReference,
        validationError,
        discussionFocus: options.discussionFocus,
        discussionOrigin: options.discussionOrigin,
      });
      const issues = validateUtteranceQuality(
        output,
        isModerator ? "moderator" : "persona",
        allowShelfReference,
        { language: this.language, task },
      );
      if (!isModerator && task === "FIRST_IMPRESSION") {
        const authorPerspective = resolveGuestAuthorPerspective(
          speaker.id,
          this.state.book,
        );
        const expectedOpening = authorPerspective?.firstPersonFrame[this.language];
        if (expectedOpening && !output.utterance.trimStart().startsWith(expectedOpening)) {
          issues.push(
            `FIRST_IMPRESSION must begin with the exact author-perspective words ${JSON.stringify(expectedOpening)}`,
          );
        }
      }
      if (
        task === "CHALLENGE_USER" &&
        (output.utterance.match(/[?？]/gu)?.length ?? 0) !== 1
      ) {
        issues.push("a user exploration turn must ask exactly one natural question");
      }
      const targetDisplayName = options.targetSpeaker
        ? this.displayNameFor(options.targetSpeaker)
        : undefined;
      const requiresSpokenTarget =
        options.targetSpeaker !== "user" ||
        targetDisplayName !== localizedSpeakerName("user", this.language);
      if (
        options.targetSpeaker &&
        targetDisplayName &&
        requiresSpokenTarget &&
        !output.utterance.includes(targetDisplayName)
      ) {
        issues.push(
          `a directed turn must address the exact target display name ${JSON.stringify(targetDisplayName)}`,
        );
      }
      if (issues.length === 0) {
        return { speaker, output, shelfKey, targetSpeaker: options.targetSpeaker };
      }
      validationError = issues.join("; ");
    }

    this.onStatus?.(
      `Quality fallback: task=${task}; speaker=${isModerator ? "moderator" : speaker.id}`,
    );
    const output = this.buildFallbackUtterance(speaker, task, options);
    return { speaker, output, shelfKey, targetSpeaker: options.targetSpeaker };
  }

  private buildFallbackUtterance(
    speaker: PersonaCard | "moderator",
    task: UtteranceTask,
    options: GenerationOptions,
  ): UtteranceOutput {
    const ko = this.language === "ko";
    const targetsUser = (options.targetSpeaker ?? "user") === "user";
    const target = this.displayNameFor(options.targetSpeaker ?? "user");
    const targetLabel = target;
    const usesDefaultUserLabel =
      (options.targetSpeaker ?? "user") === "user" &&
      target === localizedSpeakerName("user", this.language);
    const targetVocative = usesDefaultUserLabel
      ? ""
      : ko
        ? `${targetLabel}님`
        : targetLabel;
    const address = targetVocative ? `${targetVocative}, ` : "";
    const targetSubject = target === "나" ? "말씀하신 분이" : `${targetLabel}님이`;
    const topic = options.activeTopic ?? this.state.activeTopic ?? this.state.book.candidateTopics[0];
    const userPoint = options.userArgument?.paraphrase.trim().slice(0, 120);
    if (speaker === "moderator") {
      const moderatorLines: Partial<Record<UtteranceTask, string>> = ko
        ? {
            WELCOME: "리딩 테이블에 오신 것을 환영합니다. 책 이야기에 앞서 오늘 함께할 분들과 먼저 인사를 나누겠습니다.",
            INVITE_USER: "이번에는 여러분 차례입니다. 하시는 일이나 요즘의 독서 생활처럼 편한 이야기로 자신을 소개해 주세요.",
            FIRST_IMPRESSIONS_OPEN: "이제 책 이야기로 들어가 보겠습니다. 구체적인 장면은 잠시 뒤에 두고, 책을 덮었을 때 남은 전체적인 첫인상부터 들려주세요.",
            SCENES_OPEN: "서로 다른 첫인상이 어디서 시작됐는지 조금 보이네요. 이번에는 그 느낌을 만든 구체적인 장면 하나를 골라볼까요?",
            TOPIC_OPEN: `앞선 이야기에서 한 질문이 선명해졌습니다. ${topic}`,
            ASK_USER_POSITION: "두 사람의 관점을 들었습니다. 여러분은 이 질문을 어떻게 보시나요?",
            DEVILS_ADVOCATE: "괜찮습니다. 이번에는 다른 독자가 눈여겨본 부분을 하나 더 들어보겠습니다.",
            TOPIC_CLOSE: "같은 책에서 서로 무엇을 다르게 눈여겨봤는지 조금 더 보였습니다. 이제 각자가 가져갈 생각을 남겨보겠습니다.",
            WRAP_OPEN: "이제 각자 오늘 테이블에서 가져갈 생각을 하나씩 남겨보겠습니다. 처음 생각과 달라진 점이 없어도 괜찮습니다.",
            DISCUSSION_SUMMARY: "오늘은 같은 책에서 각자 무엇을 눈여겨봤는지 나눴습니다. 한 사람의 감상에 다른 장면과 이유가 차례로 더해졌습니다. 다르게 읽은 부분이 있다면 결론보다 그 이유를 함께 들었습니다. 함께 이야기해 주셔서 고맙고, 이제 모임 기록을 이어가겠습니다.",
          }
        : {
            WELCOME: "Welcome to Open Reading Club. Before discussing the book, let us first meet the people sharing the table tonight.",
            INVITE_USER: "Now it is your turn. Introduce yourself through your work, your current reading life, or any small detail you would like to share.",
            FIRST_IMPRESSIONS_OPEN: "Now we can open the book. Save the specific scenes for a moment and begin with the overall impression that remained when you finished.",
            SCENES_OPEN: "Those first impressions already point in different directions. Now choose one concrete scene that produced yours.",
            TOPIC_OPEN: `One question has become clear from the earlier conversation. ${topic}`,
            ASK_USER_POSITION: "You have heard what two readers noticed. What did you feel or think in this part of the book?",
            DEVILS_ADVOCATE: "That is all right. Let us hear one more detail another reader noticed.",
            TOPIC_CLOSE: "We have seen more of what each person noticed in the same book. Let us close with one thought each reader wants to carry away.",
            WRAP_OPEN: "Let us each leave one thought from tonight's table. It is fine if your original view has not changed.",
            DISCUSSION_SUMMARY: "Tonight we shared what each reader noticed in the same book. One reaction gained new scenes and reasons as the conversation continued. Where readings differed, we listened for the experience behind the difference instead of forcing a verdict. Thank you all for sharing the table, and the written recap comes next.",
          };
      return {
        utterance: moderatorLines[task] ?? (ko
          ? "그 차이를 서둘러 정리하지 않고 다음 이야기로 이어가겠습니다."
          : "We will keep that difference open and move to the next part of the conversation."),
        stance: null,
        refers_to: options.targetSpeaker ?? null,
        shelf_ref: null,
      };
    }

    let utterance: string;
    if (task === "PERSONA_INTRODUCTION") {
      utterance = isImaginedGuestId(speaker.id)
        ? ko
          ? `오늘은 ${localizedSpeakerName(speaker.id, this.language)}의 기록된 사고방식을 빌린 상상 속 독자로 함께합니다. ${speaker.socialIntroSeed.ko}`
          : `Tonight I join as an imagined reader shaped by ${speaker.name}'s documented ideas. ${speaker.socialIntroSeed.en}`
        : ko
          ? `안녕하세요, ${localizedSpeakerName(speaker.id, this.language)}입니다. ${speaker.socialIntroSeed.ko}`
          : `Hi, I'm ${speaker.name}. ${speaker.socialIntroSeed.en}`;
    } else if (task === "CHALLENGE_USER") {
      utterance = ko
        ? `${address}${userPoint ? `“${userPoint}”라고 느끼신 이유가 궁금합니다.` : "그렇게 읽으신 이유가 궁금합니다."} 어떤 장면에서 그 생각이 가장 선명해졌나요?`
        : `${address}${userPoint ? `I am curious what led you to read it as “${userPoint}.”` : "I am curious what led you to that reading."} Which scene made that feeling clearest?`;
    } else if (task === "CLOSING_REFLECTION") {
      const takeaway = ko
        ? {
            emotional: "다른 분들이 같은 장면에서 느낀 마음을 들으며 제가 지나친 관계의 변화를 보게 됐어요.",
            analytical: "다른 분들의 이야기를 들으며 처음에는 지나쳤던 선택 하나를 다시 보게 됐습니다.",
            contextual: "인물의 선택을 둘러싼 조건까지 함께 보니 책이 처음보다 넓게 읽혔습니다.",
          }[speaker.category]
        : {
            emotional: "Hearing how others felt the same scene helped me notice a shift in the relationship I had missed.",
            analytical: "Hearing the table led me back to a choice I had passed over at first.",
            contextual: "Looking at the conditions around the character's choice made the book feel wider than it did at first.",
          }[speaker.category];
      utterance = ko
        ? `${takeaway} 서로 다른 독자들과 이 책을 이야기해서 즐거웠어요.`
        : `${takeaway} I enjoyed hearing how differently the other readers experienced the book.`;
    } else if (task === "FIRST_IMPRESSION") {
      utterance = ko
        ? `저는 이 책을 한쪽 판단으로 쉽게 정리하기 어려웠습니다. 아직 특정 장면보다 책 전체가 남긴 감각을 조금 더 붙잡고 싶어요.`
        : `I could not settle this book into one easy verdict. Before choosing a scene, I want to sit with the feeling the whole work left behind.`;
    } else if (task === "MEMORABLE_SCENE") {
      const sceneAttention = ko
        ? {
            emotional: "두 사람의 감정이 어긋나기 시작한 순간",
            analytical: "한 선택이 뒤의 흐름을 바꾼 순간",
            contextual: "개인의 선택과 주변 조건이 맞물린 순간",
          }[speaker.category]
        : {
            emotional: "the moment two people's feelings began to miss each other",
            analytical: "the moment one choice changed what followed",
            contextual: "the moment a personal choice met the conditions around it",
          }[speaker.category];
      utterance = ko
        ? `저는 ${sceneAttention}을 다시 보고 싶습니다. 그 장면은 한 가지 느낌으로 쉽게 정리되지 않았어요.`
        : `I want to return to ${sceneAttention}. That scene refused an easy conclusion.`;
    } else if (task === "RESPOND_TO_USER_FOLLOWUP") {
      utterance = ko
        ? `${address}${userPoint ? `“${userPoint}”라는 설명을 들으니` : "덧붙인 설명을 들으니"} 왜 그렇게 읽으셨는지 알겠습니다. 제가 보던 장면에도 그 느낌을 함께 놓아볼게요.`
        : `${address}${userPoint ? `hearing your point that “${userPoint}”` : "hearing that addition"} helps me understand your reading. I will place that feeling beside the scene I had in mind.`;
    } else if (task === "BRIDGE_EXCHANGE") {
      utterance = ko
        ? `${address}저는 같은 이야기에서 다른 장면 하나가 떠올랐습니다. 그 장면을 함께 놓으면 방금 말씀하신 감상이 조금 더 넓게 보입니다.`
        : `${address}A different scene came to mind as I listened. Placing it beside your reading adds another way to experience the same idea.`;
    } else if (task === "REACT_TO_USER_SCENE") {
      utterance = ko
        ? "방금 짚은 장면은 그 선택의 의미뿐 아니라 뒤에 남은 대가도 함께 보게 합니다. 한쪽만 강조할 때 사라지는 것이 무엇인지 조금 더 붙잡고 싶어요."
        : "The scene just raised makes me consider both the meaning of the choice and the cost left behind. I want to hold onto what disappears when we emphasize only one side.";
    } else if (task === "OPEN_PERSONA_POSITION") {
      utterance = ko
        ? `${address}저는 이 질문에서 먼저 눈에 들어온 장면이 있습니다. 그 장면이 왜 중요하게 느껴졌는지 제 쪽의 독법을 보태볼게요.`
        : `${address}One scene came to mind first with this question. I want to add why it mattered to my reading.`;
    } else if (task === "CHALLENGE_PERSONA") {
      utterance = ko
        ? `${address}말씀을 들으니 저는 다른 장면이 떠올랐습니다. 같은 생각으로 이어지는지, 조금 다르게 읽히는지 제 감상을 보태볼게요.`
        : `${address}Your reading brought a different scene to mind for me. I want to add whether it leads me to the same feeling or a slightly different one.`;
    } else if (task === "RESPOND_TO_PERSONA") {
      utterance = ko
        ? `${address}그렇게 느끼신 이유를 들으니 장면이 다르게 보이네요. 저는 여기에 한 가지 다른 인상도 함께 남기고 싶습니다.`
        : `${address}Hearing why you felt that way changes how the scene looks to me. I want to place one more impression beside yours.`;
    } else if (task === "RESPOND_TO_USER_REPLY") {
      utterance = ko
        ? `${address}${userPoint ? `“${userPoint}”라는 답을 들으니` : "방금 답변을 들으니"} 왜 그 장면이 중요했는지 알겠습니다. 저는 제가 떠올린 장면과 함께 다시 생각해 볼게요.`
        : `${address}${userPoint ? `hearing your answer that “${userPoint}”` : "hearing your answer"} helps me understand why that scene mattered. I will think about it beside the scene I had in mind.`;
    } else {
      utterance = ko
        ? `${targetsUser ? "말씀해 주신 부분" : `${targetSubject} 말한 부분`}이 이해됩니다. 저는 같은 대목에서 먼저 보인 다른 느낌 하나를 보태고 싶어요.`
        : `I understand ${targetsUser ? "what you shared" : `what ${target} shared`}. I want to add one different feeling I noticed in the same part of the book.`;
    }
    return {
      utterance,
      stance: this.state.notes[speaker.id]?.overallStance ?? 0,
      refers_to: options.targetSpeaker ?? null,
      shelf_ref: null,
    };
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
    return this.commitGenerated(
      prepared.speaker,
      prepared.output,
      prepared.shelfKey,
      task,
      prepared.targetSpeaker,
    );
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
    return this.commitGenerated(
      prepared.speaker,
      prepared.output,
      prepared.shelfKey,
      task,
      prepared.targetSpeaker,
    );
  }

  private commitGenerated(
    speaker: PersonaCard | "moderator",
    output: UtteranceOutput,
    shelfKey: string,
    task: UtteranceTask,
    targetSpeaker?: string,
  ): Utterance {
    const utterance: Utterance = {
      speaker: speaker === "moderator" ? "moderator" : speaker.id,
      text: output.utterance,
      stance: output.stance ?? undefined,
      refersTo: targetSpeaker,
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
  ): Promise<string> {
    const text = this.requestUserInput
      ? await this.requestUserInput({ stage: this.state.stage, target, kind })
      : fallback;
    await this.appendUser(text, target);
    return text.trim();
  }

  private selectPerspectiveResponder(): PersonaCard {
    const ranked = [...this.state.personas].sort((left, right) => {
      const turnDifference =
        this.discussionTurnCount(left.id) - this.discussionTurnCount(right.id);
      if (turnDifference !== 0) return turnDifference;
      const leftRepeated = left.id === this.lastChallengerId ? 1 : 0;
      const rightRepeated = right.id === this.lastChallengerId ? 1 : 0;
      return leftRepeated - rightRepeated;
    });
    if (ranked.length === 0) {
      throw new Error("A reader is required to explore the user's perspective.");
    }
    const responder = ranked[0];
    this.lastChallengerId = responder.id;
    return responder;
  }

  private personaReasonFor(persona: PersonaCard, target: string): string | undefined {
    const notes = this.state.notes[persona.id];
    if (!notes) return undefined;
    return target === "overall_impression"
      ? notes.overallTake
      : notes.stanceByTopic.find((item) => item.topic === target)?.reason;
  }

  private discussionTurnCount(personaId: string): number {
    return this.state.transcript.filter(
      ({ stage, speaker }) => stage === "DISCUSSION" && speaker === personaId,
    ).length;
  }

  private selectBridgeReader(
    responder: PersonaCard | "moderator",
  ): PersonaCard {
    return [...this.state.personas]
      .filter((persona) => responder === "moderator" || persona.id !== responder.id)
      .sort((left, right) => {
        const turnDifference = this.discussionTurnCount(left.id) - this.discussionTurnCount(right.id);
        if (turnDifference !== 0) return turnDifference;
        return left.id.localeCompare(right.id);
      })[0];
  }

  private selectFollowUpResponder(): PersonaCard {
    const lastSpeaker = this.state.transcript.at(-1)?.speaker;
    return [...this.state.personas].sort((left, right) => {
      const leftRepeat = left.id === lastSpeaker ? 1 : 0;
      const rightRepeat = right.id === lastSpeaker ? 1 : 0;
      if (leftRepeat !== rightRepeat) return leftRepeat - rightRepeat;
      const turnDifference = this.discussionTurnCount(left.id) - this.discussionTurnCount(right.id);
      if (turnDifference !== 0) return turnDifference;
      return left.id.localeCompare(right.id);
    })[0];
  }

  private async appendContinuationChain(topic: string): Promise<void> {
    const lastPersonaId = [...this.state.transcript]
      .reverse()
      .find(({ stage, speaker }) =>
        stage === "DISCUSSION" && this.state.personas.some(({ id }) => id === speaker),
      )?.speaker;
    const lastPersona = this.state.personas.find(({ id }) => id === lastPersonaId);
    const first = [...this.state.personas]
      .filter(({ id }) => id !== lastPersona?.id)
      .sort((left, right) => {
        const turnDifference = this.discussionTurnCount(left.id) - this.discussionTurnCount(right.id);
        if (turnDifference !== 0) return turnDifference;
        return left.id.localeCompare(right.id);
      })[0];
    const second =
      lastPersona ??
      [...this.state.personas]
        .filter(({ id }) => id !== first.id)
        .sort(
          (left, right) =>
            this.discussionTurnCount(left.id) - this.discussionTurnCount(right.id),
        )[0];

    await this.appendGenerated(first, "RESPOND_TO_PERSONA", {
      activeTopic: topic,
      targetSpeaker: second.id,
    });
    await this.appendGenerated(second, "RESPOND_TO_PERSONA", {
      activeTopic: topic,
      targetSpeaker: first.id,
    });
  }

  private async exploreUserView(
    target: string,
    directedPersona?: PersonaCard,
  ): Promise<PersonaCard | "moderator"> {
    const userArgument = this.state.userStances[target];
    if (!userArgument) {
      await this.appendGenerated("moderator", "DEVILS_ADVOCATE", {
        activeTopic: target,
        userArgument: {
          stance: 0,
          paraphrase:
            this.language === "ko"
              ? "이번 차례에는 감상이나 해석이 제시되지 않았습니다."
              : "No reading or reaction was offered in this turn.",
        },
      });
      return "moderator";
    }
    const responder = directedPersona ?? this.selectPerspectiveResponder();
    this.lastChallengerId = responder.id;
    await this.appendGenerated(responder, "CHALLENGE_USER", {
      activeTopic: target,
      targetSpeaker: "user",
      userArgument: {
        ...userArgument,
        personaReason: this.personaReasonFor(responder, target),
      },
    });
    return responder;
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
    await this.appendGenerated("moderator", "INVITE_USER", {
      targetSpeaker: "user",
    });
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
    const sceneReaders = this.state.personas;
    const sceneAnchors = sceneReaders.map((persona) => {
      const assignment = this.state.meetingPlan.assignments.find(
        ({ personaId }) => personaId === persona.id,
      );
      const researchAnchor = this.state.meetingPlan.anchors.find(
        ({ id }) => id === assignment?.anchorId,
      );
      return researchAnchor?.detail ?? this.state.notes[persona.id].keyScenes[0];
    });
    const scenePromises = sceneReaders.map((persona, index) =>
      this.prepareGenerated(persona, "MEMORABLE_SCENE", {
        allowShelfReference: true,
        discussionFocus: sceneAnchors[index],
      }),
    );
    scenePromises.forEach((promise) => void promise.catch(() => undefined));
    for (const scenePromise of scenePromises) {
      await this.appendPrepared(await scenePromise, "MEMORABLE_SCENE");
    }
    await this.requestAndAppendUser(userInput, "memorable_scene");
    await this.appendGenerated(sceneReaders[0], "REACT_TO_USER_SCENE", {
      targetSpeaker: "user",
    });
  }

  private async runDiscussion(
    userInput: string,
    userReply: string,
    userFollowUp: string,
  ): Promise<void> {
    this.setStage("DISCUSSION");
    this.state.discussionPhase = "opening";
    const topic = this.state.meetingPlan.primaryPrompt;
    this.state.activeTopic = topic;
    const [leadA, leadB] = selectPerspectiveReaders(
      topic,
      this.state.personas,
      this.state.notes,
    );
    this.state.discussionRoles = {
      leadA: leadA.id,
      leadB: leadB.id,
    };
    await this.appendGenerated("moderator", "TOPIC_OPEN", {
      activeTopic: topic,
      discussionOrigin: "table",
    });
    await this.appendGenerated(leadA, "OPEN_PERSONA_POSITION", {
      activeTopic: topic,
      discussionOrigin: "table",
    });
    this.state.discussionPhase = "base_clash";
    await this.appendGenerated(leadB, "CHALLENGE_PERSONA", {
      activeTopic: topic,
      targetSpeaker: leadA.id,
    });
    this.state.discussionPhase = "awaiting_user_choice";

    let action = this.requestDiscussionAction
      ? await this.requestDiscussionAction({ round: 0, canListen: true, phase: "before_join" })
      : "join";
    if (action === "listen") {
      this.state.discussionListenCount = 1;
      await this.appendContinuationChain(topic);
      action = this.requestDiscussionAction
        ? await this.requestDiscussionAction({ round: 1, canListen: false, phase: "before_join" })
        : "join";
      if (action === "listen") action = "join";
    }

    if (action === "join") {
      this.state.discussionPhase = "user_exchange";
      const positionText = await this.requestAndAppendUser(
        userInput,
        "discussion_position",
        topic,
      );
      const directlyAddressed = resolveDirectlyAddressedPersona(
        positionText,
        this.state.personas,
        this.language,
      );
      const responder = await this.exploreUserView(topic, directlyAddressed);
      await this.requestAndAppendUser(userReply, "discussion_reply", topic);

      const updatedUserArgument = this.state.userStances[topic] ?? {
        stance: 0,
        paraphrase:
          this.language === "ko"
            ? "이번 질문에서는 의견을 보태지 않고 다른 이야기를 들었습니다."
            : "The user listened to the other readers without adding a response to this question.",
      };
      await this.appendGenerated(responder, "RESPOND_TO_USER_REPLY", {
        activeTopic: topic,
        targetSpeaker: "user",
        userArgument:
          responder === "moderator"
            ? updatedUserArgument
            : {
                ...updatedUserArgument,
                personaReason: this.personaReasonFor(responder, topic),
              },
      });

      const bridgeReader = this.selectBridgeReader(responder);
      this.state.discussionRoles = {
        ...this.state.discussionRoles,
        challenger: responder === "moderator" ? "moderator" : responder.id,
        bridgeReader: bridgeReader.id,
      };
      this.state.discussionPhase = "bridge_reader";
      await this.appendGenerated(bridgeReader, "BRIDGE_EXCHANGE", {
        activeTopic: topic,
        targetSpeaker: "user",
        userArgument: {
          ...updatedUserArgument,
          personaReason: this.personaReasonFor(bridgeReader, topic),
        },
      });

      let continuationCount = 0;
      this.state.discussionPhase = "continuation_checkpoint";
      while (continuationCount < MAX_DISCUSSION_EXTENSIONS && this.requestDiscussionAction) {
        const postJoinAction = await this.requestDiscussionAction({
          round: continuationCount + 1,
          canListen: true,
          phase: "after_join",
        });
        if (postJoinAction === "wrap") break;
        continuationCount += 1;
        if (postJoinAction === "join") {
          const followUpText = await this.requestAndAppendUser(
            userFollowUp,
            "discussion_followup",
            topic,
          );
          const followUpArgument = this.state.userStances[topic] ?? updatedUserArgument;
          const responder =
            resolveDirectlyAddressedPersona(
              followUpText,
              this.state.personas,
              this.language,
            ) ?? this.selectFollowUpResponder();
          await this.appendGenerated(responder, "RESPOND_TO_USER_FOLLOWUP", {
            activeTopic: topic,
            targetSpeaker: "user",
            userArgument: {
              ...followUpArgument,
              personaReason: this.personaReasonFor(responder, topic),
            },
          });
        } else {
          this.state.discussionListenCount += 1;
          await this.appendContinuationChain(topic);
        }
      }
    }
    this.state.discussionPhase = "closing";
  }

  private async runWrapUp(userInput: string): Promise<void> {
    this.setStage("WRAP_UP");
    await this.appendGenerated("moderator", "WRAP_OPEN");
    await this.requestAndAppendUser(userInput, "wrap_up");
    const closingIds = [
      this.state.discussionRoles?.challenger,
      this.state.discussionRoles?.bridgeReader,
      this.state.discussionRoles?.leadA,
      this.state.discussionRoles?.leadB,
      ...this.state.personas.map(({ id }) => id),
    ].filter((id): id is string => Boolean(id) && id !== "moderator");
    const closingPersonas = [...new Set(closingIds)]
      .map((id) => this.state.personas.find((persona) => persona.id === id))
      .filter((persona): persona is PersonaCard => Boolean(persona));
    const closingPromises = closingPersonas.map((persona) =>
      this.prepareGenerated(persona, "CLOSING_REFLECTION", {
        activeTopic: this.state.activeTopic,
      }),
    );
    closingPromises.forEach((promise) => void promise.catch(() => undefined));
    for (const closingPromise of closingPromises) {
      await this.appendPrepared(await closingPromise, "CLOSING_REFLECTION");
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
      userDisplayName: this.userDisplayName,
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
      const issues = validateRecapQuality(output.markdown, this.language, [
        ...this.state.personas.map(({ id }) => localizedSpeakerName(id, this.language)),
        this.userDisplayName,
      ]);
      if (issues.length === 0) return output.markdown;
      validationError = issues.join("; ");
    }
    throw new Error(`Recap failed validation: ${validationError}`);
  }
}
