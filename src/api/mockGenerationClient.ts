import {
  bookIdentificationSchema,
  discussionFocusSchema,
  readingNotesSchema,
  recapSchema,
  userStanceSchema,
  utteranceSchema,
} from "./contracts";
import type {
  BookIdentificationRequest,
  ReadingNotesOutput,
  UtteranceOutput,
} from "./contracts";
import type {
  DiscussionFocusRequest,
  GenerationClient,
  ReadingNotesRequest,
  RecapRequest,
  UserStanceRequest,
  UtteranceRequest,
} from "./generationClient";
import { localizedSpeakerName, STAGE_LABELS } from "../localization";
import type { AppLanguage, Category, PersonaCard, Utterance } from "../types";

const stanceProfiles: Record<string, [number, number, number]> = {
  maddie: [1.4, 0.8, -0.4],
  dot: [0.9, 0.3, 1.1],
  tyler: [0.2, -0.6, 0.5],
  marcus: [-1.3, 1.4, -0.8],
  eleanor: [-0.5, 1.1, 0.7],
  sarah: [0.4, -1.1, 0.2],
  dev: [-0.8, 0.2, 1.5],
  jamal: [0.6, -0.7, 1.2],
};

const categoryLens: Record<AppLanguage, Record<Category, string>> = {
  en: {
    emotional: "the emotional stakes and the cost paid by people on the page",
    analytical: "the structure and evidence that make an interpretation hold up",
    contextual: "the social context and larger patterns surrounding the text",
  },
  ko: {
    emotional: "책에 담긴 감정의 무게와 인물들이 치르는 대가",
    analytical: "해석을 지탱하는 구조와 장면의 증거",
    contextual: "텍스트를 둘러싼 사회적 맥락과 더 큰 흐름",
  },
};

function stripTerminal(value: string | undefined, fallback: string): string {
  return (value?.trim() || fallback).replace(/[.!?。？！]+$/gu, "");
}

function excerpt(value: string | undefined, fallback: string, maxLength = 180): string {
  const normalized = value?.replace(/\s+/gu, " ").trim() || fallback;
  return normalized.length <= maxLength ? normalized : `${normalized.slice(0, maxLength - 1)}…`;
}

function readerName(persona: PersonaCard, language: AppLanguage): string {
  return localizedSpeakerName(persona.id, language);
}

function lastUserTurn(input: UtteranceRequest): string | undefined {
  return [...input.recentTranscript].reverse().find(({ speaker }) => speaker === "user")?.text;
}

function identifyMockBook(input: BookIdentificationRequest) {
  const title = input.title.trim();
  const language = input.language ?? "en";
  const scope = input.scope ?? "single_book";
  const author = input.author?.trim() || (language === "ko" ? "저자 미입력" : "Author not provided");
  const summary =
    language === "ko"
      ? `『${title}』은 이번 리딩 테이블을 위해 사용자가 선택한 ${scope === "series" ? "시리즈" : "책"}입니다. 모의 모드는 이 작품의 줄거리나 등장인물, 구성 도서를 알고 있다고 주장하지 않습니다. 대신 사용자가 직접 들려주는 첫인상과 장면을 바탕으로 형식, 해석, 의미에 관한 세 가지 범용 질문을 발전시킵니다. 작품 범위에 맞춘 도서 정보와 구체적인 토론은 실제 GPT-5.6 모드에서 확인할 수 있습니다.`
      : `${title} is the ${scope === "series" ? "series" : "book"} selected by the user for this Reading Table session. Mock mode does not claim knowledge of its plot, people, factual context, or component volumes. Instead, it develops three broad questions about form, interpretation, and significance from observations the user brings to the table. Use Live GPT-5.6 mode for scope-verified details and a work-specific discussion.`;
  const candidateTopics =
    language === "ko"
      ? [
          "이 책의 형식은 독자가 무엇을 주목하게 만드는가?",
          "테이블에서 언급한 대목에는 어떤 해석이 가장 잘 맞는가?",
          "이 책이 끝내 열어 둔 인간적 또는 사회적 긴장은 무엇인가?",
        ]
      : [
          "How does the book's form shape what the reader notices?",
          "Which interpretation best fits the moments raised at the table?",
          "What larger human or social tension does the book leave unresolved?",
        ];

  return bookIdentificationSchema.parse({
    canonical_title: title,
    author,
    work_scope: scope,
    included_titles: scope === "single_book" ? [title] : [],
    summary,
    main_characters: [],
    candidate_topics: candidateTopics,
    verification_status: "mock",
    verification_note:
      language === "ko"
        ? "모의 모드는 외부 도서 정보를 검색하거나 검증하지 않습니다."
        : "Mock mode does not search for or verify external book information.",
    sources: [],
  });
}

