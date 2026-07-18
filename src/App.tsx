import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { GenerationApiError, HttpGenerationClient } from "./api/httpGenerationClient";
import { MockGenerationClient } from "./api/mockGenerationClient";
import { calculateReadingDelay } from "./engine/playbackTiming";
import { SessionEngine } from "./engine/sessionEngine";
import { localizedSpeakerName, STAGE_LABELS } from "./localization";
import { PERSONAS, selectPersonas } from "./personas";
import { formatTranscriptAsMarkdown } from "./transcriptExport";
import type { AppLanguage, PersonaCard, StageId, Utterance } from "./types";
import { DiagnosticsPanel } from "./ui/DiagnosticsPanel";

const STAGES: StageId[] = [
  "INTRO",
  "FIRST_IMPRESSIONS",
  "MEMORABLE_SCENES",
  "DISCUSSION",
  "WRAP_UP",
];

const INPUT_PROMPTS: Record<AppLanguage, Record<StageId, string>> = {
  en: {
    INTRO: "What brings you to this book?",
    FIRST_IMPRESSIONS: "What was your first impression?",
    MEMORABLE_SCENES: "Which scene stayed with you?",
    DISCUSSION: "Where do you land on this question?",
    WRAP_UP: "What are you leaving the table with?",
  },
  ko: {
    INTRO: "어떤 이유로 이 책을 펼치게 되었나요?",
    FIRST_IMPRESSIONS: "이 책의 첫인상은 어땠나요?",
    MEMORABLE_SCENES: "어떤 장면이 가장 오래 남았나요?",
    DISCUSSION: "이 질문에 대해 어디에 서 있나요?",
    WRAP_UP: "오늘 테이블에서 무엇을 가지고 떠나시나요?",
  },
};

