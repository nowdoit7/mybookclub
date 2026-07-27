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
  RoomAtmosphere,
  StageId,
  Utterance,
} from "../types";
import type { CharacterCoreExperimentMarker } from "../characterCore/runtime";

export type { UtteranceTask } from "./contracts";
export type { CharacterCoreExperimentMarker } from "../characterCore/runtime";

export interface ReadingNotesRequest {
  language: AppLanguage;
  book: ConfirmedBook;
  persona: PersonaCard;
  validationError?: string;
  characterCoreExperiment?: CharacterCoreExperimentMarker;
}

export interface ParticipantLabel {
  id: string;
  displayName: string;
  role: "moderator" | "reader" | "user";
}

export interface UtteranceRequest {
  language: AppLanguage;
  roomAtmosphere: RoomAtmosphere;
  book: ConfirmedBook;
  speaker: PersonaCard | "moderator";
  notes?: ReadingNotes;
  stage: StageId;
  task: UtteranceTask;
  recentTranscript: Utterance[];
  participants: ParticipantLabel[];
  activeTopic?: string;
  targetSpeaker?: string;
  userArgument?: { stance: number; paraphrase: string; personaReason?: string };
  allowShelfReference: boolean;
  validationError?: string;
  discussionFocus?: string;
  discussionOrigin?: "user" | "table";
  characterCoreExperiment?: CharacterCoreExperimentMarker;
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
  userDisplayName: string;
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
