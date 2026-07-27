import { describe, expect, it } from "vitest";
import { utteranceTaskSchema } from "../api/contracts";
import { PROTOTYPE_CHARACTER_CORES } from "../../scripts/character-core/prototypeCores";
import {
  CHARACTER_CORE_EXPERIMENT_VERSION,
  buildCharacterCoreReadingNotesPromptSlice,
  buildCharacterCoreUtterancePromptSlice,
  findRuntimeCharacterCore,
  isLoopbackHostname,
  listEnabledCharacterCorePersonaIds,
  mapUtteranceTaskToCharacterCoreState,
  resolveCharacterCoreExperiment,
} from "./runtime";

describe("Character Core runtime experiment", () => {
  it("recognizes only explicit loopback hostnames", () => {
    expect(isLoopbackHostname("localhost")).toBe(true);
    expect(isLoopbackHostname("LOCALHOST")).toBe(true);
    expect(isLoopbackHostname("127.0.0.1")).toBe(true);
    expect(isLoopbackHostname("::1")).toBe(true);
    expect(isLoopbackHostname("[::1]")).toBe(true);

    expect(isLoopbackHostname("localhost.example.com")).toBe(false);
    expect(isLoopbackHostname("127.0.0.2")).toBe(false);
    expect(isLoopbackHostname("0.0.0.0")).toBe(false);
    expect(isLoopbackHostname("localhost:5173")).toBe(false);
    expect(isLoopbackHostname(" localhost")).toBe(false);
  });

  it("resolves the exact opt-in query only on loopback", () => {
    expect(
      resolveCharacterCoreExperiment("?characterCore=1", "localhost"),
    ).toEqual({ version: CHARACTER_CORE_EXPERIMENT_VERSION });
    expect(
      resolveCharacterCoreExperiment(
        "?seed=demo&characterCore=1",
        "127.0.0.1",
      ),
    ).toEqual({ version: "v2" });

    expect(
      resolveCharacterCoreExperiment("?characterCore=1", "reading-table.web.app"),
    ).toBeUndefined();
    expect(
      resolveCharacterCoreExperiment("?characterCore=0", "localhost"),
    ).toBeUndefined();
    expect(
      resolveCharacterCoreExperiment(
        "?characterCore=1&characterCore=1",
        "localhost",
      ),
    ).toBeUndefined();
  });

  it("finds only Korean cores approved for the runtime experiment", () => {
    expect(findRuntimeCharacterCore("marcus", "ko")?.personaId).toBe("marcus");
    expect(findRuntimeCharacterCore("isaac-newton", "ko")?.personaId).toBe(
      "isaac-newton",
    );
    expect(findRuntimeCharacterCore("murasaki-shikibu", "ko")?.personaId).toBe(
      "murasaki-shikibu",
    );

    expect(findRuntimeCharacterCore("marcus", "en")).toBeUndefined();
    expect(
      findRuntimeCharacterCore("justice-tolerance-reader", "ko"),
    ).toBeUndefined();
    expect(findRuntimeCharacterCore("unknown-reader", "ko")).toBeUndefined();
  });

  it("lists only present enabled readers without mutating or duplicating input", () => {
    const personaIds = [
      "murasaki-shikibu",
      "dev",
      "marcus",
      "murasaki-shikibu",
    ] as const;
    const original = [...personaIds];

    expect(listEnabledCharacterCorePersonaIds(personaIds, "ko")).toEqual([
      "murasaki-shikibu",
      "marcus",
    ]);
    expect(listEnabledCharacterCorePersonaIds(personaIds, "en")).toEqual([]);
    expect(personaIds).toEqual(original);
  });

  it("maps every utterance task deterministically to a bounded runtime state", () => {
    for (const task of utteranceTaskSchema.options) {
      const first = mapUtteranceTaskToCharacterCoreState(task);
      const second = mapUtteranceTaskToCharacterCoreState(task);
      expect(second).toBe(first);
      expect(["baseline", "engaged"]).toContain(first);
      expect(first).not.toBe("boundary_crossed");
    }

    expect(mapUtteranceTaskToCharacterCoreState("FIRST_IMPRESSION")).toBe(
      "baseline",
    );
    expect(mapUtteranceTaskToCharacterCoreState("CHALLENGE_USER")).toBe(
      "engaged",
    );
    expect(mapUtteranceTaskToCharacterCoreState("RESPOND_TO_PERSONA")).toBe(
      "engaged",
    );
  });

  it("builds deterministic, bounded reading-note and utterance slices", () => {
    const before = structuredClone(PROTOTYPE_CHARACTER_CORES);
    const notes = buildCharacterCoreReadingNotesPromptSlice("marcus", "ko");
    const first = buildCharacterCoreUtterancePromptSlice(
      "murasaki-shikibu",
      "ko",
      "RESPOND_TO_USER_REPLY",
    );
    const second = buildCharacterCoreUtterancePromptSlice(
      "murasaki-shikibu",
      "ko",
      "RESPOND_TO_USER_REPLY",
    );

    expect(notes).toMatchObject({
      version: "v2",
      personaId: "marcus",
    });
    expect(notes?.prompt).toContain("Ranked commitments:");
    expect(first).toEqual(second);
    expect(first).toMatchObject({
      version: "v2",
      personaId: "murasaki-shikibu",
      state: "engaged",
    });
    expect(first?.prompt).toContain("Evidence before inference:");
    expect(PROTOTYPE_CHARACTER_CORES).toEqual(before);
  });

  it("keeps provenance, source URLs, and transition controls out of prompt slices", () => {
    for (const personaId of [
      "marcus",
      "isaac-newton",
      "murasaki-shikibu",
    ]) {
      const core = findRuntimeCharacterCore(personaId, "ko");
      const notes = buildCharacterCoreReadingNotesPromptSlice(personaId, "ko");
      const utterance = buildCharacterCoreUtterancePromptSlice(
        personaId,
        "ko",
        "CHALLENGE_PERSONA",
      );
      expect(core).toBeDefined();
      expect(notes).toBeDefined();
      expect(utterance).toBeDefined();
      expect(utterance!.prompt).toContain("Natural Korean floor:");

      for (const prompt of [notes!.prompt, utterance!.prompt]) {
        expect(prompt).not.toContain("provenance");
        expect(prompt).not.toContain("sourceUrls");
        expect(prompt).not.toContain("boundary_crossed");
        for (const url of core!.provenance.sourceUrls) {
          expect(prompt).not.toContain(url);
        }
        for (const transition of core!.stateTransitions) {
          expect(prompt).not.toContain(transition.id);
          expect(prompt).not.toContain(transition.when);
        }
      }
    }
  });

  it("does not build slices for unmapped readers or English sessions", () => {
    expect(
      buildCharacterCoreReadingNotesPromptSlice(
        "justice-tolerance-reader",
        "ko",
      ),
    ).toBeUndefined();
    expect(
      buildCharacterCoreUtterancePromptSlice(
        "marcus",
        "en",
        "CHALLENGE_USER",
      ),
    ).toBeUndefined();
  });
});
