import { describe, expect, it } from "vitest";

import { PERSONAS, selectPersonas } from "./personas";

describe("persona selection", () => {
  it("stores all eight persona cards", () => {
    expect(PERSONAS).toHaveLength(8);
    expect(new Set(PERSONAS.map(({ id }) => id)).size).toBe(8);
  });

  it("draws one persona from each category outside the fixed demo", () => {
    const selected = selectPersonas("repeatable-seed");
    expect(selected.map(({ category }) => category).sort()).toEqual([
      "analytical",
      "contextual",
      "emotional",
    ]);
  });

  it("preserves the fixed judging trio", () => {
    expect(selectPersonas("demo").map(({ id }) => id)).toEqual([
      "maddie",
      "marcus",
      "dev",
    ]);
    expect(selectPersonas("demo").map(({ category }) => category)).toEqual([
      "emotional",
      "analytical",
      "contextual",
    ]);
  });
});