function makeNotes(input: ReadingNotesRequest): ReadingNotesOutput {
  const isKorean = input.language === "ko";
  const name = readerName(input.persona, input.language);
  const lens = categoryLens[input.language][input.persona.category];
  const stances = stanceProfiles[input.persona.id] ?? [0, 0.5, -0.5];
  const overallTake = isKorean
    ? `${name}의 첫 관심은 ${lens}입니다. 아직 구체적인 작품 사실을 보태기보다 사용자가 꺼낼 장면을 이 관점으로 시험해 보고 싶습니다.`
    : `${name} wants to approach ${input.book.title} through ${lens}. Rather than add unverified book details, this reader will test that lens against the moments the user brings to the table.`;

  return readingNotesSchema.parse({
    overall_take: overallTake,
    overall_stance: stances[0],
    stance_by_topic: input.book.candidateTopics.map((topic, index) => ({
      topic,
      stance: stances[index],
      reason: isKorean
        ? `${name}은 ${index + 1}번 질문을 ${lens}이라는 관점에서 검토합니다.`
        : `${name}'s lens tests this question through ${lens}.`,
    })),
    key_scenes: isKorean
      ? [
          "사용자가 첫인상을 설명하며 직접 언급하는 대목.",
          "사용자가 가장 오래 남았다고 선택하는 장면 또는 구절.",
          "본 토론에서 서로 다른 해석이 같은 근거를 두고 갈리는 순간.",
        ]
      : [
          "The moment the user identifies while explaining a first impression.",
          "The scene or passage the user chooses as the one that stayed longest.",
          "The point where different readings divide over the same evidence.",
        ],
    shelf_connections: [],
    personal_reaction: isKorean
      ? "사용자가 어떤 대목을 고르는지에 따라 제 첫 판단도 달라질 수 있다는 기대가 남았습니다."
      : "I am curious to see which moment the user chooses, because it may change my first judgment.",
    unresolved_question: isKorean
      ? "내 독서 관점이 이 책의 다른 가능성을 너무 일찍 가두지는 않을까?"
      : "Could my usual reading lens close off another possibility too early?",
    possible_revision: isKorean
      ? "다른 독자가 더 구체적인 대목을 제시한다면 제 입장을 기꺼이 조정하겠습니다."
      : "I will revise my position if another reader offers a more precise moment from the book.",
    question_for_table: isKorean
      ? "같은 대목을 읽고도 서로 다른 판단에 이른 이유는 무엇일까요?"
      : "Why might the same moment lead readers toward different judgments?",
  });
}

function personaIntroduction(persona: PersonaCard, language: AppLanguage): string {
  const name = readerName(persona, language);
  const lens = categoryLens[language][persona.category];
  return language === "ko"
    ? `안녕하세요, ${name}입니다. 저는 ${persona.roleLabel.ko}이고, 책을 읽을 때는 ${lens}부터 살피는 편이에요.`
    : `Hi, I'm ${name}, a ${persona.roleLabel.en.toLowerCase()}. When I read, I tend to notice ${lens} first.`;
}

