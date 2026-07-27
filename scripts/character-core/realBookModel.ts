import type { CharacterState } from "./model";

export type RealBookTurnType =
  | "first_impression"
  | "evidence_selection"
  | "respond_to_user"
  | "directed_rebuttal"
  | "revise_after_counterevidence";

export type EvidenceSourceKind =
  | "verified_source"
  | "public_domain_text"
  | "user_provided"
  | "interpretive"
  | "uncertain";

export interface RealBookSource {
  url: string;
  label: string;
  kind: string;
}

export interface RealBookEvidenceAnchor {
  id: string;
  claim: string;
  sourceKind: EvidenceSourceKind;
  sourceUrls: string[];
  spoilerLevel: 0 | 1 | 2;
}

export interface RealBookQuestion {
  id: string;
  turnType: RealBookTurnType;
  prompt: string;
  requiredAnchorIds?: string[];
  counterEvidenceIds?: string[];
}

export interface RealBookEvidencePack {
  schemaVersion: "1.0.0";
  bookId: string;
  title: string;
  author: string;
  set: "development" | "holdout";
  genres: string[];
  evaluationAxes: string[];
  spoilerLevel: 0 | 1 | 2;
  sources: RealBookSource[];
  anchors: RealBookEvidenceAnchor[];
  uncertainties: string[];
  prohibitedClaims: string[];
  fiveQuestions: RealBookQuestion[];
}

export type RealBookRunVariant = "character_core" | "legacy_card";

export interface RealBookGroundingDecision {
  evidenceBackedBookClaim: string;
  personaInference: string;
  uncertainty: string | null;
  supportIds: string[];
}

export interface RealBookDialogueLogEntry {
  schemaVersion: 1;
  sampleId: string;
  baseCaseId: string;
  runId: string;
  repeatIndex: 0 | 1 | 2;
  variant: RealBookRunVariant;
  language: "ko";
  bookId: string;
  bookSet: "development" | "holdout";
  personaId: string;
  questionId: string;
  turnType: RealBookTurnType;
  targetState: CharacterState;
  prompt: string;
  allowedEvidence: RealBookEvidenceAnchor[];
  selectedValueIds: string[];
  valueConflict?: {
    higherValueId: string;
    lowerValueId: string;
  };
  dialogueMove: string;
  usedEvidenceIds: string[];
  groundingDecision: RealBookGroundingDecision;
  dialogue: string;
  generator: {
    kind: "subagent" | "live_api";
    label: string;
    model?: string;
    requestId?: string;
    latencyMs?: number;
  };
}

export interface RealBookBlindJudgment {
  blindId: string;
  sampleId: string;
  guessedPersonaId: string;
  actualPersonaId: string;
  correct: boolean;
  scores: {
    colloquiality: number;
    groundedness: number;
    claimFidelity: number;
    distinctiveness: number;
    caricatureRisk: number;
  };
  hardFailures: string[];
  identificationBasis: "reasoning_process" | "surface_cue" | "mixed" | "unclear";
  reasoningMoveEvidence: string[];
  lexicalCueHits: string[];
  rationale: string;
  judge: string;
}
