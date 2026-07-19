import "dotenv/config";

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

import { requireParsedOutput } from "../server/openaiGenerationClient";
import {
  buildLiveAuditionCase,
  liveGuestOutputSchema,
  toBlindPacket,
} from "./guestAuditionLive";
import {
  guestAuditionCaseSchema,
  type GuestAuditionCase,
} from "./guestAuditionSchema";

const model = process.env.OPENAI_MODEL ?? "gpt-5.6";
if (!process.env.OPENAI_API_KEY) {
  throw new Error("OPENAI_API_KEY is required for the live guest audition.");
}

const client = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
  timeout: 60_000,
  maxRetries: 2,
});

const researchRoot = path.resolve("research", "guest-audition");
const outputRoot = path.join(researchRoot, "live", "2026-07-20");

async function readCase(file: string): Promise<GuestAuditionCase> {
  return guestAuditionCaseSchema.parse(
    JSON.parse(await readFile(path.join(researchRoot, "cases", file), "utf8")),
  );
}

const [pascalSource, newtonSource, smithSource] = await Promise.all([
  readCase("same-as-ever-pascal-r2.json"),
  readCase("three-body-newton-r2.json"),
  readCase("same-as-ever-adam-smith-r2.json"),
]);

const candidates = [pascalSource, newtonSource, smithSource].map(
  ({ guestCandidate }) => guestCandidate,
);
const templates = [
  { slug: "same-as-ever", source: pascalSource },
  { slug: "three-body", source: newtonSource },
];

function candidateTurnContexts(template: GuestAuditionCase) {
  const baseline = template.samples.find(({ id }) => id !== template.guestSampleId);
  if (!baseline) throw new Error(`No baseline sample found for ${template.id}.`);
  const positions = baseline.turns.flatMap((turn, index) =>
    turn.speakerType === "candidate" ? [index] : [],
  );
  return positions.map((position) =>
    baseline.turns.slice(0, position).map(({ speaker, speakerType, text }) => ({
      speaker,
      speakerType,
      text,
    })),
  );
}

async function generateCase(
  candidate: GuestAuditionCase["guestCandidate"],
  templateSlug: string,
  template: GuestAuditionCase,
) {
  const caseId = `live-${templateSlug}-${candidate.id.replace(/-r2$/u, "")}-r3`;
  const startedAt = performance.now();
  console.log(`[live] generating ${caseId}`);
  let output: z.infer<typeof liveGuestOutputSchema> | undefined;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await client.responses.parse(
        {
          model,
          store: false,
          reasoning: { effort: "low" },
          max_output_tokens: attempt === 1 ? 1_400 : 1_800,
          input: [
            {
              role: "system",
              content: `Write two turns for an explicitly imagined historical guest at a modern book club. The guest is a fallible reader, not an oracle, lecturer, moderator, or impersonation. Use the documented portrayal basis as an interpretive lens and the speech fingerprint as a light conversational habit, never as a costume. Use at most one fingerprint cue or recurring move per turn and do not repeat a cue across the two turns. Do not quote the historical figure, imitate archaic prose, invoke fame as authority, claim the person literally read a modern book, invent biography, or introduce book facts outside the supplied evidence. Stay centered on the exact book evidence and respond directly to the preceding participant. If the intellectual fit is weak, do not force a signature doctrine; contribute as a careful reader and allow the mismatch to remain visible. Each turn must contain 2-4 natural sentences. ${template.language === "ko" ? "Write in natural contemporary Korean." : "Write in natural contemporary English."} Return JSON only.`,
            },
            {
              role: "user",
              content: JSON.stringify({
                book: template.book,
                topic: template.fixedContext.topic,
                userClaims: template.fixedContext.userClaims,
                allowedBookEvidence: template.fixedContext.allowedBookEvidence,
                imaginedGuest: candidate,
                turnContexts: candidateTurnContexts(template),
                repair:
                  attempt === 1
                    ? null
                    : "The previous response did not satisfy the complete two-turn structured output. Be concise and return both turns.",
              }),
            },
          ],
          text: { format: zodTextFormat(liveGuestOutputSchema, "live_guest_turns") },
        },
        { timeout: 60_000, maxRetries: 2 },
      );
      output = liveGuestOutputSchema.parse(requireParsedOutput(response));
      break;
    } catch (error) {
      lastError = error;
      console.warn(`[live] ${caseId} attempt ${attempt} failed; ${attempt < 2 ? "retrying" : "stopping"}`);
    }
  }
  if (!output) throw lastError;
  const auditionCase = buildLiveAuditionCase({
    id: caseId,
    template,
    candidate,
    generatedTurns: output.turns.map(({ utterance }) => utterance),
  });
  const durationMs = Math.round(performance.now() - startedAt);
  console.log(`[live] completed ${caseId} in ${durationMs} ms`);
  return { auditionCase, durationMs };
}

await Promise.all([
  mkdir(path.join(outputRoot, "cases"), { recursive: true }),
  mkdir(path.join(outputRoot, "blind"), { recursive: true }),
  mkdir(path.join(outputRoot, "evaluations"), { recursive: true }),
]);

const existingCases = (await readdir(path.join(outputRoot, "cases"))).filter((file) =>
  file.endsWith(".json"),
);
if (existingCases.length > 0 && !process.argv.includes("--force")) {
  throw new Error(
    `Live audition artifacts already exist (${existingCases.length} cases). Pass --force only when a paid replacement run is intentional.`,
  );
}

const generated = [];
for (const template of templates) {
  for (const candidate of candidates) {
    const result = await generateCase(candidate, template.slug, template.source);
    generated.push(result);
    const { auditionCase } = result;
    await Promise.all([
      writeFile(
        path.join(outputRoot, "cases", `${auditionCase.id}.json`),
        `${JSON.stringify(auditionCase, null, 2)}\n`,
        "utf8",
      ),
      writeFile(
        path.join(outputRoot, "blind", `${auditionCase.id}.json`),
        `${JSON.stringify(toBlindPacket(auditionCase), null, 2)}\n`,
        "utf8",
      ),
    ]);
  }
}

await writeFile(
  path.join(outputRoot, "run.json"),
  `${JSON.stringify(
    {
      version: 1,
      generatedAt: new Date().toISOString(),
      model,
      callCount: generated.length,
      totalDurationMs: generated.reduce((sum, item) => sum + item.durationMs, 0),
      cases: generated.map(({ auditionCase, durationMs }) => ({
        id: auditionCase.id,
        durationMs,
      })),
    },
    null,
    2,
  )}\n`,
  "utf8",
);

console.log(
  `[live] wrote ${generated.length} blinded auditions to ${path.relative(process.cwd(), outputRoot)}`,
);
