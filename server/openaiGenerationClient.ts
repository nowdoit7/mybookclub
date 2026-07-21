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
import { localizedSpeakerName } from "../src/localization";
import { isImaginedGuestId } from "../src/personas";
import {
  resolveGuestAuthorPerspective,
  type GuestAuthorPerspective,
} from "../src/personas/guestWorkRelations";
import type { AppLanguage, ConfirmedBook, PersonaCard } from "../src/types";

const COPYRIGHT_RULE =
  "Discuss themes, scenes, and interpretations. Quote at most a short phrase and never reproduce passages.";

const languageRule = (language: "en" | "ko" | undefined) =>
  language === "ko"
    ? "Write all reader-facing content in natural Korean. Keep book and author names in the form most familiar to Korean readers."
    : "Write all reader-facing content in natural English.";

const authorRelationshipRule = (perspective: GuestAuthorPerspective): string => {
  switch (perspective.relationship) {
    case "documented_author":
      return "The guest may identify themselves as this work's author, but authorship does not make their interpretation final or immune to challenge.";
    case "posthumous_compilation":
      return "The current edition was assembled or published after the guest's lifetime from notes or records. Never claim the guest completed, published, or planned the finished edition in its modern form.";
    case "traditional_attribution":
      return "The work is traditionally attributed to this guest. Never claim certain singular authorship; describe it only as a work or song handed down under the guest's name.";
    case "poetic_corpus":
      return "The current book presents surviving poems, songs, or fragments. Never claim the guest created or arranged the modern collected edition.";
    case "collected_works":
      return "The current book collects separately created pieces. Never claim the guest planned or published this exact collected edition as one work.";
  }
};

const imaginedGuestRule = (
  persona: PersonaCard | undefined,
  book?: ConfirmedBook,
) => {
  if (!persona?.imaginedGuest) return "";
  const authorPerspective = book
    ? resolveGuestAuthorPerspective(persona.id, book)
    : undefined;
  const grounding =
    persona.imaginedGuest.kind === "literary"
      ? "an imagined adaptation of a literary character grounded in the supplied canonical traits, not any screen portrayal"
      : persona.imaginedGuest.kind === "legendary"
        ? "an imagined reader grounded in an attributed literary tradition whose biography and singular authorship may be uncertain"
        : "an explicitly imagined reconstruction grounded in documented ideas";
  const ordinaryBookRule = authorPerspective
    ? `Verified book metadata and the audited guest-work registry match this guest to the current work. ${authorRelationshipRule(authorPerspective)} A task-specific rule controls the one permitted first-person relationship reference.`
    : "Never claim this figure literally read, wrote, or experienced the current book.";
  return `This speaker is ${grounding}. ${ordinaryBookRule} Never present generated dialogue as a real quotation, fabricate a private anecdote or undocumented hidden intention, imitate archaic diction, or invoke fame or authorship as authority. The UI and social introduction already disclose that this is an imagined guest, so never break immersion by announcing that status again. Reason by analogy, remain a fallible reader, and allow other participants to challenge the guest.`;
};

export function guestSignatureMomentRule(input: UtteranceRequest): string {
  if (input.speaker === "moderator" || !input.speaker.imaginedGuest) return "";
  const authorPerspective = resolveGuestAuthorPerspective(input.speaker.id, input.book);
  if (authorPerspective && input.task === "FIRST_IMPRESSION") {
    const frame = authorPerspective.firstPersonFrame[input.language];
    return `This is the guest's only author-perspective moment for the entire session. The first sentence must begin with the exact words ${JSON.stringify(frame)} and continue naturally from them; use that first-person relationship only once. Make one contestable interpretive claim about what the work attempts, where that attempt is vulnerable, or what modern readers may reasonably challenge. ${authorRelationshipRule(authorPerspective)} Do not invent a quotation, private memory, undocumented hidden intention, or definitive explanation of the work. Do not repeat the authorship relationship on later turns.`;
  }
  if (authorPerspective) {
    return "The guest's single author-perspective reference belongs only to the first-impression turn. Do not repeat that the guest wrote, created, transmitted, or left notes for the work on this turn. Debate as an equal participant from the resulting position, without using authorship as proof.";
  }
  if (input.task === "FIRST_IMPRESSION") {
    return "This is the guest's single signature moment for the entire session. In exactly one compact clause, embody one concrete element from documentedAchievement or signatureReadingMove as a distinction, image, question, or inference that sharpens the present interpretation. Perform the characteristic move instead of explaining it: never say 'my reading method', 'from my perspective', 'as someone who...', or an equivalent self-description. A named work or achievement is optional and should appear only when grammatically inseparable from the current claim. Do not recite a résumé, imitate a quotation, use fame as proof, become a history lecture, or announce that the guest is imaginary. Do not repeat this biographical or achievement link on later turns.";
  }
  return "The guest's signature achievement belongs only to the first-impression turn. Do not mention biography, famous works, achievements, or signature touchstones again on this turn; keep only the resulting habit of thought.";
}

