import { z } from "zod";

const boundedString = (minLength: number, maxLength: number) =>
  z.string().min(minLength).max(maxLength);

export const bookVerificationStatusSchema = z.enum([
  "verified",
  "ambiguous",
  "not_found",
  "mock",
]);
export const bookScopeSchema = z.enum(["single_book", "series"]);
export const roomAtmosphereSchema = z
  .object({
    warmth: z.number().min(0).max(1),
    playfulness: z.number().min(0).max(1),
    tension: z.number().min(0).max(1),
    energy: z.number().min(0).max(1),
  })
  .strict();

const bookSourceSchema = z
  .object({ url: boundedString(8, 2_000) })
  .strict();

export const stageIdSchema = z.enum([
  "INTRO",
  "FIRST_IMPRESSIONS",
  "MEMORABLE_SCENES",
  "DISCUSSION",
  "WRAP_UP",
]);

export const utteranceTaskSchema = z.enum([
  "WELCOME",
  "PERSONA_INTRODUCTION",
  "INVITE_USER",
  "FIRST_IMPRESSIONS_OPEN",
  "FIRST_IMPRESSION",
  "OPEN_PERSONA_POSITION",
  "CHALLENGE_PERSONA",
  "RESPOND_TO_PERSONA",
  "CHALLENGE_USER",
  "DEVILS_ADVOCATE",
  "SCENES_OPEN",
  "MEMORABLE_SCENE",
  "REACT_TO_USER_SCENE",
  "TOPIC_OPEN",
  "ASK_USER_POSITION",
  "RESPOND_TO_USER_REPLY",
  "SUPPORT_USER",
  "TOPIC_CLOSE",
  "WRAP_OPEN",
  "CLOSING_REFLECTION",
  "DISCUSSION_SUMMARY",
]);

const shelfBookSchema = z
  .object({
    title: boundedString(1, 200),
    author: boundedString(1, 120),
    takeaway: boundedString(1, 400),
  })
  .strict();

const personaCardSchema = z
  .object({
    id: boundedString(1, 80),
    name: boundedString(1, 100),
    category: z.enum(["emotional", "analytical", "contextual"]),
    identity: boundedString(1, 600),
    roleLabel: z
      .object({ en: boundedString(1, 100), ko: boundedString(1, 100) })
      .strict(),
    socialIntroSeed: z
      .object({ en: boundedString(1, 240), ko: boundedString(1, 240) })
      .strict(),
    lens: boundedString(1, 600),
    voice: boundedString(1, 400),
    bookshelf: z.array(shelfBookSchema).max(8),
    behaviorRules: z.array(boundedString(1, 300)).max(12),
    forbidden: z.array(boundedString(1, 300)).max(12),
    avatarColor: boundedString(1, 40),
    socialTemperament: z
      .object({
        warmth: z.number().min(0).max(1),
        playfulness: z.number().min(0).max(1),
        directness: z.number().min(0).max(1),
        energy: z.number().min(0).max(1),
      })
      .strict(),
  })
  .strict();

const confirmedBookSchema = z
  .object({
    title: boundedString(1, 200),
    author: boundedString(1, 120),
    workScope: bookScopeSchema,
    includedTitles: z.array(boundedString(1, 200)).max(12),
    confirmedSummary: boundedString(80, 1200),
    mainCharacters: z.array(boundedString(1, 100)).max(8),
    candidateTopics: z.array(boundedString(1, 160)).length(3),
    verificationStatus: bookVerificationStatusSchema,
    verificationNote: boundedString(1, 500),
    sources: z.array(bookSourceSchema).max(3),
  })
  .strict();

const internalReadingNotesSchema = z
  .object({
    overallTake: boundedString(40, 600),
    overallStance: z.number().min(-2).max(2),
    stanceByTopic: z
      .array(
        z
          .object({
            topic: boundedString(1, 160),
            stance: z.number().min(-2).max(2),
            reason: boundedString(1, 300),
          })
          .strict(),
      )
      .length(3),
    keyScenes: z.array(boundedString(1, 240)).min(2).max(3),
    shelfConnections: z.array(boundedString(1, 300)).max(2),
    personalReaction: boundedString(20, 400),
    unresolvedQuestion: boundedString(10, 300),
    possibleRevision: boundedString(10, 300),
    questionForTable: boundedString(10, 300),
  })
  .strict();

const transcriptUtteranceSchema = z
  .object({
    speaker: boundedString(1, 100),
    text: boundedString(1, 4000),
    stance: z.number().min(-2).max(2).optional(),
    refersTo: boundedString(1, 100).optional(),
    shelfRef: boundedString(1, 200).optional(),
    stage: stageIdSchema,
  })
  .strict();

export const bookIdentificationRequestSchema = z
  .object({
    title: boundedString(1, 200),
    author: boundedString(1, 120).optional(),
    scope: bookScopeSchema.optional(),
    language: z.enum(["en", "ko"]).optional(),
  })
  .strict();

export const bookIdentificationModelSchema = z
  .object({
    canonical_title: boundedString(1, 200),
    author: boundedString(1, 120),
    work_scope: bookScopeSchema,
    included_titles: z.array(boundedString(1, 200)).max(12),
    summary: boundedString(80, 1200),
    main_characters: z.array(boundedString(1, 100)).max(8),
    candidate_topics: z.array(boundedString(1, 160)).length(3),
    verification_status: z.enum(["verified", "ambiguous", "not_found"]),
    verification_note: boundedString(1, 500),
  })
  .strict();