const COPY = {
  en: {
    prototype: "Text prototype",
    mockBadge: "Mock · no API credits",
    liveBadge: "Live · GPT-5.6 API",
    description:
      "Test the pacing before the room gets decorated. Reader turns advance at a natural reading pace, and the table stops when it is your turn.",
    demoBook: "Demo book",
    bookTitle: "The Stranger",
    bookMeta: "Albert Camus · Maddie, Marcus, and Eleanor",
    privacyTitle: "Data & privacy",
    privacy:
      "Your book title and messages are sent to OpenAI to generate this discussion. This session is stored only in this browser and is not saved by The Reading Table's server.",
    mockPrivacy:
      "This prototype uses deterministic mock responses, so nothing is sent to OpenAI during this walkthrough.",
    start: "Start mock session",
    startLive: "Start live GPT-5.6 session",
    preparing: "Preparing the table",
    ready: "Ready to start",
    noCredits: "No API credits used",
    liveCredits: "Live API · credits used",
    readersSeated: "The readers are seated. Alex will open the table in a moment.",
    tableWaiting: "The table is waiting for you.",
    readyToSpeak: (name: string) => `${name} is ready to speak.`,
    generating: "Generating the next turn…",
    considering: "The table is considering your point…",
    passed: "You passed this turn.",
    placeholder: "Share your view in your own words…",
    pass: "Pass",
    share: "Share",
    next: "Next →",
    thinking: "Thinking…",
    sessionComplete: "Session complete",
    recapTitle: "Meeting recap",
    newSession: "Start a new session",
    sessionFailed: "The session could not continue.",
    sessionLabel: "The Stranger · Mock session",
    liveSessionLabel: "The Stranger · Live GPT-5.6 session",
    stagesLabel: "Session stages",
    copyTranscript: "Copy full transcript",
    copied: "Copied",
    copyFailed: "Copy failed",
    completionTitle: "The table is complete",
    transcriptTab: (count: number) => `Full transcript ${count}`,
    copyRecap: "Copy meeting recap",
    recapCopied: "Recap copied",
    downloadMarkdown: "Download Markdown",
    autoMode: "Playback",
    autoOn: "Automatic pacing on",
    autoOff: "Automatic pacing off",
    autoHint: "Turns advance according to text length and always stop for you.",
    pause: "Pause",
    resume: "Continue",
    skipNow: "Next now",
    readingTable: "Reading table",
    tableReady: "The readers are taking their seats.",
    currentDialogue: "Current dialogue",
    viewTranscript: (count: number) => `View transcript ${count}`,
    transcriptTitle: "Conversation transcript",
    closeTranscript: "Close transcript",
    modeTitle: "Conversation source",
    mockMode: "Mock",
    liveMode: "Live GPT-5.6",
    mockModeHint: "Fast deterministic responses for UI testing.",
    liveModeHint: "Real generated discussion. This uses your API credits.",
    liveChecking: "Checking the local API server…",
    liveReady: (model: string) => `${model} is ready on the server.`,
    liveUnavailable: "Live mode is unavailable. Check the server API key and restart it.",
    serverNotConfigured: "The server API key is not configured.",
    sessionLimitReached: "This live session reached its model-call limit.",
    modelRefused: "The model could not generate this turn safely.",
    incompleteOutput: "A reader's response ended before it was complete. Please retry the session.",
    invalidStructuredOutput: "A reader returned an unusable structured response. Please retry the session.",
    liveGenerationFailed: "The live API request failed. The mock mode is still available.",
    readingNotesReady: (progress: string) => `Reader notes ready: ${progress}`,
    retryingReadingNotes: "A reader's notes were incomplete, so only that reader is retrying.",
    currentSpeaker: "Speaking",
    nextSpeaker: "Next",
    yourTurn: "Your turn",
    waitingForYou: "The table stops here for you.",
    movingToRecap: "Alex has wrapped up the discussion. The meeting recap is next.",
  },
  ko: {
    prototype: "텍스트 프로토타입",
    mockBadge: "모의 응답 · API 크레딧 미사용",
    liveBadge: "실제 연결 · GPT-5.6 API",
    description:
      "원탁을 꾸미기 전에 대화의 호흡부터 확인합니다. 참여자 발언은 읽을 시간에 맞춰 자동으로 이어지고, 사용자 차례가 오면 테이블이 멈춥니다.",
    demoBook: "데모 도서",
    bookTitle: "이방인",
    bookMeta: "알베르 카뮈 · 매디, 마커스, 엘리너",
    privacyTitle: "데이터 및 개인정보",
    privacy:
      "책 제목과 메시지는 토론을 생성하기 위해 OpenAI로 전송됩니다. 이 세션은 현재 브라우저에만 저장되며 리딩 테이블 서버에는 저장되지 않습니다.",
    mockPrivacy:
      "이 프로토타입은 결정론적 모의 응답을 사용하므로 이번 체험에서는 OpenAI로 아무 내용도 전송되지 않습니다.",
    start: "모의 세션 시작",
    startLive: "실제 GPT-5.6 세션 시작",
    preparing: "테이블을 준비하고 있습니다",
    ready: "시작할 준비가 되었습니다",
    noCredits: "API 크레딧을 사용하지 않습니다",
    liveCredits: "실제 API · 크레딧 사용",
    readersSeated: "독자들이 자리에 앉았습니다. 잠시 후 알렉스가 모임을 시작합니다.",
    tableWaiting: "테이블이 여러분의 이야기를 기다립니다.",
    readyToSpeak: (name: string) => `${name}의 발언 차례입니다.`,
    generating: "다음 발언을 만들고 있습니다…",
    considering: "테이블이 여러분의 의견을 생각하고 있습니다…",
    passed: "이번 차례는 건너뛰었습니다.",
    placeholder: "여러분의 생각을 직접 적어주세요…",
    pass: "건너뛰기",
    share: "공유",
    next: "다음 →",
    thinking: "생각 중…",
    sessionComplete: "세션 완료",
    recapTitle: "모임 기록",
    newSession: "새 세션 시작",
    sessionFailed: "세션을 계속 진행할 수 없습니다.",
    sessionLabel: "이방인 · 모의 세션",
    liveSessionLabel: "이방인 · 실제 GPT-5.6 세션",
    stagesLabel: "세션 단계",
    copyTranscript: "전체 대화 복사",
    copied: "복사됨",
    copyFailed: "복사 실패",
    completionTitle: "모임이 끝났습니다",
    transcriptTab: (count: number) => `전체 대화 ${count}`,
    copyRecap: "모임 기록 복사",
    recapCopied: "기록 복사됨",
    downloadMarkdown: "Markdown 다운로드",
    autoMode: "진행 방식",
    autoOn: "자동 진행 켜짐",
    autoOff: "자동 진행 꺼짐",
    autoHint: "글 길이에 맞춰 진행하고 내 차례에서는 항상 멈춥니다.",
    pause: "일시정지",
    resume: "계속",
    skipNow: "바로 다음",
    readingTable: "리딩 테이블",
    tableReady: "독자들이 자리에 앉고 있습니다.",
    currentDialogue: "현재 대화",
    viewTranscript: (count: number) => `대화 기록 보기 ${count}`,
    transcriptTitle: "대화 기록",
    closeTranscript: "대화 기록 닫기",
    modeTitle: "대화 생성 방식",
    mockMode: "모의 응답",
    liveMode: "실제 GPT-5.6",
    mockModeHint: "UI 확인용으로 빠르고 동일한 응답을 사용합니다.",
    liveModeHint: "실제로 토론을 생성하며 API 크레딧을 사용합니다.",
    liveChecking: "로컬 API 서버를 확인하고 있습니다…",
    liveReady: (model: string) => `서버의 ${model} 연결 준비가 완료되었습니다.`,
    liveUnavailable: "실제 모드를 사용할 수 없습니다. 서버 API 키와 재시작 상태를 확인해주세요.",
    serverNotConfigured: "서버에 API 키가 설정되지 않았습니다.",
    sessionLimitReached: "이 실제 세션의 모델 호출 한도에 도달했습니다.",
    modelRefused: "모델이 이 발언을 안전하게 생성할 수 없었습니다.",
    incompleteOutput: "독자 응답이 완성되기 전에 종료되었습니다. 세션을 다시 시도해주세요.",
    invalidStructuredOutput: "독자의 구조화 응답을 사용할 수 없습니다. 세션을 다시 시도해주세요.",
    liveGenerationFailed: "실제 API 요청에 실패했습니다. 모의 응답 모드는 계속 사용할 수 있습니다.",
    readingNotesReady: (progress: string) => `독서 노트 준비: ${progress}`,
    retryingReadingNotes: "완성되지 않은 독자의 노트만 다시 준비하고 있습니다.",
    currentSpeaker: "발언 중",
    nextSpeaker: "다음",
    yourTurn: "내 차례",
    waitingForYou: "내 차례에서 테이블이 멈췄습니다.",
    movingToRecap: "알렉스가 토론을 정리했습니다. 이어서 모임 기록으로 이동합니다.",
  },
};

type Screen = "setup" | "session" | "recap";
type InputRequest = { stage: StageId; target?: string };
type CopyStatus = "idle" | "copied" | "failed";
type RecapView = "recap" | "transcript";
type GenerationMode = "mock" | "live";
type LiveAvailability = "checking" | "available" | "unavailable";

