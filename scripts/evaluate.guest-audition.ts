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

const researchRoot = path.resolve("research", "guest-audition");

async function readJsonFiles<T>(
  directory: string,
  parse: (value: unknown) => T,
): Promise<Array<{ file: string; value: T }>> {
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

function averageScores(
  evaluations: GuestAuditionEvaluation[],
  sampleId: string,
): DimensionScores {
  return Object.fromEntries(
    auditionDimensions.map((dimension) => [
      dimension,
      average(
        evaluations.map((evaluation) => {
          const sample = evaluation.evaluations.find((item) => item.sampleId === sampleId);
          if (!sample) throw new Error(`Missing ${sampleId} in ${evaluation.evaluatorId}`);
          return sample.scores[dimension];
        }),
      ),
    ]),
  ) as DimensionScores;
}

function candidateTurnLengthFailures(auditionCase: GuestAuditionCase): string[] {
  return auditionCase.samples.flatMap((sample) =>
    sample.turns.flatMap((turn) => {
      if (turn.speakerType !== "candidate") return [];
      const count = countSentences(turn.text);
      return count >= 2 && count <= 4 ? [] : [`${sample.id}/${turn.id}: ${count} sentences`];
    }),
  );
}

function evaluateCase(
  auditionCase: GuestAuditionCase,
  evaluations: GuestAuditionEvaluation[],
): { passed: boolean; summary: string[] } {
  if (evaluations.length < 3) {
    return {
      passed: false,
      summary: [`requires 3 independent evaluations, found ${evaluations.length}`],
    };
  }
  const evaluatorIds = evaluations.map(({ evaluatorId }) => evaluatorId);
  if (new Set(evaluatorIds).size !== evaluatorIds.length) {
    throw new Error(`Evaluator ids must be unique for ${auditionCase.id}`);
  }
  const sampleIds = auditionCase.samples.map(({ id }) => id);
  const turnsBySample = new Map(
    auditionCase.samples.map((sample) => [sample.id, new Set(sample.turns.map(({ id }) => id))]),
  );
  const guestTurnIds = turnsBySample.get(auditionCase.guestSampleId)!;
  for (const evaluation of evaluations) {
    if (evaluation.caseId !== auditionCase.id) {
      throw new Error(`${evaluation.evaluatorId} names the wrong case id`);
    }
    const evaluatedIds = evaluation.evaluations.map(({ sampleId }) => sampleId).sort();
    if (JSON.stringify(evaluatedIds) !== JSON.stringify([...sampleIds].sort())) {
      throw new Error(`${evaluation.evaluatorId} evaluated the wrong samples for ${auditionCase.id}`);
    }
    for (const sampleEvaluation of evaluation.evaluations) {
      const knownTurnIds = turnsBySample.get(sampleEvaluation.sampleId)!;
      for (const turnId of sampleEvaluation.citedTurnIds) {
        if (!knownTurnIds.has(turnId)) {
          throw new Error(
            `${evaluation.evaluatorId} cites unknown turn ${turnId} in ${sampleEvaluation.sampleId}`,
          );
        }
      }
    }
    for (const failure of evaluation.hardFailures) {
      if (!guestTurnIds.has(failure.turnId)) {
        throw new Error(
          `${evaluation.evaluatorId} hard failure must cite a turn in the disclosed guest sample`,
        );
      }
    }
  }

  const guestScores = averageScores(evaluations, auditionCase.guestSampleId);
  const baselineId = sampleIds.find((id) => id !== auditionCase.guestSampleId)!;
  const baselineScores = averageScores(evaluations, baselineId);
  const hardFailures = evaluations.flatMap(({ hardFailures }) => hardFailures);
  const lengthFailures = candidateTurnLengthFailures(auditionCase);
  const guestPreferences = evaluations.filter(
    ({ preferredSampleId }) => preferredSampleId === auditionCase.guestSampleId,
  ).length;
  const preferenceRate = guestPreferences / evaluations.length;
  const overallGuest = average(auditionDimensions.map((dimension) => guestScores[dimension]));
  const keyDimensions = [
    ["book specificity", guestScores.bookSpecificity],
    ["novel interpretation", guestScores.novelInterpretation],
    ["conversational participation", guestScores.conversationalParticipation],
  ] as const;
  const interpretationDelta =
    guestScores.novelInterpretation - baselineScores.novelInterpretation;
  const naturalnessDelta = guestScores.humanNaturalness - baselineScores.humanNaturalness;
  const gateFailures = [
    ...(hardFailures.length === 0 ? [] : [`hard failures ${hardFailures.length} > 0`]),
    ...(lengthFailures.length === 0
      ? []
      : [`turn-length failures ${lengthFailures.length} > 0`]),
    ...(overallGuest >= 4 ? [] : [`guest overall ${overallGuest.toFixed(2)} < 4.00`]),
    ...keyDimensions.flatMap(([label, score]) =>
      score >= 4 ? [] : [`${label} ${score.toFixed(2)} < 4.00`],
    ),
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
  const passed = gateFailures.length === 0;

  return {
    passed,
    summary: [
      `guest overall ${overallGuest.toFixed(2)}/5`,
      `blind preference ${(preferenceRate * 100).toFixed(0)}%`,
      `novel interpretation delta ${signed(interpretationDelta)}`,
      `naturalness delta ${signed(naturalnessDelta)}`,
      `${hardFailures.length} hard failures`,
      `${lengthFailures.length} turn-length failures`,
      ...(gateFailures.length === 0
        ? ["all gates satisfied"]
        : gateFailures.map((failure) => `failed gate: ${failure}`)),
    ],
  };
}

const cases = await readJsonFiles(path.join(researchRoot, "cases"), (value) =>
  guestAuditionCaseSchema.parse(value),
);
const evaluationFiles = await readJsonFiles(path.join(researchRoot, "evaluations"), (value) =>
  guestAuditionEvaluationSchema.parse(value),
);

if (cases.length === 0) throw new Error("No guest audition cases found.");

let failed = false;
for (const { file, value: auditionCase } of cases) {
  const evaluations = evaluationFiles
    .map(({ value }) => value)
    .filter(({ caseId }) => caseId === auditionCase.id);
  const result = evaluateCase(auditionCase, evaluations);
  console.log(`\n${result.passed ? "PASS" : "FAIL"} ${auditionCase.id} (${file})`);
  for (const line of result.summary) console.log(`  ${line}`);
  if (!result.passed) failed = true;
}

const knownCaseIds = new Set(cases.map(({ value }) => value.id));
const orphanEvaluations = evaluationFiles.filter(({ value }) => !knownCaseIds.has(value.caseId));
if (orphanEvaluations.length > 0) {
  failed = true;
  console.error(`\nOrphan evaluations: ${orphanEvaluations.map(({ file }) => file).join(", ")}`);
}

if (failed) process.exitCode = 1;
