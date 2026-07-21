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
import { isImaginedGuestId, selectPersonas } from "../personas";
import { localizedSpeakerName } from "../localization";
import type {
  CompletedSession,
  AppLanguage,
  ConfirmedBook,
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
  personas?: PersonaCard[];
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
      `Quality fallback: task=${task}; speaker=${isModerator ? "moderator" : speaker.id}`,
    );
    const output = this.buildFallbackUtterance(speaker, task, options);
    return { speaker, output, shelfKey };
  }

  private buildFallbackUtterance(
    speaker: PersonaCard | "moderator",
    task: UtteranceTask,
    options: GenerationOptions,
  ): UtteranceOutput {
    const ko = this.language === "ko";
    const targetsUser = (options.targetSpeaker ?? "user") === "user";
    const target = localizedSpeakerName(options.targetSpeaker ?? "user", this.language);
    const targetLabel = target;
    const topic = options.activeTopic ?? this.state.activeTopic ?? this.state.book.candidateTopics[0];
    if (speaker === "moderator") {
      const moderatorLines: Partial<Record<UtteranceTask, string>> = ko
        ? {
            WELCOME: "리딩 테이블에 오신 것을 환영합니다. 책 이야기에 앞서 오늘 함께할 분들과 먼저 인사를 나누겠습니다.",
            INVITE_USER: "이번에는 여러분 차례입니다. 하시는 일이나 요즘의 독서 생활처럼 편한 이야기로 자신을 소개해 주세요.",
            FIRST_IMPRESSIONS_OPEN: "이제 책 이야기로 들어가 보겠습니다. 구체적인 장면은 잠시 뒤에 두고, 책을 덮었을 때 남은 전체적인 첫인상부터 들려주세요.",
            SCENES_OPEN: "서로 다른 첫인상이 어디서 시작됐는지 조금 보이네요. 이번에는 그 느낌을 만든 구체적인 장면 하나를 골라볼까요?",
            TOPIC_OPEN: `앞선 이야기에서 한 질문이 선명해졌습니다. ${topic}`,
            ASK_USER_POSITION: "두 사람의 견해가 갈렸습니다. 여러분은 이 질문에서 어느 쪽에 더 가까운가요?",
            DEVILS_ADVOCATE: "잠시 반대편에서 묻겠습니다. 지금의 해석이 놓치고 있는 가장 강한 반례는 무엇일까요?",
            TOPIC_CLOSE: "이견은 완전히 풀리지 않았지만 어디에서 갈리는지는 분명해졌습니다. 이 긴장을 남겨 둔 채 마무리로 가겠습니다.",
            WRAP_OPEN: "이제 각자 오늘 테이블에서 가져갈 생각을 하나씩 남겨보겠습니다. 처음 생각과 달라진 점이 없어도 괜찮습니다.",
            DISCUSSION_SUMMARY: "오늘은 같은 책의 근거가 서로 다른 판단으로 이어지는 지점을 살폈습니다. 함께 이야기해 주셔서 고맙습니다. 남은 이견과 생각의 움직임을 이제 모임 기록에 담겠습니다.",
          }
        : {
            WELCOME: "Welcome to Open Reading Club. Before discussing the book, let us first meet the people sharing the table tonight.",
            INVITE_USER: "Now it is your turn. Introduce yourself through your work, your current reading life, or any small detail you would like to share.",
            FIRST_IMPRESSIONS_OPEN: "Now we can open the book. Save the specific scenes for a moment and begin with the overall impression that remained when you finished.",
            SCENES_OPEN: "Those first impressions already point in different directions. Now choose one concrete scene that produced yours.",
            TOPIC_OPEN: `One question has become clear from the earlier conversation. ${topic}`,
            ASK_USER_POSITION: "The two readers have reached a real disagreement. Where do you stand on this question?",
            DEVILS_ADVOCATE: "Let me push from the other side. What is the strongest counterexample this reading might miss?",
            TOPIC_CLOSE: "The disagreement is not resolved, but its fault line is clearer. Let us carry that tension into the closing round.",
            WRAP_OPEN: "Let us each leave one thought from tonight's table. It is fine if your original view has not changed.",
            DISCUSSION_SUMMARY: "Tonight we examined how the same evidence can lead readers toward different judgments. Thank you all for sharing the table. The written recap will preserve both the movement and the disagreement that remains.",
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

    const lens = ko ? speaker.roleLabel.ko : speaker.roleLabel.en;
    let utterance: string;
    if (task === "PERSONA_INTRODUCTION") {
      utterance = isImaginedGuestId(speaker.id)
        ? ko
          ? `오늘은 ${localizedSpeakerName(speaker.id, this.language)}의 기록된 사고방식을 빌린 상상 속 독자로 함께합니다. ${speaker.socialIntroSeed.ko}`
          : `Tonight I join as an imagined reader shaped by ${speaker.name}'s documented ideas. ${speaker.socialIntroSeed.en}`
        : ko
          ? `안녕하세요, ${localizedSpeakerName(speaker.id, this.language)}이고 ${speaker.roleLabel.ko}로 지내고 있어요. ${speaker.socialIntroSeed.ko}`
          : `Hi, I'm ${speaker.name}. My day job is ${speaker.roleLabel.en.toLowerCase()}. ${speaker.socialIntroSeed.en}`;
    } else if (task === "CHALLENGE_USER") {
      utterance = ko
        ? "그 결론을 그대로 받아들이기는 어렵습니다. 지금 든 근거가 가장 강한 반대 사례까지도 설명할 수 있을까요?"
        : "I cannot accept that conclusion as it stands. Can your evidence also explain the strongest counterexample?";
    } else if (task === "CLOSING_REFLECTION") {
      utterance = ko
        ? `${lens}인 저는 오늘 대화에서 처음보다 더 어려운 질문 하나를 가져가게 됐습니다. 서로 다른 독자들과 이 책을 이야기해서 즐거웠어요.`
        : `As a ${lens.toLowerCase()}, I am leaving with a harder question than the one I brought to the table. I enjoyed hearing this book argued by such different readers.`;
    } else if (task === "FIRST_IMPRESSION") {
      utterance = ko
        ? `저는 이 책을 한쪽 판단으로 쉽게 정리하기 어려웠습니다. 아직 특정 장면보다 책 전체가 남긴 감각을 조금 더 붙잡고 싶어요.`
        : `I could not settle this book into one easy verdict. Before choosing a scene, I want to sit with the feeling the whole work left behind.`;
    } else if (task === "MEMORABLE_SCENE") {
      utterance = ko
        ? `저는 제 관점이 가장 불편하게 흔들린 장면을 다시 보고 싶습니다. 그 순간이 ${lens}인 제게도 간단한 결론을 허락하지 않았어요.`
        : `I want to return to the scene that most unsettled my usual lens. It refused to give even a ${lens.toLowerCase()} an easy conclusion.`;
    } else if (task === "SUPPORT_USER") {
      utterance = ko
        ? `${targetLabel}님, 방금 나온 구분은 다른 근거도 설명할 여지가 있다고 봅니다. 다만 중요한 예외까지 지워 버리면 그 해석도 너무 넓어집니다.`
        : `${target}, I think the distinction just offered can account for other evidence as well. Its limit is that it becomes too broad if it erases an important exception.`;
    } else if (task === "REACT_TO_USER_SCENE") {
      utterance = ko
        ? "방금 짚은 장면은 그 선택의 의미뿐 아니라 뒤에 남은 대가도 함께 보게 합니다. 한쪽만 강조할 때 사라지는 것이 무엇인지 조금 더 붙잡고 싶어요."
        : "The scene just raised makes me consider both the meaning of the choice and the cost left behind. I want to hold onto what disappears when we emphasize only one side.";
    } else if (task === "OPEN_PERSONA_POSITION") {
      const stance = getTopicStance(this.state.notes[speaker.id], topic);
      utterance = ko
        ? `${targetLabel}님, 저는 이 질문에 ${stance >= 0.5 ? "대체로 그렇다고" : stance <= -0.5 ? "대체로 그렇지 않다고" : "한쪽으로 단정하기 어렵다고"} 봅니다. 같은 근거가 왜 서로 다른 판단으로 이어지는지 직접 나눠 보고 싶어요.`
        : `${target}, I ${stance >= 0.5 ? "mostly agree with the proposition" : stance <= -0.5 ? "mostly reject the proposition" : "do not think the proposition supports one clean answer"}. I want to make clear why the same evidence leads us apart.`;
    } else if (task === "CHALLENGE_PERSONA") {
      utterance = ko
        ? `${targetLabel}님, 그 결론은 장면이 남긴 반대 증거를 충분히 설명하지 못합니다. 같은 근거가 다른 결과를 낳는 부분은 어떻게 보시나요?`
        : `${target}, that conclusion does not yet explain the scene's strongest contrary evidence. How do you account for the part where the same premise leads to a different result?`;
    } else if (task === "RESPOND_TO_PERSONA") {
      utterance = ko
        ? `${targetLabel}님이 짚은 한계는 인정하지만, 그것만으로 제 판단이 뒤집히지는 않습니다. 같은 장면에서 우리가 무엇을 더 중요한 결과로 보는지가 아직 다릅니다.`
        : `${target}, I grant the limit you identified, but it does not overturn my judgment. We still disagree about which consequence of the same scene should carry more weight.`;
    } else if (task === "RESPOND_TO_USER_REPLY") {
      utterance = ko
        ? "방금 답변으로 구분하려는 지점은 더 분명해졌습니다. 그래도 그 구분이 설명하지 못하는 결과가 남아 있어 제 반론은 완전히 풀리지 않았어요."
        : `Your answer makes the distinction clearer. My objection is not fully resolved because one consequence still falls outside that distinction.`;
    } else {
      utterance = ko
        ? `${targetsUser ? "짚어 주신 부분" : `${targetLabel}님이 짚은 부분`}은 이해하지만 제 판단은 아직 다릅니다. 같은 대목에서 생긴 이 차이를 조금 더 구체적으로 따져보고 싶어요.`
        : `I understand ${targetsUser ? "your point" : `${target}'s point`}, but my judgment still differs. I want to test that difference more precisely against the same part of the book.`;
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
    if (!notes) return undefined;
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
            this.language === "ko"
              ? "이번 차례에는 입장이 제시되지 않았습니다."
              : "No position was offered in this turn.",
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
    const sceneReaders: [PersonaCard, PersonaCard] = [ranked[0], ranked[ranked.length - 1]];
    const sceneAnchors = selectDistinctSceneAnchors(sceneReaders, this.state.notes);
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
      ? await this.requestDiscussionAction({ round: 0, canListen: true, phase: "before_join" })
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
        ? await this.requestDiscussionAction({ round: 1, canListen: false, phase: "before_join" })
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
            ? "이번 질문에는 입장이 제시되지 않았습니다."
            : "No position was offered for this question.",
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

      while (
        this.state.discussionListenCount < MAX_DISCUSSION_EXTENSIONS &&
        this.requestDiscussionAction
      ) {
        const postJoinAction = await this.requestDiscussionAction({
          round: this.state.discussionListenCount + 1,
          canListen: true,
          phase: "after_join",
        });
        if (postJoinAction !== "listen") break;
        this.state.discussionListenCount += 1;
        const lastSpeaker = this.state.transcript.at(-1)?.speaker;
        const first = lastSpeaker === leadA.id ? leadB : leadA;
        const second = first.id === leadA.id ? leadB : leadA;
        await this.appendGenerated(first, "RESPOND_TO_PERSONA", {
          activeTopic: topic,
          targetSpeaker: second.id,
        });
        await this.appendGenerated(second, "RESPOND_TO_PERSONA", {
          activeTopic: topic,
          targetSpeaker: first.id,
        });
      }
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
