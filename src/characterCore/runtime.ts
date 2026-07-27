import type { UtteranceTask } from "../api/contracts";
import type { AppLanguage } from "../types";
import type { CharacterCore } from "../../scripts/character-core/model";
import { PROTOTYPE_CHARACTER_CORES } from "../../scripts/character-core/prototypeCores";

export const CHARACTER_CORE_EXPERIMENT_VERSION = "v2" as const;

export type CharacterCoreExperimentVersion =
  typeof CHARACTER_CORE_EXPERIMENT_VERSION;

export interface CharacterCoreExperimentMarker {
  version: CharacterCoreExperimentVersion;
}

export type RuntimeCharacterCoreState = "baseline" | "engaged";

export const RUNTIME_CHARACTER_CORE_PERSONA_IDS = [
  "marcus",
  "isaac-newton",
  "murasaki-shikibu",
] as const;

export type RuntimeCharacterCorePersonaId =
  (typeof RUNTIME_CHARACTER_CORE_PERSONA_IDS)[number];

export interface CharacterCoreReadingNotesPromptSlice {
  version: CharacterCoreExperimentVersion;
  personaId: RuntimeCharacterCorePersonaId;
  prompt: string;
}

export interface CharacterCoreUtterancePromptSlice
  extends CharacterCoreReadingNotesPromptSlice {
  state: RuntimeCharacterCoreState;
}

const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
const RUNTIME_PERSONA_IDS = new Set<string>(RUNTIME_CHARACTER_CORE_PERSONA_IDS);

const TASK_STATES: Record<UtteranceTask, RuntimeCharacterCoreState> = {
  WELCOME: "baseline",
  PERSONA_INTRODUCTION: "baseline",
  INVITE_USER: "baseline",
  FIRST_IMPRESSIONS_OPEN: "baseline",
  FIRST_IMPRESSION: "baseline",
  OPEN_PERSONA_POSITION: "baseline",
  CHALLENGE_PERSONA: "engaged",
  RESPOND_TO_PERSONA: "engaged",
  CHALLENGE_USER: "engaged",
  DEVILS_ADVOCATE: "engaged",
  SCENES_OPEN: "baseline",
  MEMORABLE_SCENE: "baseline",
  REACT_TO_USER_SCENE: "engaged",
  TOPIC_OPEN: "baseline",
  ASK_USER_POSITION: "baseline",
  RESPOND_TO_USER_REPLY: "engaged",
  RESPOND_TO_USER_FOLLOWUP: "engaged",
  BRIDGE_EXCHANGE: "engaged",
  TOPIC_CLOSE: "baseline",
  WRAP_OPEN: "baseline",
  CLOSING_REFLECTION: "baseline",
  DISCUSSION_SUMMARY: "baseline",
};

function isRuntimePersonaId(
  personaId: string,
): personaId is RuntimeCharacterCorePersonaId {
  return RUNTIME_PERSONA_IDS.has(personaId);
}

function formatRankedValues(core: CharacterCore): string {
  return core.rankedValues
    .map((value) => `${value.priority}. ${value.commitment}`)
    .join("\n");
}

export function isLoopbackHostname(hostname: string): boolean {
  return LOOPBACK_HOSTNAMES.has(hostname.toLowerCase());
}

export function resolveCharacterCoreExperiment(
  search: string,
  hostname: string,
): CharacterCoreExperimentMarker | undefined {
  if (!isLoopbackHostname(hostname)) return undefined;

  const parameters = new URLSearchParams(search);
  const values = parameters.getAll("characterCore");
  if (values.length !== 1 || values[0] !== "1") return undefined;

  return { version: CHARACTER_CORE_EXPERIMENT_VERSION };
}

export function findRuntimeCharacterCore(
  personaId: string,
  language: AppLanguage,
): CharacterCore | undefined {
  if (language !== "ko" || !isRuntimePersonaId(personaId)) return undefined;

  return PROTOTYPE_CHARACTER_CORES.find(
    (candidate) =>
      candidate.language === language && candidate.personaId === personaId,
  );
}

export function listEnabledCharacterCorePersonaIds(
  personaIds: readonly string[],
  language: AppLanguage,
): RuntimeCharacterCorePersonaId[] {
  if (language !== "ko") return [];

  const enabled = new Set<RuntimeCharacterCorePersonaId>();
  for (const personaId of personaIds) {
    if (isRuntimePersonaId(personaId)) enabled.add(personaId);
  }
  return [...enabled];
}

export function mapUtteranceTaskToCharacterCoreState(
  task: UtteranceTask,
): RuntimeCharacterCoreState {
  return TASK_STATES[task];
}

export function buildCharacterCoreReadingNotesPromptSlice(
  personaId: string,
  language: AppLanguage,
): CharacterCoreReadingNotesPromptSlice | undefined {
  const core = findRuntimeCharacterCore(personaId, language);
  if (!core || !isRuntimePersonaId(core.personaId)) return undefined;

  return {
    version: CHARACTER_CORE_EXPERIMENT_VERSION,
    personaId: core.personaId,
    prompt: [
      "Apply this local Character Core when forming the private reading notes.",
      `Core belief: ${core.coreBelief}`,
      `Ranked commitments:\n${formatRankedValues(core)}`,
      `Reading method: ${core.epistemicMoves.join(" ")}`,
      `Uncertainty discipline: ${core.uncertaintyRule}`,
      `Distinctive focus: ${core.contrastivePolicy.primaryFocus}`,
      `Counterweight: ${core.counterweight}`,
    ].join("\n"),
  };
}

export function buildCharacterCoreUtterancePromptSlice(
  personaId: string,
  language: AppLanguage,
  task: UtteranceTask,
): CharacterCoreUtterancePromptSlice | undefined {
  const core = findRuntimeCharacterCore(personaId, language);
  if (!core || !isRuntimePersonaId(core.personaId)) return undefined;

  const state = mapUtteranceTaskToCharacterCoreState(task);
  const behavior = core.stateBehaviors.find(
    (candidate) => candidate.state === state,
  );
  if (!behavior) return undefined;

  const evidenceRequirement =
    core.contrastivePolicy.requiredEvidenceBeforeInference;

  return {
    version: CHARACTER_CORE_EXPERIMENT_VERSION,
    personaId: core.personaId,
    state,
    prompt: [
      "Apply this local Character Core while following the existing turn directive.",
      `Core belief: ${core.coreBelief}`,
      `Distinctive focus: ${core.contrastivePolicy.primaryFocus}`,
      `Reasoning move: ${behavior.dialogueMoves.join(" ")}`,
      `Delivery: ${behavior.delivery}`,
      `Cadence: ${core.voice.ko.cadence}`,
      `Question style: ${core.voice.ko.questionStyle}`,
      `Uncertainty discipline: ${core.uncertaintyRule}`,
      ...(evidenceRequirement
        ? [`Evidence before inference: ${evidenceRequirement}`]
        : []),
      `Avoid: ${core.voice.ko.avoid.join(", ")}`,
      "Natural Korean floor: keep the exact meaning and evidence, use idiomatic spoken collocations, make omitted subjects or referents clear, and split stacked agreement, qualification, and questions into short sentences. Formality may shape endings and rhythm but never justify translation-like or opaque wording.",
    ].join("\n"),
  };
}