export function guestReadingNotesRule(
  persona: PersonaCard,
  book: ConfirmedBook,
  language: AppLanguage,
): string {
  const authorPerspective = resolveGuestAuthorPerspective(persona.id, book);
  if (!authorPerspective) return "";
  const frame = authorPerspective.firstPersonFrame[language];
  return `The audited registry matches this guest to the verified current work. Prepare a contestable author-perspective thesis that can later support a first sentence beginning with ${JSON.stringify(frame)}. Separate documented public context from interpretive reconstruction, identify a point where present-day readers may reasonably resist the work, and never invent a quotation, private anecdote, undocumented hidden intention, or final-authority claim. ${authorRelationshipRule(authorPerspective)}`;
}

export function personaPromptData(persona: PersonaCard, includeSignature: boolean) {
  const { imaginedGuest, ...base } = persona;
  if (!imaginedGuest) return base;
  return {
    ...base,
    imaginedGuest: includeSignature
      ? {
          kind: imaginedGuest.kind,
          documentedAchievement: imaginedGuest.documentedAchievement,
          signatureReadingMove: imaginedGuest.signatureReadingMove,
        }
      : { kind: imaginedGuest.kind },
  };
}

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
      return "Welcome everyone, say that book discussion will begin after introductions, and invite the readers to meet one another. Keep this purely social: do not ask for a reaction to the book, a memorable moment, a reason for choosing it, or any interpretation.";
    case "PERSONA_INTRODUCTION":
      return input.speaker !== "moderator" && isImaginedGuestId(input.speaker.id)
        ? "Give a warm, natural social introduction. In one brief clause, identify the speaker as an imagined reader shaped by documented ideas, then naturally state the conversational question or habit in socialIntroSeed. Do not recite a disclaimer, claim literal presence, modern employment, memory of the book, or historical endorsement. Keep this social and do not analyze the current book."
        : "Give a social introduction only. Say the name and broad life context, then weave in the persona card's socialIntroSeed as casual small talk rather than a résumé. Do not force a reading-habit formula, explain the persona lens, analyze the current book, or say why this particular book was chosen.";
    case "INVITE_USER":
      return "Invite the user to share who they are through work, everyday life, or their current relationship with reading. Keep this purely social: do not ask why they chose the current book, what they thought of it, or which scene stayed with them.";
    case "FIRST_IMPRESSIONS_OPEN":
      return "Briefly thank the user for the introduction, make a natural transition into the book, and invite an overall first feeling, judgment, or question. Explicitly save concrete scenes and passages for the next stage.";
    case "FIRST_IMPRESSION":
      return "Give a personal overall reaction anchored in private notes. This is independent testimony, not debate: do not agree with, quote, praise, rebut, correct, or cross-examine another participant. Do not lead with a specific memorable scene because the next stage is reserved for scenes.";
    case "OPEN_PERSONA_POSITION":
      return `${input.discussionFocus?.trim() ? `Continue directly from Alex's supplied conversation thread, ${JSON.stringify(input.discussionFocus.trim())}, without substituting a different issue. ` : ""}State one committed answer to the active topic from your private notes. Address the supplied reader directly and give one piece of scene-level evidence; do not summarize the room.`;
    case "CHALLENGE_PERSONA":
      return "Use exactly 2 short spoken sentences. Challenge the supplied reader's most recent claim directly: name the exact point you reject, then ask that reader one genuine pointed question grounded in conflicting scene-level evidence. Do not turn toward the user.";
    case "RESPOND_TO_PERSONA":
      return "Use exactly 2 short spoken sentences. Answer the supplied reader's latest argument directly, then defend, refine, or explicitly concede one point while keeping a real disagreement alive. Do not turn toward the user or summarize the room.";
    case "MEMORABLE_SCENE":
      return input.discussionFocus?.trim()
        ? `The code-selected scene anchor is ${JSON.stringify(input.discussionFocus.trim())}. Discuss that exact scene and explain the personal reason it stayed with you; do not choose or substitute another scene. Do not begin by agreeing with, quoting, praising, or answering another participant. Sound like a reader remembering a book, not a lecturer presenting a theme.`
        : "Independently name one specific scene and explain the personal reason it stayed with you. Do not begin by agreeing with, quoting, praising, or answering another participant. Sound like a reader remembering a book, not a lecturer presenting a theme.";
    case "SCENES_OPEN":
      return "In the first sentence, briefly acknowledge the range or tension in the user's just-stated first impression without evaluating it. In the second sentence, transition to the memorable-scenes round and ask for one concrete scene, passage, image, or example that produced that impression.";
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
      return "Use exactly 2 short spoken sentences. Answer the user's reply to your pointed question directly, say what it resolves, and name one precise disagreement that remains. Do not ask another question, reset the topic, or pretend to agree.";
    case "RESPOND_TO_USER_FOLLOWUP":
      return "Use exactly 2 short spoken sentences. Respond directly to the user's added thought, identify the implication it clarifies, and press one still-unresolved consequence. Do not ask another question or restart the debate.";
    case "BRIDGE_EXCHANGE":
      return "Use exactly 2 short spoken sentences. Pick up the exact unresolved difference from the user's reply and the challenger's response, then add one genuinely different scene-level consideration from your private notes. Address the supplied target, but do not merely support one side, praise the user, summarize the exchange, or open an unrelated topic.";
    case "TOPIC_CLOSE":
      return "Name the precise disagreement that remains open and close this topic without declaring a winner or inventing consensus. Bridge naturally toward the closing round.";
    case "WRAP_OPEN":
      return "In 2 warm spoken sentences, name only the unresolved tension being carried forward and invite the user to leave a closing thought. Do not repeat the full topic summary.";
    case "CLOSING_REFLECTION":
      return "Use exactly 2 short sentences total. Give this reader's independent takeaway from what genuinely happened, then naturally include either a persona-specific farewell or their pleasure at sharing the table. The ending must sound recognizably like this reader, not an interchangeable group sign-off. Do not introduce a new argument, evidence, question, or advice; do not address the user by default, copy the user's analogy, occupation, or phrasing, turn their personal plan into group advice, recite a before-and-after formula, or summarize the whole meeting.";
    case "DISCUSSION_SUMMARY":
      return "Use exactly 4 spoken sentences. Name the central disagreement, identify one precise contribution from the user, explain one genuine movement and the strongest unresolved counterclaim, then warmly thank the table and say in the selected language that the meeting recap comes next. Base it only on the supplied conversation; do not introduce a new opinion, reopen the debate, repeat a previous transition summary, or end with English words in a Korean session.";
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

