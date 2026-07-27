import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { RealBookBlindJudgment } from "./character-core/realBookModel";

interface BlindMapEntry {
  schemaVersion: 1;
  blindId: string;
  sampleId: string;
  actualPersonaId: string;
}

interface RawBlindJudgment {
  schemaVersion: 1;
  blindId: string;
  guessedPersonaId: string;
  scores: RealBookBlindJudgment["scores"];
  hardFailures: string[];
  identificationBasis: RealBookBlindJudgment["identificationBasis"];
  reasoningMoveEvidence: string[];
  lexicalCueHits: string[];
  rationale: string;
  judge: string;
}

const fixtureRoot = resolve("fixtures", "character-core", "real-books", "blind");

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

const mapping = await readJsonLines<BlindMapEntry>(
  resolve(fixtureRoot, "blind-map.private.jsonl"),
);
const raw = (
  await Promise.all(
    ["a", "b", "c"].map((batch) =>
      readJsonLines<RawBlindJudgment>(
        resolve(fixtureRoot, `blind-judgments.raw-${batch}.jsonl`),
      ),
    ),
  )
).flat();

if (mapping.length !== 261 || raw.length !== 261) {
  throw new Error(`Expected 261 map rows and judgments; received ${mapping.length}/${raw.length}.`);
}
if (new Set(raw.map(({ blindId }) => blindId)).size !== raw.length) {
  throw new Error("Raw blind judgment IDs must be unique.");
}

const mapByBlindId = new Map(mapping.map((row) => [row.blindId, row]));
const joined: RealBookBlindJudgment[] = raw.map((judgment) => {
  const map = mapByBlindId.get(judgment.blindId);
  if (!map) throw new Error(`No private mapping for ${judgment.blindId}.`);
  return {
    blindId: judgment.blindId,
    sampleId: map.sampleId,
    guessedPersonaId: judgment.guessedPersonaId,
    actualPersonaId: map.actualPersonaId,
    correct: judgment.guessedPersonaId === map.actualPersonaId,
    scores: judgment.scores,
    hardFailures: judgment.hardFailures,
    identificationBasis: judgment.identificationBasis,
    reasoningMoveEvidence: judgment.reasoningMoveEvidence,
    lexicalCueHits: judgment.lexicalCueHits,
    rationale: judgment.rationale,
    judge: judgment.judge,
  };
});

await writeFile(
  resolve(fixtureRoot, "blind-judgments.joined.jsonl"),
  `${joined.map((row) => JSON.stringify(row)).join("\n")}\n`,
  "utf8",
);
console.log(`Joined ${joined.length} blind judgments with the private map.`);
