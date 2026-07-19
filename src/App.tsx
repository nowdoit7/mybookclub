import { useCallback, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { GenerationApiError, HttpGenerationClient } from "./api/httpGenerationClient";
import { MockGenerationClient } from "./api/mockGenerationClient";
import type { GenerationClient } from "./api/generationClient";
import { calculateReadingDelay } from "./engine/playbackTiming";
import { SessionEngine, toConfirmedBook } from "./engine/sessionEngine";
import { localizedSpeakerName, localizedSpeakerRole, STAGE_LABELS } from "./localization";
import { PERSONAS, selectPersonas } from "./personas";
import { formatTranscriptAsMarkdown } from "./transcriptExport";
import type {
  AppLanguage,
  BookScope,
  ConfirmedBook,
  PersonaCard,
  StageId,
  UserTurnKind,
  Utterance,
} from "./types";
import { DiagnosticsPanel } from "./ui/DiagnosticsPanel";

const STAGES: StageId[] = [
  "INTRO",
  "FIRST_IMPRESSIONS",
  "MEMORABLE_SCENES",
  "DISCUSSION",
  "WRAP_UP",
];

const INPUT_PROMPTS: Record<AppLanguage, Record<UserTurnKind, string>> = {
  en: {
    intro: "Tell us a little about yourself and what brought you to the table.",
    first_impression: "What was your first impression?",
    memorable_scene: "Which scene stayed with you?",
    discussion_position: "Where do you land on this question?",
    discussion_reply: "How do you answer that challenge?",
    wrap_up: "What are you leaving the table with?",
  },
  ko: {
    intro: "어떤 분인지, 오늘 이 테이블에 오게 된 이유와 함께 소개해 주세요.",
    first_impression: "이 책의 첫인상은 어땠나요?",
    memorable_scene: "어떤 장면이 가장 오래 남았나요?",
    discussion_position: "이 질문에 대해 어디에 서 있나요?",
    discussion_reply: "그 반론에는 어떻게 답하시겠어요?",
    wrap_up: "오늘 테이블에서 무엇을 가지고 떠나시나요?",
  },
};

const COPY = {
  en: {
    prototype: "Text prototype",
    mockBadge: "Mock · no API credits",
    liveBadge: "Live · GPT-5.6 API",
    description:
      "Test the pacing before the room gets decorated. Reader turns advance at a natural reading pace, and the table stops when it is your turn.",
    bookSetup: "Bring a book to the table",
    scopeLabel: "Discussion scope",
    scopeLabels: { single_book: "One book", series: "Full series" },
    singleBookHint: "Discuss one volume or one standalone work.",
    seriesHint: "Verify and discuss every published volume in the series.",
    includedTitles: "Books included in this series",
    bookTitleLabel: "Book title",
    seriesTitleLabel: "Series title",
    bookTitlePlaceholder: "The book you recently finished",
    seriesTitlePlaceholder: "The series you recently finished",
    authorLabel: "Author (optional)",
    authorPlaceholder: "Helps identify books with similar titles",
    identifyBook: "Identify this book",
    identifySeries: "Identify this series",
    verifyBook: "Search and verify this book",
    verifySeries: "Search and verify this series",
    identifyingBook: "Identifying the book…",
    identifyingSeries: "Identifying the series…",
    verifyingBook: "Searching the web and verifying this book…",
    verifyingSeries: "Searching the web and verifying this series…",
    identifiedBook: "Web-verified book",
    identifiedSeries: "Web-verified series",
    mockIdentifiedBook: "Mock preview · details are not verified",
    verificationStatus: "Verification",
    verificationLabels: {
      verified: "verified",
      ambiguous: "ambiguous match",
      not_found: "not found",
      mock: "mock only",
    },
    verificationSources: "Verification sources",
    verificationBlocked: "Correct the title or author and search again before starting a live session.",
    confirmBook: "Yes, this is my book — start the session",
    confirmSeries: "Yes, this is my series — start the session",
    bookRequired: "Enter a book title first.",
    identificationFailed: "The book could not be identified. Check the details and try again.",
    currentBook: "Tonight's book",
    privacyTitle: "Data & privacy",
    privacy:
      "In live mode, your book title is sent to OpenAI for web verification, and your messages are sent to generate the discussion. This session is stored only in this browser and is not saved by The Reading Table's server.",
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
    sessionLabel: (title: string) => `${title} · Mock session`,
    liveSessionLabel: (title: string) => `${title} · Live GPT-5.6 session`,
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
    liveModeHint: "Web-verifies the book, then generates a real discussion using API credits.",
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
    bookSetup: "읽은 책을 테이블에 올려주세요",
    scopeLabel: "토론 범위",
    scopeLabels: { single_book: "한 권", series: "시리즈 전체" },
    singleBookHint: "한 권 또는 단독 작품만 이야기합니다.",
    seriesHint: "시리즈에 포함된 모든 출간 도서를 검증하고 이야기합니다.",
    includedTitles: "시리즈에 포함된 도서",
    bookTitleLabel: "책 제목",
    seriesTitleLabel: "시리즈 제목",
    bookTitlePlaceholder: "최근에 다 읽은 책",
    seriesTitlePlaceholder: "최근에 다 읽은 시리즈",
    authorLabel: "저자 (선택)",
    authorPlaceholder: "같은 제목의 책을 구분하는 데 도움이 됩니다",
    identifyBook: "이 책 확인하기",
    identifySeries: "이 시리즈 확인하기",
    verifyBook: "웹에서 도서 검증하기",
    verifySeries: "웹에서 시리즈 검증하기",
    identifyingBook: "책을 확인하고 있습니다…",
    identifyingSeries: "시리즈를 확인하고 있습니다…",
    verifyingBook: "웹에서 도서 정보를 검색하고 검증하고 있습니다…",
    verifyingSeries: "웹에서 시리즈 구성 정보를 검색하고 검증하고 있습니다…",
    identifiedBook: "웹에서 검증된 책",
    identifiedSeries: "웹에서 검증된 시리즈",
    mockIdentifiedBook: "모의 미리보기 · 도서 정보는 검증되지 않음",
    verificationStatus: "검증 상태",
    verificationLabels: {
      verified: "도서 확인 완료",
      ambiguous: "동일하거나 유사한 책이 여러 권 발견됨",
      not_found: "신뢰할 수 있는 도서 정보를 찾지 못함",
      mock: "모의 정보",
    },
    verificationSources: "검증에 사용한 출처",
    verificationBlocked: "제목이나 저자를 수정한 뒤 다시 검색해야 실제 세션을 시작할 수 있습니다.",
    confirmBook: "네, 이 책이 맞습니다 — 모임 시작",
    confirmSeries: "네, 이 시리즈가 맞습니다 — 모임 시작",
    bookRequired: "먼저 책 제목을 입력해주세요.",
    identificationFailed: "책을 확인하지 못했습니다. 입력 내용을 확인하고 다시 시도해주세요.",
    currentBook: "오늘의 책",
    privacyTitle: "데이터 및 개인정보",
    privacy:
      "실제 모드에서는 도서 검증을 위해 책 제목이 OpenAI 웹 검색에 사용되고, 토론 생성을 위해 메시지가 전송됩니다. 이 세션은 현재 브라우저에만 저장되며 리딩 테이블 서버에는 저장되지 않습니다.",
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
    sessionLabel: (title: string) => `${title} · 모의 세션`,
    liveSessionLabel: (title: string) => `${title} · 실제 GPT-5.6 세션`,
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
    liveModeHint: "도서를 웹에서 검증한 뒤 실제 토론을 생성하며 API 크레딧을 사용합니다.",
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
type InputRequest = { stage: StageId; target?: string; kind: UserTurnKind };
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

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./u, "");
  } catch {
    return url;
  }
}

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

