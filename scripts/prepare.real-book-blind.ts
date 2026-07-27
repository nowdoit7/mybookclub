import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RealBookDialogueLogEntry } from "./character-core/realBookModel";

interface BlindPacket {
  schemaVersion: 1;
  blindId: string;
  bookId: string;
  bookSet: "development" | "holdout";
  questionId: string;
  turnType: RealBookDialogueLogEntry["turnType"];
  prompt: string;
  allowedEvidence: RealBookDialogueLogEntry["allowedEvidence"];
  dialogue: string;
}

interface BlindMapEntry {
  schemaVersion: 1;
  blindId: string;
  sampleId: string;
  actualPersonaId: string;
  variant: RealBookDialogueLogEntry["variant"];
  repeatIndex: RealBookDialogueLogEntry["repeatIndex"];
  bookId: string;
  questionId: string;
}

const fixtureRoot = resolve("fixtures", "character-core", "real-books");
const dialogueFiles = [
  "dialogues.core.dev-a.jsonl",
  "dialogues.core.dev-b.jsonl",
  "dialogues.core.holdout.jsonl",
  "dialogues.legacy-ab.jsonl",
  "dialogues.repeats.jsonl",
];

async function readJsonLines<T>(path: string): Promise<T[]> {
  const content = await readFile(path, "utf8");
  return content
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch (error) {
        throw new Error(
          `Invalid JSONL at ${path}:${index + 1}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    });
}

function toJsonLines(rows: unknown[]): string {
  return `${rows.map((row) => JSON.stringify(row)).join("\n")}\n`;
}

function blindSortKey(sampleId: string): string {
  return createHash("sha256").update(`rbt-v2-blind-order:${sampleId}`).digest("hex");
}

const logs = (
  await Promise.all(
    dialogueFiles.map((fileName) =>
      readJsonLines<RealBookDialogueLogEntry>(resolve(fixtureRoot, fileName)),
    ),
  )
).flat();

if (logs.length !== 261) {
  throw new Error(`Expected 261 dialogue outputs before blinding; received ${logs.length}.`);
}
if (new Set(logs.map(({ sampleId }) => sampleId)).size !== logs.length) {
  throw new Error("Dialogue sample IDs must be unique before blinding.");
}

const ordered = [...logs].sort((left, right) =>
  blindSortKey(left.sampleId).localeCompare(blindSortKey(right.sampleId)),
);
const packets: BlindPacket[] = ordered.map((log, index) => ({
  schemaVersion: 1,
  blindId: `B-RBT2-${String(index + 1).padStart(3, "0")}`,
  bookId: log.bookId,
  bookSet: log.bookSet,
  questionId: log.questionId,
  turnType: log.turnType,
  prompt: log.prompt,
  allowedEvidence: log.allowedEvidence,
  dialogue: log.dialogue,
}));
const mapping: BlindMapEntry[] = ordered.map((log, index) => ({
  schemaVersion: 1,
  blindId: `B-RBT2-${String(index + 1).padStart(3, "0")}`,
  sampleId: log.sampleId,
  actualPersonaId: log.personaId,
  variant: log.variant,
  repeatIndex: log.repeatIndex,
  bookId: log.bookId,
  questionId: log.questionId,
}));
const batches = [
  packets.filter((_, index) => index % 3 === 0),
  packets.filter((_, index) => index % 3 === 1),
  packets.filter((_, index) => index % 3 === 2),
];

await mkdir(resolve(fixtureRoot, "blind"), { recursive: true });
await writeFile(
  resolve(fixtureRoot, "blind", "blind-packets.jsonl"),
  toJsonLines(packets),
  "utf8",
);
await writeFile(
  resolve(fixtureRoot, "blind", "blind-map.private.jsonl"),
  toJsonLines(mapping),
  "utf8",
);
await Promise.all(
  batches.map((rows, index) =>
    writeFile(
      resolve(fixtureRoot, "blind", `blind-packets.batch-${String.fromCharCode(97 + index)}.jsonl`),
      toJsonLines(rows),
      "utf8",
    ),
  ),
);

console.log(
  `Prepared ${packets.length} blind packets in batches ${batches
    .map((rows) => rows.length)
    .join("/")}.`,
);
console.log("Persona labels, Character Core fields, variants, and repeat indexes are absent from judge packets.");
