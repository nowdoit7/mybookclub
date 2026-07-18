export type Category = "emotional" | "analytical" | "contextual";
export type AppLanguage = "en" | "ko";

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
  lens: string;
  voice: string;
  bookshelf: ShelfBook[];
  behaviorRules: string[];
  forbidden: string[];
  avatarColor: string;
}

export interface ReadingNotes {
  overallTake: string;
  overallStance: number;
  stanceByTopic: Array<{ topic: string; stance: number; reason: string }>;
  keyScenes: string[];
  shelfConnections: string[];
}

export interface ConfirmedBook {
  title: string;
  author: string;
  confirmedSummary: string;
  mainCharacters: string[];
  candidateTopics: string[];
  confidence: "high" | "medium" | "low";
}

export type StageId =
  | "INTRO"
  | "FIRST_IMPRESSIONS"
  | "MEMORABLE_SCENES"
  | "DISCUSSION"
  | "WRAP_UP";

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
  book: ConfirmedBook;
  personas: PersonaCard[];
  notes: Record<string, ReadingNotes>;
  transcript: Utterance[];
  stage: StageId;
  stageTurnCount: number;
  activeTopic?: string;
  userStance?: number;
  userStances: Record<string, { stance: number; paraphrase: string }>;
  seed?: string;
}

export interface CompletedSession {
  state: SessionState;
  recapMarkdown: string;
}