const ROUND_TABLE_POSITIONS = [
  "left-1/2 top-3 -translate-x-1/2",
  "left-3 top-[34%] sm:left-8",
  "right-3 top-[34%] sm:right-8",
  "bottom-3 left-[18%] -translate-x-1/2 sm:left-[22%]",
  "bottom-3 right-[18%] translate-x-1/2 sm:right-[22%]",
] as const;

function RoundTable({
  language,
  book,
  personas,
  activeSpeaker,
  upcomingSpeaker,
}: {
  language: AppLanguage;
  book: ConfirmedBook;
  personas: PersonaCard[];
  activeSpeaker?: string;
  upcomingSpeaker?: string;
}) {
  const copy = COPY[language];
  const speakers = ["moderator", ...personas.map(({ id }) => id), "user"];
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
            {copy.currentBook}
          </p>
          <p className="mt-1 font-serif text-xl text-amber-950 sm:text-2xl">{book.title}</p>
          <p className="mt-2 text-xs text-amber-950/65">
            {book.author} · {personas.map(({ id }) => localizedSpeakerName(id, language)).join(", ")}
          </p>
        </div>
      </div>

      <div role="list">
        {speakers.map((speaker, index) => {
          const isActive = activeSpeaker === speaker;
          const isNext = !isActive && upcomingSpeaker === speaker;
          return (
            <div
              key={speaker}
              role="listitem"
              aria-current={isActive ? "true" : undefined}
              className={`absolute z-[1] w-[7rem] text-center ${ROUND_TABLE_POSITIONS[index]}`}
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
              <p className="mt-0.5 text-[9px] leading-3 text-stone-500">
                {localizedSpeakerRole(speaker, language)}
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
    ? INPUT_PROMPTS[language][inputRequest.kind]
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
          <span className="text-xs text-stone-500">{localizedSpeakerRole(speaker, language)}</span>
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
  const [bookScope, setBookScope] = useState<BookScope>("single_book");
  const [bookTitleInput, setBookTitleInput] = useState("");
  const [bookAuthorInput, setBookAuthorInput] = useState("");
  const [confirmedBook, setConfirmedBook] = useState<ConfirmedBook>();
  const [sessionPersonas, setSessionPersonas] = useState<PersonaCard[]>([]);
  const [identifyingBook, setIdentifyingBook] = useState(false);
  const [identificationError, setIdentificationError] = useState("");
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
  const generationClientRef = useRef<GenerationClient | null>(null);
  const copy = COPY[language];
  const confirmedVerificationStatus =
    confirmedBook?.verificationStatus ?? (generationMode === "mock" ? "mock" : "ambiguous");
  const confirmedSources = confirmedBook?.sources ?? [];
  const confirmedWorkScope = confirmedBook?.workScope ?? bookScope;
  const confirmedIncludedTitles = confirmedBook?.includedTitles ?? [];
  const canStartSession = Boolean(
    confirmedBook &&
      (generationMode === "mock" || confirmedVerificationStatus === "verified"),
  );

  const generationErrorMessage = (caught: unknown): string => {
    if (!(caught instanceof GenerationApiError)) {
      return caught instanceof Error ? caught.message : copy.sessionFailed;
    }
    return caught.code === "server_not_configured"
      ? copy.serverNotConfigured
      : caught.code === "session_call_limit_reached"
        ? copy.sessionLimitReached
        : caught.code === "model_refusal"
          ? copy.modelRefused
          : caught.code === "incomplete_output"
            ? copy.incompleteOutput
            : caught.code === "invalid_structured_output"
              ? copy.invalidStructuredOutput
              : copy.liveGenerationFailed;
  };

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

  const invalidateBookConfirmation = () => {
    setConfirmedBook(undefined);
    setIdentificationError("");
    generationClientRef.current = null;
  };

  const identifyBook = async (event: FormEvent) => {
    event.preventDefault();
    const title = bookTitleInput.trim();
    if (!title) {
      setIdentificationError(copy.bookRequired);
      return;
    }
    setIdentifyingBook(true);
    setIdentificationError("");
    setConfirmedBook(undefined);
    const client =
      generationMode === "live" ? new HttpGenerationClient() : new MockGenerationClient();
    generationClientRef.current = client;
    try {
      const identified = await client.identifyBook({
        title,
        author: bookAuthorInput.trim() || undefined,
        scope: bookScope,
        language,
      });
      setConfirmedBook(toConfirmedBook(identified));
    } catch (caught) {
      generationClientRef.current = null;
      setIdentificationError(
        caught instanceof GenerationApiError
          ? generationErrorMessage(caught)
          : copy.identificationFailed,
      );
    } finally {
      setIdentifyingBook(false);
    }
  };

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
    if (!recap || !confirmedBook) return;
    const blob = new Blob([recap], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    const safeTitle = confirmedBook.title
      .normalize("NFKD")
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/gu, "")
      .toLocaleLowerCase()
      .slice(0, 80) || "book";
    anchor.download = `recap-${safeTitle}-${new Date().toISOString().slice(0, 10)}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const startSession = () => {
    if (!confirmedBook) {
      setIdentificationError(copy.bookRequired);
      return;
    }
    if (generationMode === "live" && confirmedBook.verificationStatus !== "verified") {
      setIdentificationError(copy.verificationBlocked);
      return;
    }
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
      generationClientRef.current ??
      (generationMode === "live" ? new HttpGenerationClient() : new MockGenerationClient());
    const requestedSeed = new URLSearchParams(window.location.search).get("seed");
    const seed = requestedSeed || crypto.randomUUID();
    const personas = selectPersonas(seed);
    setSessionPersonas(personas);
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
        confirmedBook,
        language,
        seed,
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
        setError(generationErrorMessage(caught));
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
    setBookTitleInput("");
    setBookAuthorInput("");
    setConfirmedBook(undefined);
    setSessionPersonas([]);
    setIdentificationError("");
    generationClientRef.current = null;
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
                  onClick={() => {
                    setLanguage(option);
                    invalidateBookConfirmation();
                  }}
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
            <p className="text-sm font-semibold">{copy.modeTitle}</p>
            <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label={copy.modeTitle}>
              <button
                type="button"
                aria-pressed={generationMode === "mock"}
                onClick={() => {
                  setGenerationMode("mock");
                  invalidateBookConfirmation();
                }}
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
                onClick={() => {
                  setGenerationMode("live");
                  invalidateBookConfirmation();
                }}
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

          <form onSubmit={(event) => void identifyBook(event)} className="mt-5 rounded-2xl border border-stone-200 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-stone-500">
              {copy.bookSetup}
            </p>
            <div className="mt-4">
              <p className="text-sm font-semibold text-stone-700">{copy.scopeLabel}</p>
              <div className="mt-2 grid grid-cols-2 gap-2" role="group" aria-label={copy.scopeLabel}>
                {(["single_book", "series"] as const).map((scope) => (
                  <button
                    key={scope}
                    type="button"
                    aria-pressed={bookScope === scope}
                    onClick={() => {
                      setBookScope(scope);
                      invalidateBookConfirmation();
                    }}
                    className={`rounded-xl border p-3 text-left transition ${
                      bookScope === scope
                        ? "border-amber-800 bg-amber-50 text-amber-950"
                        : "border-stone-300 bg-white text-stone-700 hover:bg-stone-50"
                    }`}
                  >
                    <span className="block text-sm font-semibold">{copy.scopeLabels[scope]}</span>
                    <span className="mt-1 block text-xs leading-5 text-stone-500">
                      {scope === "single_book" ? copy.singleBookHint : copy.seriesHint}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-semibold text-stone-700">
                {bookScope === "series" ? copy.seriesTitleLabel : copy.bookTitleLabel}
                <input
                  aria-label={bookScope === "series" ? copy.seriesTitleLabel : copy.bookTitleLabel}
                  value={bookTitleInput}
                  onChange={(event) => {
                    setBookTitleInput(event.target.value);
                    invalidateBookConfirmation();
                  }}
                  placeholder={
                    bookScope === "series" ? copy.seriesTitlePlaceholder : copy.bookTitlePlaceholder
                  }
                  maxLength={200}
                  className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-2.5 font-normal outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-200"
                />
              </label>
              <label className="text-sm font-semibold text-stone-700">
                {copy.authorLabel}
                <input
                  value={bookAuthorInput}
                  onChange={(event) => {
                    setBookAuthorInput(event.target.value);
                    invalidateBookConfirmation();
                  }}
                  placeholder={copy.authorPlaceholder}
                  maxLength={120}
                  className="mt-2 w-full rounded-xl border border-stone-300 px-3 py-2.5 font-normal outline-none focus:border-amber-600 focus:ring-2 focus:ring-amber-200"
                />
              </label>
            </div>
            <button
              type="submit"
              disabled={identifyingBook || !bookTitleInput.trim()}
              className="mt-4 rounded-xl border border-stone-300 bg-stone-100 px-4 py-2.5 text-sm font-semibold text-stone-800 hover:bg-stone-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {identifyingBook
                ? generationMode === "live"
                  ? bookScope === "series"
                    ? copy.verifyingSeries
                    : copy.verifyingBook
                  : bookScope === "series"
                    ? copy.identifyingSeries
                    : copy.identifyingBook
                : generationMode === "live"
                  ? bookScope === "series"
                    ? copy.verifySeries
                    : copy.verifyBook
                  : bookScope === "series"
                    ? copy.identifySeries
                    : copy.identifyBook}
            </button>
            {identificationError && (
              <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">
                {identificationError}
              </p>
            )}
          </form>

          {confirmedBook && (
            <section
              className={`mt-5 rounded-2xl border p-5 ${
                confirmedVerificationStatus === "verified"
                  ? "border-emerald-200 bg-emerald-50"
                  : confirmedVerificationStatus === "mock"
                    ? "border-sky-200 bg-sky-50"
                    : "border-amber-200 bg-amber-50"
              }`}
              aria-label={
                confirmedWorkScope === "series" ? copy.identifiedSeries : copy.identifiedBook
              }
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-800">
                    {generationMode === "mock"
                      ? copy.mockIdentifiedBook
                      : confirmedWorkScope === "series"
                        ? copy.identifiedSeries
                        : copy.identifiedBook}
                  </p>
                  <h2 className="mt-2 font-serif text-2xl">{confirmedBook.title}</h2>
                  <p className="mt-1 text-sm text-stone-600">{confirmedBook.author}</p>
                  <span className="mt-2 inline-flex rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-stone-600">
                    {copy.scopeLabels[confirmedWorkScope]}
                  </span>
                </div>
                <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-stone-600">
                  {copy.verificationStatus}: {copy.verificationLabels[confirmedVerificationStatus]}
                </span>
              </div>
              <p className="mt-4 text-sm leading-7 text-stone-700">{confirmedBook.confirmedSummary}</p>
              {confirmedBook.verificationNote && (
                <p className="mt-3 rounded-xl bg-white/80 p-3 text-sm text-stone-700">
                  {confirmedBook.verificationNote}
                </p>
              )}
              {confirmedWorkScope === "series" && confirmedIncludedTitles.length > 0 && (
                <div className="mt-4 rounded-xl bg-white/80 p-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                    {copy.includedTitles}
                  </p>
                  <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-stone-700">
                    {confirmedIncludedTitles.map((title) => <li key={title}>{title}</li>)}
                  </ol>
                </div>
              )}
              {confirmedSources.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-500">
                    {copy.verificationSources}
                  </p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {confirmedSources.map(({ url }) => (
                      <li key={url}>
                        <a
                          href={url}
                          target="_blank"
                          rel="noreferrer"
                          className="font-medium text-emerald-800 underline decoration-emerald-300 underline-offset-2"
                        >
                          {sourceHost(url)}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {generationMode === "live" && confirmedVerificationStatus !== "verified" && (
                <p className="mt-3 rounded-xl bg-amber-100 p-3 text-sm text-amber-950">
                  {copy.verificationBlocked}
                </p>
              )}
              <ul className="mt-4 list-disc space-y-1 pl-5 text-sm text-stone-600">
                {confirmedBook.candidateTopics.map((topic) => <li key={topic}>{topic}</li>)}
              </ul>
            </section>
          )}

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
            disabled={!canStartSession || (generationMode === "live" && liveAvailability !== "available")}
            className="mt-8 w-full rounded-2xl bg-stone-900 px-5 py-4 font-semibold text-white transition hover:bg-stone-700 focus:outline-none focus:ring-4 focus:ring-amber-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {confirmedBook
              ? confirmedWorkScope === "series"
                ? copy.confirmSeries
                : copy.confirmBook
              : generationMode === "live"
                ? copy.startLive
                : copy.start}
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
                {generationMode === "live"
                  ? copy.liveSessionLabel(confirmedBook?.title ?? "")
                  : copy.sessionLabel(confirmedBook?.title ?? "")}
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
          book={confirmedBook!}
          personas={sessionPersonas}
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
                    {INPUT_PROMPTS[language][inputRequest.kind]}
                  </label>
                </div>
              </div>
              <textarea
                id="user-turn"
                autoFocus
                rows={2}
                maxLength={4000}
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
                  {confirmedBook?.title}
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
