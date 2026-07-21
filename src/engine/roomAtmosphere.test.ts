import { describe, expect, it } from "vitest";

import { PERSONAS } from "../personas";
import {
  describeRoomAtmosphere,
  deriveInitialAtmosphere,
  updateAtmosphereForTask,
  updateAtmosphereFromUser,
} from "./roomAtmosphere";

describe("room atmosphere", () => {
  it("derives a stable baseline from the selected persona mix", () => {
    const baseline = deriveInitialAtmosphere([
      PERSONAS.find(({ id }) => id === "maddie")!,
      PERSONAS.find(({ id }) => id === "marcus")!,
      PERSONAS.find(({ id }) => id === "dev")!,
    ]);

    expect(baseline).toEqual(deriveInitialAtmosphere([PERSONAS[0], PERSONAS[3], PERSONAS[6]]));
    expect(Object.values(baseline).every((value) => value >= 0 && value <= 1)).toBe(true);
  });

  it("lets playful user language warm and energize the room gradually", () => {
    const baseline = deriveInitialAtmosphere([PERSONAS[0], PERSONAS[3], PERSONAS[6]]);
    const updated = updateAtmosphereFromUser(
      baseline,
      "그 해석은 생각도 못했네요 ㅋㅋ 재미있어요! 저도 조금 더 이야기해 보고 싶습니다.",
    );

    expect(updated.playfulness).toBeGreaterThan(baseline.playfulness);
    expect(updated.warmth).toBeGreaterThan(baseline.warmth);
    expect(updated.energy).toBeGreaterThan(baseline.energy);
    expect(updated.playfulness - baseline.playfulness).toBeLessThanOrEqual(0.16);
  });

  it("raises tension for a direct challenge and softens it during support and closing", () => {
    const baseline = deriveInitialAtmosphere([PERSONAS[0], PERSONAS[3], PERSONAS[6]]);
    const challenged = updateAtmosphereForTask(baseline, "CHALLENGE_PERSONA");
    const supported = updateAtmosphereForTask(challenged, "BRIDGE_EXCHANGE");
    const closed = updateAtmosphereForTask(supported, "DISCUSSION_SUMMARY");

    expect(challenged.tension).toBeGreaterThan(baseline.tension);
    expect(supported.warmth).toBeGreaterThan(challenged.warmth);
    expect(closed.tension).toBeLessThan(supported.tension);
  });

  it("turns the numeric state into a human-readable debug label", () => {
    const atmosphere = { warmth: 0.8, playfulness: 0.72, tension: 0.24, energy: 0.65 };

    expect(describeRoomAtmosphere(atmosphere, "ko")).toContain("농담");
    expect(describeRoomAtmosphere(atmosphere, "en")).toContain("Playful");
  });
});
