import {
  findCorruptTextSignals,
  findVisibleInternalTerms,
  groundingSupportIsLinked,
  hasVisibleQuestionOrConfirmation,
  largestSentenceCountBucketShare,
  sentenceCountIsAllowed,
} from "./dialoguePolicy";
import type { CharacterState, DeterministicCheck } from "./model";
import type {
  RealBookBlindJudgment,
  RealBookDialogueLogEntry,
  RealBookEvidencePack,
  RealBookTurnType,
} from "./realBookModel";

export const REAL_BOOK_IDS = [
  "cosmos-carl-sagan",
  "nicomachean-ethics-aristotle",
  "atomic-habits-james-clear",
  "the-stranger-albert-camus",
  "honmono-seong-hae-na",
  "pride-and-prejudice-jane-austen",
  "nineteen-eighty-four-george-orwell",
  "murder-of-roger-ackroyd-agatha-christie",
  "one-hundred-years-of-solitude-gabriel-garcia-marquez",
] as const;

export const CORE_PERSONA_IDS = [
  "isaac-newton",
  "marcus",
  "murasaki-shikibu",
  "justice-tolerance-reader",
] as const;

export const LEGACY_COMPARISON_BOOK_IDS = [
  "cosmos-carl-sagan",
  "honmono-seong-hae-na",
  "atomic-habits-james-clear",
] as const;
export const LEGACY_COMPARISON_PERSONA_IDS = [
  "isaac-newton",
  "marcus",
  "murasaki-shikibu",
] as const;

export const STABILITY_CELLS = [
  { bookId: "cosmos-carl-sagan", personaId: "isaac-newton", questionId: "COS-Q2" },
  { bookId: "cosmos-carl-sagan", personaId: "murasaki-shikibu", questionId: "COS-Q4" },
  { bookId: "nicomachean-ethics-aristotle", personaId: "marcus", questionId: "NIC-Q3" },
  {
    bookId: "nicomachean-ethics-aristotle",
    personaId: "justice-tolerance-reader",
    questionId: "NIC-Q5",
  },
  { bookId: "atomic-habits-james-clear", personaId: "isaac-newton", questionId: "ATO-Q1" },
  { bookId: "atomic-habits-james-clear", personaId: "marcus", questionId: "ATO-Q4" },
  { bookId: "the-stranger-albert-camus", personaId: "murasaki-shikibu", questionId: "STR-Q2" },
  {
    bookId: "the-stranger-albert-camus",
    personaId: "justice-tolerance-reader",
    questionId: "STR-Q3",
  },
  { bookId: "honmono-seong-hae-na", personaId: "marcus", questionId: "HNM-Q1" },
  { bookId: "honmono-seong-hae-na", personaId: "isaac-newton", questionId: "HNM-Q5" },
  {
    bookId: "pride-and-prejudice-jane-austen",
    personaId: "murasaki-shikibu",
    questionId: "PNP-Q1",
  },
  {
    bookId: "pride-and-prejudice-jane-austen",
    personaId: "justice-tolerance-reader",
    questionId: "PNP-Q4",
  },
  {
    bookId: "nineteen-eighty-four-george-orwell",
    personaId: "isaac-newton",
    questionId: "N84-Q4",
  },
  {
    bookId: "nineteen-eighty-four-george-orwell",
    personaId: "marcus",
    questionId: "N84-Q5",
  },
  {
    bookId: "murder-of-roger-ackroyd-agatha-christie",
    personaId: "murasaki-shikibu",
    questionId: "MRA-Q5",
  },
  {
    bookId: "murder-of-roger-ackroyd-agatha-christie",
    personaId: "justice-tolerance-reader",
    questionId: "MRA-Q1",
  },
  {
    bookId: "one-hundred-years-of-solitude-gabriel-garcia-marquez",
    personaId: "murasaki-shikibu",
    questionId: "OHS-Q3",
  },
  {
    bookId: "one-hundred-years-of-solitude-gabriel-garcia-marquez",
    personaId: "justice-tolerance-reader",
    questionId: "OHS-Q2",
  },
] as const;