function personaUtterance(input: UtteranceRequest): UtteranceOutput {
  const persona = input.speaker === "moderator" ? undefined : input.speaker;
  if (!persona) throw new Error("A persona is required for a persona mock utterance.");
  const isKorean = input.language === "ko";
  const name = readerName(persona, input.language);
  const targetName = input.targetSpeaker
    ? localizedSpeakerName(input.targetSpeaker, input.language)
    : isKorean
      ? "다른 독자"
      : "another reader";
  const topic = stripTerminal(
    input.activeTopic,
    isKorean ? "이 책에서 가장 중요한 긴장" : "the book's central tension",
  );
  const reason = stripTerminal(
    input.notes?.stanceByTopic.find(({ topic: itemTopic }) => itemTopic === input.activeTopic)?.reason,
    isKorean ? "한 가지 해석만으로는 충분하지 않다는 점" : "one interpretation is not enough",
  );
  const userMoment = excerpt(
    lastUserTurn(input),
    isKorean ? "사용자가 고른 대목" : "the moment the user selected",
    120,
  ).replace(/[.!?。？！]+$/gu, "");
  const shelfRef = input.allowShelfReference ? persona.bookshelf[0]?.title ?? null : null;
  const responses: Partial<Record<UtteranceRequest["task"], string>> = isKorean
    ? {
        PERSONA_INTRODUCTION: personaIntroduction(persona, input.language),
        FIRST_IMPRESSION: input.notes?.overallTake,
        CHALLENGE_USER: `저는 “${topic}”라는 질문에서 그 결론을 조금 더 밀어보고 싶습니다. 사용자가 말한 근거가 가장 강한 반대 사례까지 설명할 수 있다고 보시나요?`,
        MEMORABLE_SCENE: shelfRef
          ? `저는 책의 중심 긴장이 가장 선명해지는 대목을 다시 보고 싶습니다. 제 책장에서는 『${shelfRef}』도 비슷한 질문을 던지지만, 지금은 사용자가 고른 장면이 무엇인지 먼저 듣겠습니다.`
          : "저는 책의 중심 긴장이 가장 선명해지는 대목을 다시 보고 싶습니다. 구체적인 장면은 제가 지어내지 않고, 사용자가 기억한 순간을 들은 뒤 제 관점을 보태겠습니다.",
        REACT_TO_USER_SCENE: `사용자가 말한 “${userMoment}”을 기준으로 보니 ${name}에게는 앞선 질문이 훨씬 구체적으로 들립니다. 저는 ${categoryLens.ko[persona.category]}을 중심으로, 그 대목이 무엇을 보여 주고 무엇을 끝내 설명하지 않는지 함께 보겠습니다.`,
        RESPOND_TO_USER_REPLY: `사용자가 답한 “${userMoment}”은 제 반론의 일부를 분명하게 해 줍니다. 그래도 제 관점에서 놓친 결과가 남아 있어, 그 구분만으로 이견이 완전히 풀리지는 않습니다.`,
        SUPPORT_USER: `${targetName}님, 저는 ${categoryLens.ko[persona.category]}이라는 관점에서는 사용자의 구분이 작품의 다른 근거도 설명할 수 있다고 봅니다. 다만 그 해석이 모든 결과를 대신 설명한다고 넓혀 버리면 중요한 예외를 놓칠 수 있습니다.`,
        CLOSING_REFLECTION: `사용자가 마지막에 말한 “${userMoment}”을 오늘 테이블에서 가져가고 싶습니다. 저는 ${categoryLens.ko[persona.category]}의 관점에서 그 생각이 놓칠 수 있는 한계도 계속 붙잡겠습니다.`,
      }
    : {
        PERSONA_INTRODUCTION: personaIntroduction(persona, input.language),
        FIRST_IMPRESSION: input.notes?.overallTake,
        CHALLENGE_USER: `I want to press that conclusion about ${topic}. Does the evidence you named really account for the strongest counterexample?`,
        MEMORABLE_SCENE: shelfRef
          ? `I want to return to the passage where the book's central tension becomes clearest. ${shelfRef} asks a related question on my shelf, but I would rather hear the user's chosen moment before making a comparison.`
          : "I want to return to the passage where the book's central tension becomes clearest. I will not invent a scene here; I would rather hear the moment the user actually remembers and respond to that evidence.",
        REACT_TO_USER_SCENE: `The user's choice—${userMoment}—makes the earlier question more concrete for ${name}. Through ${categoryLens.en[persona.category]}, I want to examine both what that moment shows and what it leaves unexplained.`,
        RESPOND_TO_USER_REPLY: `The user's answer—${userMoment}—clarifies part of my objection. I still disagree because ${reason}, and that distinction alone does not resolve it.`,
        SUPPORT_USER: `${targetName}, I think the user's distinction can explain different evidence through ${categoryLens.en[persona.category]}. Its limit is that it may erase an important exception if we let it stand in for every consequence.`,
        CLOSING_REFLECTION: `I am taking the user's final thought—${userMoment}—away from this table. Through ${categoryLens.en[persona.category]}, I will also keep testing the limit that thought may overlook.`,
      };
  const utterance =
    responses[input.task] ??
    (isKorean
      ? `『${input.book.title}』에 관한 이 질문에는 분명한 긴장이 있습니다. 작품 밖의 사실을 더하지 않고 지금까지 나온 대화 안에서 제 입장을 설명하겠습니다.`
      : `There is a real tension in this question about ${input.book.title}. I will explain my position from the conversation so far without adding facts that were never raised.`);

  return utteranceSchema.parse({
    utterance,
    stance:
      input.activeTopic && input.notes
        ? (input.notes.stanceByTopic.find(({ topic: itemTopic }) => itemTopic === input.activeTopic)
            ?.stance ?? input.notes.overallStance)
        : (input.notes?.overallStance ?? null),
    refers_to: input.targetSpeaker ?? null,
    shelf_ref: shelfRef && utterance.includes(shelfRef) ? shelfRef : null,
  });
}