async function writeToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();
  const copied = document.execCommand("copy");
  textarea.remove();
  if (!copied) throw new Error("Clipboard copy failed.");
}

function speakerColor(speaker: string): string {
  if (speaker === "moderator") return "#6b4f2c";
  if (speaker === "user") return "#1f4f46";
  return PERSONAS.find((persona) => persona.id === speaker)?.avatarColor ?? "#57534e";
}

function pendingSpeakerName(
  speaker: PersonaCard | "moderator",
  language: AppLanguage,
): string {
  if (speaker === "moderator") return language === "ko" ? "알렉스" : "Alex";
  return localizedSpeakerName(speaker.id, language);
}

const DEMO_SPEAKERS = [
  "moderator",
  ...selectPersonas("demo").map(({ id }) => id),
  "user",
];

function SpeakerAvatar({
  speaker,
  language,
  size = "large",
}: {
  speaker: string;
  language: AppLanguage;
  size?: "small" | "large";
}) {
  const name = localizedSpeakerName(speaker, language);
  return (
    <span
      className={`grid shrink-0 place-items-center rounded-full font-bold text-white ${
        size === "small" ? "h-7 w-7 text-[10px]" : "h-11 w-11 text-sm"
      }`}
      style={{ backgroundColor: speakerColor(speaker) }}
      aria-hidden="true"
    >
      {name.slice(0, 1)}
    </span>
  );
}

const ROUND_TABLE_POSITIONS: Record<string, string> = {
  moderator: "left-1/2 top-3 -translate-x-1/2",
  maddie: "left-3 top-[34%] sm:left-8",
  marcus: "right-3 top-[34%] sm:right-8",
  dev: "bottom-3 left-[18%] -translate-x-1/2 sm:left-[22%]",
  user: "bottom-3 right-[18%] translate-x-1/2 sm:right-[22%]",
};

function RoundTable({
  language,
  activeSpeaker,
  upcomingSpeaker,
}: {
  language: AppLanguage;
  activeSpeaker?: string;
  upcomingSpeaker?: string;
}) {
  const copy = COPY[language];
  return (
    <section
      className="relative h-[300px] overflow-hidden rounded-[2rem] border border-amber-900/10 bg-[#f7efe1] shadow-sm sm:h-[340px]"
      aria-label={copy.readingTable}
    >
      <div
        className="absolute left-1/2 top-1/2 flex h-[46%] w-[62%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[50%] border border-amber-950/20 bg-[#d6b68d] px-8 text-center shadow-[inset_0_2px_0_rgba(255,255,255,0.45),0_12px_25px_rgba(75,55,35,0.12)] sm:w-[58%]"
        aria-hidden="true"
      >
        <div className="w-full max-w-md">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-amber-950/55">
            {copy.demoBook}
          </p>
          <p className="mt-1 font-serif text-xl text-amber-950 sm:text-2xl">{copy.bookTitle}</p>
          <p className="mt-2 text-xs text-amber-950/65">{copy.bookMeta}</p>
        </div>
      </div>

      <div role="list">
        {DEMO_SPEAKERS.map((speaker) => {
          const isActive = activeSpeaker === speaker;
          const isNext = !isActive && upcomingSpeaker === speaker;
          return (
            <div
              key={speaker}
              role="listitem"
              aria-current={isActive ? "true" : undefined}
              className={`absolute z-[1] w-[4.5rem] text-center ${ROUND_TABLE_POSITIONS[speaker]}`}
            >
              <div
                className={`relative mx-auto w-fit rounded-full p-0.5 transition duration-300 ${
                  isActive
                    ? "scale-110 ring-4 ring-amber-400 ring-offset-2 ring-offset-[#f7efe1]"
                    : isNext
                      ? "ring-2 ring-stone-500 ring-offset-2 ring-offset-[#f7efe1]"
                      : "opacity-75"
                }`}
              >
                <SpeakerAvatar speaker={speaker} language={language} />
                {(isActive || isNext) && (
                  <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-stone-900 px-1.5 py-0.5 text-[9px] font-bold text-white">
                    {isActive
                      ? speaker === "user"
                        ? copy.yourTurn
                        : copy.currentSpeaker
                      : copy.nextSpeaker}
                  </span>
                )}
              </div>
              <p className="mt-2 truncate text-[11px] font-semibold text-stone-700">
                {localizedSpeakerName(speaker, language)}
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CurrentDialogue({
  language,
  latestUtterance,
  inputRequest,
  upcomingSpeaker,
}: {
  language: AppLanguage;
  latestUtterance?: Utterance;
  inputRequest?: InputRequest;
  upcomingSpeaker?: string;
}) {
  const copy = COPY[language];
  const speaker = inputRequest ? "user" : (latestUtterance?.speaker ?? upcomingSpeaker ?? "moderator");
  const text = inputRequest
    ? INPUT_PROMPTS[language][inputRequest.stage]
    : (latestUtterance?.text ?? copy.tableReady);

  return (
    <section
      className="mt-4 flex min-h-32 items-start gap-4 rounded-2xl border border-stone-300 bg-white p-5 shadow-sm"
      aria-label={copy.currentDialogue}
      aria-live="polite"
    >
      <div className="rounded-full ring-4 ring-stone-100">
        <SpeakerAvatar speaker={speaker} language={language} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-bold text-stone-900">{localizedSpeakerName(speaker, language)}</p>
          {inputRequest && (
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
              {copy.yourTurn}
            </span>
          )}
        </div>
        <p className="mt-2 whitespace-pre-wrap text-base leading-7 text-stone-700 sm:text-lg sm:leading-8">
          {text}
        </p>
      </div>
    </section>
  );
}

function TranscriptList({
  transcript,
  language,
}: {
  transcript: Utterance[];
  language: AppLanguage;
}) {
  return transcript.map((utterance, index) => {
    const previousStage = transcript[index - 1]?.stage;
    const isUser = utterance.speaker === "user";
    return (
      <div key={`${index}-${utterance.speaker}`}>
        {utterance.stage !== previousStage && (
          <p className="mb-3 mt-7 text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">
            {STAGE_LABELS[language][utterance.stage]}
          </p>
        )}
        <article className={`flex gap-3 ${isUser ? "flex-row-reverse" : ""}`}>
          <div
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-bold text-white"
            style={{ backgroundColor: speakerColor(utterance.speaker) }}
            aria-hidden="true"
          >
            {localizedSpeakerName(utterance.speaker, language).slice(0, 1)}
          </div>
          <div
            className={`max-w-[85%] rounded-2xl border p-4 shadow-sm ${
              isUser
                ? "border-emerald-800 bg-emerald-900 text-white"
                : "border-stone-200 bg-white"
            }`}
          >
            <p className={`text-xs font-bold ${isUser ? "text-emerald-100" : "text-stone-500"}`}>
              {localizedSpeakerName(utterance.speaker, language)}
            </p>
            <p className="mt-1 leading-7">{utterance.text}</p>
          </div>
        </article>
      </div>
    );
  });
}

function RenderedRecap({ markdown }: { markdown: string }) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm sm:p-10">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h2 className="border-b border-stone-200 pb-5 font-serif text-3xl leading-tight sm:text-4xl">
              {children}
            </h2>
          ),
          h2: ({ children }) => (
            <h3 className="mb-3 mt-9 font-serif text-2xl text-stone-900">{children}</h3>
          ),
          p: ({ children }) => <p className="my-3 leading-8 text-stone-700">{children}</p>,
          ul: ({ children }) => <ul className="my-3 list-disc space-y-2 pl-6 text-stone-700">{children}</ul>,
          ol: ({ children }) => <ol className="my-3 list-decimal space-y-2 pl-6 text-stone-700">{children}</ol>,
          li: ({ children }) => <li className="pl-1 leading-7">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="my-5 border-l-4 border-amber-400 bg-amber-50 px-5 py-2 italic text-stone-700">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-5 overflow-x-auto rounded-xl border border-stone-200">
              <table className="w-full min-w-[700px] border-collapse text-left text-sm">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border-b border-stone-300 bg-stone-100 px-4 py-3 font-semibold text-stone-800">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="border-b border-stone-200 px-4 py-3 align-top leading-6 text-stone-700">
              {children}
            </td>
          ),
          em: ({ children }) => <em className="font-medium text-amber-900">{children}</em>,
          strong: ({ children }) => <strong className="font-semibold text-stone-900">{children}</strong>,
        }}
      >
        {markdown}
      </ReactMarkdown>
    </article>
  );
}