const TURN_TYPES: RealBookTurnType[] = [
  "first_impression",
  "evidence_selection",
  "respond_to_user",
  "directed_rebuttal",
  "revise_after_counterevidence",
];

function check(
  name: string,
  passed: boolean,
  detail: string,
  severity: DeterministicCheck["severity"] = "error",
): DeterministicCheck {
  return { name, passed, detail, severity };
}

export function stateForTurnType(turnType: RealBookTurnType): CharacterState {
  if (turnType === "first_impression" || turnType === "revise_after_counterevidence") return "baseline";
  if (turnType === "directed_rebuttal") return "boundary_crossed";
  return "engaged";
}

export function validateRealBookEvidencePacks(
  packs: RealBookEvidencePack[],
): DeterministicCheck[] {
  const ids = new Set(packs.map(({ bookId }) => bookId));
  const development = packs.filter(({ set }) => set === "development");
  const holdout = packs.filter(({ set }) => set === "holdout");
  const anchorIdsAreValid = packs.every((pack) => {
    const anchorIds = new Set(pack.anchors.map(({ id }) => id));
    return (
      anchorIds.size === pack.anchors.length &&
      pack.fiveQuestions.every((question) =>
        [...(question.requiredAnchorIds ?? []), ...(question.counterEvidenceIds ?? [])].every(
          (id) => anchorIds.has(id),
        ),
      )
    );
  });

  return [
    check(
      "evidence-pack schema version",
      packs.every(({ schemaVersion }) => schemaVersion === "1.0.0"),
      `${packs.filter(({ schemaVersion }) => schemaVersion === "1.0.0").length}/${packs.length} on v1.0.0`,
    ),
    check("nine real-book evidence packs", packs.length === 9, `${packs.length}/9 packs`),
    check("unique real-book ids", ids.size === packs.length, `${ids.size}/${packs.length} unique ids`),
    check(
      "expected real-book ids",
      REAL_BOOK_IDS.every((id) => ids.has(id)),
      `${REAL_BOOK_IDS.filter((id) => ids.has(id)).length}/${REAL_BOOK_IDS.length} expected ids`,
    ),
    check(
      "development and holdout split",
      development.length === 6 && holdout.length === 3,
      `${development.length} development; ${holdout.length} holdout`,
    ),
    check(
      "bounded evidence anchors",
      packs.every(({ anchors }) => anchors.length >= 10 && anchors.length <= 14),
      packs.map(({ anchors, bookId }) => `${bookId}:${anchors.length}`).join(", "),
    ),
    check(
      "five distinct turn questions per book",
      packs.every(
        ({ fiveQuestions }) =>
          fiveQuestions.length === 5 &&
          new Set(fiveQuestions.map(({ id }) => id)).size === 5 &&
          TURN_TYPES.every((turnType) =>
            fiveQuestions.some((question) => question.turnType === turnType),
          ),
      ),
      "each pack covers all five turn types exactly once",
    ),
    check(
      "evidence references stay inside each pack",
      anchorIdsAreValid,
      "question anchor references resolve to the same book pack",
    ),
    check(
      "source lineage is present",
      packs.every(
        ({ anchors, sources }) =>
          sources.length > 0 &&
          anchors.every(
            ({ sourceKind, sourceUrls }) =>
              sourceKind === "interpretive" ||
              sourceKind === "uncertain" ||
              sourceKind === "user_provided" ||
              sourceUrls.length > 0,
          ),
      ),
      "verified/public-domain anchors have source URLs",
    ),
    check(
      "uncertainty and prohibited-claim boundaries",
      packs.every(
        ({ prohibitedClaims, uncertainties }) =>
          uncertainties.length > 0 && prohibitedClaims.length > 0,
      ),
      "every pack states uncertainty and prohibited claims",
    ),
  ];
}