function moderatorUtterance(input: UtteranceRequest): UtteranceOutput {
  const isKorean = input.language === "ko";
  const topic = input.activeTopic ?? input.book.candidateTopics[0];
  const personaNames = input.recentTranscript
    .filter(({ speaker }) => !["moderator", "user"].includes(speaker))
    .map(({ speaker }) => localizedSpeakerName(speaker, input.language));
  const uniqueNames = [...new Set(personaNames)].slice(0, 3).join(isKorean ? ", " : ", ");
  const responses: Partial<Record<UtteranceRequest["task"], string>> = isKorean
    ? {
        WELCOME: `리딩 테이블에 오신 것을 환영합니다. 오늘 함께 이야기할 책은 ${input.book.author}의 『${input.book.title}』입니다. 먼저 같은 테이블에 앉은 분들과 인사부터 나누겠습니다.`,
        INVITE_USER: "책을 펼치기 전에 여러분도 어떤 분인지, 오늘 이 자리에 오게 된 이유와 함께 가볍게 소개해 주시겠어요?",
        FIRST_IMPRESSIONS_OPEN: "소개해 주셔서 고맙습니다. 이제 책으로 들어가서, 한 분씩 가장 솔직한 첫인상을 이야기해 볼까요?",
        DEVILS_ADVOCATE: "잠시 반대편에서 밀어붙여 보겠습니다. 모두가 이 해석에 동의한다면 우리가 시험하지 않고 지나치는 근거는 무엇일까요?",
        SCENES_OPEN: "줄거리나 핵심 내용보다 오래 남아 있던 장면, 대목 또는 생각은 무엇이었나요?",
        TOPIC_OPEN: `${input.discussionFocus ? `앞선 이야기에서는 ${input.discussionFocus}이 계속 남았습니다. ` : ""}그래서 오늘의 중심 질문은 이것입니다. ${topic}`,
        ASK_USER_POSITION: "서로 다른 입장의 끝을 들어봤습니다. 여러분은 이 질문에 대해 어디에 서 있나요?",
        TOPIC_CLOSE: `오늘 우리는 “${stripTerminal(topic, "이 질문")}”라는 질문을 놓고 이야기했습니다. 같은 근거가 낳은 해석의 차이를 합의로 덮지 않고 기억해 두겠습니다.`,
        WRAP_OPEN: "테이블을 떠나기 전에 묻겠습니다. 오늘 대화가 여러분의 생각을 움직였나요?",
        DISCUSSION_SUMMARY: `오늘 ${uniqueNames || "세 독자"}와 사용자는 질문 “${stripTerminal(topic, "중심 질문")}”를 중심에 두고 서로 다른 판단의 근거를 비교했습니다. 무엇이 입장을 바꾸고 무엇이 끝내 남았는지 모임 기록에 담겠습니다.`,
      }
    : {
        WELCOME: `Welcome to The Reading Table. We will discuss ${input.book.title} by ${input.book.author}, but first let us meet the people sitting with us tonight.`,
        INVITE_USER: "Before we open the book, tell us a little about yourself and what brought you to the table tonight.",
        FIRST_IMPRESSIONS_OPEN: "Thank you for introducing yourself. Now let us open the book and hear everyone's honest first impression.",
        DEVILS_ADVOCATE: "Let me push from the other side for a moment. If everyone accepts this reading, what evidence are we choosing not to test?",
        SCENES_OPEN: "Which scene, passage, or idea stayed with you after the book's other details began to fade?",
        TOPIC_OPEN: `${input.discussionFocus ? `The earlier conversation kept returning to ${input.discussionFocus}. ` : ""}That gives us our central question: ${topic}`,
        ASK_USER_POSITION: "You have heard the edges of the disagreement. Where do you land on this question?",
        TOPIC_CLOSE: `We tested how the same evidence can support different answers to ${stripTerminal(topic, "this question")}. The remaining difference matters more than a forced consensus.`,
        WRAP_OPEN: "Before we leave the table, did this discussion move your view?",
        DISCUSSION_SUMMARY: `Tonight ${uniqueNames || "three readers"} and the user compared the reasons behind different answers to ${stripTerminal(topic, "the central question")}. The recap will preserve what moved, what was challenged, and what remained unresolved rather than force a single verdict.`,
      };

  return utteranceSchema.parse({
    utterance:
      responses[input.task] ??
      (isKorean
        ? "질문을 정확하게 붙잡고 지금까지 나온 대화로 돌아가 보겠습니다."
        : "Let's keep the question precise and return to the conversation so far."),
    stance: null,
    refers_to: input.targetSpeaker ?? null,
    shelf_ref: null,
  });
}

