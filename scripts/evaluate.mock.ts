import { MockGenerationClient } from "../src/api/mockGenerationClient";
import { countSentences } from "../src/engine/sentenceValidation";
import { SessionEngine } from "../src/engine/sessionEngine";
import type {
  AppLanguage,
  BookScope,
  CompletedSession,
} from "../src/types";

interface Check {
  name: string;
  passed: boolean;
  detail: string;
}

function evaluate(result: CompletedSession): Check[] {
  const { state } = result;
  const personaIds = new Set(state.personas.map(({ id }) => id));
  const introductions = state.transcript.filter(
    ({ stage, speaker }) => stage === "INTRO" && personaIds.has(speaker),
  );
  const firstImpressions = state.transcript.filter(
    ({ stage, speaker }) => stage === "FIRST_IMPRESSIONS" && personaIds.has(speaker),
  );
  const discussion = state.transcript.filter(({ stage }) => stage === "DISCUSSION");
  const closings = state.transcript.filter(
    ({ stage, speaker }) => stage === "WRAP_UP" && personaIds.has(speaker),
  );
  const generatedPersonaTurns = state.transcript.filter(({ speaker }) => personaIds.has(speaker));
  const repeatedTurnCount =
    generatedPersonaTurns.length - new Set(generatedPersonaTurns.map(({ text }) => text)).size;
  const invalidLengthCount = generatedPersonaTurns.filter(({ text }) => {
    const count = countSentences(text);
    return count < 2 || count > 4;
  }).length;
  const discussionUserTurns = discussion.filter(({ speaker }) => speaker === "user");
  const agendaSlices = state.agendaRounds.map((_, index) =>
    discussion.slice(index * 7, index * 7 + 7),
  );
  const spokenDiscussionTurns = discussion.filter(
    ({ speaker }) => personaIds.has(speaker),
  );
  const essayLikeTurnCount = spokenDiscussionTurns.filter(
    ({ text }) =>
      /[;；]/u.test(text) ||
      text
        .split(/(?<=[.!?。？！])\s+/u)
        .some((sentence) => [...sentence].length > (/[가-힣]/u.test(sentence) ? 95 : 200)),
  ).length;

  return [
    {
      name: "social introductions",
      passed: introductions.length === 3 && new Set(introductions.map(({ text }) => text)).size === 3,
      detail: `${introductions.length}/3 distinct reader introductions`,
    },
    {
      name: "non-adversarial first impressions",
      passed: firstImpressions.length === 3 && firstImpressions.every(({ refersTo }) => !refersTo),
      detail: `${firstImpressions.length}/3 independent first impressions`,
    },
    {
      name: "two prepared agenda questions",
      passed:
        state.agendaRounds.length === 2 &&
        state.agendaRounds[0]?.topic === state.meetingPlan.primaryPrompt &&
        state.agendaRounds[1]?.topic === state.meetingPlan.reservePrompt &&
        agendaSlices.every(
          (agenda) => (agenda[0]?.text.match(/[?？]/gu)?.length ?? 0) === 1,
        ),
      detail: `${state.agendaRounds.length}/2 agendas opened in prepared order`,
    },
    {
      name: "distinct perspective entrances",
      passed:
        state.meetingPlan.assignments.length === 3 &&
        new Set(state.meetingPlan.assignments.map(({ anchorId }) => anchorId)).size === 3,
      detail: `${new Set(
        state.meetingPlan.assignments.map(({ anchorId }) => anchorId),
      ).size}/3 unique primary anchors`,
    },
    {
      name: "common interpretation ownership",
      passed:
        state.meetingPlan.assignments.filter(({ anchorId }) =>
          state.meetingPlan.anchors.find(({ id }) => id === anchorId)?.isCommonInterpretation
        ).length <= 1,
      detail: "at most one reader owns a common interpretation as the main entrance",
    },
    {
      name: "user perspective expanded in each agenda",
      passed:
        discussionUserTurns.length === 2 &&
        agendaSlices.every(
          (agenda, index) =>
            agenda[4]?.speaker === "user" &&
            agenda[5]?.speaker === state.agendaRounds[index]?.reflector &&
            agenda[5]?.refersTo === "user",
        ),
      detail: `${discussionUserTurns.length}/2 user contributions received a widening response`,
    },
    {
      name: "one user turn per agenda",
      passed:
        discussionUserTurns.length === 2 &&
        agendaSlices.every((agenda) => agenda.filter(({ speaker }) => speaker === "user").length === 1),
      detail: `${discussionUserTurns.length}/2 scheduled user turns`,
    },
    {
      name: "agenda perspective exchange",
      passed:
        agendaSlices.every(
          (agenda, index) =>
            agenda[1]?.speaker === state.agendaRounds[index]?.lead &&
            agenda[2]?.speaker === state.agendaRounds[index]?.responder &&
            agenda[2]?.refersTo === state.agendaRounds[index]?.lead,
        ),
      detail: "each lead is followed by a code-selected independent responder",
    },
    {
      name: "all readers participate in every agenda",
      passed:
        agendaSlices.every(
          (agenda) =>
            new Set(agenda.filter(({ speaker }) => personaIds.has(speaker)).map(({ speaker }) => speaker))
              .size === 3,
        ),
      detail: "lead, responder, and reflector cover all three readers in both agendas",
    },
    {
      name: "distinct agenda leads",
      passed:
        new Set(state.agendaRounds.map(({ lead }) => lead)).size === 2,
      detail: `${new Set(state.agendaRounds.map(({ lead }) => lead)).size}/2 distinct leads`,
    },
    {
      name: "spoken discussion style",
      passed: essayLikeTurnCount === 0,
      detail: `${essayLikeTurnCount} semicolon-heavy or overlong persona turns`,
    },
    {
      name: "distinct closing movement",
      passed: closings.length === 3 && new Set(closings.map(({ text }) => text)).size === 3,
      detail: `${new Set(closings.map(({ text }) => text)).size}/3 unique reflections and farewells`,
    },
    {
      name: "no exact persona repetition",
      passed: repeatedTurnCount === 0,
      detail: `${repeatedTurnCount} repeated persona turns`,
    },
    {
      name: "persona turn length",
      passed: invalidLengthCount === 0,
      detail: `${invalidLengthCount} turns outside 2-4 sentences`,
    },
  ];
}