export function localizedRecapParticipants(
  personas: RecapRequest["personas"],
  language: RecapRequest["language"],
  userDisplayName: string,
): Array<{ id: string; name: string }> {
  return [
    ...personas.map(({ id }) => ({ id, name: localizedSpeakerName(id, language) })),
    { id: "user", name: userDisplayName },
  ];
}

export class OpenAIGenerationClient implements GenerationClient {
  private readonly client: OpenAI;

  constructor(
    apiKey: string | undefined,
    private readonly model = "gpt-5.6-terra",
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
      `You are ${input.persona.name}. Stay committed to the supplied persona card. ${imaginedGuestRule(input.persona, input.book)} ${guestReadingNotesRule(input.persona, input.book, input.language)} These are private anchor notes, not dialogue. Build one contestable thesis from this persona's specific lens; do not collapse into a generic balanced verdict. Preserve every candidate topic verbatim and in order. overall_take must be 2-3 sentences. Use any guest achievement metadata only to derive a distinctive way of thinking; do not put biography, fame, or a résumé into the notes. Include a genuine personal reaction, an unresolved doubt, evidence that could change your mind, and a question you actually want to ask another reader. These must differ from the thesis instead of restating it. ${languageRule(input.language)} ${COPYRIGHT_RULE}`,
      JSON.stringify({
        book: input.book,
        persona: personaPromptData(input.persona, true),
        repair: input.validationError ?? null,
      }),
      { reasoningEffort: "medium", maxOutputTokens: 2_800 },
    );
  }

  async extractDiscussionFocus(input: DiscussionFocusRequest) {
    return this.parse(
      discussionFocusSchema,
      "discussion_focus",
      `Extract discussion pressure from the supplied first-impression and memorable-scene conversation. Score each supplied candidate topic from 0 to 2 for how strongly the whole conversation supports it, preserving every candidate topic verbatim and in order. Separately score user_relevance from 0 to 2 using only the user's actual remarks and provide a short user_evidence phrase when present. General evidence must describe a concrete repeated remark, disagreement, question, or user request; user evidence must explain how that exact remark opens the candidate topic instead of attaching an unrelated quote. Propose an emergent question only when the conversation clearly raises an important issue not covered by the candidates, and separately score its user relevance; otherwise return null fields and relevance 0. You extract evidence only; code makes the final topic choice. ${languageRule(input.language)} ${COPYRIGHT_RULE}`,
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
    const persona = input.speaker === "moderator" ? undefined : input.speaker;
    const lengthRule = isModerator
      ? input.task === "DISCUSSION_SUMMARY"
        ? "Use exactly 4 sentences."
        : "Use 1-3 sentences."
      : input.task === "PERSONA_INTRODUCTION"
        ? "Use exactly 2 short sentences."
        : input.task === "CLOSING_REFLECTION"
          ? "Use exactly 2 short sentences."
        : "Use 2-4 sentences.";
    const taskDirective = utteranceTaskDirective(input);
    const referenceRule = input.targetSpeaker
      ? `Set refers_to exactly to ${JSON.stringify(input.targetSpeaker)}.`
      : "Set refers_to to null.";
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
      } ${lengthRule} ${taskDirective} ${referenceRule} ${imaginedGuestRule(persona, input.book)} ${guestSignatureMomentRule(input)} ${languageRule(input.language)} ${roomAtmosphereRule(input.roomAtmosphere)} Write spoken conversation, not literary criticism: make one conversational move per turn, prefer short clauses, and never package a thesis, evidence, counterargument, and conclusion into one miniature essay. In Korean dialogue, avoid semicolons and vary natural spoken endings; in English dialogue, use contractions when natural. On substantive persona turns, preserve the persona's distinct lens and do not repeat an established consensus unless adding new evidence. ${testimonyRule} Let occupation, uncertainty, and speech habits show naturally; do not turn every response into a polished conclusion. Use a persona's signature metaphor sparingly and speak plainly if a similar flourish appeared in the recent turns. Avoid generic praise followed by "but," repeated "both can coexist" constructions, and abstract mini-essays. Mention persuasion only when the speaker's position genuinely changes, and acknowledge any change explicitly. Shelf reference is ${
        input.allowShelfReference ? "allowed once if illuminating" : "not allowed; shelf_ref must be null"
      }. ${COPYRIGHT_RULE}`,
      JSON.stringify({
        book: input.book,
        persona: isModerator
          ? null
          : personaPromptData(input.speaker as PersonaCard, input.task === "FIRST_IMPRESSION"),
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
      participants: localizedRecapParticipants(
        input.personas,
        input.language,
        input.userDisplayName,
      ),
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
      `${recapStructure} Keep the discussion summary to 3-5 sentences, the sparks section to at most 2 bullets, and the scenes section to at most 3 bullets. The final section must contain exactly one substantive question and exactly one question mark. Include a concise Markdown stance table in the final-position section with exactly one row or column for every supplied participant, including the user, and use the supplied participant names exactly in both the table and prose. In the shelf section, include only books explicitly cited by a transcript entry's shelf reference; if none, say naturally that no other book was brought into the conversation. Never expose implementation terms or field names such as shelfRef, refersTo, transcript, schema, or private notes. Do not imply that an exchange happened unless it appears in the supplied conversation. ${languageRule(input.language)} Quote only this session's generated conversation, never the source book. Do not invent or reveal private reading notes. ${COPYRIGHT_RULE}`,
      JSON.stringify(safeInput),
      { reasoningEffort: "low", maxOutputTokens: 1_400 },
    );
  }
}
