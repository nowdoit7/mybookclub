import { existsSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { GUEST_PERSONAS, PERSONAS, portraitUrlFor, selectPersonas } from "./personas";

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

  it.each(GUEST_PERSONAS)("replaces only the selected guest's category for $name", (guest) => {
    const selected = selectPersonas("demo", guest.id);

    expect(selected).toHaveLength(3);
    expect(selected.map(({ category }) => category).sort()).toEqual([
      "analytical",
      "contextual",
      "emotional",
    ]);
    expect(selected.filter(({ id }) => id === guest.id)).toHaveLength(1);
    expect(selected.filter(({ category }) => category === guest.category)).toEqual([guest]);
  });

  it("keeps a balanced pool of twenty-one imagined guests", () => {
    expect(GUEST_PERSONAS).toHaveLength(21);
    expect(
      GUEST_PERSONAS.reduce<Record<string, number>>((counts, guest) => {
        counts[guest.category] = (counts[guest.category] ?? 0) + 1;
        return counts;
      }, {}),
    ).toEqual({ analytical: 7, contextual: 7, emotional: 7 });
  });

  it.each(GUEST_PERSONAS)("provides grounded metadata and a portrait for $name", (guest) => {
    const portrait = portraitUrlFor(guest.id);
    expect(guest.imaginedGuest).toBeDefined();
    expect(guest.imaginedGuest?.documentedAchievement.en.length).toBeGreaterThan(40);
    expect(guest.imaginedGuest?.documentedAchievement.ko.length).toBeGreaterThan(20);
    expect(guest.imaginedGuest?.signatureReadingMove.en.length).toBeGreaterThan(30);
    expect(guest.imaginedGuest?.signatureReadingMove.ko.length).toBeGreaterThan(15);
    expect(guest.imaginedGuest?.sourceUrls.every((url) => url.startsWith("https://"))).toBe(true);
    expect(portrait).toBe(`/portraits/${guest.id}.webp`);
    expect(existsSync(join(process.cwd(), "public", portrait!.replace(/^\//u, "")))).toBe(true);
  });

  it("does not embed books used in prior live evaluations into guest cards", () => {
    const serialized = JSON.stringify(GUEST_PERSONAS).toLowerCase();
    for (const title of [
      "the stranger",
      "brave new world",
      "remembrance of earth's past",
      "same as ever",
      "이방인",
      "멋진 신세계",
      "삼체",
      "불변의 법칙",
      "메이플스토리",
    ]) {
      expect(serialized).not.toContain(title);
    }
  });
});