interface EvaluationCase {
  language: AppLanguage;
  title: string;
  author: string;
  scope?: BookScope;
}

async function runCase({
  language,
  title,
  author,
  scope = "single_book",
}: EvaluationCase): Promise<void> {
  const result = await new SessionEngine(new MockGenerationClient()).run({
    title,
    author,
    scope,
    seed: `evaluation:${language}:${title}`,
    language,
    userInputs:
      language === "ko"
        ? {
            intro: "혼자 읽을 때 놓친 관점을 듣고 싶어 모임에 왔습니다.",
            firstImpression: "중심 질문은 흥미로웠지만 제시 방식에는 아직 판단을 유보하고 있습니다.",
            memorableScene: "앞에서 이해한 내용을 새롭게 보게 만든 대목이 가장 기억에 남았습니다.",
            discussion: "형식과 그 결과를 함께 설명하는 해석이 더 설득력 있다고 생각합니다.",
            discussionSecond: "두 번째 발제에서는 의도와 결과를 나누어 볼 필요가 있다고 생각합니다.",
            wrapUp: "다른 독자의 근거를 들으며 처음 판단을 더 세밀하게 다듬었습니다.",
          }
        : {
            intro: "I came to hear what other readers noticed that I may have missed alone.",
            firstImpression: "The central question interested me, but I am still testing how the book presented it.",
            memorableScene: "The passage that changed my earlier understanding stayed with me.",
            discussion: "I prefer an interpretation that explains both the form and its consequences.",
            discussionSecond: "For the second agenda, I want to separate intention from consequence.",
            wrapUp: "The other readers helped me make my first judgment more precise.",
          },
  });
  const checks = [
    ...evaluate(result),
    {
      name: "selected book retained",
      passed: result.state.book.title === title && result.recapMarkdown.includes(title),
      detail: `${result.state.book.title} by ${result.state.book.author}`,
    },
    {
      name: "requested scope retained",
      passed: result.state.book.workScope === scope,
      detail: result.state.book.workScope,
    },
    {
      name: "emergent atmosphere remains bounded",
      passed: Object.values(result.state.roomAtmosphere).every(
        (value) => value >= 0 && value <= 1,
      ),
      detail: JSON.stringify(result.state.roomAtmosphere),
    },
  ];
  const passed = checks.filter((check) => check.passed).length;

  console.log(`\n${language.toUpperCase()} · ${title}: ${passed}/${checks.length}`);
  for (const check of checks) {
    console.log(`${check.passed ? "PASS" : "FAIL"}  ${check.name} — ${check.detail}`);
  }
  if (passed !== checks.length) process.exitCode = 1;
}

const cases: EvaluationCase[] = [
  {
    language: "en",
    title: "The Cartographer's Lantern",
    author: "R. Vale",
  },
  {
    language: "en",
    title: "Notes on Attention",
    author: "M. Rowan",
  },
  { language: "ko", title: "달의 정원", author: "한여름" },
  { language: "ko", title: "천천히 읽는 기술", author: "김독자" },
  {
    language: "ko",
    title: "독자가 선택한 삼부작",
    author: "김작가",
    scope: "series",
  },
];

for (const evaluationCase of cases) await runCase(evaluationCase);