export const bookIdentificationSchema = bookIdentificationModelSchema
  .extend({
    verification_status: bookVerificationStatusSchema,
    sources: z.array(bookSourceSchema).max(3),
  })
  .strict();

export const readingNotesRequestSchema = z
  .object({
    language: z.enum(["en", "ko"]),
    book: confirmedBookSchema,
    persona: personaCardSchema,
    validationError: boundedString(1, 1200).optional(),
  })
  .strict();

export const utteranceRequestSchema = z
  .object({
    language: z.enum(["en", "ko"]),
    roomAtmosphere: roomAtmosphereSchema,
    book: confirmedBookSchema,
    speaker: z.union([personaCardSchema, z.literal("moderator")]),
    notes: internalReadingNotesSchema.optional(),
    stage: stageIdSchema,
    task: utteranceTaskSchema,
    recentTranscript: z.array(transcriptUtteranceSchema).max(12),
    activeTopic: boundedString(1, 160).optional(),
    targetSpeaker: boundedString(1, 100).optional(),
    userArgument: z
      .object({
        stance: z.number().min(-2).max(2),
        paraphrase: boundedString(1, 240),
        personaReason: boundedString(1, 600).optional(),
      })
      .strict()
      .optional(),
    allowShelfReference: z.boolean(),
    validationError: boundedString(1, 1200).optional(),
    discussionFocus: boundedString(1, 240).optional(),
  })
  .strict();

export const userStanceRequestSchema = z
  .object({
    language: z.enum(["en", "ko"]),
    text: boundedString(1, 4000),
    target: boundedString(1, 160),
    book: confirmedBookSchema,
  })
  .strict();

export const recapRequestSchema = z
  .object({
    language: z.enum(["en", "ko"]),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/u),
    book: confirmedBookSchema,
    personas: z.array(personaCardSchema).length(3),
    transcript: z.array(transcriptUtteranceSchema).min(1).max(80),
    personaStances: z.record(z.string(), z.number().min(-2).max(2)),
    userStances: z.record(
      z.string(),
      z
        .object({
          stance: z.number().min(-2).max(2),
          paraphrase: boundedString(1, 240),
        })
        .strict(),
    ),
    validationError: boundedString(1, 1200).optional(),
  })
  .strict();

export const readingNotesSchema = z
  .object({
    overall_take: boundedString(40, 600),
    overall_stance: z.number().min(-2).max(2),
    stance_by_topic: z
      .array(
        z
          .object({
            topic: boundedString(1, 160),
            stance: z.number().min(-2).max(2),
            reason: boundedString(1, 300),
          })
          .strict(),
      )
      .length(3),
    key_scenes: z.array(boundedString(1, 240)).min(2).max(3),
    shelf_connections: z.array(boundedString(1, 300)).max(2),
    personal_reaction: boundedString(20, 400),
    unresolved_question: boundedString(10, 300),
    possible_revision: boundedString(10, 300),
    question_for_table: boundedString(10, 300),
  })
  .strict();

export const discussionFocusRequestSchema = z
  .object({
    language: z.enum(["en", "ko"]),
    book: confirmedBookSchema,
    transcript: z.array(transcriptUtteranceSchema).min(1).max(40),
  })
  .strict();

export const discussionFocusSchema = z
  .object({
    topic_scores: z
      .array(
        z
          .object({
            topic: boundedString(1, 160),
            relevance: z.number().min(0).max(2),
            evidence: boundedString(1, 240),
          })
          .strict(),
      )
      .length(3),
    emergent_question: boundedString(1, 160).nullable(),
    emergent_relevance: z.number().min(0).max(2),
    emergent_evidence: boundedString(1, 240).nullable(),
  })
  .strict();

export const utteranceSchema = z
  .object({
    utterance: boundedString(1, 600),
    stance: z.number().min(-2).max(2).nullable(),
    refers_to: z.string().min(1).max(100).nullable(),
    shelf_ref: z.string().min(1).max(200).nullable(),
  })
  .strict();

export const userStanceSchema = z
  .object({
    stance: z.number().min(-2).max(2),
    paraphrase: boundedString(1, 240),
  })
  .strict();

export const recapSchema = z
  .object({
    markdown: boundedString(200, 8000),
  })
  .strict();

export type BookIdentificationRequest = z.infer<typeof bookIdentificationRequestSchema>;
export type UtteranceTask = z.infer<typeof utteranceTaskSchema>;
export type BookIdentificationOutput = z.infer<typeof bookIdentificationSchema>;
export type BookIdentificationModelOutput = z.infer<typeof bookIdentificationModelSchema>;
export type ReadingNotesOutput = z.infer<typeof readingNotesSchema>;
export type DiscussionFocusOutput = z.infer<typeof discussionFocusSchema>;
export type UtteranceOutput = z.infer<typeof utteranceSchema>;
export type UserStanceOutput = z.infer<typeof userStanceSchema>;
export type RecapOutput = z.infer<typeof recapSchema>;
