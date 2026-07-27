import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

interface EvidenceRef {
  id: string;
}

interface DialogueRecord {
  bookId: string;
  personaId: string;
  questionId: string;
  turnType: string;
  prompt: string;
  allowedEvidence: EvidenceRef[];
  usedEvidenceIds: string[];
  dialogueMove: string;
  dialogue: string;
}

interface BookAudit {
  bookId: string;
  readerCount: number;
  availableEvidenceOverlap: number;
  selectedEvidenceOverlap: number;
  dialogueTokenOverlap: number;
  distinctSelectionCount: number;
  inputConvergenceRisk: "높음" | "중간" | "낮음";
}

const DATA_FILES = [
  "dialogues.core.dev-a.jsonl",
  "dialogues.core.dev-b.jsonl",
  "dialogues.core.holdout.jsonl",
] as const;

const STOP_TOKENS = new Set([
  "가장",
  "같은",
  "것은",
  "그",
  "그래서",
  "그리고",
  "다만",
  "더",
  "먼저",
  "보입니다",
  "보여요",
  "수",
  "어떤",
  "이",
  "있는",
  "있습니다",
  "저는",
  "점이",
  "합니다",
  "한",
  "합니다",
]);

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

function jaccard(left: ReadonlySet<string>, right: ReadonlySet<string>): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 1;

  let intersectionSize = 0;
  for (const item of left) {
    if (right.has(item)) intersectionSize += 1;
  }
  return intersectionSize / union.size;
}

function meanPairwiseOverlap(sets: ReadonlySet<string>[]): number {
  if (sets.length < 2) return 1;

  let total = 0;
  let comparisons = 0;
  for (let leftIndex = 0; leftIndex < sets.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < sets.length;
      rightIndex += 1
    ) {
      total += jaccard(sets[leftIndex], sets[rightIndex]);
      comparisons += 1;
    }
  }
  return comparisons === 0 ? 1 : total / comparisons;
}

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLocaleLowerCase("ko")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(/\s+/u)
    .map((token) => token.trim())
    .filter(
      (token) =>
        token.length >= 2 &&
        !STOP_TOKENS.has(token) &&
        !/^(?:이다|이고|이며|에서|으로|라는|라고|하게|하기)$/u.test(token),
    );
  return new Set(tokens);
}

function percentage(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function riskLabel(
  selectedEvidenceOverlap: number,
): BookAudit["inputConvergenceRisk"] {
  if (selectedEvidenceOverlap >= 0.75) {
    return "높음";
  }
  if (selectedEvidenceOverlap >= 0.5) {
    return "중간";
  }
  return "낮음";
}

function auditBook(bookId: string, records: DialogueRecord[]): BookAudit {
  const availableEvidenceSets = records.map(
    ({ allowedEvidence }) => new Set(allowedEvidence.map(({ id }) => id)),
  );
  const selectedEvidenceSets = records.map(
    ({ usedEvidenceIds }) => new Set(usedEvidenceIds),
  );
  const dialogueTokenSets = records.map(({ dialogue }) => tokenize(dialogue));
  const availableEvidenceOverlap = meanPairwiseOverlap(availableEvidenceSets);
  const selectedEvidenceOverlap = meanPairwiseOverlap(selectedEvidenceSets);

  return {
    bookId,
    readerCount: records.length,
    availableEvidenceOverlap,
    selectedEvidenceOverlap,
    dialogueTokenOverlap: meanPairwiseOverlap(dialogueTokenSets),
    distinctSelectionCount: new Set(
      records.map(({ usedEvidenceIds }) => [...usedEvidenceIds].sort().join(",")),
    ).size,
    inputConvergenceRisk: riskLabel(selectedEvidenceOverlap),
  };
}

const fixtureRoot = resolve("fixtures", "character-core", "real-books");
const records = (
  await Promise.all(
    DATA_FILES.map((file) =>
      readJsonLines(resolve(fixtureRoot, file)),
    ),
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

const audits = [...grouped.entries()]
  .map(([bookId, bookRecords]) => auditBook(bookId, bookRecords))
  .sort((left, right) => left.bookId.localeCompare(right.bookId));

console.log("Character Core first-impression convergence audit");
console.log("No OpenAI API call is made by this command.");
console.log(
  "| book | readers | available evidence overlap | selected evidence overlap | dialogue token overlap | distinct selections | input risk |",
);
console.log(
  "|---|---:|---:|---:|---:|---:|---|",
);
for (const audit of audits) {
  console.log(
    `| ${audit.bookId} | ${audit.readerCount} | ${percentage(
      audit.availableEvidenceOverlap,
    )} | ${percentage(audit.selectedEvidenceOverlap)} | ${percentage(
      audit.dialogueTokenOverlap,
    )} | ${audit.distinctSelectionCount} | ${audit.inputConvergenceRisk} |`,
  );
}

const highRiskCount = audits.filter(
  ({ inputConvergenceRisk }) => inputConvergenceRisk === "높음",
).length;
const averageAvailableOverlap =
  audits.reduce(
    (total, { availableEvidenceOverlap }) =>
      total + availableEvidenceOverlap,
    0,
  ) / audits.length;
const averageSelectedOverlap =
  audits.reduce(
    (total, { selectedEvidenceOverlap }) => total + selectedEvidenceOverlap,
    0,
  ) / audits.length;
const averageDialogueOverlap =
  audits.reduce(
    (total, { dialogueTokenOverlap }) => total + dialogueTokenOverlap,
    0,
  ) / audits.length;

console.log("");
console.log(
  `Summary: ${audits.length} books, ${records.length} independent first impressions, ${highRiskCount} high input-risk books.`,
);
console.log(
  `Mean overlaps: available evidence ${percentage(
    averageAvailableOverlap,
  )}, selected evidence ${percentage(
    averageSelectedOverlap,
  )}, dialogue tokens ${percentage(averageDialogueOverlap)}.`,
);
console.log(
  "Interpretation limit: overlap detects shared input and wording, not semantic agreement. Read the dialogues before calling a shared conclusion natural or artificial.",
);
