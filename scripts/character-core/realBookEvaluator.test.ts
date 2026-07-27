import { describe, expect, it } from "vitest";
import {
  CORE_PERSONA_IDS,
  LEGACY_COMPARISON_PERSONA_IDS,
  REAL_BOOK_IDS,
  STABILITY_CELLS,
  stateForTurnType,
} from "./realBookEvaluator";

describe("real-book Character Core evaluator", () => {
  it("defines the intended 180-case core matrix", () => {
    expect(REAL_BOOK_IDS).toHaveLength(9);
    expect(CORE_PERSONA_IDS).toHaveLength(4);
    expect(REAL_BOOK_IDS.length * CORE_PERSONA_IDS.length * 5).toBe(180);
    expect(LEGACY_COMPARISON_PERSONA_IDS).toHaveLength(3);
    expect(LEGACY_COMPARISON_PERSONA_IDS.length * 3 * 5).toBe(45);
  });

  it("maps each question function to a stable response state", () => {
    expect(stateForTurnType("first_impression")).toBe("baseline");
    expect(stateForTurnType("evidence_selection")).toBe("engaged");
    expect(stateForTurnType("respond_to_user")).toBe("engaged");
    expect(stateForTurnType("directed_rebuttal")).toBe("boundary_crossed");
    expect(stateForTurnType("revise_after_counterevidence")).toBe("baseline");
  });

  it("locks two stability cells per book", () => {
    expect(STABILITY_CELLS).toHaveLength(18);
    for (const bookId of REAL_BOOK_IDS) {
      expect(STABILITY_CELLS.filter((cell) => cell.bookId === bookId)).toHaveLength(2);
    }
    expect(
      new Set(
        STABILITY_CELLS.map(
          ({ bookId, personaId, questionId }) => `${bookId}:${personaId}:${questionId}`,
        ),
      ).size,
    ).toBe(18);
  });
});
