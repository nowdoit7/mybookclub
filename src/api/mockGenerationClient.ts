import {
  bookIdentificationSchema,
  discussionFocusSchema,
  meetingPlanSchema,
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
  MeetingPlanRequest,
  ReadingNotesRequest,
  RecapRequest,
  UserStanceRequest,
  UtteranceRequest,
} from "./generationClient";
import { localizedSpeakerName, STAGE_LABELS } from "../localization";
import { isImaginedGuestId } from "../personas";
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
    emotional: "the feelings between people and the moments when a relationship shifts",
    analytical: "how events connect and what a character's choices change",
    contextual: "the social conditions and larger patterns surrounding the story",
  },
  ko: {
    emotional: "인물 사이의 감정과 관계가 달라지는 순간",
    analytical: "사건이 이어지는 방식과 인물의 선택이 만든 변화",
    contextual: "이야기를 둘러싼 사회적 조건과 더 큰 흐름",
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
      ? `『${title}』은 이번 리딩 테이블을 위해 사용자가 선택한 ${scope === "series" ? "시리즈" : "책"}입니다. 모의 모드는 이 작품의 줄거리나 등장인물, 구성 도서를 알고 있다고 주장하지 않습니다. 대신 사용자가 직접 들려주는 첫인상과 장면을 바탕으로 형식, 해석, 의미에 관한 세 가지 범용 질문을 발전시킵니다. 작품 범위에 맞춘 도서 정보와 구체적인 책 이야기는 실제 GPT-5.6 모드에서 확인할 수 있습니다.`
      : `${title} is the ${scope === "series" ? "series" : "book"} selected by the user for this Reading Table session. Mock mode does not claim knowledge of its plot, people, factual context, or component volumes. Instead, it develops three broad questions about form, interpretation, and significance from observations the user brings to the table. Use Live GPT-5.6 mode for scope-verified details and a work-specific conversation.`;
  const candidateTopics =
    language === "ko"
      ? [
          "이 책의 형식 때문에 어떤 부분에 더 눈이 갔나요?",
          "같은 대목에서 다른 독자는 무엇을 볼 수 있을까요?",
          "이 책은 사람이나 사회를 보는 시선을 어떻게 넓혀 주었나요?",
        ]
      : [
          "How does the book's form shape what the reader notices?",
          "What might another reader notice in the same moment?",
          "How did this book widen the way we see people or society?",
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
    ? `저는 먼저 ${lens}을 봅니다. ${input.perspectiveAssignment?.emotionalDoor ?? "다른 독자가 고른 대목이 어떤 느낌을 남겼는지 궁금합니다."}`
    : `I first notice ${lens}. ${input.perspectiveAssignment?.emotionalDoor ?? "I am curious how the moments chosen by other readers felt to them."}`;
  const assignedAnchor = input.meetingPlan?.anchors.find(
    ({ id }) => id === input.perspectiveAssignment?.anchorId,
  );

  return readingNotesSchema.parse({
    overall_take: overallTake,
    overall_stance: stances[0],
    stance_by_topic: input.book.candidateTopics.map((topic, index) => ({
      topic,
      stance: stances[index],
      reason: isKorean
        ? `${name}은 ${index + 1}번 질문에서 ${lens}을 먼저 봅니다.`
        : `${name} first notices ${lens} in question ${index + 1}.`,
    })),
    key_scenes: isKorean
      ? [
          assignedAnchor?.detail ?? "첫인상을 설명하며 직접 언급한 대목.",
          "가장 기억에 남았다고 고른 장면 또는 구절.",
          "다른 독자의 말을 듣고 새롭게 보인 순간.",
        ]
      : [
          assignedAnchor?.detail ?? "The moment identified while explaining a first impression.",
          "The scene or passage chosen as the one that stayed longest.",
          "A moment that looked different after hearing another reader.",
        ],
    shelf_connections: [],
    personal_reaction: isKorean
      ? "사용자가 고른 대목을 들으면 제가 미처 보지 못한 부분을 발견할 것 같아 궁금합니다."
      : "I am curious which moment the user chooses, because it may reveal something I missed.",
    unresolved_question: isKorean
      ? "내 독서 관점이 이 책의 다른 가능성을 너무 일찍 가두지는 않을까?"
      : "Could my usual reading lens close off another possibility too early?",
    possible_revision: isKorean
      ? "다른 독자의 장면과 느낌을 들으며 제 시야를 넓히겠습니다."
      : "I will widen my view by listening to another reader's scene and response.",
    question_for_table:
      input.perspectiveAssignment?.questionToExplore ??
      (isKorean
        ? "이 장면에서 여러분은 무엇이 가장 먼저 보였나요?"
        : "What did each of you notice first in this moment?"),
  });
}

function prepareMockMeetingPlan(input: MeetingPlanRequest) {
  const isKorean = input.language === "ko";
  const anchorTemplates = isKorean
    ? [
        ["scene", "처음의 판단이 흔들리는 대목", "처음 세운 판단과 다른 행동 또는 결과가 나타나는 구체적인 대목을 확인합니다."],
        ["character_relationship", "인물 사이의 거리 변화", "한 인물이 다른 인물을 대하는 태도가 달라지는 순간을 관계의 흐름에서 살펴봅니다."],
        ["form", "독자가 정보를 받는 순서", "서술과 구성의 순서가 독자의 첫 판단에 어떤 영향을 주는지 살펴봅니다."],
        ["context", "선택을 둘러싼 조건", "개인의 선택만으로 설명하기 어려운 사회적 또는 역사적 조건을 구분합니다."],
        ["emotion", "말하지 못한 감정", "인물이 직접 설명하지 않은 감정을 행동과 관계의 변화에서 조심스럽게 읽습니다."],
        ["question", "끝까지 남는 물음", "책이 결론을 닫지 않고 독자에게 남겨 둔 질문을 확인합니다."],
        ["scene", "결과가 분명해지는 대목", "앞선 선택이 다른 인물이나 공동체에 미친 결과가 구체화되는 대목을 살펴봅니다."],
        ["form", "반복되는 이미지나 장치", "작품에서 되풀이되는 이미지 또는 형식적 장치가 감상에 미치는 영향을 살펴봅니다."],
      ]
    : [
        ["scene", "A moment that unsettles the first judgment", "Examine a concrete moment where an action or consequence complicates the reader's first judgment."],
        ["character_relationship", "A shift in distance between people", "Notice when one character's way of treating another changes the shape of their relationship."],
        ["form", "The order in which the reader learns things", "Consider how narration and structure influence the reader's first judgment."],
        ["context", "Conditions surrounding a choice", "Separate an individual's choice from the social or historical conditions around it."],
        ["emotion", "An emotion left unspoken", "Read an unspoken feeling cautiously through actions and changes in relationship."],
        ["question", "A question the ending leaves open", "Identify the question the book leaves with the reader instead of closing down."],
        ["scene", "A moment when consequences become visible", "Look at where an earlier choice has a concrete consequence for another person or group."],
        ["form", "A recurring image or device", "Consider how a recurring image or formal device shapes the reading experience."],
      ];

  const anchors = anchorTemplates.map(([kind, label, detail], index) => ({
    id: `anchor-${index + 1}`,
    kind,
    label,
    detail,
    is_common_interpretation: index === 0,
  }));

  return meetingPlanSchema.parse({
    research_brief: isKorean
      ? "모의 모드는 작품의 줄거리나 장면을 알고 있다고 주장하지 않습니다. 대신 한 권의 책을 여러 방향에서 읽기 위한 구조적 관점 입구를 준비합니다. 실제 작품의 구체적인 장면과 맥락은 라이브 모드의 검증된 웹 리서치로 채워집니다. 캐릭터에게는 결론이 아니라 서로 다른 관심과 질문만 배정됩니다."
      : "Mock mode does not claim knowledge of the book's plot or scenes. It prepares structural entrances for reading one work from several directions. Live mode replaces these placeholders with web-grounded scenes and context. Personas receive different objects of attention and questions, never assigned conclusions.",
    anchors,
    primary_prompt: isKorean
      ? "이 책을 다 읽고 나서 처음과 다르게 보인 인물이나 선택이 있었나요?"
      : "Which person or choice looked different after you finished the book?",
    reserve_prompt: isKorean
      ? "다른 독자의 이야기를 듣고 다시 보고 싶은 장면은 어디인가요?"
      : "Which scene would you revisit after hearing another reader?",
    assignments: input.personas.map((persona, index) => ({
      persona_id: persona.id,
      anchor_id: anchors[index + 1].id,
      emotional_door: isKorean
        ? `${categoryLens.ko[persona.category]}을 보며 생긴 구체적인 감정을 숨기지 않습니다.`
        : `Name the concrete feeling created by noticing ${categoryLens.en[persona.category]}.`,
      question_to_explore: isKorean
        ? `${anchors[index + 1].label}을 다른 독자는 어떻게 보았을까요?`
        : `How might another reader understand ${anchors[index + 1].label.toLocaleLowerCase()}?`,
    })),
    uncertainties: isKorean
      ? ["모의 모드에서는 작품 고유의 사실을 확인하지 않습니다."]
      : ["Mock mode does not verify work-specific facts."],
    connection_concepts: isKorean
      ? ["판단의 변화", "관계의 거리", "선택을 둘러싼 조건"]
      : ["changing judgments", "relational distance", "conditions surrounding choice"],
    sources:
      input.book.verificationStatus === "verified"
        ? input.book.sources.slice(0, 8)
        : [],
  });
}

function personaIntroduction(persona: PersonaCard, language: AppLanguage): string {
  const name = readerName(persona, language);
  if (isImaginedGuestId(persona.id) && persona.imaginedGuest) {
    const guestGrounding =
      persona.imaginedGuest.kind === "literary"
        ? language === "ko"
          ? "원작의 특징을 바탕으로 재구성된 문학 게스트"
          : "an imagined literary guest grounded in the original character"
        : persona.imaginedGuest.kind === "legendary"
          ? language === "ko"
            ? "전승과 작품을 바탕으로 재구성된 상상 속 게스트"
            : "an imagined guest grounded in an attributed literary tradition"
          : language === "ko"
            ? "기록으로 남은 생각을 바탕으로 재구성된 상상 속 게스트"
            : "an imagined guest reconstructed from documented ideas";
    return language === "ko"
      ? `저는 ${guestGrounding} ${name}입니다. ${persona.socialIntroSeed.ko}`
      : `I'm ${name}, ${guestGrounding}. ${persona.socialIntroSeed.en}`;
  }
  return language === "ko"
    ? `안녕하세요, ${name}입니다. ${persona.socialIntroSeed.ko}`
    : `Hi, I'm ${name}. ${persona.socialIntroSeed.en}`;
}

function closingReflection(persona: PersonaCard, language: AppLanguage): string {
  const takeaway =
    language === "ko"
      ? {
          emotional: "오늘은 감정이 무엇을 보여 주고 또 무엇을 놓칠 수 있는지 더 분명해졌어요.",
          analytical: "오늘은 다른 분들의 이야기를 들으며 한 장면 안에도 여러 선택과 결과가 함께 있다는 걸 봤습니다.",
          contextual: "오늘은 한 사람의 선택을 둘러싼 조건까지 함께 볼 때 이야기가 더 넓어진다는 걸 느꼈습니다.",
        }[persona.category]
      : {
          emotional: "I am leaving with a clearer sense of what feeling can reveal and what it can miss.",
          analytical: "Hearing the table helped me see how several choices and consequences can live in one scene.",
          contextual: "I am leaving with a wider view of the conditions surrounding a person's choices.",
        }[persona.category];
  const farewell =
    language === "ko"
      ? {
          emotional: "서로 다른 마음을 들을 수 있어 즐거웠고, 다음 책에서도 다시 만나고 싶어요.",
          analytical: "제가 놓친 장면을 들을 수 있어 좋았습니다. 다음 테이블에서 뵙죠.",
          contextual: "함께 시야를 넓혀 가는 대화가 즐거웠고, 다음 책에서 또 만나요.",
        }[persona.category]
      : {
          emotional: "I loved hearing how differently this table felt the book, and I hope we meet over another one.",
          analytical: "I enjoyed hearing about the moments I missed. See you at the next table.",
          contextual: "I enjoyed widening the view together; until the next book.",
        }[persona.category];

  return `${takeaway} ${farewell}`;
}

function personaUtterance(input: UtteranceRequest): UtteranceOutput {
  const persona = input.speaker === "moderator" ? undefined : input.speaker;
  if (!persona) throw new Error("A persona is required for a persona mock utterance.");
  const isKorean = input.language === "ko";
  const targetName = input.targetSpeaker
    ? (input.participants.find(({ id }) => id === input.targetSpeaker)?.displayName ??
      localizedSpeakerName(input.targetSpeaker, input.language))
    : isKorean
      ? "다른 독자"
      : "another reader";
  const usesDefaultUserLabel =
    input.targetSpeaker === "user" &&
    targetName === localizedSpeakerName("user", input.language);
  const targetVocative = usesDefaultUserLabel
    ? ""
    : isKorean
      ? `${targetName}님`
      : targetName;
  const address = targetVocative ? `${targetVocative}, ` : "";
  const reason = categoryLens[input.language][persona.category];
  const userMoment = excerpt(
    lastUserTurn(input),
    isKorean ? "방금 고른 대목" : "the chosen moment",
    120,
  ).replace(/[.!?。？！]+$/gu, "");
  const shelfRef = input.allowShelfReference ? persona.bookshelf[0]?.title ?? null : null;
  const sceneAnchor = input.discussionFocus?.trim()
    ? excerpt(input.discussionFocus, isKorean ? "선택된 장면" : "the selected scene", 160).replace(
        /[.!?。？！]+$/gu,
        "",
      )
    : undefined;
  const moodLead = isKorean
    ? input.roomAtmosphere.playfulness >= 0.58
      ? "이 대목은 서로 다르게 본 부분을 꺼내기 좋겠네요."
      : input.roomAtmosphere.tension >= 0.55
        ? "저는 조금 다른 부분이 먼저 보였습니다."
        : input.roomAtmosphere.warmth >= 0.65
          ? "서두르지 않고 제 쪽에서 보이는 것을 말해 볼게요."
          : "저는 이 장면에서 먼저 보인 것을 말해 볼게요."
    : input.roomAtmosphere.playfulness >= 0.58
      ? "This is a good moment to bring in what each of us noticed."
      : input.roomAtmosphere.tension >= 0.55
        ? "A different part of the moment stood out to me."
        : input.roomAtmosphere.warmth >= 0.65
          ? "I will start with what I can see from my side of the table."
          : "I will share what I noticed first in this scene.";
  const responses: Partial<Record<UtteranceRequest["task"], string>> = isKorean
    ? {
        PERSONA_INTRODUCTION: personaIntroduction(persona, input.language),
        FIRST_IMPRESSION: input.notes?.overallTake,
        OPEN_PERSONA_POSITION: `${moodLead} 제게는 ${reason}이 먼저 들어왔습니다. 앞서 나온 장면과 함께 이야기해 보고 싶어요.`,
        CHALLENGE_PERSONA: `${address}말씀을 듣고 보니 그 장면이 다르게 보이네요. 저는 같은 대목에서 ${reason}을 먼저 봤습니다. 두 시선을 함께 놓으니 장면이 더 선명해집니다.`,
        RESPOND_TO_PERSONA: `${address}그렇게 읽을 수도 있겠네요. 저는 ${reason} 쪽을 먼저 봤는데, 말씀을 들으니 제가 놓친 부분이 보입니다.`,
        CHALLENGE_USER: `${address}말씀하신 느낌이 이해돼요. 특히 어느 장면 때문에 그렇게 읽으셨나요?`,
        MEMORABLE_SCENE: sceneAnchor
          ? `저는 “${sceneAnchor}”에 머물겠습니다. ${reason} 쪽에 무게를 두고, 그 순간이 무엇을 보여 주고 무엇을 끝내 남겨 두는지 생각해 보고 싶어요.`
          : shelfRef
            ? `저는 책의 중심 긴장이 가장 선명해지는 대목을 다시 보고 싶습니다. 제 책장에서는 『${shelfRef}』도 비슷한 질문을 던지지만, 지금은 어떤 장면이 오래 남았는지 먼저 듣겠습니다.`
            : "저는 책의 중심 긴장이 가장 선명해지는 대목을 다시 보고 싶습니다. 구체적인 장면은 지어내지 않고, 여러분이 기억한 순간을 들은 뒤 제 관점을 보태겠습니다.",
        REACT_TO_USER_SCENE: `방금 들은 “${userMoment}” 덕분에 앞선 이야기가 훨씬 구체적으로 다가옵니다. 저는 그 대목에서 ${categoryLens.ko[persona.category]}도 함께 보였어요.`,
        RESPOND_TO_USER_REPLY: `${address}그 장면 때문에 그렇게 느끼셨군요. 저는 다른 부분을 먼저 봤는데, 말씀을 듣고 나니 두 느낌이 함께 이해됩니다.`,
        RESPOND_TO_USER_FOLLOWUP: `${address}덧붙인 설명을 들으니 왜 그렇게 읽으셨는지 알겠어요. 저는 ${reason}도 함께 생각해 보게 됩니다.`,
        BRIDGE_EXCHANGE: `${address}저는 여기에 다른 시선 하나를 보태고 싶어요. ${reason}까지 함께 보면 앞선 이야기가 조금 더 넓어집니다.`,
        CLOSING_REFLECTION: closingReflection(persona, input.language),
      }
    : {
        PERSONA_INTRODUCTION: personaIntroduction(persona, input.language),
        FIRST_IMPRESSION: input.notes?.overallTake,
        OPEN_PERSONA_POSITION: `${moodLead} I first noticed ${reason}. I would like to place that beside the scene already on the table.`,
        CHALLENGE_PERSONA: `${targetName}, hearing you makes the scene look different. I first noticed ${reason}; putting both views together gives the moment more depth.`,
        RESPOND_TO_PERSONA: `${targetName}, I can see that reading. I first noticed ${reason}, and your comment helps me see what I missed.`,
        CHALLENGE_USER: `${targetName}, I can understand that response. Which scene especially led you to read it that way?`,
        MEMORABLE_SCENE: sceneAnchor
          ? `I want to stay with the scene “${sceneAnchor}.” Through ${reason}, I want to consider what that moment reveals and what it leaves unsettled.`
          : shelfRef
            ? `I want to return to the passage where the book's central tension becomes clearest. ${shelfRef} asks a related question on my shelf, but I would rather hear which moment stayed with you before making a comparison.`
            : "I want to return to the passage where the book's central tension becomes clearest. I will not invent a scene here; I would rather hear the moment you actually remember and respond to it.",
        REACT_TO_USER_SCENE: `Hearing “${userMoment}” makes the earlier conversation much more concrete. I also noticed ${categoryLens.en[persona.category]} in that moment.`,
        RESPOND_TO_USER_REPLY: `${targetName}, now I understand why that scene led you there. I noticed something else first, but both responses can sit together.`,
        RESPOND_TO_USER_FOLLOWUP: `${targetName}, that addition helps me understand your reading. It also makes me think about ${reason}.`,
        BRIDGE_EXCHANGE: `${targetName}, I want to add one more perspective. Looking at ${reason} can widen the conversation we just had.`,
        CLOSING_REFLECTION: closingReflection(persona, input.language),
      };
  const utterance =
    responses[input.task] ??
    (isKorean
      ? `『${input.book.title}』에 관해 제가 먼저 본 것은 ${reason}입니다. 작품 밖의 사실을 더하지 않고 지금까지 나온 대화에 제 시선을 보태겠습니다.`
      : `What I noticed first in ${input.book.title} was ${reason}. I will add that perspective without inventing facts that were never raised.`);

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
  const userFirstImpression = excerpt(
    lastUserTurn(input),
    isKorean ? "방금 들려준 첫인상" : "the first impression you just shared",
    70,
  ).replace(/[.!?。？！]+$/gu, "");
  const responses: Partial<Record<UtteranceRequest["task"], string>> = isKorean
    ? {
        WELCOME: `리딩 테이블에 오신 것을 환영합니다. 오늘 함께 이야기할 책은 ${input.book.author}의 『${input.book.title}』입니다. 먼저 같은 테이블에 앉은 분들과 인사부터 나누겠습니다.`,
        INVITE_USER: "이번에는 여러분 차례예요. 하시는 일이나 요즘 어떻게 지내는지, 최근의 독서 생활처럼 편한 이야기로 자신을 소개해 주시겠어요?",
        FIRST_IMPRESSIONS_OPEN: "혼자 읽을 때와는 다른 관점을 듣고 싶다는 말이 인상적이네요. 이제 책으로 들어가되 구체적인 장면은 다음 순서에 남겨 두고, 책을 덮었을 때의 전체적인 느낌이나 질문부터 이야기해 볼까요?",
        DEVILS_ADVOCATE: "괜찮습니다. 잠시 쉬어 가셔도 돼요. 이번에는 다른 분이 이 대목에서 무엇을 보았는지 들어볼까요?",
        SCENES_OPEN: `“${userFirstImpression}”라는 첫인상이 어디에서 시작됐는지 궁금해지네요. 이번에는 그 느낌을 만든 구체적인 장면이나 대목 하나를 골라볼까요?`,
        TOPIC_OPEN: `${input.discussionFocus ? "앞서 나온 장면과 첫인상을 이어서 이야기해 보죠. " : ""}${topic}`,
        ASK_USER_POSITION: "다른 분들의 이야기를 들으셨는데요. 여러분은 이 대목에서 무엇을 느끼거나 생각하셨나요?",
        TOPIC_CLOSE: `오늘은 “${stripTerminal(topic, "이 질문")}”를 두고 각자 먼저 보인 장면과 느낌을 나눴습니다. 같은 부분과 다르게 읽은 부분을 모두 가져가겠습니다.`,
        WRAP_OPEN: "다른 분들의 이야기를 들으며 새롭게 보인 부분이 있나요? 오늘 대화에서 가져갈 생각을 마지막으로 들려주세요.",
        DISCUSSION_SUMMARY: `오늘 테이블에서는 “${stripTerminal(topic, "중심 질문")}”를 중심에 두고 각자 먼저 본 장면과 느낌을 나눴습니다. 여러분의 이야기에 다른 독자들의 시선이 더해지면서 한 가지 결론보다 여러 가능성이 보였습니다. 생각을 편하게 나눠 주셔서 고맙습니다. 이제 모임 기록에서 오늘 넓어진 생각을 정리해 보겠습니다.`,
      }
    : {
        WELCOME: `Welcome to Open Reading Club. We will discuss ${input.book.title} by ${input.book.author}, but first let us meet the people sitting with us tonight.`,
        INVITE_USER: "Now it is your turn. Tell us a little about your work, everyday life, or what reading has looked like for you lately.",
        FIRST_IMPRESSIONS_OPEN: "You came to hear what reading alone might have missed. Let us open the book, save specific scenes for the next round, and begin with the overall feeling or question it left behind.",
        DEVILS_ADVOCATE: "That is fine; you can sit this one out. Let us hear what another reader noticed in this moment.",
        SCENES_OPEN: `I am curious where the impression “${userFirstImpression}” began. Which concrete scene, passage, image, or example produced it?`,
        TOPIC_OPEN: `${input.discussionFocus ? `The earlier conversation kept returning to ${input.discussionFocus}. ` : ""}That gives us our central question: ${topic}`,
        ASK_USER_POSITION: "You have heard what the other readers noticed. What did you feel or think in this part of the book?",
        TOPIC_CLOSE: `We shared the scenes and feelings that first came to mind around ${stripTerminal(topic, "this question")}. We can carry both the common ground and the different readings with us.`,
        WRAP_OPEN: "Did another reader help you notice something new? Before we leave the table, what thought will you carry from this conversation?",
        DISCUSSION_SUMMARY: `Tonight we explored ${stripTerminal(topic, "the central question")} by sharing the scenes and feelings each person noticed first. Adding your reading to the other perspectives opened several possibilities instead of one final answer. Thank you for sharing the table. The written recap comes next.`,
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

  async prepareMeetingPlan(input: MeetingPlanRequest) {
    return prepareMockMeetingPlan(input);
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
      userRelevance: topicPreference(topic, userConversation),
    }));
    const selected = [...rawScores].sort((left, right) => right.relevance - left.relevance)[0];
    return discussionFocusSchema.parse({
      topic_scores: rawScores.map(({ topic, relevance, userRelevance }) => ({
        topic,
        relevance: Math.min(2, relevance),
        evidence:
          input.language === "ko"
            ? topic === selected.topic
              ? "함께 나눈 첫인상과 직접 고른 대목"
              : "앞선 대화와 간접적으로 연결된 질문"
            : topic === selected.topic
              ? "the first impression and chosen moment shared at the table"
              : "a question indirectly connected to the earlier conversation",
        user_relevance: Math.min(2, userRelevance),
        user_evidence: userConversation
          ? excerpt(userConversation, input.language === "ko" ? "사용자 발언" : "the user's remark", 160)
          : null,
      })),
      emergent_question: null,
      emergent_relevance: 0,
      emergent_evidence: null,
      emergent_user_relevance: 0,
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
      stance: positive === negative ? 0 : positive ? 1 : -1,
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
    const perspectiveRows: string[][] = input.personas.map((persona) => [
      readerName(persona, input.language),
      isKorean
        ? `먼저 본 것은 ${categoryLens.ko[persona.category]}입니다. 그 시선을 다른 독자의 장면과 나란히 놓았습니다.`
        : `First noticed ${categoryLens.en[persona.category]} and placed that view beside the other readers' scenes.`,
    ]);
    perspectiveRows.push([
      input.userDisplayName,
      user?.paraphrase ??
        (isKorean
          ? "이번 질문에서는 의견을 보태지 않고 다른 독자들의 이야기를 들었습니다."
          : "Listened to the other readers without adding a response to this question."),
    ]);
    const scene = userTurn(input.transcript, "MEMORABLE_SCENES");
    const readerExchange = input.transcript.find(
      ({ speaker, refersTo }) =>
        speaker !== "moderator" &&
        speaker !== "user" &&
        Boolean(refersTo) &&
        refersTo !== "user" &&
        refersTo !== "moderator",
    );
    const readingDifference = readerExchange
      ? isKorean
        ? `- ${localizedSpeakerName(readerExchange.speaker, input.language)}는 ${localizedSpeakerName(readerExchange.refersTo!, input.language)}의 이야기를 들은 뒤 자신이 먼저 본 부분을 보탰습니다. 어느 쪽이 맞는지 가르기보다 같은 장면을 두 시선으로 넓혀 보았습니다.`
        : `- After hearing ${localizedSpeakerName(readerExchange.refersTo!, input.language)}, ${localizedSpeakerName(readerExchange.speaker, input.language)} added what they had noticed first. The table widened the scene through two views instead of deciding which one was right.`
      : isKorean
        ? "- 이번 모임에서는 서로 정면으로 충돌한 해석이 없었습니다. 각자가 먼저 본 장면과 느낌을 더하며 대화를 넓혔습니다."
        : "- No readings directly conflicted in this session. Each person widened the conversation by adding a scene or feeling they noticed first.";
    const citedBooks = input.transcript
      .filter(({ shelfRef }) => shelfRef)
      .map(({ shelfRef, stage }) =>
        isKorean
          ? `- *${shelfRef}*가 ${STAGE_LABELS.ko[stage]} 단계에서 언급되었습니다.`
          : `- *${shelfRef}* was cited during ${STAGE_LABELS.en[stage].toLowerCase()}.`,
      );
    const headers = [
      isKorean ? "참여자" : "Reader",
      isKorean ? "가져간 생각" : "What they took away",
    ];
    const table = `| ${headers.join(" | ")} |\n| ${headers.map(() => "---").join(" | ")} |\n${perspectiveRows
      .map((row) => `| ${row.join(" | ")} |`)
      .join("\n")}`;
    const markdown = isKorean
      ? `# ${input.book.title} — 리딩 테이블 모임 기록, ${input.date}

## 오늘 나눈 이야기
테이블은 **${stripTerminal(topic, "중심 질문")}**를 중심에 두고 ${names.join(", ")}와 ${input.userDisplayName}이 각자 먼저 본 장면과 느낌을 나눴습니다. 같은 결론을 만들기보다 다른 독자의 말을 통해 책과 사람을 보는 시선이 어디까지 넓어졌는지 기록했습니다.

## 각자가 가져간 생각
${table}

## 서로 다르게 읽은 순간
${readingDifference}

## 놓치기 쉬운 장면
- ${scene ? `사용자가 직접 고른 대목: ${excerpt(scene.text, "사용자가 고른 대목")}` : "사용자가 특정 장면을 고르지 않아 대화에서 확인되지 않은 작품 내용을 덧붙이지 않았습니다."}

## 책장에서 꺼낸 연결
${citedBooks.length > 0 ? citedBooks.join("\n") : "- 이번 모임에서는 다른 책과의 연결을 사용하지 않았습니다."}

## 잠들기 전 생각할 질문
오늘 다른 독자가 보탠 시선 중, 다음에 책을 펼칠 때 다시 확인하고 싶은 것은 무엇인가요?`
      : `# ${input.book.title} — Reading Table Recap, ${input.date}

## What we explored
The table centered on **${topic}** as ${names.join(", ")} and ${input.userDisplayName} shared the scenes and feelings they noticed first. Rather than forcing one conclusion, the recap records how listening to another reader widened the view of the book and its people.

## What each reader took away
${table}

## Where readings differed
${readingDifference}

## Scenes you might have missed
- ${scene ? `The user brought this moment to the table: ${excerpt(scene.text, "the user's chosen moment")}` : "The user did not choose a specific scene, so the recap adds no unverified book details."}

## From the shelves
${citedBooks.length > 0 ? citedBooks.join("\n") : "- No shelf comparison was used in this session."}

## A question to sleep on
Which perspective added by another reader would you like to revisit the next time you open the book?`;

    return recapSchema.parse({ markdown });
  }
}
