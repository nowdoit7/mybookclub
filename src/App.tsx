import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { GenerationApiError, HttpGenerationClient } from "./api/httpGenerationClient";
import { MockGenerationClient } from "./api/mockGenerationClient";
import { recordGenerationDiagnostic } from "./api/diagnostics";
import type { GenerationClient } from "./api/generationClient";
import { SessionEngine, toConfirmedBook } from "./engine/sessionEngine";
import { localizedSpeakerName, localizedSpeakerRole, STAGE_LABELS } from "./localization";
import { PERSONAS, portraitUrlFor, selectPersonas } from "./personas";
import { formatTranscriptAsMarkdown } from "./transcriptExport";
import type {
  AppLanguage,
  BookScope,
  ConfirmedBook,
  DiscussionAction,
  DiscussionDecisionTurn,
  PersonaCard,
  RoomAtmosphere,
  StageId,
  UserTurnKind,
  Utterance,
} from "./types";
import { DiagnosticsPanel } from "./ui/DiagnosticsPanel";
import { buildDialoguePages } from "./ui/dialoguePaging";
import { UserAvatarArtwork } from "./ui/UserAvatar";
import { USER_AVATARS, type UserAvatarId } from "./ui/userAvatars";

const STAGES: StageId[] = [
  "INTRO",
  "FIRST_IMPRESSIONS",
  "MEMORABLE_SCENES",
  "DISCUSSION",
  "WRAP_UP",
];

const INPUT_PROMPTS: Record<AppLanguage, Record<UserTurnKind, string>> = {
  en: {
    intro: "Tell us a little about your work, everyday life, or what reading has looked like lately.",
    first_impression: "What was your first impression?",
    memorable_scene: "Which scene stayed with you?",
    discussion_position: "Where do you land on this question?",
    discussion_reply: "How do you answer that challenge?",
    wrap_up: "What are you leaving the table with?",
  },
  ko: {
    intro: "하시는 일이나 요즘의 일상, 최근의 독서 생활처럼 편한 이야기로 자신을 소개해 주세요.",
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
      "Enter a portrait-led reading room where every line moves only when you are ready.",
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
    previous: "Previous",
    revealPage: "Show full line",
    nextPage: "Next page",
    advanceSpeaker: "Next speaker",
    returnLive: "Return to current line",
    enterTable: "Enter the table",
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
    manualHint: "Dialogue advances only when you choose Next.",
    readingTable: "Reading table",
    tableReady: "Everyone is here. Alex will open the session when you are ready.",
    sceneTransition: "Scene transition",
    stageReady: (stageName: string) => `${stageName} is ready to begin.`,
    preparingRoom: "Preparing the next part of the conversation…",
    nextTurnReady: (name: string) => `${name} is next. Choose Next speaker when you are ready.`,
    preparingTurn: (name: string) => `Preparing ${name}'s next line…`,
    earlierDialogue: (stageName: string) => `Earlier dialogue · ${stageName}`,
    currentDialogue: "Current dialogue",
    challengedLine: "The line you are answering",
    discussionChoice: "How would you like to continue?",
    joinDiscussion: "Join the discussion",
    keepListening: "Keep listening",
    continueDiscussion: "Continue the discussion",
    wrapDiscussion: "Wrap up",
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
    identityTitle: "Take your seat",
    identityHint: "Choose how you appear at the table. This does not change the discussion.",
    displayName: "Display name (optional)",
    displayNamePlaceholder: "You",
    avatarLabel: "Choose your portrait",
    youRole: "Book-club member",
  },
  ko: {
    prototype: "텍스트 프로토타입",
    mockBadge: "모의 응답 · API 크레딧 미사용",
    liveBadge: "실제 연결 · GPT-5.6 API",
    description:
      "초상화가 있는 독서 모임에 입장해, 모든 대사를 원하는 속도로 직접 넘겨보세요.",
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
    previous: "이전",
    revealPage: "대사 전체 보기",
    nextPage: "다음 페이지",
    advanceSpeaker: "다음 사람",
    returnLive: "현재 대사로 돌아가기",
    enterTable: "테이블 입장",
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
    manualHint: "다음 버튼을 눌러야 대화가 진행됩니다.",
    readingTable: "리딩 테이블",
    tableReady: "모두 모였습니다. 준비되면 알렉스가 모임을 시작합니다.",
    sceneTransition: "장면 전환",
    stageReady: (stageName: string) => `${stageName} 단계로 넘어갑니다.`,
    preparingRoom: "다음 대화를 준비하고 있습니다…",
    nextTurnReady: (name: string) => `${name}의 다음 발언이 준비되어 있습니다. 준비되면 다음 사람을 눌러주세요.`,
    preparingTurn: (name: string) => `${name}의 발언을 준비하고 있습니다…`,
    earlierDialogue: (stageName: string) => `이전 대화 · ${stageName}`,
    currentDialogue: "현재 대화",
    challengedLine: "지금 답변할 발언",
    discussionChoice: "이 토론을 어떻게 이어갈까요?",
    joinDiscussion: "내 의견 보태기",
    keepListening: "한 번 더 듣기",
    continueDiscussion: "토론 조금 더 이어보기",
    wrapDiscussion: "이쯤에서 마무리",
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
    identityTitle: "내 자리 준비",
    identityHint: "테이블에서 보일 모습을 선택하세요. 토론 내용에는 영향을 주지 않습니다.",
    displayName: "표시 이름 (선택)",
    displayNamePlaceholder: "나",
    avatarLabel: "내 초상화 선택",
    youRole: "모임 참여자",
  },
};