export function App() {
  const [language, setLanguage] = useState<AppLanguage>("ko");
  const [generationMode, setGenerationMode] = useState<GenerationMode>("mock");
  const [liveAvailability, setLiveAvailability] = useState<LiveAvailability>("checking");
  const [liveModel, setLiveModel] = useState("gpt-5.6");
  const [screen, setScreen] = useState<Screen>("setup");
  const [stage, setStage] = useState<StageId>("INTRO");
  const [transcript, setTranscript] = useState<Utterance[]>([]);
  const [status, setStatus] = useState("");
  const [pendingTurn, setPendingTurn] = useState("");
  const [canAdvance, setCanAdvance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inputRequest, setInputRequest] = useState<InputRequest>();
  const [inputText, setInputText] = useState("");
  const [recap, setRecap] = useState("");
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [recapCopyStatus, setRecapCopyStatus] = useState<CopyStatus>("idle");
  const [recapView, setRecapView] = useState<RecapView>("recap");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [playbackPaused, setPlaybackPaused] = useState(false);
  const [activeSpeaker, setActiveSpeaker] = useState<string>();
  const [upcomingSpeaker, setUpcomingSpeaker] = useState<string>();
  const advanceResolver = useRef<(() => void) | null>(null);
  const inputResolver = useRef<((value: string) => void) | null>(null);
  const autoAdvanceRef = useRef(true);
  const playbackPausedRef = useRef(false);
  const lastUtteranceRef = useRef<Utterance | null>(null);
  const playbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const playbackDeadlineRef = useRef(0);
  const playbackRemainingRef = useRef(0);
  const playbackActionRef = useRef<(() => void) | null>(null);
  const copy = COPY[language];

  const clearPlaybackTimers = useCallback(() => {
    if (playbackTimeoutRef.current) clearTimeout(playbackTimeoutRef.current);
    playbackTimeoutRef.current = null;
  }, []);

  const runPlaybackAction = useCallback(() => {
    const action = playbackActionRef.current;
    if (!action) return;
    clearPlaybackTimers();
    playbackActionRef.current = null;
    playbackRemainingRef.current = 0;
    setCanAdvance(false);
    setBusy(true);
    setPendingTurn(COPY[language].generating);
    action();
  }, [clearPlaybackTimers, language]);

  const startPlaybackClock = useCallback(
    (durationMs: number) => {
      clearPlaybackTimers();
      const safeDuration = Math.max(0, durationMs);
      playbackRemainingRef.current = safeDuration;
      playbackDeadlineRef.current = Date.now() + safeDuration;
      playbackTimeoutRef.current = setTimeout(runPlaybackAction, safeDuration);
    },
    [clearPlaybackTimers, runPlaybackAction],
  );

  const queuePlayback = useCallback(
    (durationMs: number, action: () => void) => {
      clearPlaybackTimers();
      playbackActionRef.current = action;
      playbackRemainingRef.current = durationMs;
      setCanAdvance(true);
      setBusy(false);
      if (autoAdvanceRef.current && !playbackPausedRef.current) {
        startPlaybackClock(durationMs);
      }
    },
    [clearPlaybackTimers, startPlaybackClock],
  );

  const pausePlayback = useCallback(() => {
    if (!playbackActionRef.current || playbackPausedRef.current) return;
    const remaining = Math.max(0, playbackDeadlineRef.current - Date.now());
    playbackRemainingRef.current = remaining;
    clearPlaybackTimers();
    playbackPausedRef.current = true;
    setPlaybackPaused(true);
  }, [clearPlaybackTimers]);

  const resumePlayback = useCallback(() => {
    if (!playbackActionRef.current || !playbackPausedRef.current) return;
    playbackPausedRef.current = false;
    setPlaybackPaused(false);
    startPlaybackClock(playbackRemainingRef.current);
  }, [startPlaybackClock]);

  const toggleAutoAdvance = useCallback(() => {
    if (autoAdvanceRef.current) {
      if (playbackActionRef.current && !playbackPausedRef.current) {
        const remaining = Math.max(0, playbackDeadlineRef.current - Date.now());
        playbackRemainingRef.current = remaining;
        clearPlaybackTimers();
      }
      autoAdvanceRef.current = false;
      playbackPausedRef.current = false;
      setAutoAdvance(false);
      setPlaybackPaused(false);
      return;
    }

    autoAdvanceRef.current = true;
    setAutoAdvance(true);
    if (playbackActionRef.current) {
      startPlaybackClock(playbackRemainingRef.current);
    }
  }, [clearPlaybackTimers, startPlaybackClock]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/health", { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Health check failed");
        const body = (await response.json()) as {
          liveGenerationAvailable?: boolean;
          model?: string;
        };
        if (body.model) setLiveModel(body.model);
        setLiveAvailability(body.liveGenerationAvailable ? "available" : "unavailable");
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLiveAvailability("unavailable");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden && autoAdvanceRef.current) pausePlayback();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [pausePlayback]);

  useEffect(
    () => () => {
      clearPlaybackTimers();
      playbackActionRef.current = null;
    },
    [clearPlaybackTimers],
  );

  const copyTranscript = async () => {
    if (transcript.length === 0) return;
    try {
      await writeToClipboard(formatTranscriptAsMarkdown(transcript, language));
      setCopyStatus("copied");
    } catch {
      setCopyStatus("failed");
    }
  };

  const copyButtonLabel =
    copyStatus === "copied"
      ? copy.copied
      : copyStatus === "failed"
        ? copy.copyFailed
        : copy.copyTranscript;

  const openTranscript = () => {
    if (autoAdvance && canAdvance && !busy && !playbackPaused) pausePlayback();
    setTranscriptOpen(true);
  };

  const copyRecap = async () => {
    if (!recap) return;
    try {
      await writeToClipboard(recap);
      setRecapCopyStatus("copied");
    } catch {
      setRecapCopyStatus("failed");
    }
  };

  const recapCopyButtonLabel =
    recapCopyStatus === "copied"
      ? copy.recapCopied
      : recapCopyStatus === "failed"
        ? copy.copyFailed
        : copy.copyRecap;

  const downloadRecap = () => {
    if (!recap) return;
    const blob = new Blob([recap], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `recap-${language === "ko" ? "이방인" : "the-stranger"}-${new Date().toISOString().slice(0, 10)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const startSession = () => {
    clearPlaybackTimers();
    playbackActionRef.current = null;
    playbackPausedRef.current = false;
    lastUtteranceRef.current = null;
    setScreen("session");
    setTranscript([]);
    setRecap("");
    setRecapView("recap");
    setTranscriptOpen(false);
    setRecapCopyStatus("idle");
    setError("");
    setBusy(true);
    setStatus(copy.preparing);
    setPendingTurn(copy.readersSeated);
    setPlaybackPaused(false);
    setActiveSpeaker(undefined);
    setUpcomingSpeaker(undefined);

    const generationClient =
      generationMode === "live" ? new HttpGenerationClient() : new MockGenerationClient();
    const engine = new SessionEngine(generationClient, {
      onStatus(message) {
        if (message.startsWith("Stage: ")) {
          const nextStage = message.slice("Stage: ".length) as StageId;
          setStage(nextStage);
          setStatus(STAGE_LABELS[language][nextStage]);
        } else if (message === "Generating meeting recap") {
          setStatus(language === "ko" ? "모임 기록을 만들고 있습니다" : message);
        } else if (message === "Generating private reading notes in parallel") {
          setStatus(language === "ko" ? "세 독자의 독서 노트를 준비하고 있습니다" : message);
        } else if (message.startsWith("Reading notes ready: ")) {
          setStatus(copy.readingNotesReady(message.slice("Reading notes ready: ".length)));
        } else if (message.startsWith("Retrying reading notes: ")) {
          setStatus(copy.retryingReadingNotes);
        } else if (message === "Identifying book") {
          setStatus(language === "ko" ? "책을 확인하고 있습니다" : message);
        } else {
          setStatus(message);
        }
      },
      onUtterance(utterance) {
        lastUtteranceRef.current = utterance;
        setActiveSpeaker(utterance.speaker);
        setUpcomingSpeaker(undefined);
        setCopyStatus("idle");
        setTranscript((current) => [...current, utterance]);
      },
    });

    void engine
      .run({
        title: "The Stranger",
        author: "Albert Camus",
        language,
        seed: "demo",
        waitForAdvance(turn) {
          return new Promise<void>((resolve) => {
            advanceResolver.current = resolve;
            const speakerId = turn.speaker === "moderator" ? "moderator" : turn.speaker.id;
            setUpcomingSpeaker(speakerId);
            setPendingTurn(copy.readyToSpeak(pendingSpeakerName(turn.speaker, language)));
            const duration = lastUtteranceRef.current
              ? calculateReadingDelay(lastUtteranceRef.current.text, language)
              : 1_200;
            queuePlayback(duration, () => {
              advanceResolver.current = null;
              resolve();
            });
          });
        },
        requestUserInput(turn) {
          return new Promise<string>((resolve) => {
            setUpcomingSpeaker("user");
            setPendingTurn(copy.readyToSpeak(localizedSpeakerName("user", language)));
            const duration = lastUtteranceRef.current
              ? calculateReadingDelay(lastUtteranceRef.current.text, language)
              : 1_200;
            queuePlayback(duration, () => {
              inputResolver.current = resolve;
              setActiveSpeaker("user");
              setUpcomingSpeaker(undefined);
              setInputRequest(turn);
              setPendingTurn(copy.waitingForYou);
              setCanAdvance(false);
              setBusy(false);
            });
          });
        },
        waitForSessionComplete(summary) {
          return new Promise<void>((resolve) => {
            setUpcomingSpeaker(undefined);
            setPendingTurn(copy.movingToRecap);
            queuePlayback(calculateReadingDelay(summary.text, language), resolve);
          });
        },
      })
      .then((result) => {
        setRecap(result.recapMarkdown);
        setTranscriptOpen(false);
        setScreen("recap");
        clearPlaybackTimers();
        playbackActionRef.current = null;
        setBusy(false);
        setStatus(copy.sessionComplete);
      })
      .catch((caught: unknown) => {
        const apiMessage =
          caught instanceof GenerationApiError
            ? caught.code === "server_not_configured"
              ? copy.serverNotConfigured
              : caught.code === "session_call_limit_reached"
                ? copy.sessionLimitReached
                : caught.code === "model_refusal"
                  ? copy.modelRefused
                  : caught.code === "incomplete_output"
                    ? copy.incompleteOutput
                    : caught.code === "invalid_structured_output"
                      ? copy.invalidStructuredOutput
                  : copy.liveGenerationFailed
            : undefined;
        setError(apiMessage ?? (caught instanceof Error ? caught.message : copy.sessionFailed));
        clearPlaybackTimers();
        playbackActionRef.current = null;
        setBusy(false);
        setCanAdvance(false);
      });
  };

  const advance = () => {
    runPlaybackAction();
  };

  const submitUserInput = (value: string) => {
    const resolve = inputResolver.current;
    if (!resolve) return;
    inputResolver.current = null;
    setInputRequest(undefined);
    setInputText("");
    setBusy(true);
    setPendingTurn(value.trim() ? copy.considering : copy.passed);
    resolve(value);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (inputText.trim()) submitUserInput(inputText);
  };

  const startNewSession = () => {
    clearPlaybackTimers();
    playbackActionRef.current = null;
    advanceResolver.current = null;
    inputResolver.current = null;
    setScreen("setup");
    setTranscript([]);
    setRecap("");
    setRecapView("recap");
    setTranscriptOpen(false);
    setRecapCopyStatus("idle");
    setInputRequest(undefined);
    setStage("INTRO");
    setStatus(copy.ready);
    setActiveSpeaker(undefined);
    setUpcomingSpeaker(undefined);
  };

  if (screen === "setup") {
    return (
      <main className="min-h-screen bg-stone-100 px-5 py-12 text-stone-900">
        <section className="mx-auto max-w-2xl rounded-[2rem] border border-stone-200 bg-[#fffaf0] p-8 shadow-sm sm:p-12">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-amber-900">
              <span>{copy.prototype}</span>
              <span aria-hidden="true">·</span>
              <span className="rounded-full bg-emerald-100 px-3 py-1 tracking-normal text-emerald-900">
                {generationMode === "live" ? copy.liveBadge : copy.mockBadge}
              </span>
            </div>
            <div
              className="inline-flex rounded-xl border border-stone-300 bg-white p-1"
              role="group"
              aria-label="Language"
            >
              {(["ko", "en"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={language === option}
                  onClick={() => setLanguage(option)}
                  className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${
                    language === option
                      ? "bg-stone-900 text-white"
                      : "text-stone-600 hover:bg-stone-100"
                  }`}
                >
                  {option === "ko" ? "한국어" : "English"}
                </button>
              ))}
            </div>
          </div>
          <h1 className="mt-5 font-serif text-5xl leading-none sm:text-6xl">The Reading Table</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-stone-700">
            {copy.description}
          </p>

          <div className="mt-10 rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
              {copy.demoBook}
            </p>
            <p className="mt-2 font-serif text-2xl">{copy.bookTitle}</p>
            <p className="mt-1 text-sm text-stone-600">{copy.bookMeta}</p>
          </div>

          <div className="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-sm font-semibold">{copy.modeTitle}</p>
            <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={copy.modeTitle}>
              <button
                type="button"
                aria-pressed={generationMode === "mock"}
                onClick={() => setGenerationMode("mock")}
                className={`rounded-xl border p-3 text-left transition ${
                  generationMode === "mock"
                    ? "border-stone-900 bg-stone-900 text-white"
                    : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                <span className="block text-sm font-semibold">{copy.mockMode}</span>
                <span className={`mt-1 block text-xs leading-5 ${generationMode === "mock" ? "text-stone-300" : "text-stone-500"}`}>
                  {copy.mockModeHint}
                </span>
              </button>
              <button
                type="button"
                aria-pressed={generationMode === "live"}
                disabled={liveAvailability !== "available"}
                onClick={() => setGenerationMode("live")}
                className={`rounded-xl border p-3 text-left transition disabled:cursor-not-allowed disabled:opacity-50 ${
                  generationMode === "live"
                    ? "border-emerald-800 bg-emerald-800 text-white"
                    : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                }`}
              >
                <span className="block text-sm font-semibold">{copy.liveMode}</span>
                <span className={`mt-1 block text-xs leading-5 ${generationMode === "live" ? "text-emerald-100" : "text-stone-500"}`}>
                  {copy.liveModeHint}
                </span>
              </button>
            </div>
            <p
              className={`mt-3 text-xs font-medium ${
                liveAvailability === "available" ? "text-emerald-800" : "text-stone-500"
              }`}
              aria-live="polite"
            >
              {liveAvailability === "checking"
                ? copy.liveChecking
                : liveAvailability === "available"
                  ? copy.liveReady(liveModel)
                  : copy.liveUnavailable}
            </p>
          </div>

          <div className="mt-5 flex items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5">
            <div>
              <p className="text-sm font-semibold">{copy.autoMode}</p>
              <p className="mt-1 text-xs leading-5 text-stone-500">{copy.autoHint}</p>
            </div>
            <button
              type="button"
              aria-pressed={autoAdvance}
              onClick={toggleAutoAdvance}
              className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition ${
                autoAdvance
                  ? "bg-emerald-800 text-white"
                  : "border border-stone-300 bg-stone-100 text-stone-700"
              }`}
            >
              {autoAdvance ? copy.autoOn : copy.autoOff}
            </button>
          </div>

          <div className="mt-5 rounded-2xl bg-stone-900 p-5 text-sm leading-6 text-stone-200">
            <p className="font-semibold text-white">{copy.privacyTitle}</p>
            <p className="mt-1">{copy.privacy}</p>
            <p className="mt-2 text-stone-400">
              {generationMode === "mock" ? copy.mockPrivacy : copy.liveModeHint}
            </p>
          </div>

          <button
            type="button"
            onClick={startSession}
            disabled={generationMode === "live" && liveAvailability !== "available"}
            className="mt-8 w-full rounded-2xl bg-stone-900 px-5 py-4 font-semibold text-white transition hover:bg-stone-700 focus:outline-none focus:ring-4 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generationMode === "live" ? copy.startLive : copy.start}
          </button>
        </section>
        <DiagnosticsPanel language={language} />
      </main>
    );
  }

  if (screen === "recap") {
    return (
      <main className="min-h-screen bg-stone-100 px-4 py-8 text-stone-900 sm:px-6">
        <section className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-emerald-800">
                {copy.sessionComplete}
              </p>
              <h1 className="mt-2 font-serif text-4xl">{copy.completionTitle}</h1>
            </div>
            <div className="flex flex-wrap gap-2">
              {recapView === "recap" ? (
                <>
                  <button
                    type="button"
                    onClick={() => void copyRecap()}
                    className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"
                    aria-live="polite"
                  >
                    {recapCopyButtonLabel}
                  </button>
                  <button
                    type="button"
                    onClick={downloadRecap}
                    className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50"
                  >
                    {copy.downloadMarkdown}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => void copyTranscript()}
                  className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"
                  aria-live="polite"
                >
                  {copyButtonLabel}
                </button>
              )}
              <button
                type="button"
                onClick={startNewSession}
                className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold hover:bg-stone-50"
              >
                {copy.newSession}
              </button>
            </div>
          </div>

          <div
            className="mt-7 inline-flex rounded-xl border border-stone-300 bg-white p-1"
            role="tablist"
            aria-label={language === "ko" ? "완료된 세션 보기" : "Completed session views"}
          >
            <button
              type="button"
              role="tab"
              aria-selected={recapView === "recap"}
              onClick={() => setRecapView("recap")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                recapView === "recap" ? "bg-stone-900 text-white" : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {copy.recapTitle}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={recapView === "transcript"}
              onClick={() => setRecapView("transcript")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                recapView === "transcript"
                  ? "bg-stone-900 text-white"
                  : "text-stone-600 hover:bg-stone-100"
              }`}
            >
              {copy.transcriptTab(transcript.length)}
            </button>
          </div>

          <div className="mt-5" role="tabpanel">
            {recapView === "recap" ? (
              <RenderedRecap markdown={recap} />
            ) : (
              <div className="space-y-4 rounded-2xl border border-stone-200 bg-[#fffdf8] p-5 shadow-sm sm:p-8">
                <TranscriptList transcript={transcript} language={language} />
              </div>
            )}
          </div>
        </section>
        <DiagnosticsPanel language={language} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-stone-100 text-stone-900">
      <header className="sticky top-0 z-10 border-b border-stone-200 bg-stone-100/95 px-4 py-4 backdrop-blur sm:px-6">
        <div className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-serif text-xl">The Reading Table</p>
              <p className="text-xs text-stone-500">
                {generationMode === "live" ? copy.liveSessionLabel : copy.sessionLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold text-emerald-900">
                {generationMode === "live" ? copy.liveCredits : copy.noCredits}
              </span>
              <button
                type="button"
                onClick={openTranscript}
                disabled={transcript.length === 0}
                className="rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {copy.viewTranscript(transcript.length)}
              </button>
            </div>
          </div>
          <ol className="mt-4 flex gap-1 overflow-x-auto pb-1" aria-label={copy.stagesLabel}>
            {STAGES.map((item) => {
              const activeIndex = STAGES.findIndex((id) => id === stage);
              const itemIndex = STAGES.findIndex((id) => id === item);
              const isActive = item === stage;
              const isComplete = itemIndex < activeIndex;
              return (
                <li
                  key={item}
                  aria-current={isActive ? "step" : undefined}
                  className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold ${
                    isActive
                      ? "bg-stone-900 text-white"
                      : isComplete
                        ? "bg-amber-200 text-amber-950"
                        : "bg-white text-stone-500"
                  }`}
                >
                  {STAGE_LABELS[language][item]}
                </li>
              );
            })}
          </ol>
        </div>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-9rem)] max-w-4xl flex-col px-4 py-6 sm:px-6">
        <RoundTable
          language={language}
          activeSpeaker={activeSpeaker}
          upcomingSpeaker={upcomingSpeaker}
        />

        <CurrentDialogue
          language={language}
          latestUtterance={transcript.at(-1)}
          inputRequest={inputRequest}
          upcomingSpeaker={upcomingSpeaker}
        />

        <div className="sticky bottom-0 mt-4 border-t border-stone-200 bg-stone-100 py-4">
          {error && (
            <p role="alert" className="mb-3 rounded-xl bg-red-100 p-3 text-sm text-red-900">
              {error}
            </p>
          )}
          {inputRequest ? (
            <form onSubmit={handleSubmit} className="rounded-2xl border border-stone-300 bg-white p-4 shadow-lg">
              <div className="flex items-center gap-3">
                <SpeakerAvatar speaker="user" language={language} size="small" />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-emerald-800">
                    {copy.waitingForYou}
                  </p>
                  <label htmlFor="user-turn" className="text-sm font-semibold">
                    {INPUT_PROMPTS[language][inputRequest.stage]}
                  </label>
                </div>
              </div>
              <textarea
                id="user-turn"
                autoFocus
                rows={2}
                value={inputText}
                onChange={(event) => setInputText(event.target.value)}
                placeholder={copy.placeholder}
                className="mt-2 w-full resize-none rounded-xl border border-stone-300 p-3 leading-6 outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-200"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => submitUserInput("")}
                  className="rounded-xl px-4 py-2 text-sm font-semibold text-stone-600 hover:bg-stone-100"
                >
                  {copy.pass}
                </button>
                <button
                  type="submit"
                  disabled={!inputText.trim()}
                  className="rounded-xl bg-stone-900 px-5 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {copy.share}
                </button>
              </div>
            </form>
          ) : (
            <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-lg">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
                    {status}
                  </p>
                  <p className="mt-1 truncate text-sm text-stone-700">{pendingTurn}</p>
                </div>

                <div className="flex shrink-0 flex-wrap justify-end gap-2">
                  {autoAdvance ? (
                    <>
                      <button
                        type="button"
                        onClick={playbackPaused ? resumePlayback : pausePlayback}
                        disabled={!canAdvance || busy}
                        className="rounded-xl border border-stone-300 bg-white px-3 py-2 text-sm font-semibold text-stone-700 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        {playbackPaused ? copy.resume : copy.pause}
                      </button>
                      <button
                        type="button"
                        onClick={runPlaybackAction}
                        disabled={!canAdvance || busy}
                        className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-40"
                      >
                        {busy ? copy.thinking : copy.skipNow}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={advance}
                      disabled={!canAdvance || busy}
                      className="rounded-xl bg-stone-900 px-6 py-3 font-semibold text-white disabled:cursor-wait disabled:opacity-40"
                    >
                      {busy ? copy.thinking : copy.next}
                    </button>
                  )}
                </div>
              </div>

              <button
                type="button"
                aria-pressed={autoAdvance}
                onClick={toggleAutoAdvance}
                className="mt-3 text-xs font-semibold text-stone-500 underline decoration-stone-300 underline-offset-4 hover:text-stone-900"
              >
                {autoAdvance ? copy.autoOn : copy.autoOff}
              </button>
            </div>
          )}
        </div>
      </section>

      {transcriptOpen && (
        <div className="fixed inset-0 z-50 bg-stone-950/45 p-4 backdrop-blur-sm sm:p-8">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="transcript-dialog-title"
            className="mx-auto flex h-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-[#fffdf8] shadow-2xl"
          >
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-white px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">
                  {copy.bookTitle}
                </p>
                <h2 id="transcript-dialog-title" className="mt-1 font-serif text-2xl">
                  {copy.transcriptTitle}
                </h2>
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void copyTranscript()}
                  className="rounded-xl bg-stone-900 px-4 py-2 text-sm font-semibold text-white hover:bg-stone-700"
                  aria-live="polite"
                >
                  {copyButtonLabel}
                </button>
                <button
                  type="button"
                  onClick={() => setTranscriptOpen(false)}
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                >
                  {copy.closeTranscript}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-8 sm:px-8">
              <TranscriptList transcript={transcript} language={language} />
            </div>
          </section>
        </div>
      )}
      <DiagnosticsPanel language={language} />
    </main>
  );
}
