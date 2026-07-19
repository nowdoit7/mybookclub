import { createHash } from "node:crypto";

import { z } from "zod";

import { countSentences } from "../src/engine/sentenceValidation";
import {
  guestAuditionCaseSchema,
  type GuestAuditionCase,
} from "./guestAuditionSchema";

export const liveGuestTurnSchema = z
  .object({
    utterance: z.string().min(20).max(600),
  })
  .strict();

export const liveGuestOutputSchema = z
  .object({
    turns: z.array(liveGuestTurnSchema).length(2),
  })
  .strict()
  .superRefine((value, context) => {
    value.turns.forEach((turn, index) => {
      const sentenceCount = countSentences(turn.utterance);
      if (sentenceCount < 2 || sentenceCount > 4) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["turns", index, "utterance"],
          message: `turn ${index + 1} must contain 2-4 sentences, found ${sentenceCount}`,
        });
      }
    });
  });

export interface BlindAuditionPacket {
  caseId: string;
  language: "en" | "ko";
  book: GuestAuditionCase["book"];
  fixedContext: GuestAuditionCase["fixedContext"];
  samples: GuestAuditionCase["samples"];
}

function sampleIdFor(seed: string): "sample-a" | "sample-b" {
  return createHash("sha256").update(seed).digest()[0]! % 2 === 0 ? "sample-a" : "sample-b";
}

function remapTurns(
  source: GuestAuditionCase["samples"][number],
  sampleId: "sample-a" | "sample-b",
  generatedTurns?: string[],
): GuestAuditionCase["samples"][number] {
  let candidateIndex = 0;
  const prefix = sampleId === "sample-a" ? "a" : "b";
  return {
    id: sampleId,
    turns: source.turns.map((turn, index) => {
      const text =
        turn.speakerType === "candidate" && generatedTurns
          ? generatedTurns[candidateIndex++]
          : turn.text;
      if (!text) throw new Error(`Missing generated candidate turn ${candidateIndex}.`);
      return {
        ...turn,
        id: `${prefix}${index + 1}`,
        speaker: turn.speakerType === "candidate" ? "Reader X" : turn.speaker,
        text,
      };
    }),
  };
}

export function buildLiveAuditionCase(input: {
  id: string;
  template: GuestAuditionCase;
  candidate: GuestAuditionCase["guestCandidate"];
  generatedTurns: string[];
}): GuestAuditionCase {
  if (input.generatedTurns.length !== 2) {
    throw new Error(`Expected exactly 2 generated turns, found ${input.generatedTurns.length}.`);
  }
  const baseline = input.template.samples.find(
    ({ id }) => id !== input.template.guestSampleId,
  );
  if (!baseline) throw new Error(`No baseline sample found for ${input.template.id}.`);

  const guestSampleId = sampleIdFor(input.id);
  const baselineSampleId = guestSampleId === "sample-a" ? "sample-b" : "sample-a";
  const samples = [
    remapTurns(baseline, baselineSampleId),
    remapTurns(baseline, guestSampleId, input.generatedTurns),
  ].sort((left, right) => left.id.localeCompare(right.id));

  return guestAuditionCaseSchema.parse({
    version: 1,
    id: input.id,
    language: input.template.language,
    book: input.template.book,
    guestCandidate: input.candidate,
    fixedContext: input.template.fixedContext,
    guestSampleId,
    samples,
  });
}

export function toBlindPacket(auditionCase: GuestAuditionCase): BlindAuditionPacket {
  return {
    caseId: auditionCase.id,
    language: auditionCase.language,
    book: auditionCase.book,
    fixedContext: auditionCase.fixedContext,
    samples: auditionCase.samples,
  };
}
