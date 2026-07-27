import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

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
