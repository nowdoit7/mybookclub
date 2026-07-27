import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { countSentences } from "../src/engine/sentenceValidation";
import { jaccardSimilarity } from "./character-core/evaluator";
import {
  CORE_PERSONA_IDS,
  validateRealBookBlindJudgments,
  validateRealBookDialogueLogs,
  validateRealBookEvidencePacks,
} from "./character-core/realBookEvaluator";
import type {
  RealBookBlindJudgment,
  RealBookDialogueLogEntry,
  RealBookEvidencePack,
} from "./character-core/realBookModel";

interface HoldoutLock {
  protocol: string;
  claimBoundary: string;
  frozenInputs: Array<{ path: string; sha256: string }>;
  frozenEvaluationInputs?: Array<{ path: string; sha256: string }>;
  postLockCorrections?: Array<{
    path: string;
    scope: string;
    affectsBaseOrHoldoutDialogueGeneration: boolean;
    reason: string;
  }>;
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

function average(values: number[]): number {
  return values.length === 0
    ? 0
    : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percent(numerator: number, denominator: number): string {
  return `${((numerator / Math.max(denominator, 1)) * 100).toFixed(1)}%`;
}

function scoreAverage(
  rows: RealBookBlindJudgment[],
  key: keyof RealBookBlindJudgment["scores"],
): number {
  return average(rows.map(({ scores }) => scores[key]));
}

function accuracy(rows: RealBookBlindJudgment[]): number {
  return rows.filter(({ correct }) => correct).length / Math.max(rows.length, 1);
}

const developmentPacks = await readJsonLines<RealBookEvidencePack>(
  resolve(fixtureRoot, "evidence-packs.dev.jsonl"),
);
const holdoutPacks = await readJsonLines<RealBookEvidencePack>(
  resolve(fixtureRoot, "evidence-packs.holdout.jsonl"),
);
const packs = [...developmentPacks, ...holdoutPacks];
const logs = (
  await Promise.all(
    dialogueFiles.map((fileName) =>
      readJsonLines<RealBookDialogueLogEntry>(resolve(fixtureRoot, fileName)),
    ),
  )
).flat();
const judgments = await readJsonLines<RealBookBlindJudgment>(
  resolve(fixtureRoot, "blind", "blind-judgments.joined.jsonl"),
);
const lock = JSON.parse(
  await readFile(resolve(fixtureRoot, "holdout-lock.json"), "utf8"),
) as HoldoutLock;

const lockResults = await Promise.all(
  [...lock.frozenInputs, ...(lock.frozenEvaluationInputs ?? [])].map(async ({ path, sha256 }) => {
    const actual = createHash("sha256").update(await readFile(resolve(path))).digest("hex");
    return { path, passed: actual === sha256, expected: sha256, actual };
  }),
);
const packById = new Map(packs.map((pack) => [pack.bookId, pack]));
const questionLinksValid = logs.every((log) => {
  const pack = packById.get(log.bookId);
  const question = pack?.fiveQuestions.find(({ id }) => id === log.questionId);
  if (!pack || !question) return false;
  const permitted = new Set([
    ...(question.requiredAnchorIds ?? []),
    ...(question.counterEvidenceIds ?? []),
  ]);
  return (
    log.bookSet === pack.set &&
    log.turnType === question.turnType &&
    log.prompt === question.prompt &&
    (permitted.size === 0 ||
      log.usedEvidenceIds.every((evidenceId) => permitted.has(evidenceId)))
  );
});
const sourceClosureValid = packs.every((pack) => {
  const sourceUrls = new Set(pack.sources.map(({ url }) => url));
  return pack.anchors.every(({ sourceKind, sourceUrls: anchorUrls }) =>
    sourceKind === "interpretive" || sourceKind === "uncertain"
      ? anchorUrls.every((url) => sourceUrls.has(url))
      : anchorUrls.length > 0 && anchorUrls.every((url) => sourceUrls.has(url)),
  );
});

const evidenceChecks = validateRealBookEvidencePacks(packs);
const dialogueChecks = validateRealBookDialogueLogs(logs, packs);
const judgmentChecks = validateRealBookBlindJudgments(judgments, logs);
const extraErrors = [
  ...lockResults.filter(({ passed }) => !passed).map(({ path }) => `lock hash changed: ${path}`),
  ...(questionLinksValid ? [] : ["dialogue question/evidence linkage mismatch"]),
  ...(sourceClosureValid ? [] : ["evidence source URL closure mismatch"]),
];
const validationErrors = [...evidenceChecks, ...dialogueChecks, ...judgmentChecks]
  .filter(({ passed, severity }) => !passed && severity === "error")
  .map(({ name, detail }) => `${name}: ${detail}`);

const logBySampleId = new Map(logs.map((log) => [log.sampleId, log]));
const coreBaseJudgments = judgments.filter((row) => {
  const log = logBySampleId.get(row.sampleId);
  return log?.variant === "character_core" && log.repeatIndex === 0;
});
const developmentJudgments = coreBaseJudgments.filter(
  (row) => logBySampleId.get(row.sampleId)?.bookSet === "development",
);
const holdoutJudgments = coreBaseJudgments.filter(
  (row) => logBySampleId.get(row.sampleId)?.bookSet === "holdout",
);
const legacyJudgments = judgments.filter(
  (row) => logBySampleId.get(row.sampleId)?.variant === "legacy_card",
);
const coreAbJudgments = coreBaseJudgments.filter((row) => {
  const log = logBySampleId.get(row.sampleId);
  return (
    log &&
    ["cosmos-carl-sagan", "honmono-seong-hae-na", "atomic-habits-james-clear"].includes(
      log.bookId,
    ) &&
    ["isaac-newton", "marcus", "murasaki-shikibu"].includes(log.personaId)
  );
});
const homePairs = new Set([
  "isaac-newton:cosmos-carl-sagan",
  "marcus:murder-of-roger-ackroyd-agatha-christie",
  "murasaki-shikibu:pride-and-prejudice-jane-austen",
  "justice-tolerance-reader:nineteen-eighty-four-george-orwell",
]);
const homeJudgments = coreBaseJudgments.filter((row) => {
  const log = logBySampleId.get(row.sampleId);
  return log ? homePairs.has(`${log.personaId}:${log.bookId}`) : false;
});
const awayJudgments = coreBaseJudgments.filter((row) => !homeJudgments.includes(row));

const repeats = logs.filter(({ repeatIndex }) => repeatIndex > 0);
const repeatSimilarities = repeats.map((repeat) => {
  const base = logs.find(
    (candidate) =>
      candidate.baseCaseId === repeat.baseCaseId &&
      candidate.variant === "character_core" &&
      candidate.repeatIndex === 0,
  );
  if (!base) throw new Error(`Missing stability base for ${repeat.sampleId}.`);
  return jaccardSimilarity(base.dialogue, repeat.dialogue);
});
const repeatedJudgments = judgments.filter(
  (row) => (logBySampleId.get(row.sampleId)?.repeatIndex ?? 0) > 0,
);
const visibleInternalLanguage = logs.filter(({ dialogue }) =>
  ["근거팩", "사용자 발제", "검증된 작품 사실"].some((term) => dialogue.includes(term)),
);
const questionFormCount = logs.filter(({ dialogue }) => dialogue.includes("?")).length;
const sentenceDistribution = new Map<number, number>();
for (const { dialogue } of logs) {
  const sentenceCount = countSentences(dialogue);
  sentenceDistribution.set(sentenceCount, (sentenceDistribution.get(sentenceCount) ?? 0) + 1);
}

const personaRows = CORE_PERSONA_IDS.map((personaId) => {
  const rows = coreBaseJudgments.filter(
    (row) => logBySampleId.get(row.sampleId)?.personaId === personaId,
  );
  return `| ${personaId} | ${rows.filter(({ correct }) => correct).length}/${rows.length} | ${percent(
    rows.filter(({ correct }) => correct).length,
    rows.length,
  )} | ${scoreAverage(rows, "groundedness").toFixed(2)} | ${scoreAverage(
    rows,
    "distinctiveness",
  ).toFixed(2)} | ${scoreAverage(rows, "caricatureRisk").toFixed(2)} |`;
});
const bookRows = packs.map((pack) => {
  const rows = coreBaseJudgments.filter(
    (row) => logBySampleId.get(row.sampleId)?.bookId === pack.bookId,
  );
  return `| ${pack.title} | ${pack.set} | ${rows.filter(({ correct }) => correct).length}/${
    rows.length
  } | ${percent(rows.filter(({ correct }) => correct).length, rows.length)} |`;
});
const turnTypes = [
  "first_impression",
  "evidence_selection",
  "respond_to_user",
  "directed_rebuttal",
  "revise_after_counterevidence",
] as const;
const turnTypeRows = turnTypes.map((turnType) => {
  const rows = coreBaseJudgments.filter(
    (row) => logBySampleId.get(row.sampleId)?.turnType === turnType,
  );
  return `| ${turnType} | ${rows.filter(({ correct }) => correct).length}/${rows.length} | ${percent(
    rows.filter(({ correct }) => correct).length,
    rows.length,
  )} | ${scoreAverage(rows, "colloquiality").toFixed(2)} | ${scoreAverage(
    rows,
    "distinctiveness",
  ).toFixed(2)} |`;
});
const confusionRows = CORE_PERSONA_IDS.map((actualPersonaId) => {
  const actualRows = coreBaseJudgments.filter(
    (row) => logBySampleId.get(row.sampleId)?.personaId === actualPersonaId,
  );
  return `| ${actualPersonaId} | ${CORE_PERSONA_IDS.map(
    (guessedPersonaId) =>
      actualRows.filter(({ guessedPersonaId: guess }) => guess === guessedPersonaId).length,
  ).join(" | ")} |`;
});
const judgeRows = [...new Set(judgments.map(({ judge }) => judge))].map((judge) => {
  const rows = judgments.filter((row) => row.judge === judge);
  return `| ${judge} | ${rows.length} | ${(accuracy(rows) * 100).toFixed(
    1,
  )}% | ${scoreAverage(rows, "groundedness").toFixed(2)} | ${scoreAverage(
    rows,
    "distinctiveness",
  ).toFixed(2)} | ${scoreAverage(rows, "caricatureRisk").toFixed(2)} |`;
});
const hardFailureCounts = new Map<string, number>();
for (const failure of judgments.flatMap(({ hardFailures }) => hardFailures)) {
  hardFailureCounts.set(failure, (hardFailureCounts.get(failure) ?? 0) + 1);
}
const reasoningOnlyJudgments = coreBaseJudgments.filter(
  ({ identificationBasis }) => identificationBasis === "reasoning_process",
);
const repeatedBaseCaseIds = new Set(repeats.map(({ baseCaseId }) => baseCaseId));
const repeatPersonaRows = CORE_PERSONA_IDS.map((personaId) => {
  const baseRows = coreBaseJudgments.filter((row) => {
    const log = logBySampleId.get(row.sampleId);
    return log?.personaId === personaId && repeatedBaseCaseIds.has(log.baseCaseId);
  });
  const repeatRows = repeatedJudgments.filter(
    (row) => logBySampleId.get(row.sampleId)?.personaId === personaId,
  );
  return `| ${personaId} | ${baseRows.filter(({ correct }) => correct).length}/${
    baseRows.length
  } | ${repeatRows.filter(({ correct }) => correct).length}/${
    repeatRows.length
  } | ${percent(
    repeatRows.filter(({ correct }) => correct).length,
    repeatRows.length,
  )} |`;
});

const report = `# 실제 책 Character Core 전이 평가

> 생성 방식: Codex 서브 에이전트 오프라인 생성. 앱 OpenAI API 호출 없음.
>
> 역사적 인물이 실제로 현대 책을 읽었다는 주장이 아니라, 제공된 근거팩에 반응하는 편집적 재구성입니다.

## 실행 무결성

- 근거팩: ${packs.length}권 (개발 ${developmentPacks.length}, 홀드아웃 ${holdoutPacks.length})
- 출력: 총 ${logs.length}개 = Character Core 기본 ${coreBaseJudgments.length} + legacy A/B ${legacyJudgments.length} + 안정성 반복 ${repeats.length}
- 블라인드 판단: ${judgments.length}개
- 홀드아웃 프로토콜: ${lock.protocol}
- 한계: ${lock.claimBoundary}
- 고정 입력 해시: ${lockResults.filter(({ passed }) => passed).length}/${lockResults.length} 일치
- 잠금 후 정정: ${
  lock.postLockCorrections?.length
    ? lock.postLockCorrections
        .map(
          ({ affectsBaseOrHoldoutDialogueGeneration, scope }) =>
            `${scope} (기본·홀드아웃 대사 생성 영향: ${
              affectsBaseOrHoldoutDialogueGeneration ? "있음" : "없음"
            })`,
        )
        .join(", ")
    : "없음"
}
- 질문·근거 연결: ${questionLinksValid ? "통과" : "실패"}
- 출처 URL 폐쇄성: ${sourceClosureValid ? "통과" : "실패"}

## 핵심 결과

- Character Core 전체 블라인드 식별률: ${percent(
  coreBaseJudgments.filter(({ correct }) => correct).length,
  coreBaseJudgments.length,
)}
- 사고 과정만으로 식별한 행의 정확도: ${percent(
  reasoningOnlyJudgments.filter(({ correct }) => correct).length,
  reasoningOnlyJudgments.length,
)} (${reasoningOnlyJudgments.length}개)
- 개발 세트: ${percent(
  developmentJudgments.filter(({ correct }) => correct).length,
  developmentJudgments.length,
)} / 출력 미열람 홀드아웃: ${percent(
  holdoutJudgments.filter(({ correct }) => correct).length,
  holdoutJudgments.length,
)}
- 홈 조합 20개: ${percent(
  homeJudgments.filter(({ correct }) => correct).length,
  homeJudgments.length,
)} / 비홈 조합 160개: ${percent(
  awayJudgments.filter(({ correct }) => correct).length,
  awayJudgments.length,
)}
- 안정성 반복 식별률: ${percent(
  repeatedJudgments.filter(({ correct }) => correct).length,
  repeatedJudgments.length,
)}
- 기본 대사와 반복 대사의 평균 5-gram Jaccard: ${average(repeatSimilarities).toFixed(
  3,
)} (높을수록 문장 복제 가능성도 있으므로 식별률과 함께 해석)

## 알려진 대화 품질 경고

- 보이는 대사에 내부 근거 관리 용어가 나온 발화: ${visibleInternalLanguage.length}/${logs.length}
- 실제 물음표가 있는 발화: ${questionFormCount}/${logs.length}
- 문장 수 분포: ${[...sentenceDistribution.entries()]
  .sort(([left], [right]) => left - right)
  .map(([sentenceCount, count]) => `${sentenceCount}문장 ${count}개`)
  .join(", ")}
- 이 수치는 블라인드 점수와 별개다. 식별률이 높더라도 전부 같은 길이의 진술문이면 실제 독서 모임 대사 품질을 통과한 것으로 보지 않는다.

## 반복 안정성

| 캐릭터 | 선택된 r0 정답 | r1·r2 정답 | 반복 식별률 |
|---|---:|---:|---:|
${repeatPersonaRows.join("\n")}

## 캐릭터별

| 캐릭터 | 정답 | 식별률 | 근거성 | 개성 | 희화화 위험 |
|---|---:|---:|---:|---:|---:|
${personaRows.join("\n")}

## 책별

| 책 | 세트 | 정답 | 식별률 |
|---|---|---:|---:|
${bookRows.join("\n")}

## 질문 기능별

| 질문 기능 | 정답 | 식별률 | 구어성 | 개성 |
|---|---:|---:|---:|---:|
${turnTypeRows.join("\n")}

## Character Core 혼동 행렬

행은 실제 캐릭터, 열은 판정 캐릭터다.

| 실제 \\ 판정 | ${CORE_PERSONA_IDS.join(" | ")} |
|---|${CORE_PERSONA_IDS.map(() => "---:").join("|")}|
${confusionRows.join("\n")}

## Character Core 대 legacy 카드 — 공통 45셀

| 변형 | 식별률 | 구어성 | 근거성 | 주장 충실도 | 개성 | 희화화 위험 |
|---|---:|---:|---:|---:|---:|---:|
| Character Core | ${(accuracy(coreAbJudgments) * 100).toFixed(1)}% | ${scoreAverage(
  coreAbJudgments,
  "colloquiality",
).toFixed(2)} | ${scoreAverage(coreAbJudgments, "groundedness").toFixed(
  2,
)} | ${scoreAverage(coreAbJudgments, "claimFidelity").toFixed(2)} | ${scoreAverage(
  coreAbJudgments,
  "distinctiveness",
).toFixed(2)} | ${scoreAverage(coreAbJudgments, "caricatureRisk").toFixed(2)} |
| Legacy card | ${(accuracy(legacyJudgments) * 100).toFixed(1)}% | ${scoreAverage(
  legacyJudgments,
  "colloquiality",
).toFixed(2)} | ${scoreAverage(legacyJudgments, "groundedness").toFixed(
  2,
)} | ${scoreAverage(legacyJudgments, "claimFidelity").toFixed(2)} | ${scoreAverage(
  legacyJudgments,
  "distinctiveness",
).toFixed(2)} | ${scoreAverage(legacyJudgments, "caricatureRisk").toFixed(2)} |

## 판정자별 보정 확인

| 판정자 | 행 | 전체 정답률 | 근거성 | 개성 | 희화화 위험 |
|---|---:|---:|---:|---:|---:|
${judgeRows.join("\n")}

- Hard failure: ${
  hardFailureCounts.size === 0
    ? "없음"
    : [...hardFailureCounts.entries()]
        .sort((left, right) => right[1] - left[1])
        .map(([failure, count]) => `${failure} ${count}건`)
        .join(", ")
}

## 판정 경계

- 이 평가는 책 전체 이해도가 아니라 제공된 근거팩을 바탕으로 한 반응의 정확성과 캐릭터 전이를 측정합니다.
- 장르당 한 권 수준이므로 장르 일반화를 입증하지 않습니다. 여기서는 “9권 도전 배터리”라고 부릅니다.
- 생성자와 판정자는 서로 다른 서브 에이전트지만 같은 모델 계열일 수 있어 완전히 독립된 인간 평가가 아닙니다.
- legacy 비교에는 기존 카드가 실제로 존재하는 뉴턴·마커스·무라사키만 포함했습니다. 정의·관용 독자는 억지 baseline을 만들지 않았습니다.
- 원문 전문을 넣지 않았고 짧은 근거 요약만 썼습니다. 저작권 안전성과 전체 독서 대체 금지를 우선했습니다.

## 검증

${[...validationErrors, ...extraErrors].length === 0 ? "- 모든 필수 검증 통과" : [...validationErrors, ...extraErrors].map((error) => `- 실패: ${error}`).join("\n")}
`;

await writeFile(resolve(fixtureRoot, "REAL_BOOK_TRANSFER_REPORT.ko.md"), report, "utf8");

for (const check of [...evidenceChecks, ...dialogueChecks, ...judgmentChecks]) {
  const marker = check.passed ? "PASS" : check.severity === "warning" ? "WARN" : "FAIL";
  console.log(`${marker} ${check.name}: ${check.detail}`);
}
console.log(`PASS lock hashes: ${lockResults.filter(({ passed }) => passed).length}/${lockResults.length}`);
console.log(`${questionLinksValid ? "PASS" : "FAIL"} question/evidence linkage`);
console.log(`${sourceClosureValid ? "PASS" : "FAIL"} source URL closure`);
console.log(`Wrote ${resolve(fixtureRoot, "REAL_BOOK_TRANSFER_REPORT.ko.md")}`);

if ([...validationErrors, ...extraErrors].length > 0) process.exitCode = 1;
