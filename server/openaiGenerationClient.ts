import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { z } from "zod";

import {
  bookIdentificationSchema,
  bookIdentificationModelSchema,
  discussionFocusSchema,
  meetingPlanModelSchema,
  meetingPlanSchema,
  readingNotesSchema,
  recapSchema,
  userStanceSchema,
  utteranceSchema,
} from "../src/api/contracts";
import type {
  BookIdentificationModelOutput,
  BookIdentificationRequest,
  MeetingPlanModelOutput,
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
  MeetingPlanRequest,
  ReadingNotesRequest,
  RecapRequest,
  UserStanceRequest,
  UtteranceRequest,
} from "../src/api/generationClient";
import {
  validateBookIdentificationQuality,
  validateMeetingPlanQuality,
} from "../src/engine/qualityValidation";
import { localizedSpeakerName } from "../src/localization";
import { isImaginedGuestId } from "../src/personas";
import {
  resolveGuestAuthorPerspective,
  type GuestAuthorPerspective,
} from "../src/personas/guestWorkRelations";
import type { AppLanguage, ConfirmedBook, PersonaCard } from "../src/types";
import {
  buildCharacterCoreReadingNotesPromptSlice as buildRuntimeCharacterCoreReadingNotesPromptSlice,
  buildCharacterCoreUtterancePromptSlice as buildRuntimeCharacterCoreUtterancePromptSlice,
} from "../src/characterCore/runtime";
import type {
  CharacterCoreReadingNotesPromptSlice,
  CharacterCoreUtterancePromptSlice,
} from "../src/characterCore/runtime";

const COPYRIGHT_RULE =
  "Discuss themes, scenes, and interpretations. Quote at most a short phrase and never reproduce passages.";

type RuntimeCharacterCorePromptSlice =
  | CharacterCoreReadingNotesPromptSlice
  | CharacterCoreUtterancePromptSlice;

export function appendCharacterCorePrompt(
  basePrompt: string,
  slice: RuntimeCharacterCorePromptSlice | undefined,
): string {
  if (!slice) return basePrompt;
  const runtimeState =
    "state" in slice ? `\nRuntime state: ${slice.state}` : "";
  return `${basePrompt}\n\n[LOCAL CHARACTER CORE EXPERIMENT ${slice.version}]${runtimeState}\n${slice.prompt}`;
}

export function resolveReadingNotesCharacterCorePromptSlice(
  input: ReadingNotesRequest,
): CharacterCoreReadingNotesPromptSlice | undefined {
  if (!input.characterCoreExperiment) return undefined;
  return buildRuntimeCharacterCoreReadingNotesPromptSlice(
    input.persona.id,
    input.language,
  );
}

export function resolveUtteranceCharacterCorePromptSlice(
  input: UtteranceRequest,
): CharacterCoreUtterancePromptSlice | undefined {
  if (!input.characterCoreExperiment || input.speaker === "moderator") {
    return undefined;
  }
  return buildRuntimeCharacterCoreUtterancePromptSlice(
    input.speaker.id,
    input.language,
    input.task,
  );
}

const languageRule = (language: "en" | "ko" | undefined) =>
  language === "ko"
    ? "Write all reader-facing content in natural Korean. Keep book and author names in the form most familiar to Korean readers."
    : "Write all reader-facing content in natural English.";

