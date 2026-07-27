import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  validateBlindJudgments,
  validateCases,
  validateCharacterCores,
  validateDialogueLogs,
} from "./character-core/evaluator";
import type {
  BlindJudgmentLogEntry,
  CharacterCoreCase,
  DeterministicCheck,
  OfflineDialogueLogEntry,
} from "./character-core/model";
import { PROTOTYPE_CHARACTER_CORES } from "./character-core/prototypeCores";

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
          `Invalid JSONL at ${path}:${index + 1}: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    });
}

function printSection(title: string, checks: DeterministicCheck[]): void {
  console.log(`\n${title}`);
  for (const item of checks) {
    const marker = item.passed ? "PASS" : item.severity === "warning" ? "WARN" : "FAIL";
    console.log(`${marker}  ${item.name} — ${item.detail}`);
  }
}

const fixtureRoot = resolve("fixtures", "character-core");
const cases = await readJsonLines<CharacterCoreCase>(
  resolve(fixtureRoot, "character-core-cases.jsonl"),
);
const logs = await readJsonLines<OfflineDialogueLogEntry>(
  resolve(fixtureRoot, "offline-dialogue-log.jsonl"),
);
const judgments = await readJsonLines<BlindJudgmentLogEntry>(
  resolve(fixtureRoot, "blind-judgments.jsonl"),
);

const coreChecks = validateCharacterCores(PROTOTYPE_CHARACTER_CORES);
const caseChecks = validateCases(cases);
const dialogueChecks = validateDialogueLogs(logs, PROTOTYPE_CHARACTER_CORES);
const judgmentChecks = validateBlindJudgments(judgments);
const allChecks = [...coreChecks, ...caseChecks, ...dialogueChecks, ...judgmentChecks];

console.log("Character Core v1 offline harness");
console.log("No application OpenAI API call is made by this command.");
printSection("Prototype cores", coreChecks);
printSection("Evaluation cases", caseChecks);
printSection("Offline subagent dialogue log", dialogueChecks);
printSection("Blind character identification", judgmentChecks);

const errorCount = allChecks.filter(
  ({ passed, severity }) => !passed && severity === "error",
).length;
const warningCount = allChecks.filter(
  ({ passed, severity }) => !passed && severity === "warning",
).length;

console.log(`\nSummary: ${errorCount} errors, ${warningCount} warnings`);
if (errorCount > 0) process.exitCode = 1;
