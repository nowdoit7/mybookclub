import { countSentences } from "../../src/engine/sentenceValidation";
import type {
  CharacterCore,
  CharacterCoreCase,
  CharacterState,
  CharacterTurnType,
  BlindJudgmentLogEntry,
  DeterministicCheck,
  OfflineDialogueLogEntry,
} from "./model";

const PERSONA_IDS = [
  "isaac-newton",
  "marcus",
  "murasaki-shikibu",
  "justice-tolerance-reader",
] as const;

const TURN_TYPES: CharacterTurnType[] = [
  "first_impression",
  "respond_to_user",
  "challenge_reader",
  "boundary_response",
  "concede_or_repair",
];

const STATES: CharacterState[] = ["baseline", "engaged", "boundary_crossed"];

const ABSTRACT_WORDS = [
  "구조",
  "조건",
  "관계",
  "의미",
  "본질",
  "맥락",
  "가능성",
  "정당성",
  "진정성",
  "층위",
  "재맥락화",
  "변증법",
];

function check(
  name: string,
  passed: boolean,
  detail: string,
  severity: DeterministicCheck["severity"] = "error",
): DeterministicCheck {
  return { name, passed, detail, severity };
}

export function expectedMatrixIds(): string[] {
  return PERSONA_IDS.flatMap((personaId) =>
    TURN_TYPES.flatMap((turnType) =>
      STATES.map((state) => `${personaId}:${turnType}:${state}`),
    ),
  );
}

function matrixId(entry: {
  personaId: string;
  turnType: CharacterTurnType;
  state: CharacterState;
}): string {
  return `${entry.personaId}:${entry.turnType}:${entry.state}`;
}

export function validateCharacterCores(cores: CharacterCore[]): DeterministicCheck[] {
  const checks: DeterministicCheck[] = [
    check("four prototype cores", cores.length === 4, `${cores.length}/4 cores`),
    check(
      "unique prototype persona ids",
      new Set(cores.map(({ personaId }) => personaId)).size === cores.length,
      `${new Set(cores.map(({ personaId }) => personaId)).size}/${cores.length} unique ids`,
    ),
  ];

  for (const core of cores) {
    const priorities = core.rankedValues.map(({ priority }) => priority);
    checks.push(
      check(
        `${core.personaId}: Korean editorial prototype`,
        core.schemaVersion === 1 &&
          core.language === "ko" &&
          core.interpretation === "editorial_reconstruction",
        `schema v${core.schemaVersion}; ${core.language}; ${core.interpretation}`,
      ),
      check(
        `${core.personaId}: ranked values`,
        core.rankedValues.length >= 2 &&
          core.rankedValues.length <= 3 &&
          priorities.every((priority, index) => priority === index + 1),
        `${core.rankedValues.length} values; priorities ${priorities.join(", ")}`,
      ),
      check(
        `${core.personaId}: complete state policy`,
        STATES.every((state) => core.stateBehaviors.some((behavior) => behavior.state === state)),
        core.stateBehaviors.map(({ state }) => state).join(", "),
      ),
      check(
        `${core.personaId}: boundary release`,
        core.stateTransitions.some(
          ({ from, to }) => from === "boundary_crossed" && to === "baseline",
        ),
        `${core.stateTransitions.length} transitions`,
      ),
      check(
        `${core.personaId}: provenance boundary`,
        core.provenance.documentedFacts.length > 0 &&
          core.provenance.editorialInterpretation.length > 20 &&
          core.provenance.prohibitedInference.length > 20,
        "documented facts, editorial interpretation, and prohibited inference present",
      ),
      check(
        `${core.personaId}: bounded signature`,
        core.voice.signatureBudget.maxPerSession >= 0 &&
          core.voice.signatureBudget.maxPerSession <= 2,
        `max ${core.voice.signatureBudget.maxPerSession} per session`,
      ),
      check(
        `${core.personaId}: explicit nearest-neighbor distinctions`,
        core.contrastivePolicy.primaryFocus.length > 20 &&
          core.distinction.nearestNeighbors.length > 0 &&
          core.distinction.nearestNeighbors.every((personaId) =>
            core.contrastivePolicy.nearestNeighborDifferences.some(
              (difference) =>
                difference.personaId === personaId &&
                difference.thisCoreFocus.length > 20 &&
                difference.neighborFocus.length > 20,
            ),
          ),
        `${core.contrastivePolicy.nearestNeighborDifferences.length}/${core.distinction.nearestNeighbors.length} contrast rules`,
      ),
    );
  }

  const murasaki = cores.find(({ personaId }) => personaId === "murasaki-shikibu");
  checks.push(
    check(
      "murasaki: evidence before interior inference",
      (murasaki?.contrastivePolicy.requiredEvidenceBeforeInference?.length ?? 0) > 20,
      murasaki?.contrastivePolicy.requiredEvidenceBeforeInference ??
        "missing evidence prerequisite",
    ),
  );

  return checks;
}