export function localizedSpokenConversationRule(
  language: "en" | "ko" | undefined,
): string {
  if (language !== "ko") {
    return "Realize the supplied meaning as idiomatic spoken English for a small book club. Preserve the exact claim, evidence, strength, and addressee, but do not translate Korean honorifics, omissions, or word order into English.";
  }

  return [
    "Realize the supplied meaning as idiomatic spoken Korean for a small book club.",
    "Before writing, keep the exact scene facts, claim strength, addressee, and one conversational action fixed; natural wording must never change them.",
    "Prefer a concrete subject and action over stacked abstract nouns or compressed literary metaphors.",
    "Use one main conversational action per sentence. If agreement, qualification, and a question are all needed, separate them into short sentences instead of nesting clauses.",
    "React to the prior speaker's actual point. Do not add ritual thanks, a recap, or a polished transition when a Korean speaker would normally answer the content directly.",
    "Turn an academic written prompt into a question someone would naturally ask aloud; do not recite phrases equivalent to 'what does this reveal?' or 'what does this process show?' as an essay prompt.",
    "Use complete, idiomatic Korean collocations. A formal or literary persona may choose respectful endings and measured rhythm, but may not use translation-like combinations or unclear omitted referents.",
    "Do not say that a scene, passage, problem, gap, or person simply '남는다' or '오래 남는다'. State the exact feeling or effect; use '기억에 남는다' or '마음에 걸린다' only when that precise meaning fits, and do not repeat either as a session-wide stock phrase.",
    "Do not use '서늘했다' as a generic serious reaction. Use it only when the scene produced a concrete sense of coldness, threat, or unease; otherwise name the actual feeling plainly.",
    "Do not infer a user's reading ability, sensitivity, or likely interpretation from their job, city, age, or hobby unless the user explicitly made that connection.",
    "Do not translate agreement as '같은 자리에 있다'. Say plainly that the speakers agree on that point or reached the same conclusion.",
    "In this book-club product, call a prepared discussion question '발제', never the bureaucratic term '의제'.",
    "Character voice comes from judgment, focus, degree of formality, and rhythm after natural Korean is secured; obscurity is never evidence of character.",
  ].join(" ");
}

