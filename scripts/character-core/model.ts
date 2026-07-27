export type CharacterState = "baseline" | "engaged" | "boundary_crossed";

export type CharacterTurnType =
  | "first_impression"
  | "respond_to_user"
  | "challenge_reader"
  | "boundary_response"
  | "concede_or_repair";

export interface RankedValue {
  id: string;
  priority: number;
  commitment: string;
}

export interface StateBehavior {
  state: CharacterState;
  trigger: string;
  dialogueMoves: string[];
  delivery: string;
}

export interface StateTransition {
  id: string;
  from: CharacterState;
  to: CharacterState;
  when: string;
}

export interface CharacterCore {
  schemaVersion: 1;
  language: "ko";
  interpretation: "editorial_reconstruction";
  personaId: string;
  displayName: { en: string; ko: string };
  rankedValues: RankedValue[];
  coreBelief: string;
  epistemicMoves: string[];
  uncertaintyRule: string;
  stateBehaviors: StateBehavior[];
  stateTransitions: StateTransition[];
  disagreementMove: string;
  concessionMove: string;
  repairMove: string;
  blindSpot: string;
  counterweight: string;
  provenance: {
    documentedFacts: string[];
    sourceUrls: string[];
    editorialInterpretation: string;
    prohibitedInference: string;
  };
  voice: {
    ko: {
      openingMoves: string[];
      cadence: string;
      questionStyle: string;
      avoid: string[];
    };
    signatureBudget: {
      maxPerSession: number;
      domains: string[];
    };
  };
  distinction: {
    nearestNeighbors: string[];
    mustDifferBy: string;
  };
  contrastivePolicy: {
    primaryFocus: string;
    nearestNeighborDifferences: Array<{
      personaId: string;
      thisCoreFocus: string;
      neighborFocus: string;
    }>;
    requiredEvidenceBeforeInference?: string;
  };
}

export interface EvidenceAnchor {
  id: string;
  fact: string;
}

export interface CharacterCoreCase {
  id: string;
  personaId: string;
  turnType: CharacterTurnType;
  state: CharacterState;
  language?: "ko";
  prompt: string;
  userClaim?: string;
  priorTurn?: string;
  allowedEvidence: EvidenceAnchor[];
  expectedProperties: string[];
  forbiddenProperties: string[];
}

export interface CharacterCoreSample {
  sampleId?: string;
  runId?: string;
  schemaVersion?: 1;
  language?: "ko";
  caseId: string;
  personaId: string;
  selectedValue: string;
  selectedValueIds?: string[];
  valueConflict?: {
    higherValueId: string;
    lowerValueId: string;
  };
  state: CharacterState;
  dialogueMove: string;
  usedEvidenceIds: string[];
  dialogue: string;
  generator: {
    kind: "subagent" | "fixture" | "live_api";
    label: string;
    model?: string;
    requestId?: string;
    latencyMs?: number;
  };
}

export interface CharacterCoreJudgment {
  sampleId?: string;
  caseId: string;
  guessedPersonaId: string;
  scores: {
    colloquiality: number;
    groundedness: number;
    claimFidelity: number;
    characterDistinctiveness: number;
    caricatureRisk: number;
  };
  hardFailures: string[];
  identificationBasis?: "reasoning_process" | "surface_cue" | "mixed" | "unclear";
  reasoningMoveEvidence?: string[];
  lexicalCueHits?: string[];
  rationale: string;
  judge: {
    kind: "subagent" | "human";
    label: string;
  };
}

export interface OfflineDialogueLogEntry extends CharacterCoreSample {
  turnType: CharacterTurnType;
  prompt: string;
  allowedEvidence: EvidenceAnchor[];
}

export interface DeterministicCheck {
  name: string;
  passed: boolean;
  severity: "error" | "warning";
  detail: string;
}

export interface BlindJudgmentLogEntry {
  blindId: string;
  guessedPersonaId: string;
  actualPersonaId: string;
  correct: boolean;
  scores: {
    colloquiality: number;
    groundedness: number;
    distinctiveness: number;
    caricatureRisk: number;
  };
  identificationBasis: "reasoning_process" | "surface_cue" | "mixed" | "unclear";
  lexicalCueHits: string[];
  rationale: string;
  judge: string;
}
