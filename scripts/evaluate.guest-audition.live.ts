import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

import { countSentences } from "../src/engine/sentenceValidation";
import {
  auditionDimensions,
  guestAuditionCaseSchema,
  guestAuditionEvaluationSchema,
  type DimensionScores,
  type GuestAuditionCase,
  type GuestAuditionEvaluation,
} from "./guestAuditionSchema";

const liveRoot = path.resolve("research", "guest-audition", "live", "2026-07-20");

async function readJsonFiles<T>(directory: string, parse: (value: unknown) => T) {
  const files = (await readdir(directory)).filter((file) => file.endsWith(".json")).sort();
  return Promise.all(
    files.map(async (file) => ({
      file,
      value: parse(JSON.parse(await readFile(path.join(directory, file), "utf8"))),
    })),
  );
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function signed(value: number): string {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}`;
}

function averageScores(evaluations: GuestAuditionEvaluation[], sampleId: string) {
  return Object.fromEntries(
    auditionDimensions.map((dimension) => [
      dimension,
      average(
        evaluations.map((evaluation) => {
          const sample = evaluation.evaluations.find((item) => item.sampleId === sampleId);
          if (!sample) throw new Error(`Missing ${sampleId} in ${evaluation.evaluatorId}.`);
          return sample.scores[dimension];
        }),
      ),
    ]),
  ) as DimensionScores;
}

function evaluateCase(auditionCase: GuestAuditionCase, evaluations: GuestAuditionEvaluation[]) {
  if (evaluations.length !== 3) {
    return { passed: false, summary: [`requires exactly 3 evaluations, found ${evaluations.length}`] };
  }
  if (new Set(evaluations.map(({ evaluatorId }) => evaluatorId)).size !== 3) {
    throw new Error(`Evaluator ids must be unique for ${auditionCase.id}.`);
  }
  const guestId = auditionCase.guestSampleId;
  const baselineId = auditionCase.samples.find(({ id }) => id !== guestId)!.id;
  const guestScores = averageScores(evaluations, guestId);
  const baselineScores = averageScores(evaluations, baselineId);
  const hardFailures = evaluations.flatMap(({ hardFailures }) => hardFailures);
  const lengthFailures = auditionCase.samples
    .find(({ id }) => id === guestId)!
    .turns.filter(({ speakerType }) => speakerType === "candidate")
    .filter(({ text }) => {
      const count = countSentences(text);
      return count < 2 || count > 4;
    });
  const preferenceRate =
    evaluations.filter(({ preferredSampleId }) => preferredSampleId === guestId).length /
    evaluations.length;
  const overallGuest = average(auditionDimensions.map((dimension) => guestScores[dimension]));
  const interpretationDelta =
    guestScores.novelInterpretation - baselineScores.novelInterpretation;
  const naturalnessDelta = guestScores.humanNaturalness - baselineScores.humanNaturalness;
  const failures = [
    ...(hardFailures.length === 0 ? [] : [`hard failures ${hardFailures.length} > 0`]),
    ...(lengthFailures.length === 0
      ? []
      : [`turn-length failures ${lengthFailures.length} > 0`]),
    ...(overallGuest >= 4 ? [] : [`guest overall ${overallGuest.toFixed(2)} < 4.00`]),
    ...(guestScores.bookSpecificity >= 4
      ? []
      : [`book specificity ${guestScores.bookSpecificity.toFixed(2)} < 4.00`]),
    ...(guestScores.novelInterpretation >= 4
      ? []
      : [`novel interpretation ${guestScores.novelInterpretation.toFixed(2)} < 4.00`]),
    ...(guestScores.conversationalParticipation >= 4
      ? []
      : [`conversational participation ${guestScores.conversationalParticipation.toFixed(2)} < 4.00`]),
    ...(guestScores.humanNaturalness >= 3.5
      ? []
      : [`human naturalness ${guestScores.humanNaturalness.toFixed(2)} < 3.50`]),
    ...(guestScores.authorityBalance >= 3.5
      ? []
      : [`authority balance ${guestScores.authorityBalance.toFixed(2)} < 3.50`]),
    ...(preferenceRate >= 0.65
      ? []
      : [`blind preference ${(preferenceRate * 100).toFixed(0)}% < 65%`]),
    ...(interpretationDelta >= 0.5
      ? []
      : [`novel interpretation delta ${signed(interpretationDelta)} < +0.50`]),
    ...(naturalnessDelta >= -0.25
      ? []
      : [`naturalness delta ${signed(naturalnessDelta)} < -0.25`]),
  ];
  return {
    passed: failures.length === 0,
    summary: [
      `guest overall ${overallGuest.toFixed(2)}/5`,
      `blind preference ${(preferenceRate * 100).toFixed(0)}%`,
      `novel interpretation delta ${signed(interpretationDelta)}`,
      `naturalness delta ${signed(naturalnessDelta)}`,
      `${hardFailures.length} hard failures`,
      `${lengthFailures.length} turn-length failures`,
      ...(failures.length === 0 ? ["all gates satisfied"] : failures.map((item) => `failed gate: ${item}`)),
    ],
  };
}

const cases = await readJsonFiles(path.join(liveRoot, "cases"), (value) =>
  guestAuditionCaseSchema.parse(value),
);
const evaluations = await readJsonFiles(path.join(liveRoot, "evaluations"), (value) =>
  guestAuditionEvaluationSchema.parse(value),
);

let failed = false;
for (const { file, value: auditionCase } of cases) {
  const matching = evaluations
    .map(({ value }) => value)
    .filter(({ caseId }) => caseId === auditionCase.id);
  const result = evaluateCase(auditionCase, matching);
  console.log(`\n${result.passed ? "PASS" : "FAIL"} ${auditionCase.id} (${file})`);
  for (const line of result.summary) console.log(`  ${line}`);
  if (!result.passed) failed = true;
}

const knownIds = new Set(cases.map(({ value }) => value.id));
const orphans = evaluations.filter(({ value }) => !knownIds.has(value.caseId));
if (orphans.length > 0) {
  failed = true;
  console.error(`\nOrphan evaluations: ${orphans.map(({ file }) => file).join(", ")}`);
}

if (failed) process.exitCode = 1;
