import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

import {
  bookIdentificationSchema,
  bookIdentificationModelSchema,
  discussionFocusSchema,
  readingNotesSchema,
  recapSchema,
  userStanceSchema,
  utteranceSchema,
} from "../src/api/contracts";
import type {
  BookIdentificationModelOutput,
  BookIdentificationRequest,
} from "../src/api/contracts";
import {
  IncompleteGenerationError,
  InvalidStructuredOutputError,
  MissingConfigurationError,
  ModelRefusalError,
} from "../src/api/errors";
import type {
  GenerationClient,
  DiscussionFocusRequest,
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

function roomAtmosphereRule(atmosphere: UtteranceRequest["roomAtmosphere"]): string {
  const warmth = atmosphere.warmth >= 0.65 ? "open and generous" : atmosphere.warmth < 0.4 ? "reserved" : "attentive";
  const playfulness =
    atmosphere.playfulness >= 0.6
      ? "light wit is naturally available"
      : atmosphere.playfulness < 0.3
        ? "humor is currently sparse"
        : "occasional humor may fit";
  const tension =
    atmosphere.tension >= 0.62
      ? "the disagreement is visibly tense and should stay specific without hostility"
      : atmosphere.tension < 0.35
        ? "the room is low-tension"
        : "the room has a clear but manageable disagreement";
  const energy = atmosphere.energy >= 0.65 ? "energetic" : atmosphere.energy < 0.4 ? "quiet and reflective" : "measured";
  return `Emergent room atmosphere: ${warmth}, ${energy}; ${playfulness}; ${tension}. Adapt delivery subtly while preserving the speaker's own voice and position. Do not imitate the user's wording, force jokes, or turn the whole group into one personality.`;
}

interface GenerationProfile {
  reasoningEffort: "none" | "low" | "medium";
  maxOutputTokens: number;
}

function utteranceTaskDirective(input: UtteranceRequest): string {
  switch (input.task) {
    case "WELCOME":
      return "Welcome everyone, say that book discussion will begin after introductions, and invite the readers to meet one another. Do not preview interpretations.";
    case "PERSONA_INTRODUCTION":
      return "Give a social introduction only: name, occupation or life context, and one natural reading habit. Do not dump the persona card or recite demographic details mechanically. Do not analyze or give an opinion on the current book.";
    case "INVITE_USER":
      return "Invite the user to share who they are and what brought them to this table. Do not require a book opinion yet.";
    case "FIRST_IMPRESSIONS_OPEN":
      return "Briefly thank the user for the introduction, make a natural transition into the book, and invite everyone's first impressions.";
    case "FIRST_IMPRESSION":
      return "Give a personal first reaction anchored in private notes. This is independent testimony, not debate: do not agree with, quote, praise, rebut, correct, or cross-examine another participant.";
    case "OPEN_PERSONA_POSITION":
      return "State one committed answer to the active topic from your private notes. Address the supplied reader directly and give scene-level evidence; do not turn toward the user or summarize the room.";
    case "CHALLENGE_PERSONA":
      return "Challenge the supplied reader's most recent claim directly. Name the exact point you reject, offer conflicting scene-level evidence, and ask that reader one genuine pointed question; do not turn toward the user.";
    case "RESPOND_TO_PERSONA":
      return "Answer the supplied reader's latest argument directly. Defend, refine, or explicitly concede one point while keeping a real disagreement alive; do not turn toward the user or summarize the room.";
    case "MEMORABLE_SCENE":
      return "Independently name one specific scene and explain the personal reason it stayed with you. Do not begin by agreeing with, quoting, praising, or answering another participant. Sound like a reader remembering a book, not a lecturer presenting a theme.";
    case "TOPIC_OPEN":
      return `Briefly name the supplied thread from the earlier conversation, then state this exact code-selected question verbatim without substituting another topic: ${input.activeTopic}`;
    case "ASK_USER_POSITION":
      return "After the two readers' disagreement, invite the user to enter with their own position on the active topic. Do not presume which side they support.";
    case "CHALLENGE_USER":
      return "Address the user's paraphrased claim directly, state the private-note reason that conflicts with it, and ask one pointed question. Respectfully but firmly challenge; do not concede.";
    case "DEVILS_ADVOCATE":
      return "Challenge the user's paraphrased claim with the strongest plausible counterreading and one pointed question. Do not merely summarize the existing consensus.";
    case "REACT_TO_USER_SCENE":
      return "Use the persona's lens to add a consequence or contradiction the user's scene reading missed. Do not simply praise or paraphrase the user.";
    case "RESPOND_TO_USER_REPLY":
      return "Answer the user's reply to your pointed question directly. Say whether it resolves your objection and name one precise disagreement that remains. Do not ask another question, reset the topic, or pretend to agree.";
    case "SUPPORT_USER":
      return "Support the user's updated claim with different scene-level evidence, address the challenger directly, and name one real limit or risk in the user's position. Do not merely praise or repeat the user.";
    case "TOPIC_CLOSE":
      return "Name the precise disagreement that remains open and close this topic without declaring a winner or inventing consensus. Bridge naturally toward the closing round.";
    case "CLOSING_REFLECTION":
      return "Respond directly to the user's latest closing thought in exactly two short sentences. Name either one idea you are carrying away or one disagreement that remains. Do not recite a before-and-after formula or summarize the whole meeting.";
    case "DISCUSSION_SUMMARY":
      return "In 2-3 concise sentences, name the central disagreement, the strongest unresolved counterclaim, and any genuine movement, then bridge naturally to the written recap. Base it only on the supplied conversation and do not introduce a new opinion.";
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

export function extractWebSearchSources(response: unknown): Array<{ url: string }> {
  const candidate = response as {
    output?: Array<{
      type?: string;
      action?: { type?: string; sources?: Array<{ url?: string }> };
      content?: Array<{
        annotations?: Array<{ type?: string; url?: string }>;
      }>;
    }>;
  };
  const urls: string[] = [];
  const add = (url: string | undefined) => {
    if (!url?.startsWith("https://") || urls.includes(url)) return;
    urls.push(url);
  };

  for (const item of candidate.output ?? []) {
    for (const content of item.content ?? []) {
      for (const annotation of content.annotations ?? []) {
        if (annotation.type === "url_citation") add(annotation.url);
      }
    }
  }
  for (const item of candidate.output ?? []) {
    if (item.type !== "web_search_call" || item.action?.type !== "search") continue;
    for (const source of item.action.sources ?? []) add(source.url);
  }

  return urls.slice(0, 3).map((url) => ({ url }));
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
    const requestedScope = input.scope ?? "single_book";

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.client.responses.parse(
        {
          model: this.model,
          store: false,
          reasoning: { effort: "low" },
          max_output_tokens: 1_400,
          tools: [
            {
              type: "web_search",
              search_context_size: requestedScope === "series" ? "medium" : "low",
            },
          ],
          tool_choice: "required",
          include: ["web_search_call.action.sources"],
          input: [
            {
              role: "system",
              content: `Verify a requested published work using web search before describing it. Never rely on model memory alone. The requested scope is binding: single_book means one specific volume or standalone work; series means the complete published series, not merely its first volume. Return work_scope exactly as requested. For a verified single book, canonical_title names that book and included_titles contains exactly that one title. For a verified series, canonical_title names the series and included_titles lists every component volume in publication order. Mark verification_status as verified only when the requested scope, title, author, and component list match at least two independent retrieved sources; use ambiguous for conflicting or multiple plausible matches, and not_found when no trustworthy match exists. Prefer publisher, author, library, bookseller, or reputable review records. Do not put URLs, Markdown links, citation markers, domains, or source labels into summary, titles, topics, or verification_note; application code extracts source URLs from tool metadata. Return exactly three crisp, complete discussion questions covering the requested scope. For verified works, the summary must be 4-6 sentences and cover only the requested scope. For unresolved works, use an honest 4-sentence explanation and generic questions without inventing plot details. ${languageRule(input.language)} ${COPYRIGHT_RULE}`,
            },
            {
              role: "user",
              content: `Requested scope: ${requestedScope}\nBook or series title: ${input.title}\nAuthor hint: ${input.author ?? "not provided"}${
                validationError ? `\nRepair the previous output: ${validationError}` : ""
              }`,
            },
          ],
          text: {
            format: zodTextFormat(bookIdentificationModelSchema, "verified_book_identification"),
          },
        },
        { timeout: 45_000, maxRetries: 2 },
      );
      const parsed = bookIdentificationModelSchema.parse(
        requireParsedOutput<BookIdentificationModelOutput>(response),
      );
      const sources = extractWebSearchSources(response);
      const wasDowngraded = parsed.verification_status === "verified" && sources.length < 2;
      const output = bookIdentificationSchema.parse({
        ...parsed,
        verification_status: wasDowngraded ? "ambiguous" : parsed.verification_status,
        verification_note: wasDowngraded
          ? input.language === "ko"
            ? "독립적인 웹 출처 두 곳을 확보하지 못해 검증 완료로 처리하지 않았습니다. 제목과 저자를 확인해 다시 검색해주세요."
            : "Fewer than two independent web sources were retrieved, so this book was not marked verified. Check the title and author, then search again."
          : parsed.verification_note,
        sources,
      });
      const issues = validateBookIdentificationQuality(output);
      if (parsed.work_scope !== requestedScope) {
        issues.push(`work_scope must equal the requested scope: ${requestedScope}`);
      }
      if (issues.length === 0) return output;
      validationError = issues.join("; ");
    }

    throw new Error(`Book identification failed quality validation: ${validationError}`);
  }

  async generateReadingNotes(input: ReadingNotesRequest) {
    return this.parse(
      readingNotesSchema,
      "private_reading_notes",
      `You are ${input.persona.name}. Stay committed to the supplied persona card. These are private anchor notes, not dialogue. Build one contestable thesis from this persona's specific lens; do not collapse into a generic balanced verdict. Preserve every candidate topic verbatim and in order. overall_take must be 2-3 sentences. Include a genuine personal reaction, an unresolved doubt, evidence that could change your mind, and a question you actually want to ask another reader. These must differ from the thesis instead of restating it. ${languageRule(input.language)} ${COPYRIGHT_RULE}`,
      JSON.stringify({
        book: input.book,
        persona: input.persona,
        repair: input.validationError ?? null,
      }),
      { reasoningEffort: "medium", maxOutputTokens: 2_800 },
    );
  }

  async extractDiscussionFocus(input: DiscussionFocusRequest) {
    return this.parse(
      discussionFocusSchema,
      "discussion_focus",
      `Extract discussion pressure from the supplied first-impression and memorable-scene conversation. Score each supplied candidate topic from 0 to 2 for how strongly the actual conversation supports it, preserving every candidate topic verbatim and in order. Evidence must be a short phrase describing a concrete repeated remark, disagreement, question, or user request. Propose an emergent question only when the conversation clearly raises an important issue not covered by the candidates; otherwise return null fields and relevance 0. You extract evidence only; code makes the final topic choice. ${languageRule(input.language)} ${COPYRIGHT_RULE}`,
      JSON.stringify({
        book: input.book,
        candidate_topics: input.book.candidateTopics,
        conversation: input.transcript,
      }),
      { reasoningEffort: "low", maxOutputTokens: 900 },
    );
  }

  async generateUtterance(input: UtteranceRequest) {
    const isModerator = input.speaker === "moderator";
    const lengthRule = isModerator
      ? "Use 1-3 sentences."
      : input.task === "PERSONA_INTRODUCTION"
        ? "Use exactly 2 short sentences."
        : "Use 2-4 sentences.";
    const taskDirective = utteranceTaskDirective(input);
    const testimonyRule =
      input.task === "FIRST_IMPRESSION" || input.task === "MEMORABLE_SCENE"
        ? "This is independent testimony. Do not react to recent participants or use their remarks as your opening."
        : "React to one precise idea from the recent conversation when it is relevant.";
    return this.parse(
      utteranceSchema,
      "table_utterance",
      `${
        isModerator
          ? "You are Alex, a warm, crisp, unflappable book-club moderator. Do not offer your own opinion unless the task is DEVILS_ADVOCATE."
          : `You are ${
              input.speaker === "moderator" ? "Alex" : input.speaker.name
            }. Stay in character and anchored to your private notes.`
      } ${lengthRule} ${taskDirective} ${languageRule(input.language)} ${roomAtmosphereRule(input.roomAtmosphere)} On substantive persona turns, preserve the persona's distinct lens and do not repeat an established consensus unless adding new evidence. ${testimonyRule} Let occupation, uncertainty, and speech habits show naturally; do not turn every response into a polished conclusion. Avoid generic praise followed by "but," repeated "both can coexist" constructions, and abstract mini-essays. Mention persuasion only when the speaker's position genuinely changes, and acknowledge any change explicitly. Shelf reference is ${
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
        discussion_focus: input.discussionFocus ?? null,
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
      `${recapStructure} Keep the discussion summary to 3-5 sentences, the sparks section to at most 2 bullets, and the scenes section to at most 3 bullets. The final section must contain exactly one substantive question and exactly one question mark. Include a concise Markdown stance table in the final-position section. In the shelf section, include only books explicitly present in transcript shelfRef fields; if none, say no shelf comparison was used. Do not imply that an exchange happened unless it appears in the transcript. ${languageRule(input.language)} Quote only this session's generated transcript, never the source book. Do not invent or reveal private reading notes. ${COPYRIGHT_RULE}`,
      JSON.stringify(safeInput),
      { reasoningEffort: "low", maxOutputTokens: 1_400 },
    );
  }
}