function tokenize(value: string): Set<string> {
  return new Set(
    value
      .toLocaleLowerCase()
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/u)
      .filter((token) => token.length >= 2),
  );
}

function topicPreference(topic: string, conversation: string): number {
  const topicTokens = tokenize(topic);
  const conversationTokens = tokenize(conversation);
  let overlap = 0;
  for (const token of topicTokens) if (conversationTokens.has(token)) overlap += 1;
  const thematicBoost =
    /form|structure|voice|style|형식|구조|서술/u.test(conversation) &&
    /form|형식/u.test(topic)
      ? 1
      : /social|society|history|context|사회|역사|맥락/u.test(conversation) &&
          /social|사회/u.test(topic)
        ? 1
        : 0;
  return Math.min(2, 0.3 + overlap * 0.25 + thematicBoost);
}

function userTurn(transcript: Utterance[], stage: Utterance["stage"]): Utterance | undefined {
  return transcript.find(({ speaker, stage: itemStage }) => speaker === "user" && itemStage === stage);
}

export class MockGenerationClient implements GenerationClient {
  async identifyBook(input: BookIdentificationRequest) {
    return identifyMockBook(input);
  }

  async generateReadingNotes(input: ReadingNotesRequest) {
    return makeNotes(input);
  }

  async extractDiscussionFocus(input: DiscussionFocusRequest) {
    const userConversation = input.transcript
      .filter(({ speaker }) => speaker === "user")
      .map(({ text }) => text)
      .join(" ");
    const conversation = userConversation || input.transcript.map(({ text }) => text).join(" ");
    const rawScores = input.book.candidateTopics.map((topic, index) => ({
      topic,
      relevance: topicPreference(topic, conversation) + (index === 1 ? 0.45 : 0),
    }));
    const selected = [...rawScores].sort((left, right) => right.relevance - left.relevance)[0];
    return discussionFocusSchema.parse({
      topic_scores: rawScores.map(({ topic, relevance }) => ({
        topic,
        relevance: Math.min(2, relevance),
        evidence:
          input.language === "ko"
            ? topic === selected.topic
              ? "사용자의 첫인상과 직접 고른 대목"
              : "앞선 대화와 간접적으로 연결된 질문"
            : topic === selected.topic
              ? "the user's first impression and chosen moment"
              : "a question indirectly connected to the earlier conversation",
      })),
      emergent_question: null,
      emergent_relevance: 0,
      emergent_evidence: null,
    });
  }

  async generateUtterance(input: UtteranceRequest) {
    return input.speaker === "moderator" ? moderatorUtterance(input) : personaUtterance(input);
  }

  async extractUserStance(input: UserStanceRequest) {
    const normalized = input.text.toLocaleLowerCase();
    const positive = /agree|support|persuad|동의|설득|지지/u.test(normalized);
    const negative = /disagree|reject|not |cannot|반대|아니|않/u.test(normalized);
    return userStanceSchema.parse({
      stance: positive === negative ? (input.target === "overall_impression" ? 0.5 : -0.4) : positive ? 1 : -1,
      paraphrase: input.text.trim().slice(0, 240),
    });
  }

