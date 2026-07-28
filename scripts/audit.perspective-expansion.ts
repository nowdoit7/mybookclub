import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { MockGenerationClient } from "../src/api/mockGenerationClient";
import { SessionEngine } from "../src/engine/sessionEngine";

interface DialogueRecord {
  bookId: string;
  personaId: string;
  turnType: string;
  dialogue: string;
}

const DATA_FILES = [
  "dialogues.core.dev-a.jsonl",
  "dialogues.core.dev-b.jsonl",
  "dialogues.core.holdout.jsonl",
] as const;

const ARGUMENTATIVE_CUES =
  /반대|반증|입증|책임|귀속|판결|일반화|면책|기준|검토|판단|단정|따르기 어렵|구분|확인/gu;
const EXPERIENTIAL_CUES =
  /느껴|마음|인상|흥미|좋|불편|두렵|끌리|궁금|놀랍|경이|떠오르/gu;

async function readJsonLines(path: string): Promise<DialogueRecord[]> {
  const content = await readFile(path, "utf8");
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as DialogueRecord;
      } catch (error) {
        throw new Error(
          `Invalid JSONL at ${path}:${index + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });
}

function hasMatch(text: string, pattern: RegExp): boolean {
  pattern.lastIndex = 0;
  return pattern.test(text);
}

function countQuestionMarks(text: string): number {
  return text.match(/[?？]/gu)?.length ?? 0;
}

const fixtureRoot = resolve("fixtures", "character-core", "real-books");
const records = (
  await Promise.all(
    DATA_FILES.map((file) => readJsonLines(resolve(fixtureRoot, file))),
  )
)
  .flat()
  .filter(({ turnType }) => turnType === "first_impression");

const grouped = new Map<string, DialogueRecord[]>();
for (const record of records) {
  const current = grouped.get(record.bookId) ?? [];
  current.push(record);
  grouped.set(record.bookId, current);
}

console.log("Perspective-expansion proxy audit");
console.log("No OpenAI API call is made by this command.");
console.log("");
console.log("Frozen pre-redesign dialogue baseline");
console.log(
  "| book | turns | argumentative framing | felt-interest language | questions |",
);
console.log("|---|---:|---:|---:|---:|");

let argumentativeTurns = 0;
let experientialTurns = 0;
let questionCount = 0;

for (const [bookId, bookRecords] of [...grouped.entries()].sort(([left], [right]) =>
  left.localeCompare(right),
)) {
  const bookArgumentative = bookRecords.filter(({ dialogue }) =>
    hasMatch(dialogue, ARGUMENTATIVE_CUES),
  ).length;
  const bookExperiential = bookRecords.filter(({ dialogue }) =>
    hasMatch(dialogue, EXPERIENTIAL_CUES),
  ).length;
  const bookQuestions = bookRecords.reduce(
    (total, { dialogue }) => total + countQuestionMarks(dialogue),
    0,
  );

  argumentativeTurns += bookArgumentative;
  experientialTurns += bookExperiential;
  questionCount += bookQuestions;

  console.log(
    `| ${bookId} | ${bookRecords.length} | ${bookArgumentative}/${bookRecords.length} | ${bookExperiential}/${bookRecords.length} | ${bookQuestions} |`,
  );
}

console.log("");
console.log(
  `Summary: ${records.length} independent first impressions; argumentative framing ${argumentativeTurns}/${records.length}; felt-interest language ${experientialTurns}/${records.length}; questions ${questionCount}.`,
);
console.log(
  "Interpretation limit: these are lexical proxies. Human review must decide whether a turn genuinely adds a new perspective, repeats a prior point, or forces opposition.",
);

const CURRENT_GUARD_CUES =
  /반론|반박|반례|입증|증명|반대 근거|검증|범위를 시험|\b(?:rebut|counterexample|prove|defend|test the scope|contrary evidence)\b/iu;
const OCCUPATION_INFERENCE_CUES = /(?:인 저는|인 제게|\bAs an? [^,.]{2,40}, I\b)/u;
const CURRENT_CASES = [
  { title: "코스모스", author: "칼 세이건", seed: "perspective-cosmos" },
  { title: "니코마코스 윤리학", author: "아리스토텔레스", seed: "perspective-ethics" },
  { title: "아주 작은 습관의 힘", author: "제임스 클리어", seed: "perspective-habits" },
  { title: "이방인", author: "알베르 카뮈", seed: "perspective-stranger" },
  { title: "혼모노", author: "성해나", seed: "perspective-honmono" },
] as const;

let currentPersonaTurns = 0;
let currentArgumentativeTurns = 0;
let currentUserQuestions = 0;
let currentOccupationInferences = 0;

for (const testCase of CURRENT_CASES) {
  const { state } = await new SessionEngine(new MockGenerationClient()).run({
    ...testCase,
    language: "ko",
    userInputs: {
      intro: "혼자 읽을 때 놓친 부분을 다른 사람들의 이야기를 통해 보고 싶습니다.",
      firstImpression: "인물의 선택을 보면서 안타까운 마음이 들었습니다.",
      memorableScene: "처음에는 지나쳤지만 뒤의 이야기를 읽고 다시 떠올린 장면이 있습니다.",
      discussion: "저는 그 장면에서 정답보다 인물이 왜 그렇게 느꼈는지가 궁금했습니다.",
      discussionReply: "혼자 남은 인물의 표정이 떠올라서 그렇게 읽었습니다.",
      wrapUp: "다른 분이 본 장면을 들으니 제가 놓친 감정이 보였습니다.",
    },
  });
  const personaDiscussion = state.transcript.filter(
    ({ stage, speaker }) =>
      stage === "DISCUSSION" && !["moderator", "user"].includes(speaker),
  );
  const personaOutsideIntro = state.transcript.filter(
    ({ stage, speaker }) =>
      stage !== "INTRO" && !["moderator", "user"].includes(speaker),
  );

  currentPersonaTurns += personaDiscussion.length;
  currentArgumentativeTurns += personaDiscussion.filter(({ text }) =>
    CURRENT_GUARD_CUES.test(text),
  ).length;
  currentUserQuestions += personaDiscussion.filter(
    ({ refersTo, text }) =>
      refersTo === "user" && (text.match(/[?？]/gu)?.length ?? 0) === 1,
  ).length;
  currentOccupationInferences += personaOutsideIntro.filter(({ text }) =>
    OCCUPATION_INFERENCE_CUES.test(text),
  ).length;
}

console.log("");
console.log("Current local deterministic-flow guard");
console.log(`- representative sessions: ${CURRENT_CASES.length}`);
console.log(`- persona discussion turns: ${currentPersonaTurns}`);
console.log(`- forced-debate cue violations: ${currentArgumentativeTurns}`);
console.log(
  `- grounded user questions: ${currentUserQuestions}/${CURRENT_CASES.length} sessions`,
);
console.log(`- occupation-to-reading inference violations: ${currentOccupationInferences}`);
console.log(
  "Interpretation limit: this current guard proves orchestration, mock, and fallback policy only. It does not replace a paid live-language run or human Korean review.",
);

if (
  currentArgumentativeTurns > 0 ||
  currentUserQuestions !== CURRENT_CASES.length ||
  currentOccupationInferences > 0
) {
  process.exitCode = 1;
}