function baseMatrixId(entry: {
  bookId: string;
  personaId: string;
  questionId: string;
}): string {
  return `${entry.bookId}:${entry.personaId}:${entry.questionId}`;
}

export function validateRealBookDialogueLogs(
  logs: RealBookDialogueLogEntry[],
  packs: RealBookEvidencePack[],
): DeterministicCheck[] {
  const packById = new Map(packs.map((pack) => [pack.bookId, pack]));
  const coreBase = logs.filter(
    ({ repeatIndex, variant }) => variant === "character_core" && repeatIndex === 0,
  );
  const legacyBase = logs.filter(
    ({ repeatIndex, variant }) => variant === "legacy_card" && repeatIndex === 0,
  );
  const repeats = logs.filter(({ repeatIndex }) => repeatIndex > 0);
  const coreMatrix = new Set(coreBase.map(baseMatrixId));
  const legacyMatrix = new Set(legacyBase.map(baseMatrixId));
  const expectedCoreMatrix = REAL_BOOK_IDS.flatMap((bookId) => {
    const pack = packById.get(bookId);
    return CORE_PERSONA_IDS.flatMap((personaId) =>
      (pack?.fiveQuestions ?? []).map(
        ({ id: questionId }) => `${bookId}:${personaId}:${questionId}`,
      ),
    );
  });
  const expectedLegacyMatrix = LEGACY_COMPARISON_BOOK_IDS.flatMap((bookId) => {
    const pack = packById.get(bookId);
    return LEGACY_COMPARISON_PERSONA_IDS.flatMap((personaId) =>
      (pack?.fiveQuestions ?? []).map(
        ({ id: questionId }) => `${bookId}:${personaId}:${questionId}`,
      ),
    );
  });
  const repeatedBaseCases = new Map<string, Set<number>>();
  for (const repeat of repeats) {
    const indexes = repeatedBaseCases.get(repeat.baseCaseId) ?? new Set<number>();
    indexes.add(repeat.repeatIndex);
    repeatedBaseCases.set(repeat.baseCaseId, indexes);
  }

  const evidenceIsValid = logs.every((log) => {
    const pack = packById.get(log.bookId);
    if (!pack) return false;
    const allowedIds = new Set(log.allowedEvidence.map(({ id }) => id));
    const packIds = new Set(pack.anchors.map(({ id }) => id));
    return (
      log.allowedEvidence.every(({ id }) => packIds.has(id)) &&
      log.usedEvidenceIds.length > 0 &&
      log.usedEvidenceIds.every((id) => allowedIds.has(id))
    );
  });
  const groundingIsValid = logs.every((log) => {
    const pack = packById.get(log.bookId);
    if (!pack || !groundingSupportIsLinked(log)) return false;
    const packIds = new Set(pack.anchors.map(({ id }) => id));
    return log.groundingDecision.supportIds.every((id) => packIds.has(id));
  });
  const visibleInternalTermHits = logs.filter(
    ({ dialogue }) => findVisibleInternalTerms(dialogue).length > 0,
  );
  const corruptDialogueHits = logs.filter(
    ({ dialogue }) => findCorruptTextSignals(dialogue).length > 0,
  );
  const largestSentenceBucketShare = largestSentenceCountBucketShare(
    logs.map(({ dialogue }) => dialogue),
  );
  const coreInteractiveTurns = coreBase.filter(
    ({ turnType }) =>
      turnType === "respond_to_user" || turnType === "directed_rebuttal",
  );
  const coreQuestionOrConfirmationTurns = coreInteractiveTurns.filter(
    ({ dialogue }) => hasVisibleQuestionOrConfirmation(dialogue),
  );
  const questionOrConfirmationRatio =
    coreInteractiveTurns.length === 0
      ? 0
      : coreQuestionOrConfirmationTurns.length / coreInteractiveTurns.length;
  const expectedRepeatedBaseCases = new Set(
    STABILITY_CELLS.map(
      ({ bookId, personaId, questionId }) =>
        `rbt-v1:character_core:${personaId}:${bookId}:${questionId}`,
    ),
  );

  return [
    check("two hundred sixty-one logged outputs", logs.length === 261, `${logs.length}/261 outputs`),
    check(
      "unique real-book sample ids",
      new Set(logs.map(({ sampleId }) => sampleId)).size === logs.length,
      `${new Set(logs.map(({ sampleId }) => sampleId)).size}/${logs.length} unique ids`,
    ),
    check(
      "one hundred eighty Character Core base outputs",
      coreBase.length === 180 &&
        expectedCoreMatrix.every((id) => coreMatrix.has(id)) &&
        coreMatrix.size === 180,
      `${coreBase.length}/180 outputs; ${coreMatrix.size}/180 matrix cells`,
    ),
    check(
      "forty-five honest legacy A/B outputs",
      legacyBase.length === 45 &&
        expectedLegacyMatrix.every((id) => legacyMatrix.has(id)) &&
        legacyMatrix.size === 45,
      `${legacyBase.length}/45 outputs; ${legacyMatrix.size}/45 matrix cells`,
    ),
    check(
      "thirty-six stability repeats",
      repeats.length === 36 &&
        repeatedBaseCases.size === 18 &&
        [...repeatedBaseCases.keys()].every((baseCaseId) =>
          expectedRepeatedBaseCases.has(baseCaseId),
        ) &&
        [...repeatedBaseCases.values()].every(
          (indexes) => indexes.size === 2 && indexes.has(1) && indexes.has(2),
        ),
      `${repeats.length}/36 outputs across ${repeatedBaseCases.size}/18 base cases`,
    ),
    check(
      "dialogue uses one to three sentences",
      logs.every(({ dialogue }) => sentenceCountIsAllowed(dialogue)),
      `${logs.filter(({ dialogue }) => sentenceCountIsAllowed(dialogue)).length}/${logs.length} within range`,
    ),
    check(
      "sentence-count distribution is not collapsed",
      logs.length > 0 && largestSentenceBucketShare <= 0.8,
      `largest sentence-count bucket ${(largestSentenceBucketShare * 100).toFixed(2)}% (maximum 80%)`,
    ),
    check(
      "visible dialogue hides internal grounding terms",
      visibleInternalTermHits.length === 0,
      `${visibleInternalTermHits.length} visible-dialogue violations`,
    ),
    check(
      "Character Core interactive question or confirmation ratio",
      coreInteractiveTurns.length === 72 &&
        questionOrConfirmationRatio >= 0.25 &&
        questionOrConfirmationRatio <= 0.4,
      `${coreQuestionOrConfirmationTurns.length}/${coreInteractiveTurns.length} (${(questionOrConfirmationRatio * 100).toFixed(2)}%; target 25-40%)`,
    ),
    check(
      "visible dialogue has no corrupt text",
      corruptDialogueHits.length === 0,
      `${corruptDialogueHits.length} corrupt-text violations`,
    ),
    check(
      "target state matches turn function",
      logs.every(({ targetState, turnType }) => targetState === stateForTurnType(turnType)),
      "all states follow the shared five-question policy",
    ),
    check(
      "real-book evidence ids are valid",
      evidenceIsValid,
      "all used evidence is allowed and belongs to the same book pack",
    ),
    check(
      "internal grounding support is linked",
      groundingIsValid,
      "grounding claims name persona inference and uncertainty, and support IDs exactly match allowed used evidence",
    ),
    check(
      "no Korean semicolons",
      logs.every(({ dialogue }) => !/[;；]/u.test(dialogue)),
      `${logs.filter(({ dialogue }) => /[;；]/u.test(dialogue)).length} violations`,
    ),
  ];
}

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function validateRealBookBlindJudgments(
  judgments: RealBookBlindJudgment[],
  logs: RealBookDialogueLogEntry[],
): DeterministicCheck[] {
  const logBySampleId = new Map(logs.map((log) => [log.sampleId, log]));
  const coreBaseSampleIds = new Set(
    logs
      .filter(({ repeatIndex, variant }) => variant === "character_core" && repeatIndex === 0)
      .map(({ sampleId }) => sampleId),
  );
  const coreBaseJudgments = judgments.filter(({ sampleId }) => coreBaseSampleIds.has(sampleId));
  const reasoningOnly = coreBaseJudgments.filter(
    ({ identificationBasis }) => identificationBasis === "reasoning_process",
  );
  const correct = coreBaseJudgments.filter(({ correct: isCorrect }) => isCorrect);
  const reasoningCorrect = reasoningOnly.filter(({ correct: isCorrect }) => isCorrect);
  const development = coreBaseJudgments.filter(
    ({ sampleId }) => logBySampleId.get(sampleId)?.bookSet === "development",
  );
  const holdout = coreBaseJudgments.filter(
    ({ sampleId }) => logBySampleId.get(sampleId)?.bookSet === "holdout",
  );
  const accuracy = (rows: RealBookBlindJudgment[]): number =>
    rows.length === 0 ? 0 : rows.filter(({ correct: isCorrect }) => isCorrect).length / rows.length;
  const developmentAccuracy = accuracy(development);
  const holdoutAccuracy = accuracy(holdout);
  const perPersona = CORE_PERSONA_IDS.map((personaId) => {
    const rows = coreBaseJudgments.filter(({ actualPersonaId }) => actualPersonaId === personaId);
    return { personaId, accuracy: accuracy(rows) };
  });

  return [
    check("two hundred sixty-one blind judgments", judgments.length === 261, `${judgments.length}/261 judgments`),
    check(
      "one judgment per sample",
      new Set(judgments.map(({ sampleId }) => sampleId)).size === logs.length &&
        judgments.every(({ sampleId }) => logBySampleId.has(sampleId)),
      `${new Set(judgments.map(({ sampleId }) => sampleId)).size}/${logs.length} linked sample ids`,
    ),
    check(
      "blind correctness is consistent",
      judgments.every(
        ({ actualPersonaId, correct: isCorrect, guessedPersonaId }) =>
          isCorrect === (actualPersonaId === guessedPersonaId),
      ),
      "correct flags match actual and guessed ids",
    ),
    check(
      "Character Core blind target",
      accuracy(coreBaseJudgments) >= 0.7,
      `${correct.length}/${coreBaseJudgments.length} (${(accuracy(coreBaseJudgments) * 100).toFixed(2)}%)`,
    ),
    check(
      "reasoning-only blind target",
      accuracy(reasoningOnly) >= 0.7,
      `${reasoningCorrect.length}/${reasoningOnly.length} (${(accuracy(reasoningOnly) * 100).toFixed(2)}%)`,
    ),
    check(
      "per-persona blind floor",
      perPersona.every(({ accuracy: personaAccuracy }) => personaAccuracy >= 0.6),
      perPersona
        .map(({ accuracy: personaAccuracy, personaId }) => `${personaId} ${(personaAccuracy * 100).toFixed(1)}%`)
        .join(", "),
    ),
    check(
      "holdout generalization drop",
      developmentAccuracy - holdoutAccuracy <= 0.1,
      `development ${(developmentAccuracy * 100).toFixed(2)}%; holdout ${(holdoutAccuracy * 100).toFixed(2)}%`,
    ),
    check(
      "groundedness target",
      average(judgments.map(({ scores }) => scores.groundedness)) >= 4.5 &&
        judgments.every(({ hardFailures }) => !hardFailures.includes("unsupported_scene")),
      `${average(judgments.map(({ scores }) => scores.groundedness)).toFixed(2)}/5`,
    ),
    check(
      "caricature risk target",
      average(judgments.map(({ scores }) => scores.caricatureRisk)) <= 1.5,
      `${average(judgments.map(({ scores }) => scores.caricatureRisk)).toFixed(2)}/5`,
    ),
  ];
}