export function validateCases(cases: CharacterCoreCase[]): DeterministicCheck[] {
  const actualMatrix = new Set(cases.map(matrixId));
  const expectedMatrix = expectedMatrixIds();
  const duplicateCount = cases.length - new Set(cases.map(({ id }) => id)).size;

  return [
    check("sixty evaluation cases", cases.length === 60, `${cases.length}/60 cases`),
    check("unique case ids", duplicateCount === 0, `${duplicateCount} duplicate ids`),
    check(
      "complete persona-turn-state matrix",
      expectedMatrix.every((id) => actualMatrix.has(id)) && actualMatrix.size === 60,
      `${actualMatrix.size}/60 matrix cells`,
    ),
    check(
      "cases use controlled evidence",
      cases.every(
        ({ allowedEvidence }) =>
          allowedEvidence.length >= 2 &&
          allowedEvidence.every(({ id, fact }) => id.length > 0 && fact.length > 0),
      ),
      `${cases.filter(({ allowedEvidence }) => allowedEvidence.length >= 2).length}/${cases.length} cases with at least two anchors`,
    ),
    check(
      "cases specify behavioral properties",
      cases.every(
        ({ expectedProperties, forbiddenProperties }) =>
          expectedProperties.length > 0 && forbiddenProperties.length > 0,
      ),
      "every case has expected and forbidden properties",
    ),
  ];
}