type Screen = "setup" | "session" | "recap";
type InputRequest = { stage: StageId; target?: string; kind: UserTurnKind };
type CopyStatus = "idle" | "copied" | "failed";
type RecapView = "recap" | "transcript";
type GenerationMode = "mock" | "live";
type LiveAvailability = "checking" | "available" | "unavailable";
type DiscussionDecisionRequest = DiscussionDecisionTurn;

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

function speakerDisplayName(
  speaker: string,
  language: AppLanguage,
  userDisplayName: string,
): string {
  if (speaker === "user" && userDisplayName.trim()) return userDisplayName.trim();
  return localizedSpeakerName(speaker, language);
}

function speakerDisplayRole(speaker: string, language: AppLanguage): string {
  if (speaker === "user") return COPY[language].youRole;
  return localizedSpeakerRole(speaker, language);
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
  userAvatarId,
  userDisplayName = "",
  size = "large",
}: {
  speaker: string;
  language: AppLanguage;
  userAvatarId: UserAvatarId;
  userDisplayName?: string;
  size?: "small" | "large";
}) {
  const name = speakerDisplayName(speaker, language, userDisplayName);
  const portraitUrl = portraitUrlFor(speaker);
  return (
    <span
      className={`relative grid shrink-0 place-items-center overflow-hidden rounded-full font-bold text-white ${
        size === "small" ? "h-7 w-7 text-[10px]" : "h-11 w-11 text-sm"
      }`}
      style={{ backgroundColor: speakerColor(speaker) }}
      aria-hidden="true"
    >
      {name.slice(0, 1)}
      {speaker === "user" ? (
        <span className="absolute inset-0">
          <UserAvatarArtwork avatarId={userAvatarId} className="h-full w-full" />
        </span>
      ) : portraitUrl ? (
        <img
          src={portraitUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover object-top"
        />
      ) : null}
    </span>
  );
}

function StagePortrait({
  speaker,
  language,
  userAvatarId,
  userDisplayName,
  secondary = false,
}: {
  speaker: string;
  language: AppLanguage;
  userAvatarId: UserAvatarId;
  userDisplayName: string;
  secondary?: boolean;
}) {
  const portraitUrl = portraitUrlFor(speaker);
  const name = speakerDisplayName(speaker, language, userDisplayName);
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-t-[5rem] border border-amber-100/25 bg-amber-950/40 shadow-[0_24px_70px_rgba(0,0,0,0.5)] transition-all duration-500 ${
        secondary
          ? "h-56 w-40 opacity-85 sm:h-72 sm:w-52 lg:h-[23rem] lg:w-64"
          : "h-72 w-52 sm:h-[24rem] sm:w-72 lg:h-[31rem] lg:w-[23rem]"
      }`}
      aria-label={name}
    >
      {speaker === "user" ? (
        <UserAvatarArtwork
          avatarId={userAvatarId}
          portrait
          label={name}
          className="h-full w-full"
        />
      ) : portraitUrl ? (
        <img src={portraitUrl} alt={name} className="h-full w-full object-cover object-top" />
      ) : (
        <div className="flex h-full flex-col items-center justify-center bg-emerald-950/80 text-white">
          <span className="h-20 w-20 rounded-full bg-emerald-100/70" />
          <span className="-mt-1 h-32 w-36 rounded-t-full bg-emerald-100/50" />
          <span className="absolute bottom-5 rounded-full bg-emerald-950/70 px-3 py-1 text-sm font-semibold">
            {name}
          </span>
        </div>
      )}
    </div>
  );
}

function ParticipantCard({
  speaker,
  language,
  userAvatarId,
  userDisplayName,
  active,
  addressed,
  next,
}: {
  speaker: string;
  language: AppLanguage;
  userAvatarId: UserAvatarId;
  userDisplayName: string;
  active: boolean;
  addressed: boolean;
  next: boolean;
}) {
  const name = speakerDisplayName(speaker, language, userDisplayName);
  const role = speakerDisplayRole(speaker, language);

  return (
    <div
      role="listitem"
      aria-label={`${name} · ${role}`}
      aria-current={active ? "true" : undefined}
      className={`relative flex min-w-0 items-center gap-2 rounded-xl border px-2 py-2 backdrop-blur-md transition-all duration-300 sm:px-3 ${
        active
          ? "-translate-y-1 border-amber-300 bg-amber-100/95 text-stone-950 shadow-[0_0_32px_rgba(251,191,36,0.48)]"
          : addressed
            ? "border-teal-300 bg-teal-950/80 text-white shadow-[0_0_24px_rgba(45,212,191,0.32)]"
            : next
              ? "border-white/35 bg-stone-900/70 text-white"
              : "border-white/10 bg-stone-950/55 text-stone-300 opacity-75"
      }`}
    >
      {speaker === "user" ? (
        <UserAvatarArtwork
          avatarId={userAvatarId}
          className="h-10 w-10 shrink-0 rounded-lg sm:h-12 sm:w-12"
        />
      ) : (
        <SpeakerAvatar
          speaker={speaker}
          language={language}
          userAvatarId={userAvatarId}
          userDisplayName={userDisplayName}
        />
      )}
      <div className="min-w-0">
        <p className="truncate text-xs font-bold sm:text-sm">{name}</p>
        <p className={`truncate text-[9px] sm:text-[10px] ${active ? "text-stone-600" : "text-current opacity-65"}`}>
          {role}
        </p>
      </div>
      {active && (
        <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-amber-400 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.12em] text-amber-950">
          {COPY[language].currentSpeaker}
        </span>
      )}
    </div>
  );
}

function SceneParticipantCard({
  speaker,
  language,
  userAvatarId,
  userDisplayName,
  status,
}: {
  speaker: string;
  language: AppLanguage;
  userAvatarId: UserAvatarId;
  userDisplayName: string;
  status?: "active" | "next";
}) {
  const name = speakerDisplayName(speaker, language, userDisplayName);
  const role = speakerDisplayRole(speaker, language);
  const portraitUrl = portraitUrlFor(speaker);

  return (
    <div
      role="listitem"
      aria-label={`${name} · ${role}`}
      className={`relative h-40 w-28 shrink-0 overflow-hidden rounded-2xl border bg-stone-950/75 shadow-2xl transition-all duration-300 sm:h-48 sm:w-32 lg:h-56 lg:w-40 ${
        status
          ? "-translate-y-2 border-amber-300 ring-4 ring-amber-300/25"
          : "border-amber-100/20 opacity-85"
      }`}
    >
      {speaker === "user" ? (
        <UserAvatarArtwork
          avatarId={userAvatarId}
          portrait
          label={name}
          className="h-full w-full"
        />
      ) : portraitUrl ? (
        <img src={portraitUrl} alt={name} className="h-full w-full object-cover object-top" />
      ) : (
        <div className="grid h-full place-items-center bg-stone-800 text-3xl font-bold text-amber-100">
          {name.slice(0, 1)}
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black via-black/85 to-transparent px-3 pb-3 pt-10 text-left">
        <p className="truncate text-sm font-bold text-white">{name}</p>
        <p className="mt-0.5 truncate text-[10px] text-stone-300">{role}</p>
      </div>
      {status && (
        <span className="absolute right-2 top-2 rounded-full bg-amber-300 px-2 py-1 text-[9px] font-black text-amber-950 shadow">
          {status === "active" ? COPY[language].currentSpeaker : COPY[language].nextSpeaker}
        </span>
      )}
    </div>
  );
}

type PageNavigationState = {
  knownPageCount: number;
  cursor: number;
  revealedCursor: number;
};

function normalizePageNavigation(
  state: PageNavigationState,
  pageCount: number,
): PageNavigationState {
  if (pageCount === state.knownPageCount) return state;
  if (pageCount === 0) return { knownPageCount: 0, cursor: 0, revealedCursor: -1 };
  if (pageCount > state.knownPageCount) {
    return {
      knownPageCount: pageCount,
      cursor: state.knownPageCount,
      revealedCursor: state.knownPageCount,
    };
  }
  return { knownPageCount: pageCount, cursor: 0, revealedCursor: 0 };
}

function useTypewriter(text: string, pageKey: string) {
  const shouldReduceMotion =
    import.meta.env.MODE === "test" ||
    (typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const [reveal, setReveal] = useState({ pageKey, visibleLength: 0 });
  const visibleLength =
    shouldReduceMotion || reveal.pageKey !== pageKey ? (shouldReduceMotion ? text.length : 0) : reveal.visibleLength;

  useEffect(() => {
    if (shouldReduceMotion || text.length === 0) return;
    const timer = window.setInterval(() => {
      setReveal((current) => {
        const currentLength = current.pageKey === pageKey ? current.visibleLength : 0;
        if (currentLength >= text.length) {
          window.clearInterval(timer);
          return { pageKey, visibleLength: text.length };
        }
        return { pageKey, visibleLength: Math.min(text.length, currentLength + 2) };
      });
    }, 16);
    return () => window.clearInterval(timer);
  }, [pageKey, shouldReduceMotion, text]);

  return {
    visibleText: text.slice(0, visibleLength),
    typing: visibleLength < text.length,
    complete: () => setReveal({ pageKey, visibleLength: text.length }),
  };
}

function ConversationStage({
  language,
  stage,
  book,
  personas,
  transcript,
  inputRequest,
  activeSpeaker,
  upcomingSpeaker,
  canAdvance,
  busy,
  onAdvance,
  interactionPanel,
  userAvatarId,
  userDisplayName,
}: {
  language: AppLanguage;
  stage: StageId;
  book: ConfirmedBook;
  personas: PersonaCard[];
  transcript: Utterance[];
  inputRequest?: InputRequest;
  activeSpeaker?: string;
  upcomingSpeaker?: string;
  canAdvance: boolean;
  busy: boolean;
  onAdvance: () => void;
  interactionPanel?: ReactNode;
  userAvatarId: UserAvatarId;
  userDisplayName: string;
}) {
  const copy = COPY[language];
  const pages = useMemo(() => buildDialoguePages(transcript, language), [language, transcript]);
  const [pageNavigation, setPageNavigation] = useState<PageNavigationState>({
    knownPageCount: 0,
    cursor: 0,
    revealedCursor: -1,
  });
  const navigation = normalizePageNavigation(pageNavigation, pages.length);
  const { cursor, revealedCursor } = navigation;
  const speakers = ["moderator", ...personas.map(({ id }) => id), "user"];
  const currentPage = pages[cursor];
  const currentUtterance = currentPage?.utterance;
  const isBrowsingHistory = cursor < revealedCursor;
  const isHistoricalPage = Boolean(currentUtterance && isBrowsingHistory);
  const isStageTransition = Boolean(
    currentUtterance && currentUtterance.stage !== stage && !isBrowsingHistory,
  );
  const isOpeningScene = !currentUtterance;
  const isPreparingNextTurn = busy && !isBrowsingHistory;
  const isTransitionScene = isOpeningScene || isStageTransition || isPreparingNextTurn;
  const isUserTurn = Boolean(inputRequest);
  const displayPage = isTransitionScene || isUserTurn ? undefined : currentPage;
  const primarySpeaker = isUserTurn
    ? "user"
    : isTransitionScene
    ? upcomingSpeaker ?? activeSpeaker ?? "moderator"
    : currentUtterance?.speaker ?? activeSpeaker ?? upcomingSpeaker ?? "moderator";
  const referencedSpeaker = isUserTurn
    ? inputRequest?.kind === "discussion_reply"
      ? transcript.at(-1)?.speaker
      : undefined
    : isTransitionScene
      ? undefined
      : currentUtterance?.refersTo;
  const showClosingCast =
    stage === "WRAP_UP" && currentUtterance?.stage === stage && currentUtterance.speaker === "moderator";
  const showCastLineup = !isUserTurn && (isTransitionScene || showClosingCast);
  const showReferencedSpeaker = Boolean(
    referencedSpeaker && referencedSpeaker !== primarySpeaker && speakers.includes(referencedSpeaker),
  );
  const transitionSpeaker = upcomingSpeaker;
  const transitionSpeakerName = transitionSpeaker
    ? speakerDisplayName(transitionSpeaker, language, userDisplayName)
    : undefined;
  const transitionText = busy
    ? transitionSpeakerName
      ? copy.preparingTurn(transitionSpeakerName)
      : copy.preparingRoom
    : transitionSpeakerName
      ? copy.nextTurnReady(transitionSpeakerName)
      : isOpeningScene
        ? copy.tableReady
        : copy.stageReady(STAGE_LABELS[language][stage]);
  const { visibleText, typing, complete } = useTypewriter(
    displayPage?.text ?? "",
    displayPage?.key ?? `transition:${stage}`,
  );

  const nextPage = () => {
    if (interactionPanel) return;
    if (displayPage && typing) {
      complete();
      return;
    }
    if (cursor < revealedCursor) {
      setPageNavigation({ ...navigation, cursor: cursor + 1 });
      return;
    }
    if (displayPage && displayPage.pageIndex < displayPage.pageCount - 1) {
      setPageNavigation({
        ...navigation,
        cursor: cursor + 1,
        revealedCursor: revealedCursor + 1,
      });
      return;
    }
    if (canAdvance && !busy) {
      setPageNavigation(navigation);
      onAdvance();
    }
  };

  const nextLabel = busy
    ? copy.thinking
    : displayPage && typing
      ? copy.revealPage
      : cursor < revealedCursor || (displayPage && displayPage.pageIndex < displayPage.pageCount - 1)
      ? copy.nextPage
      : displayPage
          ? copy.advanceSpeaker
          : transcript.length === 0
            ? copy.enterTable
            : copy.advanceSpeaker;
  const canMoveWithinRevealedPages =
    cursor < revealedCursor ||
    Boolean(displayPage && displayPage.pageIndex < displayPage.pageCount - 1);
  const nextDisabled =
    busy || (!(displayPage && typing) && !canMoveWithinRevealedPages && !canAdvance);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (interactionPanel || (event.key !== " " && event.key !== "Enter")) return;
    const target = event.target as HTMLElement;
    if (["INPUT", "TEXTAREA", "BUTTON", "A"].includes(target.tagName)) return;
    event.preventDefault();
    nextPage();
  };

  return (
    <section
      className="relative h-full min-h-[36rem] overflow-hidden rounded-[1.75rem] border border-amber-100/15 bg-[#1c130d] shadow-[0_28px_90px_rgba(0,0,0,0.55)] outline-none"
      aria-label={copy.readingTable}
      tabIndex={0}
      onKeyDown={handleKeyDown}
    >
      <div className="absolute inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/reading-room-bg.png')" }} />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,6,4,0.7)_0%,rgba(20,12,7,0.12)_32%,rgba(5,4,3,0.7)_100%)]" />

      <div className="relative z-10 flex h-full min-h-[36rem] flex-col">
        <div className="flex items-center justify-between gap-4 px-4 pb-3 pt-4 sm:px-6">
          <div className="hidden min-w-0 md:block">
            <p className="text-[9px] font-bold uppercase tracking-[0.2em] text-amber-200/55">
              {copy.currentBook}
            </p>
            <p className="max-w-48 truncate font-serif text-lg text-amber-50">{book.title}</p>
          </div>
          <div className="grid flex-1 grid-cols-5 gap-1.5 sm:gap-2" role="list">
            {speakers.map((speaker) => {
              const isActive =
                !isTransitionScene && primarySpeaker === speaker && (Boolean(displayPage) || isUserTurn);
              const isAddressed =
                !isTransitionScene && referencedSpeaker === speaker && speaker !== primarySpeaker;
              const isNext = !isActive && upcomingSpeaker === speaker;
              return (
                <ParticipantCard
                  key={speaker}
                  speaker={speaker}
                  language={language}
                  userAvatarId={userAvatarId}
                  userDisplayName={userDisplayName}
                  active={isActive}
                  addressed={isAddressed}
                  next={isNext}
                />
              );
            })}
          </div>
        </div>

        <div
          className="relative flex flex-1 flex-col overflow-hidden px-4 sm:px-8"
          role="region"
          aria-label={copy.currentDialogue}
          aria-live="polite"
        >
          {showCastLineup ? (
            <div className="flex flex-1 flex-col items-center justify-center pb-40 text-center">
              <div
                className="flex w-full max-w-5xl items-end justify-start gap-2 overflow-x-auto px-1 pb-3 pt-8 sm:gap-3 md:justify-center lg:gap-5"
                role="list"
                aria-label={copy.readingTable}
              >
                {speakers.map((speaker) => (
                  <SceneParticipantCard
                    key={speaker}
                    speaker={speaker}
                    language={language}
                    userAvatarId={userAvatarId}
                    userDisplayName={userDisplayName}
                    status={
                      isTransitionScene
                        ? upcomingSpeaker === speaker
                          ? "next"
                          : undefined
                        : primarySpeaker === speaker
                          ? "active"
                          : undefined
                    }
                  />
                ))}
              </div>
              <p className="mt-3 font-serif text-xl text-amber-50 sm:text-2xl">
                {STAGE_LABELS[language][stage]}
              </p>
              <p className="mt-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-100/50">
                {isTransitionScene ? copy.sceneTransition : copy.currentDialogue}
              </p>
            </div>
          ) : (
            <div className="flex flex-1 items-end justify-center gap-4 pb-40 sm:gap-12 lg:gap-20">
              <StagePortrait speaker={primarySpeaker} language={language} userAvatarId={userAvatarId} userDisplayName={userDisplayName} />
              {showReferencedSpeaker && referencedSpeaker && (
                <StagePortrait speaker={referencedSpeaker} language={language} userAvatarId={userAvatarId} userDisplayName={userDisplayName} secondary />
              )}
            </div>
          )}

          {interactionPanel ? (
            <div className="absolute inset-x-3 bottom-3 z-20 sm:inset-x-8 sm:bottom-6">{interactionPanel}</div>
          ) : (
            <div
              className="absolute inset-x-3 bottom-3 z-20 h-40 rounded-2xl border border-amber-100/25 bg-stone-950/90 p-4 text-left text-stone-100 shadow-[0_24px_70px_rgba(0,0,0,0.6)] backdrop-blur-md sm:inset-x-8 sm:bottom-6 sm:h-44 sm:p-5"
              onClick={nextPage}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-2">
                  <p className="truncate rounded-full bg-amber-100 px-3 py-1 text-sm font-bold text-stone-950">
                    {isTransitionScene
                      ? STAGE_LABELS[language][stage]
                      : speakerDisplayName(primarySpeaker, language, userDisplayName)}
                  </p>
                  <span className="truncate text-xs text-stone-400">
                    {isTransitionScene
                      ? copy.sceneTransition
                      : isHistoricalPage && currentUtterance
                        ? copy.earlierDialogue(STAGE_LABELS[language][currentUtterance.stage])
                        : speakerDisplayRole(primarySpeaker, language)}
                  </span>
                </div>
                {displayPage && (
                  <span className="shrink-0 font-mono text-[11px] text-amber-200/70">
                    {displayPage.pageIndex + 1} / {displayPage.pageCount}
                  </span>
                )}
              </div>
              <p className="mt-3 min-h-14 whitespace-pre-wrap text-base leading-7 text-stone-100 sm:text-lg sm:leading-8">
                {displayPage ? visibleText : transitionText}
                {displayPage && typing && <span className="ml-0.5 animate-pulse text-amber-300">▌</span>}
              </p>
              <span className="sr-only" aria-live="polite">
                {displayPage?.text ?? transitionText}
              </span>
              <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between sm:left-5 sm:right-5">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      setPageNavigation({ ...navigation, cursor: Math.max(0, cursor - 1) });
                    }}
                    disabled={cursor <= 0}
                    className="rounded-lg border border-white/15 px-3 py-1.5 text-xs font-semibold text-stone-300 disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    ‹ {copy.previous}
                  </button>
                  {cursor < revealedCursor && (
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        setPageNavigation({ ...navigation, cursor: revealedCursor });
                      }}
                      className="text-xs font-semibold text-amber-200 underline decoration-amber-200/30 underline-offset-4"
                    >
                      {copy.returnLive}
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    nextPage();
                  }}
                  disabled={nextDisabled}
                  className="rounded-lg bg-amber-300 px-4 py-1.5 text-xs font-black text-amber-950 shadow hover:bg-amber-200 disabled:cursor-wait disabled:opacity-45"
                >
                  {nextLabel} ›
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function TranscriptList({
  transcript,
  language,
  userAvatarId = "reader-1",
  userDisplayName = "",
}: {
  transcript: Utterance[];
  language: AppLanguage;
  userAvatarId?: UserAvatarId;
  userDisplayName?: string;
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
          <SpeakerAvatar
            speaker={utterance.speaker}
            language={language}
            userAvatarId={userAvatarId}
            userDisplayName={userDisplayName}
          />
          <div
            className={`max-w-[85%] rounded-2xl border p-4 shadow-sm ${
              isUser
                ? "border-emerald-800 bg-emerald-900 text-white"
                : "border-stone-200 bg-white"
            }`}
          >
            <p className={`text-xs font-bold ${isUser ? "text-emerald-100" : "text-stone-500"}`}>
              {speakerDisplayName(utterance.speaker, language, userDisplayName)}
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
  const [roomAtmosphere, setRoomAtmosphere] = useState<RoomAtmosphere>();
  const [bookTitleInput, setBookTitleInput] = useState("");
  const [bookAuthorInput, setBookAuthorInput] = useState("");
  const [confirmedBook, setConfirmedBook] = useState<ConfirmedBook>();
  const [sessionPersonas, setSessionPersonas] = useState<PersonaCard[]>([]);
  const [identifyingBook, setIdentifyingBook] = useState(false);
  const [identificationError, setIdentificationError] = useState("");
  const [screen, setScreen] = useState<Screen>("setup");
  const [stage, setStage] = useState<StageId>("INTRO");
  const [transcript, setTranscript] = useState<Utterance[]>([]);
  const [canAdvance, setCanAdvance] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inputRequest, setInputRequest] = useState<InputRequest>();
  const [discussionDecision, setDiscussionDecision] = useState<DiscussionDecisionRequest>();
  const [inputText, setInputText] = useState("");
  const [recap, setRecap] = useState("");
  const [error, setError] = useState("");
  const [copyStatus, setCopyStatus] = useState<CopyStatus>("idle");
  const [recapCopyStatus, setRecapCopyStatus] = useState<CopyStatus>("idle");
  const [recapView, setRecapView] = useState<RecapView>("recap");
  const [transcriptOpen, setTranscriptOpen] = useState(false);
  const [userAvatarId, setUserAvatarId] = useState<UserAvatarId>("reader-1");
  const [userDisplayName, setUserDisplayName] = useState("");
  const [activeSpeaker, setActiveSpeaker] = useState<string>();
  const [upcomingSpeaker, setUpcomingSpeaker] = useState<string>();
  const inputResolver = useRef<((value: string) => void) | null>(null);
  const discussionDecisionResolver = useRef<((value: DiscussionAction) => void) | null>(null);
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

  const runPlaybackAction = useCallback(() => {
    const action = playbackActionRef.current;
    if (!action) return;
    playbackActionRef.current = null;
    setCanAdvance(false);
    setBusy(true);
    action();
  }, []);

  const queueManualAdvance = useCallback(
    (action: () => void) => {
      playbackActionRef.current = action;
      setCanAdvance(true);
      setBusy(false);
    },
    [],
  );

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

  useEffect(
    () => () => {
      playbackActionRef.current = null;
    },
    [],
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
    setTranscriptOpen(true);
  };

  const closeTranscript = () => {
    setTranscriptOpen(false);
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
    playbackActionRef.current = null;
    setScreen("session");
    window.scrollTo(0, 0);
    setTranscript([]);
    setRecap("");
    setRecapView("recap");
    setTranscriptOpen(false);
    setDiscussionDecision(undefined);
    setRecapCopyStatus("idle");
    setError("");
    setBusy(true);
    setActiveSpeaker(undefined);
    setUpcomingSpeaker(undefined);
    setRoomAtmosphere(undefined);

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
        } else if (import.meta.env.DEV && message.startsWith("Quality fallback: ")) {
          recordGenerationDiagnostic({
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            endpoint: "engine-quality",
            outcome: "failure",
            status: 0,
            durationMs: 0,
            code: "quality_fallback",
            detail: message.slice("Quality fallback: ".length),
          });
        }
      },
      onUtterance(utterance) {
        setActiveSpeaker(utterance.speaker);
        setUpcomingSpeaker(undefined);
        setCopyStatus("idle");
        setTranscript((current) => [...current, utterance]);
      },
      onAtmosphereChange(atmosphere) {
        setRoomAtmosphere(atmosphere);
      },
    });

    void engine
      .run({
        confirmedBook,
        language,
        seed,
        waitForAdvance(turn) {
          return new Promise<void>((resolve) => {
            const speakerId = turn.speaker === "moderator" ? "moderator" : turn.speaker.id;
            setUpcomingSpeaker(speakerId);
            queueManualAdvance(resolve);
          });
        },
        requestUserInput(turn) {
          return new Promise<string>((resolve) => {
            setUpcomingSpeaker("user");
            queueManualAdvance(() => {
              inputResolver.current = resolve;
              setActiveSpeaker("user");
              setUpcomingSpeaker(undefined);
              setInputRequest(turn);
              setCanAdvance(false);
              setBusy(false);
            });
          });
        },
        requestDiscussionAction(turn) {
          return new Promise<DiscussionAction>((resolve) => {
            setUpcomingSpeaker(undefined);
            queueManualAdvance(() => {
              discussionDecisionResolver.current = resolve;
              setDiscussionDecision(turn);
              setActiveSpeaker(undefined);
              setUpcomingSpeaker(undefined);
              setCanAdvance(false);
              setBusy(false);
            });
          });
        },
        waitForSessionComplete() {
          return new Promise<void>((resolve) => {
            setUpcomingSpeaker(undefined);
            queueManualAdvance(resolve);
          });
        },
      })
      .then((result) => {
        setRecap(result.recapMarkdown);
        setTranscriptOpen(false);
        setScreen("recap");
        playbackActionRef.current = null;
        setBusy(false);
      })
      .catch((caught: unknown) => {
        setError(generationErrorMessage(caught));
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
    resolve(value);
  };

  const submitDiscussionDecision = (value: DiscussionAction) => {
    const resolve = discussionDecisionResolver.current;
    if (!resolve) return;
    discussionDecisionResolver.current = null;
    setDiscussionDecision(undefined);
    setBusy(true);
    resolve(value);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (inputText.trim()) submitUserInput(inputText);
  };

  const startNewSession = () => {
    playbackActionRef.current = null;
    inputResolver.current = null;
    discussionDecisionResolver.current = null;
    setScreen("setup");
    setBookTitleInput("");
    setBookAuthorInput("");
    setRoomAtmosphere(undefined);
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
    setDiscussionDecision(undefined);
    setStage("INTRO");
    setActiveSpeaker(undefined);
    setUpcomingSpeaker(undefined);
  };

  if (screen === "setup") {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#0d0907] px-5 py-10 text-stone-900 sm:py-14">
        <div className="fixed inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/reading-room-bg.png')" }} />
        <div className="fixed inset-0 bg-[radial-gradient(circle_at_center,rgba(64,38,19,0.18),rgba(6,4,3,0.86)_72%)]" />
        <section className="relative z-10 mx-auto max-w-5xl rounded-[2rem] border border-amber-100/20 bg-[#fffaf0]/95 p-8 shadow-[0_32px_100px_rgba(0,0,0,0.62)] backdrop-blur-sm sm:p-12">
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

          {confirmedBook && (
            <section className="mt-5 rounded-2xl border border-amber-200 bg-[#2a1a10] p-5 text-amber-50">
              <p className="font-serif text-xl">{copy.identityTitle}</p>
              <p className="mt-1 text-xs leading-5 text-amber-100/65">{copy.identityHint}</p>
              <label className="mt-4 block text-xs font-semibold text-amber-100" htmlFor="display-name">
                {copy.displayName}
              </label>
              <input
                id="display-name"
                type="text"
                maxLength={32}
                value={userDisplayName}
                onChange={(event) => setUserDisplayName(event.target.value)}
                placeholder={copy.displayNamePlaceholder}
                className="mt-2 w-full rounded-xl border border-amber-100/20 bg-black/25 px-4 py-3 text-sm text-white outline-none placeholder:text-amber-100/35 focus:border-amber-300"
              />
              <fieldset className="mt-4">
                <legend className="text-xs font-semibold text-amber-100">{copy.avatarLabel}</legend>
                <div className="mt-2 grid grid-cols-4 gap-2">
                  {USER_AVATARS.map(({ id, label }) => (
                    <button
                      key={id}
                      type="button"
                      aria-label={label}
                      aria-pressed={userAvatarId === id}
                      onClick={() => setUserAvatarId(id)}
                      className={`overflow-hidden rounded-xl border-2 transition ${
                        userAvatarId === id
                          ? "border-amber-300 ring-2 ring-amber-300/35"
                          : "border-transparent opacity-65 hover:opacity-100"
                      }`}
                    >
                      <UserAvatarArtwork avatarId={id} className="aspect-square w-full" />
                    </button>
                  ))}
                </div>
              </fieldset>
              <p className="mt-4 text-xs text-amber-100/60">{copy.manualHint}</p>
            </section>
          )}

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
        <DiagnosticsPanel language={language} roomAtmosphere={roomAtmosphere} />
      </main>
    );
  }

  if (screen === "recap") {
    return (
      <main className="relative min-h-screen overflow-hidden bg-[#0d0907] px-4 py-8 text-stone-900 sm:px-6">
        <div className="fixed inset-0 bg-cover bg-center" style={{ backgroundImage: "url('/reading-room-bg.png')" }} />
        <div className="fixed inset-0 bg-[linear-gradient(180deg,rgba(8,5,3,0.82),rgba(9,6,4,0.72))]" />
        <section className="relative z-10 mx-auto max-w-5xl">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-amber-300">
                {copy.sessionComplete}
              </p>
              <h1 className="mt-2 font-serif text-4xl text-amber-50">{copy.completionTitle}</h1>
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
                    className="rounded-xl border border-amber-100/25 bg-white/10 px-4 py-2 text-sm font-semibold text-amber-50 hover:bg-white/15"
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
                className="rounded-xl border border-amber-100/25 bg-white/10 px-4 py-2 text-sm font-semibold text-amber-50 hover:bg-white/15"
              >
                {copy.newSession}
              </button>
            </div>
          </div>

          <div
            className="mt-7 inline-flex rounded-xl border border-amber-100/20 bg-stone-950/75 p-1 text-amber-50 backdrop-blur-md"
            role="tablist"
            aria-label={language === "ko" ? "완료된 세션 보기" : "Completed session views"}
          >
            <button
              type="button"
              role="tab"
              aria-selected={recapView === "recap"}
              onClick={() => setRecapView("recap")}
              className={`rounded-lg px-4 py-2 text-sm font-semibold ${
                recapView === "recap" ? "bg-amber-300 text-amber-950" : "text-stone-300 hover:bg-white/10"
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
                  ? "bg-amber-300 text-amber-950"
                  : "text-stone-300 hover:bg-white/10"
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
        <DiagnosticsPanel language={language} roomAtmosphere={roomAtmosphere} />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0d0907] text-stone-100">
      <header className="relative z-20 border-b border-amber-100/10 bg-[#130d09] px-3 py-3 sm:px-5">
        <div className="mx-auto flex max-w-[100rem] items-center gap-4">
          <div className="min-w-0 shrink-0">
            <p className="font-serif text-lg text-amber-50 sm:text-xl">The Reading Table</p>
            <p className="max-w-48 truncate text-[10px] text-amber-100/45 sm:max-w-64">
              {generationMode === "live"
                ? copy.liveSessionLabel(confirmedBook?.title ?? "")
                : copy.sessionLabel(confirmedBook?.title ?? "")}
            </p>
          </div>
          <ol className="hidden min-w-0 flex-1 items-center justify-center gap-1 lg:flex" aria-label={copy.stagesLabel}>
            {STAGES.map((item) => {
              const activeIndex = STAGES.findIndex((id) => id === stage);
              const itemIndex = STAGES.findIndex((id) => id === item);
              const isActive = item === stage;
              const isComplete = itemIndex < activeIndex;
              return (
                <li
                  key={item}
                  aria-current={isActive ? "step" : undefined}
                  className={`whitespace-nowrap rounded-full px-3 py-1 text-[10px] font-bold ${
                    isActive
                      ? "bg-amber-300 text-amber-950"
                      : isComplete
                        ? "bg-amber-950 text-amber-200"
                        : "bg-white/5 text-stone-500"
                  }`}
                >
                  {STAGE_LABELS[language][item]}
                </li>
              );
            })}
          </ol>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <span className="hidden rounded-full bg-emerald-950 px-3 py-1 text-[10px] font-semibold text-emerald-200 sm:inline-flex">
              {generationMode === "live" ? copy.liveCredits : copy.noCredits}
            </span>
            <button
              type="button"
              onClick={openTranscript}
              disabled={transcript.length === 0}
              className="rounded-lg border border-amber-100/20 bg-white/5 px-3 py-2 text-xs font-semibold text-amber-50 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-35"
            >
              {copy.viewTranscript(transcript.length)}
            </button>
          </div>
        </div>
      </header>

      <section className="mx-auto h-[calc(100dvh-4.5rem)] min-h-[37rem] max-w-[100rem] p-2 sm:p-4">
        <ConversationStage
          language={language}
          stage={stage}
          book={confirmedBook!}
          personas={sessionPersonas}
          transcript={transcript}
          inputRequest={inputRequest}
          activeSpeaker={activeSpeaker}
          upcomingSpeaker={upcomingSpeaker}
          canAdvance={canAdvance}
          busy={busy}
          onAdvance={advance}
          userAvatarId={userAvatarId}
          userDisplayName={userDisplayName}
          interactionPanel={
            error ? (
              <p role="alert" className="rounded-xl border border-red-300/40 bg-red-950/95 p-4 text-sm text-red-100 shadow-2xl">
                {error}
              </p>
            ) : discussionDecision ? (
              <div className="rounded-2xl border border-amber-200/30 bg-stone-950/95 p-5 text-stone-100 shadow-2xl backdrop-blur-md">
                <p className="font-serif text-xl text-amber-100">{copy.discussionChoice}</p>
                <p className="mt-1 text-sm leading-6 text-stone-400">
                  {language === "ko"
                    ? discussionDecision.phase === "after_join"
                      ? discussionDecision.round === 1
                        ? "방금 생긴 쟁점을 두 독자가 더 밀어붙이게 하거나, 지금의 긴장을 남긴 채 마무리할 수 있습니다."
                        : "한 차례 더 이어진 쟁점을 마지막으로 한 번 더 듣거나, 지금 직접 마무리를 선택할 수 있습니다."
                      : "직접 의견을 보태거나, 두 독자의 논쟁을 조금 더 듣거나, 남은 쟁점을 그대로 두고 마무리할 수 있습니다."
                    : discussionDecision.phase === "after_join"
                      ? discussionDecision.round === 1
                        ? "Let the two readers push the new disagreement further, or leave the tension open and wrap up."
                        : "Hear one final exchange on the remaining disagreement, or choose to close the table now."
                      : "Join with your own view, hear one more exchange, or leave the remaining tension open and wrap up."}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {discussionDecision.phase === "before_join" && (
                    <button type="button" onClick={() => submitDiscussionDecision("join")} className="rounded-lg bg-amber-300 px-4 py-2 text-sm font-bold text-amber-950">
                      {copy.joinDiscussion}
                    </button>
                  )}
                  {discussionDecision.canListen && (
                    <button type="button" onClick={() => submitDiscussionDecision("listen")} className="rounded-lg border border-amber-200/30 bg-white/10 px-4 py-2 text-sm font-semibold text-amber-50">
                      {discussionDecision.phase === "after_join" ? copy.continueDiscussion : copy.keepListening}
                    </button>
                  )}
                  <button type="button" onClick={() => submitDiscussionDecision("wrap")} className="rounded-lg px-4 py-2 text-sm font-semibold text-stone-400 hover:bg-white/10">
                    {copy.wrapDiscussion}
                  </button>
                </div>
              </div>
            ) : inputRequest ? (
              <form onSubmit={handleSubmit} className="rounded-2xl border border-amber-200/30 bg-stone-950/95 p-4 text-stone-100 shadow-2xl backdrop-blur-md">
                <div className="flex items-start gap-3">
                  <UserAvatarArtwork avatarId={userAvatarId} className="h-11 w-11 shrink-0 rounded-xl" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-amber-300">{copy.waitingForYou}</p>
                    <label htmlFor="user-turn" className="text-sm font-semibold text-amber-50">{INPUT_PROMPTS[language][inputRequest.kind]}</label>
                    {inputRequest.kind === "discussion_reply" && transcript.at(-1) && (
                      <p className="mt-1 max-h-12 overflow-y-auto text-xs leading-5 text-stone-400">
                        {copy.challengedLine}: {transcript.at(-1)?.text}
                      </p>
                    )}
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
                  className="mt-3 h-20 w-full resize-none rounded-xl border border-white/15 bg-black/25 p-3 text-sm leading-6 text-white outline-none placeholder:text-stone-600 focus:border-amber-300"
                />
                <div className="mt-2 flex items-center justify-between gap-2">
                  <p className="hidden text-[10px] text-stone-500 sm:block">{copy.manualHint}</p>
                  <div className="ml-auto flex gap-2">
                    <button type="button" onClick={() => submitUserInput("")} className="rounded-lg px-4 py-2 text-sm font-semibold text-stone-400 hover:bg-white/10">{copy.pass}</button>
                    <button type="submit" disabled={!inputText.trim()} className="rounded-lg bg-amber-300 px-5 py-2 text-sm font-bold text-amber-950 disabled:cursor-not-allowed disabled:opacity-40">{copy.share}</button>
                  </div>
                </div>
              </form>
            ) : undefined
          }
        />
      </section>

      {transcriptOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-stone-950/60 backdrop-blur-sm" onClick={closeTranscript}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="transcript-dialog-title"
            className="flex h-full w-full max-w-2xl flex-col overflow-hidden border-l border-amber-100/15 bg-[#f8f1e5] text-stone-900 shadow-2xl"
            onClick={(event) => event.stopPropagation()}
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
                  onClick={closeTranscript}
                  className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-50"
                >
                  {copy.closeTranscript}
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-8 sm:px-8">
              <TranscriptList
                transcript={transcript}
                language={language}
                userAvatarId={userAvatarId}
                userDisplayName={userDisplayName}
              />
            </div>
          </section>
        </div>
      )}
      <DiagnosticsPanel language={language} roomAtmosphere={roomAtmosphere} />
    </main>
  );
}
