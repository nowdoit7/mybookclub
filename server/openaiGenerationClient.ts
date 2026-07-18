import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

import {
  bookIdentificationSchema,
  readingNotesSchema,
  recapSchema,
  userStanceSchema,
  utteranceSchema,
} from "../src/api/contracts";
import type { BookIdentificationRequest } from "../src/api/contracts";
import {
  IncompleteGenerationError,
  InvalidStructuredOutputError,
  MissingConfigurationError,
  ModelRefusalError,
} from "../src/api/errors";
import type {
  GenerationClient,
  ReadingNotesRequest,
  RecapRequest,
  UserStanceRequest,
  UtteranceRequest,
} from "../src/api/generationClient";
import { validateBookIdentificationQuality } from "../src/engine/qualityValidation";

const COPYRIGHT_RULE =
  "Discuss themes, scenes, and interpretations. Quote at most a short phrase and never reproduce passages.";

const languageRule = (language: "en" | "ko" | undefined) =>
  language === "ko"
    ? "Write all reader-facing content in natural Korean. Keep book and author names in the form most familiar to Korean readers."
    : "Write all reader-facing content in natural English.";

interface GenerationProfile {
  reasoningEffort: "none" | "low";
  maxOutputTokens: number;
}

function utteranceTaskDirective(input: UtteranceRequest): string {
  switch (input.task) {
    case "TOPIC_OPEN":
      return `State this exact code-selected question verbatim and do not substitute another topic: ${input.activeTopic}`;
    case "TOPIC_POSITION":
      return "Lead with one contestable claim from this persona's lens and support it with scene-level evidence. Do not settle for a balanced both-sides conclusion.";
    case "CHALLENGE_USER":
      return "Address the user's paraphrased claim directly, state the private-note reason that conflicts with it, and ask one pointed question. Respectfully but firmly challenge; do not concede.";
    case "DEVILS_ADVOCATE":
      return "Challenge the user's paraphrased claim with the strongest plausible counterreading and one pointed question. Do not merely summarize the existing consensus.";
    case "REACT_TO_USER_SCENE":
      return "Use the persona's lens to add a consequence or contradiction the user's scene reading missed. Do not simply praise or paraphrase the user.";
    case "PERSONA_EXCHANGE":
      return "Directly disagree with or materially complicate the named speaker's claim. Identify what their reading misses and add different evidence; do not begin with generic agreement.";
    case "CLOSING_REFLECTION":
      return "State explicitly what remained firm and what new pressure the discussion introduced. Avoid formulaic phrasing such as 'my view did not change; it only sharpened,' and do not claim movement that did not occur.";
    case "DISCUSSION_SUMMARY":
      return "Give a substantive spoken summary: name the central disagreement, the strongest unresolved counterclaim, and any genuine movement, then bridge naturally to the written recap. Base it only on the supplied conversation and do not introduce a new opinion.";
    default:
      return "Perform the named task directly.";
  }
}

function findRefusal(response: unknown): string | undefined {
  const candidate = response as {
    output?: Array<{ content?: Array<{ type?: string; refusal?: string }> }>;
  };
  return candidate.output
    ?.flatMap((item) => item.content ?? [])
    .find((item) => item.type === "refusal")?.refusal;
}

export function requireParsedOutput<T>(response: unknown): T {
  const refusal = findRefusal(response);
  if (refusal) throw new ModelRefusalError(refusal);

  const candidate = response as {
    status?: string;
    incomplete_details?: { reason?: string } | null;
    output_parsed?: T | null;
  };
  if (candidate.status === "incomplete") {
    throw new IncompleteGenerationError(candidate.incomplete_details?.reason);
  }
  if (candidate.output_parsed === undefined || candidate.output_parsed === null) {
    throw new InvalidStructuredOutputError();
  }
  return candidate.output_parsed;
}

export class OpenAIGenerationClient implements GenerationClient {
  private readonly client: OpenAI;

  constructor(
    apiKey: string | undefined,
    private readonly model = "gpt-5.6",
  ) {
    if (!apiKey) {
      throw new MissingConfigurationError("OPENAI_API_KEY is not configured.");
    }
    this.client = new OpenAI({
      apiKey,
      timeout: 45_000,
      maxRetries: 2,
    });
  }

  private async parse<T>(
    schema: z.ZodType<T>,
    schemaName: string,
    system: string,
    user: string,
    profile: GenerationProfile,
  ): Promise<T> {
    const response = await this.client.responses.parse(
      {
        model: this.model,
        store: false,
        reasoning: { effort: profile.reasoningEffort },
        max_output_tokens: profile.maxOutputTokens,
        input: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        text: { format: zodTextFormat(schema, schemaName) },
      },
      { timeout: 45_000, maxRetries: 2 },
    );

    return schema.parse(requireParsedOutput<T>(response));
  }

