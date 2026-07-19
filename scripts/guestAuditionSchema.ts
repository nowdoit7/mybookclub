import { z } from "zod";

export const genreFamilySchema = z.enum([
  "literary_fiction",
  "science_fiction",
  "fantasy_myth",
  "mystery_crime",
  "romance",
  "horror_gothic",
  "history_politics",
  "science_nature",
  "philosophy_religion",
  "psychology_self_help",
  "business_economics",
  "biography_memoir",
  "poetry_drama",
  "children_young_adult",
]);

export const auditionDimensions = [
  "bookSpecificity",
  "novelInterpretation",
  "personaCoherence",
  "conversationalParticipation",
  "humanNaturalness",
  "authorityBalance",
  "bookCenteredness",
  "repeatResistance",
  "discussionContribution",
  "returnInterest",
] as const;

const scoreSchema = z.number().min(1).max(5);

export const dimensionScoresSchema = z
  .object(Object.fromEntries(auditionDimensions.map((dimension) => [dimension, scoreSchema])) as {
    [Dimension in (typeof auditionDimensions)[number]]: typeof scoreSchema;
  })
  .strict();

export const hardFailureSchema = z.enum([
  "fake_historical_quote",
  "literal_modern_experience",
  "invented_biography",
  "copyright_reproduction",
  "authority_submission",
  "moderator_takeover",
  "cross_book_leak",
  "genre_mismatch",
  "structure_violation",
]);

const auditionTurnSchema = z
  .object({
    id: z.string().min(1).max(80),
    speaker: z.string().min(1).max(80),
    speakerType: z.enum(["moderator", "user", "reader", "candidate"]),
    text: z.string().min(1).max(2_000),
  })
  .strict();

const auditionSampleSchema = z
  .object({
    id: z.string().regex(/^sample-[a-z]$/u),
    turns: z.array(auditionTurnSchema).min(3).max(20),
  })
  .strict();

export const guestAuditionCaseSchema = z
  .object({
    version: z.literal(1),
    id: z.string().regex(/^[a-z0-9-]+$/u),
    language: z.enum(["en", "ko"]),
    book: z
      .object({
        title: z.string().min(1).max(200),
        author: z.string().min(1).max(120),
        genreFamily: genreFamilySchema,
        sourceArtifacts: z.array(z.string().min(1).max(500)).min(1).max(8),
      })
      .strict(),
    guestCandidate: z
      .object({
        id: z.string().regex(/^[a-z0-9-]+$/u),
        displayName: z.string().min(1).max(120),
        category: z.enum(["emotional", "analytical", "contextual"]),
        portrayalBasis: z.array(z.string().min(20).max(500)).min(3).max(8),
        sourceUrls: z.array(z.string().url()).min(2).max(8),
      })
      .strict(),
    fixedContext: z
      .object({
        topic: z.string().min(10).max(500),
        userClaims: z.array(z.string().min(10).max(1_000)).min(1).max(6),
        allowedBookEvidence: z.array(z.string().min(10).max(1_000)).min(3).max(12),
      })
      .strict(),
    guestSampleId: z.string().regex(/^sample-[a-z]$/u),
    samples: z.array(auditionSampleSchema).length(2),
  })
  .strict()
  .superRefine((value, context) => {
    const ids = value.samples.map(({ id }) => id);
    if (new Set(ids).size !== 2) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "sample ids must be unique" });
    }
    if (!ids.includes(value.guestSampleId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "guestSampleId must name a sample" });
    }

    for (const sample of value.samples) {
      const turnIds = sample.turns.map(({ id }) => id);
      if (new Set(turnIds).size !== turnIds.length) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: `${sample.id} turn ids must be unique`,
        });
      }
    }

    const [firstSample, secondSample] = value.samples;
    if (!firstSample || !secondSample) return;

    const candidatePositions = (sample: typeof firstSample) =>
      sample.turns.flatMap((turn, index) => (turn.speakerType === "candidate" ? [index] : []));
    const firstCandidatePositions = candidatePositions(firstSample);
    const secondCandidatePositions = candidatePositions(secondSample);
    if (
      firstCandidatePositions.length === 0 ||
      JSON.stringify(firstCandidatePositions) !== JSON.stringify(secondCandidatePositions)
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "samples must place the same non-zero number of candidate turns in the same positions",
      });
    }

    const fixedTurns = (sample: typeof firstSample) =>
      sample.turns
        .filter(({ speakerType }) => speakerType !== "candidate")
        .map(({ speaker, speakerType, text }) => ({ speaker, speakerType, text }));
    if (JSON.stringify(fixedTurns(firstSample)) !== JSON.stringify(fixedTurns(secondSample))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "non-candidate turns must be identical and ordered equally across samples",
      });
    }

    const candidateText = (sample: typeof firstSample) =>
      sample.turns
        .filter(({ speakerType }) => speakerType === "candidate")
        .map(({ text }) => text);
    if (JSON.stringify(candidateText(firstSample)) === JSON.stringify(candidateText(secondSample))) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "candidate turns must differ across samples",
      });
    }
  });

const sampleEvaluationSchema = z
  .object({
    sampleId: z.string().regex(/^sample-[a-z]$/u),
    scores: dimensionScoresSchema,
    citedTurnIds: z.array(z.string().min(1).max(80)).min(1).max(12),
    rationale: z.string().min(40).max(2_000),
  })
  .strict();

export const guestAuditionEvaluationSchema = z
  .object({
    version: z.literal(1),
    caseId: z.string().regex(/^[a-z0-9-]+$/u),
    evaluatorId: z.string().regex(/^[a-z0-9-]+$/u),
    evaluations: z.array(sampleEvaluationSchema).length(2),
    preferredSampleId: z.string().regex(/^sample-[a-z]$/u),
    hardFailures: z.array(
      z
        .object({
          code: hardFailureSchema,
          turnId: z.string().min(1).max(80),
          detail: z.string().min(20).max(1_000),
        })
        .strict(),
    ),
    redTeamNotes: z.string().min(20).max(2_000),
  })
  .strict()
  .superRefine((value, context) => {
    const sampleIds = value.evaluations.map(({ sampleId }) => sampleId);
    if (new Set(sampleIds).size !== 2) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "evaluated sample ids must be unique" });
    }
    if (!sampleIds.includes(value.preferredSampleId)) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "preferredSampleId must be evaluated" });
    }
  });

export type GuestAuditionCase = z.infer<typeof guestAuditionCaseSchema>;
export type GuestAuditionEvaluation = z.infer<typeof guestAuditionEvaluationSchema>;
export type DimensionScores = z.infer<typeof dimensionScoresSchema>;
