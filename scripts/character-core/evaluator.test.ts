import { describe, expect, it } from "vitest";
import { PROTOTYPE_CHARACTER_CORES } from "./prototypeCores";
import {
  expectedMatrixIds,
  jaccardSimilarity,
  validateCharacterCores,
} from "./evaluator";

describe("Character Core offline evaluator", () => {
  it("defines a complete four-persona, five-turn, three-state matrix", () => {
    const ids = expectedMatrixIds();

    expect(ids).toHaveLength(60);
    expect(new Set(ids).size).toBe(60);
  });

  it("accepts all four prototype cores", () => {
    const checks = validateCharacterCores(PROTOTYPE_CHARACTER_CORES);

    expect(checks.filter(({ severity, passed }) => severity === "error" && !passed)).toEqual([]);
  });

  it("keeps the four nearest-neighbor reasoning boundaries explicit", () => {
    const byId = new Map(
      PROTOTYPE_CHARACTER_CORES.map((core) => [core.personaId, core]),
    );

    expect(byId.get("isaac-newton")?.contrastivePolicy.primaryFocus).toMatch(
      /작동 원리.*조건.*일반화/u,
    );
    expect(byId.get("marcus")?.contrastivePolicy.primaryFocus).toMatch(
      /책임.*반대 증거.*절차/u,
    );
    expect(byId.get("justice-tolerance-reader")?.contrastivePolicy.primaryFocus).toMatch(
      /비용.*기준.*복구/u,
    );
    expect(
      byId.get("murasaki-shikibu")?.contrastivePolicy.requiredEvidenceBeforeInference,
    ).toMatch(/행동.*관계 변화/u);
  });

  it("detects close sentence skeletons without requiring exact equality", () => {
    const close = jaccardSimilarity(
      "확인된 사실과 아직 남은 조건을 나눠 봐야 합니다.",
      "확인된 사실과 아직 남아 있는 조건을 나눠 봐야 합니다.",
    );
    const different = jaccardSimilarity(
      "확인된 사실과 아직 남은 조건을 나눠 봐야 합니다.",
      "그 사람은 사과할 기회부터 돌려받아야 해요.",
    );

    expect(close).toBeGreaterThan(different);
    expect(close).toBeGreaterThan(0.45);
  });
});