function normalizedSkeleton(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"'‘’.,!?()[\]{}:;]/g, " ")
    .replace(/\d+/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}

function fiveGrams(text: string): Set<string> {
  const compact = normalizedSkeleton(text).replace(/\s+/g, "");
  const grams = new Set<string>();
  for (let index = 0; index <= compact.length - 5; index += 1) {
    grams.add(compact.slice(index, index + 5));
  }
  return grams;
}

export function jaccardSimilarity(left: string, right: string): number {
  const leftGrams = fiveGrams(left);
  const rightGrams = fiveGrams(right);
  if (leftGrams.size === 0 && rightGrams.size === 0) return 1;
  const intersection = [...leftGrams].filter((gram) => rightGrams.has(gram)).length;
  const union = new Set([...leftGrams, ...rightGrams]).size;
  return union === 0 ? 0 : intersection / union;
}

export function validateDialogueLogs(
  logs: OfflineDialogueLogEntry[],
  cores: CharacterCore[],
): DeterministicCheck[] {
  const checks: DeterministicCheck[] = [];
  const actualMatrix = new Set(logs.map(matrixId));
  const expectedMatrix = expectedMatrixIds();
  const coreById = new Map(cores.map((core) => [core.personaId, core]));

  checks.push(
    check("sixty logged dialogues", logs.length === 60, `${logs.length}/60 dialogues`),
    check(
      "complete logged persona-turn-state matrix",
      expectedMatrix.every((id) => actualMatrix.has(id)) && actualMatrix.size === 60,
      `${actualMatrix.size}/60 matrix cells`,
    ),
    check(
      "two-to-three sentence dialogue",
      logs.every(({ dialogue }) => {
        const sentenceCount = countSentences(dialogue);
        return sentenceCount >= 2 && sentenceCount <= 3;
      }),
      `${logs.filter(({ dialogue }) => {
        const count = countSentences(dialogue);
        return count >= 2 && count <= 3;
      }).length}/${logs.length} within range`,
    ),
    check(
      "evidence ids stay inside each prompt",
      logs.every(({ allowedEvidence, usedEvidenceIds }) => {
        const allowedIds = new Set(allowedEvidence.map(({ id }) => id));
        return usedEvidenceIds.length > 0 && usedEvidenceIds.every((id) => allowedIds.has(id));
      }),
      "all used evidence IDs are allowed and non-empty",
    ),
    check(
      "no semicolons in Korean dialogue",
      logs.every(({ dialogue }) => !/[;；]/u.test(dialogue)),
      `${logs.filter(({ dialogue }) => /[;；]/u.test(dialogue)).length} violations`,
    ),
  );

  const abstractHeavy = logs.filter(({ dialogue }) => {
    const hits = ABSTRACT_WORDS.filter((word) => dialogue.includes(word)).length;
    return hits >= 3;
  });
  checks.push(
    check(
      "abstract-language warning",
      abstractHeavy.length === 0,
      `${abstractHeavy.length} turns contain at least three monitored abstract terms`,
      "warning",
    ),
  );

  const caricatureHits: string[] = [];
  for (const log of logs) {
    const core = coreById.get(log.personaId);
    if (!core) {
      caricatureHits.push(`${log.caseId}:missing-core`);
      continue;
    }
    const matched = core.voice.ko.avoid.filter((phrase) => {
      const keyword = phrase.split(/[,\s]/u).find((part) => part.length >= 2);
      return keyword ? log.dialogue.includes(keyword) : false;
    });
    if (matched.length >= 2) caricatureHits.push(`${log.caseId}:${matched.join("|")}`);
  }
  checks.push(
    check(
      "caricature cue warning",
      caricatureHits.length === 0,
      caricatureHits.length === 0 ? "no dense persona cue clusters" : caricatureHits.join(", "),
      "warning",
    ),
  );

  const nearDuplicates: string[] = [];
  for (let left = 0; left < logs.length; left += 1) {
    for (let right = left + 1; right < logs.length; right += 1) {
      if (logs[left].personaId === logs[right].personaId) continue;
      const similarity = jaccardSimilarity(logs[left].dialogue, logs[right].dialogue);
      if (similarity > 0.45) {
        nearDuplicates.push(
          `${logs[left].caseId}~${logs[right].caseId}:${similarity.toFixed(2)}`,
        );
      }
    }
  }
  checks.push(
    check(
      "cross-persona repetition warning",
      nearDuplicates.length === 0,
      nearDuplicates.length === 0 ? "no pair above 0.45" : nearDuplicates.join(", "),
      "warning",
    ),
  );

  return checks;
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function validateBlindJudgments(
  judgments: BlindJudgmentLogEntry[],
): DeterministicCheck[] {
  const correct = judgments.filter(({ correct: isCorrect }) => isCorrect);
  const reasoningOnly = judgments.filter(
    ({ identificationBasis }) => identificationBasis === "reasoning_process",
  );
  const reasoningCorrect = reasoningOnly.filter(({ correct: isCorrect }) => isCorrect);
  const scoreValues = judgments.flatMap(({ scores }) => Object.values(scores));
  const perPersona = PERSONA_IDS.map((personaId) => {
    const rows = judgments.filter(({ actualPersonaId }) => actualPersonaId === personaId);
    return {
      personaId,
      accuracy:
        rows.length === 0
          ? 0
          : rows.filter(({ correct: isCorrect }) => isCorrect).length / rows.length,
    };
  });

  return [
    check("sixty blind judgments", judgments.length === 60, `${judgments.length}/60 judgments`),
    check(
      "unique blind ids",
      new Set(judgments.map(({ blindId }) => blindId)).size === judgments.length,
      `${new Set(judgments.map(({ blindId }) => blindId)).size}/${judgments.length} unique ids`,
    ),
    check(
      "correctness mapping is consistent",
      judgments.every(
        ({ actualPersonaId, correct: isCorrect, guessedPersonaId }) =>
          isCorrect === (actualPersonaId === guessedPersonaId),
      ),
      "correct flag matches actual and guessed persona ids",
    ),
    check(
      "blind identification target",
      correct.length / Math.max(judgments.length, 1) >= 0.7,
      `${correct.length}/${judgments.length} (${(
        (correct.length / Math.max(judgments.length, 1)) *
        100
      ).toFixed(2)}%)`,
    ),
    check(
      "reasoning-process-only target",
      reasoningCorrect.length / Math.max(reasoningOnly.length, 1) >= 0.7,
      `${reasoningCorrect.length}/${reasoningOnly.length} (${(
        (reasoningCorrect.length / Math.max(reasoningOnly.length, 1)) *
        100
      ).toFixed(2)}%)`,
    ),
    check(
      "per-persona floor",
      perPersona.every(({ accuracy }) => accuracy >= 0.6),
      perPersona
        .map(({ accuracy, personaId }) => `${personaId} ${(accuracy * 100).toFixed(1)}%`)
        .join(", "),
    ),
    check(
      "blind score ranges",
      scoreValues.every((value) => Number.isFinite(value) && value >= 1 && value <= 5),
      `${scoreValues.length} scores inside 1..5`,
    ),
    check(
      "groundedness target",
      average(judgments.map(({ scores }) => scores.groundedness)) >= 4.5,
      `${average(judgments.map(({ scores }) => scores.groundedness)).toFixed(2)}/5`,
    ),
    check(
      "caricature risk target",
      average(judgments.map(({ scores }) => scores.caricatureRisk)) <= 1.5,
      `${average(judgments.map(({ scores }) => scores.caricatureRisk)).toFixed(2)}/5`,
    ),
  ];
}