  async generateRecap(input: RecapRequest) {
    const isKorean = input.language === "ko";
    const topic =
      Object.keys(input.userStances).find((key) => key !== "overall_impression") ??
      input.book.candidateTopics[0];
    const user = input.userStances[topic];
    const names = input.personas.map((persona) => readerName(persona, input.language));
    const personaCells = input.personas.map((persona) => {
      const stance = input.personaStances[persona.id]?.toFixed(1) ?? "0.0";
      return `${stance} — ${categoryLens[input.language][persona.category]}`;
    });
    const headers = [isKorean ? "주제" : "Topic", ...names, isKorean ? "나" : "You"];
    const row = [
      topic,
      ...personaCells,
      `${user?.stance.toFixed(1) ?? (isKorean ? "통과" : "pass")} — ${user?.paraphrase ?? (isKorean ? "기록된 입장 없음" : "No position recorded")}`,
    ];
    const scene = userTurn(input.transcript, "MEMORABLE_SCENES");
    const challenge = input.transcript.find(
      ({ speaker, refersTo }) => speaker !== "moderator" && refersTo === "user",
    );
    const challenger = challenge
      ? localizedSpeakerName(challenge.speaker, input.language)
      : isKorean
        ? "진행자"
        : "the moderator";
    const citedBooks = input.transcript
      .filter(({ shelfRef }) => shelfRef)
      .map(({ shelfRef, stage }) =>
        isKorean
          ? `- *${shelfRef}*가 ${STAGE_LABELS.ko[stage]} 단계에서 언급되었습니다.`
          : `- *${shelfRef}* was cited during ${STAGE_LABELS.en[stage].toLowerCase()}.`,
      );
    const table = `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n| ${row.join(" | ")} |`;
    const markdown = isKorean
      ? `# ${input.book.title} — 리딩 테이블 모임 기록, ${input.date}

## 토론 요약
테이블은 질문 **${stripTerminal(topic, "중심 질문")}**를 중심에 두고 ${names.join(", ")}의 서로 다른 독서 관점과 사용자의 입장을 비교했습니다. 하나의 결론을 만드는 대신 어떤 근거가 각 입장을 지탱했고 어디에서 차이가 남았는지 기록했습니다.

## 모두의 최종 입장
${table}

## 불꽃 — 실제로 부딪힌 순간
- ${challenger}가 사용자의 입장에 반대 가능성을 제시하면서, 처음 나온 해석이 다른 근거까지 설명할 수 있는지 물었습니다.

## 놓치기 쉬운 장면
- ${scene ? `사용자가 직접 고른 대목: ${excerpt(scene.text, "사용자가 고른 대목")}` : "사용자가 특정 장면을 고르지 않아 대화에서 확인되지 않은 작품 내용을 덧붙이지 않았습니다."}

## 책장에서 꺼낸 연결
${citedBooks.length > 0 ? citedBooks.join("\n") : "- 이번 모임에서는 다른 책과의 연결을 사용하지 않았습니다."}

## 잠들기 전 생각할 질문
**${stripTerminal(topic, "중심 질문")}**에 대한 지금의 답을 바꾸려면 책의 어떤 근거가 더 필요할까요?`
      : `# ${input.book.title} — Reading Table Recap, ${input.date}

## Discussion summary
The table centered on **${topic}** and compared the different reading lenses of ${names.join(", ")} with the user's position. Instead of forcing one conclusion, the group preserved which evidence supported each position and where the disagreement remained.

## Where everyone landed
${table}

## Sparks — moments of real disagreement
- ${challenger} tested the user's position by asking whether the first interpretation could account for the strongest counterevidence raised at the table.

## Scenes you might have missed
- ${scene ? `The user brought this moment to the table: ${excerpt(scene.text, "the user's chosen moment")}` : "The user did not choose a specific scene, so the recap adds no unverified book details."}

## From the shelves
${citedBooks.length > 0 ? citedBooks.join("\n") : "- No shelf comparison was used in this session."}

## A question to sleep on
What evidence from the book would change your current answer to **${stripTerminal(topic, "the central question")}**?`;

    return recapSchema.parse({ markdown });
  }
}
