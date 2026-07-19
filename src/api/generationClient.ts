import type {
  BookIdentificationOutput,
  BookIdentificationRequest,
  DiscussionFocusOutput,
  ReadingNotesOutput,
  RecapOutput,
  UserStanceOutput,
  UtteranceOutput,
  UtteranceTask,
} from "./contracts";
import type {
  AppLanguage,
  ConfirmedBook,
  PersonaCard,
  ReadingNotes,
  StageId,
  Utterance,
} from "../types";

export type { UtteranceTask } from "./contracts";

export interface ReadingNotesRequest {
  language: AppLanguage;
  book: ConfirmedBook;
  persona: PersonaCard;
  validationError?: string;
}

export interface UtteranceRequest {
  language: AppLanguage;
  book: ConfirmedBook;
  speaker: PersonaCard | "moderator";
  notes?: ReadingNotes;
  stage: StageId;
  task: UtteranceTask;
  recentTranscript: Utterance[];
  activeTopic?: string;
  targetSpeaker?: string;
  userArgument?: { stance: number; paraphrase: string; personaReason?: string };
  allowShelfReference: boolean;
  validationError?: string;
  discussionFocus?: string;
}

export interface DiscussionFocusRequest {
  language: AppLanguage;
  book: ConfirmedBook;
  transcript: Utterance[];
}

export interface UserStanceRequest {
  language: AppLanguage;
  text: string;
  target: string;
  book: ConfirmedBook;
}

export interface RecapRequest {
  language: AppLanguage;
  date: string;
  book: ConfirmedBook;
  personas: PersonaCard[];
  transcript: Utterance[];
  personaStances: Record<string, number>;
  userStances: Record<string, { stance: number; paraphrase: string }>;
  validationError?: string;
}

export interface GenerationClient {
  identifyBook(input: BookIdentificationRequest): Promise<BookIdentificationOutput>;
  generateReadingNotes(input: ReadingNotesRequest): Promise<ReadingNotesOutput>;
  extractDiscussionFocus(input: DiscussionFocusRequest): Promise<DiscussionFocusOutput>;
  generateUtterance(input: UtteranceRequest): Promise<UtteranceOutput>;
  extractUserStance(input: UserStanceRequest): Promise<UserStanceOutput>;
  generateRecap(input: RecapRequest): Promise<RecapOutput>;
}
