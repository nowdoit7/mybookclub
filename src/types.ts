export type Category = "emotional" | "analytical" | "contextual";
export type AppLanguage = "en" | "ko";
export type BookScope = "single_book" | "series";
export type DiscussionAction = "join" | "listen" | "wrap";
export type BookVerificationStatus = "verified" | "ambiguous" | "not_found" | "mock";

export interface SocialTemperament {
  warmth: number;
  playfulness: number;
  directness: number;
  energy: number;
}

export interface RoomAtmosphere {
  warmth: number;
  playfulness: number;
  tension: number;
  energy: number;
}

export interface BookSource {
  url: string;
}

export interface ShelfBook {
  title: string;
  author: string;
  takeaway: string;
}

export interface PersonaCard {
  id: string;
  name: string;
  category: Category;
  identity: string;
  roleLabel: Record<AppLanguage, string>;
  socialIntroSeed: Record<AppLanguage, string>;
  lens: string;
  voice: string;
  bookshelf: ShelfBook[];
  behaviorRules: string[];
  forbidden: string[];
  avatarColor: string;
  socialTemperament: SocialTemperament;
}

export interface ReadingNotes {
  overallTake: string;
  overallStance: number;
  stanceByTopic: Array<{ topic: string; stance: number; reason: string }>;
  keyScenes: string[];
  shelfConnections: string[];
  personalReaction: string;
  unresolvedQuestion: string;
  possibleRevision: string;
  questionForTable: string;
}

export interface DiscussionFocus {
  topicScores: Array<{ topic: string; relevance: number; evidence: string }>;
  emergentQuestion?: string;
  emergentRelevance: number;
  emergentEvidence?: string;
}

export interface ConfirmedBook {
  title: string;
  author: string;
  workScope: BookScope;
  includedTitles: string[];
  confirmedSummary: string;
  mainCharacters: string[];
  candidateTopics: string[];
  verificationStatus: BookVerificationStatus;
  verificationNote: string;
  sources: BookSource[];
}

export type StageId =
  | "INTRO"
  | "FIRST_IMPRESSIONS"
  | "MEMORABLE_SCENES"
  | "DISCUSSION"
  | "WRAP_UP";

export type UserTurnKind =
  | "intro"
  | "first_impression"
  | "memorable_scene"
  | "discussion_position"
  | "discussion_reply"
  | "wrap_up";

export interface Utterance {
  speaker: string;
  text: string;
  stance?: number;
  refersTo?: string;
  shelfRef?: string;
  stage: StageId;
}

export interface SessionState {
  language: AppLanguage;
  roomAtmosphere: RoomAtmosphere;
  book: ConfirmedBook;
  personas: PersonaCard[];
  notes: Record<string, ReadingNotes>;
  transcript: Utterance[];
  stage: StageId;
  stageTurnCount: number;
  activeTopic?: string;
  userStance?: number;
  userStances: Record<string, { stance: number; paraphrase: string }>;
  discussionRoles?: {
    leadA: string;
    leadB: string;
    challenger?: string;
    supporter?: string;
    observer?: string;
  };
  discussionListenCount: number; // 0..2 bounded reader-to-reader extensions
  seed?: string;
}

export interface DiscussionDecisionTurn {
  round: number;
  canListen: boolean;
  phase: "before_join" | "after_join";
}

export interface CompletedSession {
  state: SessionState;
  recapMarkdown: string;
}