  async identifyBook(input: BookIdentificationRequest) {
    let validationError: string | undefined;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const output = await this.parse(
        bookIdentificationSchema,
        "book_identification",
        `Identify the requested book without claiming external verification. Return exactly three crisp, complete discussion questions. The summary must be 4-6 sentences. ${languageRule(input.language)} ${COPYRIGHT_RULE}`,
        `Book title: ${input.title}\nAuthor hint: ${input.author ?? "not provided"}${
          validationError ? `\nRepair the previous output: ${validationError}` : ""
        }`,
        { reasoningEffort: "low", maxOutputTokens: 900 },
      );
      const issues = validateBookIdentificationQuality(output);
      if (issues.length === 0) return output;
      validationError = issues.join("; ");
    }

    throw new Error(`Book identification failed quality validation: ${validationError}`);
  }

  async generateReadingNotes(input: ReadingNotesRequest) {
    return this.parse(
      readingNotesSchema,
      "private_reading_notes",
      `You are ${input.persona.name}. Stay committed to the supplied persona card. These are private anchor notes, not dialogue. Build one contestable thesis from this persona's specific lens; do not collapse into a generic balanced verdict. Preserve every candidate topic verbatim and in order. overall_take must be 2-3 sentences. ${languageRule(input.language)} ${COPYRIGHT_RULE}`,
      JSON.stringify({
        book: input.book,
        persona: input.persona,
        repair: input.validationError ?? null,
      }),
      { reasoningEffort: "low", maxOutputTokens: 2_200 },
    );
  }

  async generateUtterance(input: UtteranceRequest) {
    const isModerator = input.speaker === "moderator";
    const lengthRule = isModerator ? "Use 1-3 sentences." : "Use 2-3 sentences.";
    const taskDirective = utteranceTaskDirective(input);
    return this.parse(
      utteranceSchema,
      "table_utterance",
      `${
        isModerator
          ? "You are Alex, a warm, crisp, unflappable book-club moderator. Do not offer your own opinion unless the task is DEVILS_ADVOCATE."
          : `You are ${
              input.speaker === "moderator" ? "Alex" : input.speaker.name
            }. Stay in character and anchored to your private notes.`
      } ${lengthRule} ${taskDirective} ${languageRule(input.language)} On substantive persona turns, preserve the persona's distinct lens and do not repeat an established consensus unless adding new evidence. Mention persuasion only when the speaker's position genuinely changes, and acknowledge any change explicitly; otherwise do not use formulaic agreement. Shelf reference is ${
        input.allowShelfReference ? "allowed once if illuminating" : "not allowed; shelf_ref must be null"
      }. ${COPYRIGHT_RULE}`,
      JSON.stringify({
        book: input.book,
        persona: isModerator ? null : input.speaker,
        private_notes: input.notes ?? null,
        stage: input.stage,
        task: input.task,
        topic: input.activeTopic ?? null,
        target_speaker: input.targetSpeaker ?? null,
        user_argument: input.userArgument ?? null,
        recent_conversation: input.recentTranscript.slice(-12),
        repair: input.validationError ?? null,
      }),
      { reasoningEffort: "low", maxOutputTokens: 450 },
    );
  }

  async extractUserStance(input: UserStanceRequest) {
    return this.parse(
      userStanceSchema,
      "user_stance",
      `Map the user's stated position to -2 through +2 on the supplied target. Paraphrase in one neutral line; do not strengthen or soften their claim. ${languageRule(input.language)}`,
      JSON.stringify(input),
      { reasoningEffort: "none", maxOutputTokens: 180 },
    );
  }

  async generateRecap(input: RecapRequest) {
    const safeInput = {
      date: input.date,
      book: {
        title: input.book.title,
        author: input.book.author,
        candidateTopics: input.book.candidateTopics,
      },
      participants: input.personas.map(({ id, name }) => ({ id, name })),
      transcript: input.transcript,
      personaStances: input.personaStances,
      userStances: input.userStances,
      repair: input.validationError ?? null,
    };
    const recapStructure =
      input.language === "ko"
        ? `Start with "# {book title} — 리딩 테이블 모임 기록, {provided date}". Then use exactly these level-two headings: "토론 요약", "모두의 최종 입장", "불꽃 — 실제로 부딪힌 순간", "놓치기 쉬운 장면", "책장에서 꺼낸 연결", and "잠들기 전 생각할 질문".`
        : `Start with "# {book title} — Reading Table Recap, {provided date}". Then use exactly these level-two headings: "Discussion summary", "Where everyone landed", "Sparks — moments of real disagreement", "Scenes you might have missed", "From the shelves", and "A question to sleep on".`;
    return this.parse(
      recapSchema,
      "meeting_recap",
      `${recapStructure} Include a Markdown stance table in the final-position section. In the shelf section, include only books explicitly present in transcript shelfRef fields; if none, say no shelf comparison was used. ${languageRule(input.language)} Quote only this session's generated transcript, never the source book. Do not invent or reveal private reading notes. ${COPYRIGHT_RULE}`,
      JSON.stringify(safeInput),
      { reasoningEffort: "low", maxOutputTokens: 2_200 },
    );
  }
}