const authorRelationshipRule = (perspective: GuestAuthorPerspective): string => {
  switch (perspective.relationship) {
    case "documented_author":
      return "The guest may identify themselves as this work's author, but authorship does not make their interpretation final or outweigh another reader's experience.";
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
  return `This speaker is ${grounding}. ${ordinaryBookRule} Never present generated dialogue as a real quotation, fabricate a private anecdote or undocumented hidden intention, imitate archaic diction, or invoke fame or authorship as authority. The UI and social introduction already disclose that this is an imagined guest, so never break immersion by announcing that status again. Reason by analogy, remain a fallible reader, and listen to other interpretations without treating difference as a contest.`;
};

export function guestSignatureMomentRule(input: UtteranceRequest): string {
  if (input.speaker === "moderator" || !input.speaker.imaginedGuest) return "";
  const authorPerspective = resolveGuestAuthorPerspective(input.speaker.id, input.book);
  if (authorPerspective && input.task === "FIRST_IMPRESSION") {
    const frame = authorPerspective.firstPersonFrame[input.language];
    return `This is the guest's only author-perspective moment for the entire session. The first sentence must begin with the exact words ${JSON.stringify(frame)} and continue naturally from them; use that first-person relationship only once. Share one specific aspect of the work that draws attention, one feeling or question it creates, and remain open to how present-day readers may experience it differently. ${authorRelationshipRule(authorPerspective)} Do not invent a quotation, private memory, undocumented hidden intention, or definitive explanation of the work. Do not repeat the authorship relationship on later turns.`;
  }
  if (authorPerspective) {
    return "The guest's single author-perspective reference belongs only to the first-impression turn. Do not repeat that the guest wrote, created, transmitted, or left notes for the work on this turn. Speak as an equal reader without using authorship as proof.";
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
  return `The audited registry matches this guest to the verified current work. Prepare a provisional author-perspective reaction that can later support a first sentence beginning with ${JSON.stringify(frame)}. Separate documented public context from interpretive reconstruction, notice where present-day readers may experience the work differently, and never invent a quotation, private anecdote, undocumented hidden intention, or final-authority claim. ${authorRelationshipRule(authorPerspective)}`;
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
      ? "the room contains a meaningful difference in reading; stay curious and specific without turning it into a contest"
      : atmosphere.tension < 0.35
        ? "the room is low-tension"
        : "the room contains different emphases that can be explored gently";
  const energy = atmosphere.energy >= 0.65 ? "energetic" : atmosphere.energy < 0.4 ? "quiet and reflective" : "measured";
  return `Emergent room atmosphere: ${warmth}, ${energy}; ${playfulness}; ${tension}. Adapt delivery subtly while preserving the speaker's own voice and attention. Do not imitate the user's wording, force jokes, or turn the whole group into one personality.`;
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
      return "Move directly into the book without mentioning the user's work, city, age, hobby, or other profile detail. Never infer reading ability, sensitivity, or a likely interpretation from the introduction. Invite an overall first feeling or question and save concrete scenes for the next stage.";
    case "FIRST_IMPRESSION":
      return "Give a personal overall reaction anchored in private notes and the assigned perspective entrance. Name what drew your attention and the concrete feeling or curiosity it created. This is independent testimony, not debate: do not agree with, quote, praise, rebut, correct, or cross-examine another participant. Do not recite the assignment or lead with a detailed memorable scene because the next stage is reserved for scenes.";
    case "OPEN_PERSONA_POSITION":
      return `${input.discussionFocus?.trim() ? `Continue directly from Alex's supplied conversation thread, ${JSON.stringify(input.discussionFocus.trim())}, without substituting a different issue. ` : ""}Answer Alex's shared prompt with one concrete perspective from your private notes: what caught your attention, how you felt, and why it mattered to your experience of the book. Do not address another participant unless the code selected one. Add to the room rather than staking out a side, and do not summarize everyone.`;
    case "CHALLENGE_PERSONA":
      return "Use 2-3 short spoken sentences. Listen to the supplied reader's actual point, then add one different scene, feeling, context, or question from your own reading. If you truly read the same moment differently, say so gently and explain your reading; otherwise let both perspectives coexist. Do not test their evidence, demand a defense, manufacture opposition, or turn toward the user. A question is optional and must express genuine curiosity rather than cross-examination.";
    case "RESPOND_TO_PERSONA":
      return "Use 2-3 short spoken sentences. Respond to the supplied reader's exact feeling, scene, or question first. Say what their perspective helps you notice, then connect it to or gently distinguish it from your own reading. Do not defend a side, test scope, demand evidence, turn toward the user, or summarize the room.";
    case "MEMORABLE_SCENE":
      return input.discussionFocus?.trim()
        ? `The code-selected scene anchor is ${JSON.stringify(input.discussionFocus.trim())}. Discuss that exact scene and explain the personal reason it stayed with you; do not choose or substitute another scene. Do not begin by agreeing with, quoting, praising, or answering another participant. Sound like a reader remembering a book, not a lecturer presenting a theme.`
        : "Independently name one specific scene and explain the personal reason it stayed with you. Do not begin by agreeing with, quoting, praising, or answering another participant. Sound like a reader remembering a book, not a lecturer presenting a theme.";
    case "SCENES_OPEN":
      return "In the first sentence, briefly acknowledge the range or tension in the user's just-stated first impression without evaluating it. In the second sentence, transition to the memorable-scenes round and ask for one concrete scene, passage, image, or example that produced that impression.";
    case "TOPIC_OPEN":
      return input.discussionOrigin === "user"
        ? `In one short sentence, attribute only the supplied user thread to the user without adding another reader's interpretation. Then restate the meaning of this code-selected topic as one short question that sounds natural when spoken aloud: ${input.activeTopic}. Preserve the issue but do not recite academic wording verbatim.`
        : `Briefly name the supplied table thread without attributing it to the user. Then restate the meaning of this code-selected topic as one short question that sounds natural when spoken aloud: ${input.activeTopic}. Preserve the issue but do not recite academic wording verbatim.`;
    case "ASK_USER_POSITION":
      return "After hearing two readers' perspectives, invite the user to share what they noticed or how they experienced the active topic. Do not frame the invitation as choosing a side.";
    case "CHALLENGE_USER":
      return "Use the user's latest verbatim transcript turn as the source of truth; the supplied paraphrase is only a compatibility index and must not strengthen or broaden the claim. Show that you heard the user's feeling or interpretation, then ask exactly one natural question about the scene or experience that led them there. If your reading genuinely differs, offer it as an additional perspective before asking why they read it that way. Never demand proof, test scope, search for a counterexample, or make the user defend a position.";
    case "DEVILS_ADVOCATE":
      return "The user did not add a reading in this turn. Briefly accept the pass and invite the table to hear one more concrete perspective. Do not create an opposing view, ask the user again, or imply that silence is a position.";
    case "REACT_TO_USER_SCENE":
      return "Respond first within the exact story, scene, and experience the user named. Add one different detail, feeling, or implication without redirecting to the persona's prepared anchor. For a story collection, do not jump to a different story unless the comparison is both verified and genuinely clarifies the user's point; label it plainly as a comparison. Do not praise, paraphrase, correct, or turn the addition into a contradiction unless the two readings truly cannot coexist.";
    case "RESPOND_TO_USER_REPLY":
      return "Use 2-3 short spoken sentences. Treat the user's latest verbatim transcript turn as the source of truth and do not strengthen it through the supplied paraphrase. Respond directly and say what their answer helps you understand or notice. Add at most one related impression from your reading. Do not ask another question, announce agreement, manufacture tension, or reset the topic.";
    case "RESPOND_TO_USER_FOLLOWUP":
      return "Use 2-3 short spoken sentences. Treat the user's latest verbatim transcript turn as the source of truth and do not strengthen it through the supplied paraphrase. Respond to the added thought and connect it to one new scene, feeling, or context from your reading. Do not press a consequence, ask another question, or restart a debate.";
    case "BRIDGE_EXCHANGE":
      return "Use 2-3 short spoken sentences. Pick up the user's exact point, then add one genuinely different scene, feeling, or context from your private notes that can widen it. Address the supplied target, but do not support a side, praise the user, summarize the exchange, manufacture a disagreement, or open an unrelated topic.";
    case "TOPIC_CLOSE":
      return `Briefly name what different readers noticed without forcing disagreement or consensus. Close this agenda clearly. ${input.discussionFocus === "One more distinct agenda follows." ? "Bridge toward another agenda, not the end of the meeting." : "Bridge toward the closing round."}`;
    case "WRAP_OPEN":
      return "In 2 warm spoken sentences, acknowledge that the table explored two distinct agenda questions and invite the user to leave one closing thought. Do not collapse the two agendas into one, repeat their full wording, or invent unresolved tension.";
    case "CLOSING_REFLECTION":
      return "Use exactly 2 short sentences total. Give this reader's independent takeaway from what genuinely happened, then naturally include either a farewell or their pleasure at sharing the table. Let voice come from the reader's judgment, warmth, formality, and rhythm, not an occupation catchphrase, city-based joke, résumé reminder, or forced metaphor. Do not introduce a new argument, evidence, question, or advice; do not address the user by default, copy the user's analogy, occupation, or phrasing, turn their personal plan into group advice, recite a before-and-after formula, or summarize the whole meeting.";
    case "DISCUSSION_SUMMARY":
      return "Use exactly 4 short spoken sentences. Keep every Korean sentence under 95 characters and give each sentence only one main action. Name the two distinct agendas the table explored, identify one precise contribution from the user, name one additional perspective that widened the discussion, then warmly thank the table and say in the selected language that the meeting recap comes next. Do not collapse the two agendas into one. Mention a difference only if it genuinely occurred, without turning it into a winner or unresolved contest. Base it only on the supplied conversation; do not introduce a new opinion, repeat a previous transition summary, or end with English words in a Korean session.";
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

export function extractWebSearchSources(
  response: unknown,
  limit = 3,
): Array<{ url: string }> {
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

  return urls.slice(0, limit).map((url) => ({ url }));
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

  async prepareMeetingPlan(input: MeetingPlanRequest) {
    if (input.book.verificationStatus !== "verified") {
      throw new Error("A live meeting plan requires a verified book.");
    }
    let validationError = input.validationError;

    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.client.responses.parse(
        {
          model: this.model,
          store: false,
          reasoning: { effort: "low" },
          max_output_tokens: 6_000,
          tools: [{ type: "web_search", search_context_size: "medium" }],
          tool_choice: "required",
          include: ["web_search_call.action.sources"],
          input: [
            {
              role: "system",
              content: `Prepare a private, web-grounded plan for a small facilitated book club. Search beyond a generic summary and confirm work-specific information across publisher, library, scholarly, reputable review, interview, or reference sources. Never imply access to the full text and never invent a scene, quotation, motive, or biographical fact. ${COPYRIGHT_RULE}

Return 8-12 diverse anchors across concrete scenes or events, character relationships, form or narration, historical/social context, emotional experience, and open questions. An anchor detail must be specific enough to guide a reader without reproducing prose. Mark is_common_interpretation true for widely repeated critical framings, canonical controversies, and prominent web-discussion themes.

Prepare exactly two semantically distinct agenda questions: primary_prompt and reserve_prompt. Both are used in the session, so reserve_prompt is required rather than optional. Each must be one natural spoken book-club question with exactly one question mark and one main axis of thought. Ground each in a different work-specific anchor or interpretive path, keep each under 240 characters, and avoid compound academic prompts or wording equivalent to "what does this reveal?" when a simpler spoken question works.

Assign exactly one distinct anchor to each supplied persona id. Assign an entrance into attention, not a conclusion: emotional_door describes a feeling the persona can honestly explore, and question_to_explore remains genuinely open. Never assign agreement, disagreement, pro/con, correctness, a final interpretation, a debate role, or a line to recite. Use each persona's core to diversify what they notice. At most one persona may receive an anchor marked as a common interpretation. Keep first impressions independent and do not script a panel exchange.

connection_concepts may name related works or concepts only when useful, but must paraphrase the connection and must not supply an unverified direct quotation. uncertainties must explicitly name claims that remain edition-dependent, contested, or unsupported by the retrieved sources. Do not place URLs or citation markup in reader-facing fields; application code extracts source URLs from tool metadata. ${languageRule(input.language)}`,
            },
            {
              role: "user",
              content: JSON.stringify({
                verified_book: input.book,
                selected_personas: input.personas.map((persona) =>
                  personaPromptData(persona, true)
                ),
                repair: validationError ?? null,
              }),
            },
          ],
          text: {
            format: zodTextFormat(meetingPlanModelSchema, "facilitated_meeting_plan"),
          },
        },
        { timeout: 120_000, maxRetries: 0 },
      );
      const parsed = meetingPlanModelSchema.parse(
        requireParsedOutput<MeetingPlanModelOutput>(response),
      );
      const output = meetingPlanSchema.parse({
        ...parsed,
        sources: extractWebSearchSources(response, 8),
      });
      const issues = validateMeetingPlanQuality(
        output,
        input.personas.map(({ id }) => id),
      );
      if (issues.length === 0) return output;
      validationError = issues.join("; ");
    }

    throw new Error(`Meeting-plan research failed quality validation: ${validationError}`);
  }

  async generateReadingNotes(input: ReadingNotesRequest) {
    const characterCoreSlice =
      resolveReadingNotesCharacterCorePromptSlice(input);
    const systemPrompt = appendCharacterCorePrompt(
      `You are ${input.persona.name}. Stay committed to the supplied persona card. ${imaginedGuestRule(input.persona, input.book)} ${guestReadingNotesRule(input.persona, input.book, input.language)} These are private anchor notes, not dialogue. Form a provisional reading perspective from this persona's attention, felt response, and genuine curiosity. Use the assigned perspective entrance as a starting place, never as a conclusion or a line to recite. Treat the research pack as bounded web-grounded context, not proof that you read or remember the full text. Do not manufacture a polar thesis or opposition. Preserve every candidate topic verbatim and in order. overall_take must be 2-3 sentences and should say what drew attention and why it mattered to this reader. The numeric stance fields remain only as compatibility metadata: use 0 when a topic is not a genuine proposition, and never force polarity merely to separate characters. Each topic reason should name the distinct angle this reader could add, not a case they would prosecute. Use any guest achievement metadata only to derive a distinctive way of noticing; do not put biography, fame, or a résumé into the notes. Include a direct first-person emotional reaction when the assigned anchor genuinely supports one; fictional readers may plainly feel sad, upset, relieved, frustrated, puzzled, delighted, or moved without inventing a real-life anecdote. Do not default to vague seriousness words such as discomfort or coldness. Include an unresolved question, something another reader could help this persona notice or reconsider, and a question they actually want to ask. These must add different kinds of information instead of restating one thesis. ${languageRule(input.language)} ${COPYRIGHT_RULE}`,
      characterCoreSlice,
    );
    return this.parse(
      readingNotesSchema,
      "private_reading_notes",
      systemPrompt,
      JSON.stringify({
        book: input.book,
        persona: personaPromptData(input.persona, true),
        research_pack: input.meetingPlan ?? null,
        assigned_perspective: input.perspectiveAssignment ?? null,
        repair: input.validationError ?? null,
      }),
      { reasoningEffort: "medium", maxOutputTokens: 2_800 },
    );
  }

  async extractDiscussionFocus(input: DiscussionFocusRequest) {
    return this.parse(
      discussionFocusSchema,
      "discussion_focus",
      `Extract opportunities for perspective expansion from the supplied first-impression and memorable-scene conversation. Score each supplied candidate topic from 0 to 2 for how strongly it connects to concrete feelings, scenes, questions, or interpretations already present, preserving every candidate topic verbatim and in order. Separately score user_relevance from 0 to 2 using only the user's actual remarks and provide a short user_evidence phrase when present. General evidence must describe a concrete remark, scene, curiosity, different emphasis, or user request; user evidence must explain how that exact remark opens the topic instead of attaching an unrelated quote. Do not reward disagreement merely because it is disagreement. Propose an emergent question only when the conversation clearly raises one important experience or interpretation not covered by the candidates. It must invite one line of reflection, contain one question mark, and must not combine motive, ethics, form, and context into a compound prompt. Separately score its user relevance; otherwise return null fields and relevance 0. You extract evidence only; code makes the final topic choice. ${languageRule(input.language)} ${COPYRIGHT_RULE}`,
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
        ? "Use 2-3 short sentences."
        : input.task === "CLOSING_REFLECTION"
          ? "Use exactly 2 short sentences."
        : "Use 2-4 sentences.";
    const taskDirective = utteranceTaskDirective(input);
    const participantName = (speakerId: string): string =>
      input.participants.find(({ id }) => id === speakerId)?.displayName ?? speakerId;
    const targetDisplayName = input.targetSpeaker
      ? participantName(input.targetSpeaker)
      : undefined;
    const usesDefaultUserLabel =
      input.targetSpeaker === "user" &&
      targetDisplayName === localizedSpeakerName("user", input.language);
    const referenceRule = usesDefaultUserLabel
      ? `The code-selected response target is the user. Address the user naturally without speaking the placeholder label ${JSON.stringify(targetDisplayName)}. Set refers_to exactly to "user".`
      : input.targetSpeaker
      ? `The code-selected response target is ${JSON.stringify(targetDisplayName)}. Address that participant with this exact display name in the spoken utterance; never substitute, translate, or infer another name. Set refers_to exactly to ${JSON.stringify(input.targetSpeaker)}.`
      : "Set refers_to to null.";
    const testimonyRule =
      input.task === "FIRST_IMPRESSION" || input.task === "MEMORABLE_SCENE"
        ? "This is independent testimony. Do not react to recent participants or use their remarks as your opening."
        : "React to one precise idea from the recent conversation when it is relevant.";
    const characterCoreSlice =
      resolveUtteranceCharacterCorePromptSlice(input);
    return this.parse(
      utteranceSchema,
      "table_utterance",
      appendCharacterCorePrompt(
        `${
          isModerator
            ? "You are Alex, a warm, crisp, unflappable book-club moderator. Help readers notice and connect perspectives; do not create opposition or offer your own interpretation."
            : `You are ${
                input.speaker === "moderator" ? "Alex" : input.speaker.name
              }. Stay in character and anchored to your private notes.`
        } ${lengthRule} ${taskDirective} ${referenceRule} ${imaginedGuestRule(persona, input.book)} ${guestSignatureMomentRule(input)} ${languageRule(input.language)} ${localizedSpokenConversationRule(input.language)} ${roomAtmosphereRule(input.roomAtmosphere)} Write spoken conversation, not literary criticism: make one conversational move per turn, prefer short clauses, and never package a thesis, evidence, counterargument, and conclusion into one miniature essay. The default goal is to add a scene, feeling, context, connection, or genuine question that widens the user's reading. Agreement is allowed. Different emphasis is allowed. Do not turn either into debate. A fictional reader may plainly say that a scene made them sad, upset, relieved, frustrated, puzzled, delighted, or moved; emotional honesty does not require a fabricated real-life anecdote. Choose the feeling that fits this exact moment instead of defaulting to vague discomfort, unease, coldness, or a polished literary reaction. Check recent_conversation and avoid reusing its stock emotional phrase when a more exact everyday expression is available. In Korean dialogue, avoid semicolons and vary natural spoken endings; in English dialogue, use contractions when natural. On substantive persona turns, preserve the assigned perspective entrance and do not repeat another reader's established main anchor unless responding briefly before returning to the speaker's own anchor. A common interpretation is not forbidden, but only the persona assigned that common anchor may make it their main point. If the user corrects a scene fact, the user's latest correction overrides the research pack for the rest of this session. ${testimonyRule} Let uncertainty and speech habits show naturally; do not infer a reading style from occupation or turn every response into a polished conclusion. Use a persona's signature metaphor sparingly and speak plainly if a similar flourish appeared in the recent turns. Avoid generic praise followed by "but," repeated "both can coexist" constructions, and abstract mini-essays. Mention persuasion only when the speaker's interpretation genuinely changes, and acknowledge any change explicitly. Related-book connections must be paraphrased unless an exact short quotation was separately verified in the supplied research; never invent a remembered quotation. Shelf reference is ${
          input.allowShelfReference ? "allowed once if illuminating" : "not allowed; shelf_ref must be null"
        }. ${COPYRIGHT_RULE}`,
        characterCoreSlice,
      ),
      JSON.stringify({
        book: input.book,
        meeting_plan: input.meetingPlan ?? null,
        assigned_perspective: input.perspectiveAssignment ?? null,
        persona: isModerator
          ? null
          : personaPromptData(input.speaker as PersonaCard, input.task === "FIRST_IMPRESSION"),
        private_notes: input.notes ?? null,
        stage: input.stage,
        task: input.task,
        topic: input.activeTopic ?? null,
        participants: input.participants,
        target_speaker: input.targetSpeaker
          ? { id: input.targetSpeaker, display_name: targetDisplayName }
          : null,
        user_argument: input.userArgument ?? null,
        discussion_focus: input.discussionFocus ?? null,
        discussion_origin: input.discussionOrigin ?? null,
        recent_conversation: input.recentTranscript.slice(-12).map((utterance) => ({
          ...utterance,
          speaker: participantName(utterance.speaker),
          refersTo: utterance.refersTo ? participantName(utterance.refersTo) : undefined,
        })),
        repair: input.validationError ?? null,
      }),
      { reasoningEffort: "low", maxOutputTokens: 450 },
    );
  }

  async extractUserStance(input: UserStanceRequest) {
    return this.parse(
      userStanceSchema,
      "user_stance",
      `Paraphrase the user's stated feeling or interpretation in one neutral line without strengthening, softening, or turning it into a proposition they must defend. The numeric -2 through +2 field is compatibility metadata only: use 0 when the target is not genuinely polar. Preserve uncertainty markers such as uncertain memory, possibility, or a need to verify. ${languageRule(input.language)}`,
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
      agendaRounds: input.agendaRounds,
      transcript: input.transcript,
      personaStances: input.personaStances,
      userStances: input.userStances,
      repair: input.validationError ?? null,
    };
    const recapStructure =
      input.language === "ko"
        ? `Start with "# {book title} — 리딩 테이블 모임 기록, {provided date}". Then use exactly these level-two headings: "오늘 나눈 이야기", "각자가 가져간 생각", "발제와 주요 관점", "놓치기 쉬운 장면", "책장에서 꺼낸 연결", and "잠들기 전 생각할 질문".`
        : `Start with "# {book title} — Reading Table Recap, {provided date}". Then use exactly these level-two headings: "What we explored", "What each reader took away", "Agenda questions and perspectives", "Scenes you might have missed", "From the shelves", and "A question to sleep on".`;
    return this.parse(
      recapSchema,
      "meeting_recap",
      `${recapStructure} Keep the opening summary to 3-5 sentences and the scenes section to at most 3 bullets. In the agenda section, include exactly two bullets in supplied order: state each full agenda question, the main perspectives voiced, the user's contribution when present, and any question that remained open. Preserve compatible and differing readings without inventing conflict, consensus, or a winner. The final section must contain exactly one substantive question and exactly one question mark. Include a concise Markdown perspective table in the takeaways section with exactly one row or column for every supplied participant, including the user, and use the supplied participant names exactly in both the table and prose. Describe what each person noticed, felt, connected, or newly considered; do not rank positions. In the shelf section, include only books explicitly cited by a transcript entry's shelf reference; if none, say naturally that no other book was brought into the conversation. Never expose implementation terms or field names such as shelfRef, refersTo, transcript, schema, private notes, or stance scores. Do not imply that an exchange happened unless it appears in the supplied conversation. ${languageRule(input.language)} Quote only this session's generated conversation, never the source book. Do not invent or reveal private reading notes. ${COPYRIGHT_RULE}`,
      JSON.stringify(safeInput),
      { reasoningEffort: "low", maxOutputTokens: 2_200 },
    );
  }
}
