import {
  bookIdentificationSchema,
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
  GenerationClient,
  ReadingNotesRequest,
  RecapRequest,
  UserStanceRequest,
  UtteranceRequest,
} from "./generationClient";
import { STAGE_LABELS } from "../localization";

const englishBook = bookIdentificationSchema.parse({
  canonical_title: "The Stranger",
  author: "Albert Camus",
  summary:
    "Meursault, a detached office worker in French Algeria, moves through his mother's funeral and a chain of ordinary events with unsettling emotional distance. After killing an unnamed Arab man on a beach, he is tried as much for his behavior at the funeral as for the act itself. The novel examines social judgment, absurdity, alienation, and the demand that a person perform recognizable meaning. Its spare narration leaves readers arguing over whether Meursault is honest, numb, condemned by society, or responsible in ways he refuses to name.",
  main_characters: ["Meursault", "Marie Cardona", "Raymond Sintès"],
  candidate_topics: [
    "Is Meursault's emotional detachment honesty, pathology, or refusal?",
    "What is the court truly judging during Meursault's trial?",
    "Does accepting the absurd create freedom or excuse responsibility?",
  ],
  confidence: "high",
});

const koreanBook = bookIdentificationSchema.parse({
  canonical_title: "이방인",
  author: "알베르 카뮈",
  summary:
    "프랑스령 알제리에 사는 회사원 뫼르소는 어머니의 장례와 이어지는 일상을 불편할 만큼 감정적인 거리감을 두고 통과한다. 해변에서 이름 없는 아랍인을 살해한 뒤 그는 살인 행위뿐 아니라 장례식에서 보인 태도까지 함께 심판받는다. 소설은 사회적 판단, 부조리, 소외, 그리고 삶에 익숙한 의미를 요구하는 공동체를 살핀다. 절제된 서술은 뫼르소가 정직한지 무감각한지, 사회에 의해 단죄되는지 혹은 스스로 책임을 회피하는지 계속 논쟁하게 한다.",
  main_characters: ["뫼르소", "마리 카르도나", "레몽 생테스"],
  candidate_topics: [
    "뫼르소의 감정적 거리두기는 정직함인가, 병리인가, 아니면 거부인가?",
    "재판정은 뫼르소의 어떤 행동을 진정으로 심판하고 있는가?",
    "부조리를 받아들이는 태도는 자유를 주는가, 책임을 피하게 하는가?",
  ],
  confidence: "high",
});

const stanceProfiles: Record<string, number[]> = {
  maddie: [1.5, -1.2, 0.4],
  dot: [0.4, -1.1, -0.3],
  tyler: [0.2, -0.8, 0.5],
  marcus: [-1.4, 1.3, -1.2],
  eleanor: [0.8, 0.9, 1.1],
  sarah: [1.1, -0.4, 0.2],
  dev: [-0.3, 1.5, 0.8],
  jamal: [0.5, 0.7, 1.3],
};

const koreanNames: Record<string, string> = {
  maddie: "매디",
  dot: "도트",
  tyler: "타일러",
  marcus: "마커스",
  eleanor: "엘리너",
  sarah: "세라",
  dev: "데브",
  jamal: "자말",
};

function makeNotes(input: ReadingNotesRequest): ReadingNotesOutput {
  const stances = stanceProfiles[input.persona.id] ?? [0, 0, 0];
  const isKorean = input.language === "ko";
  return readingNotesSchema.parse({
    overall_take: isKorean
      ? `${koreanNames[input.persona.id] ?? input.persona.name}는 이 소설의 감정적 절제가 공허하기보다 생산적으로 불편하다고 본다. 독자가 한 사람의 삶을 판단할 때 사용하는 기준 자체를 돌아보게 한다는 점에서 이 책은 성공한다.`
      : `${input.persona.name} finds the novel's emotional restraint productively unsettling rather than empty. The book succeeds because it makes the reader examine the standards used to judge a life.`,
    overall_stance: stances[0],
    stance_by_topic: input.book.candidateTopics.map((topic, index) => ({
      topic,
      stance: stances[index],
      reason: isKorean
        ? `${index + 1}번 주제의 긴장은 이 인물의 독서 관점으로 보면 그냥 지나칠 수 없다.`
        : `${input.persona.lens} This lens makes the tension in topic ${index + 1} impossible to dismiss.`,
    })),
    key_scenes: isKorean
      ? [
          "장례식장의 사회적 의례가 뫼르소의 내면만큼 중요하게 다뤄지는 밤샘 장면.",
          "재판정이 살인보다 장례식의 태도로 반복해서 돌아가는 장면.",
          "죽음의 확실성과 마주하는 사제와의 마지막 대면 장면.",
        ]
      : [
          "The vigil, where the surrounding social rituals matter as much as Meursault's interior response.",
          "The courtroom's repeated return to the funeral instead of limiting itself to the killing.",
          "The final confrontation with the chaplain and the certainty of death.",
        ],
    shelf_connections: input.persona.bookshelf.slice(0, 1).map((book) =>
      isKorean ? `${book.title}: 이 작품의 도덕적 질문을 선명하게 한다.` : `${book.title}: ${book.takeaway}`,
    ),
  });
}

function personaUtterance(input: UtteranceRequest): UtteranceOutput {
  const speaker = input.speaker === "moderator" ? undefined : input.speaker;
  const name = speaker?.name ?? "Reader";
  const koreanName = speaker ? (koreanNames[speaker.id] ?? speaker.name) : "독자";
  const shelfRef = input.allowShelfReference ? (speaker?.bookshelf[0]?.title ?? null) : null;
  const isKorean = input.language === "ko";
  const englishResponses: Partial<Record<UtteranceRequest["task"], string>> = {
    PERSONA_INTRODUCTION: `I'm ${name}, and I tend to read through ${(speaker?.lens.toLowerCase() ?? "a clear lens").replace(/[.!?]+$/u, "")}. I want to know what this book asks us to notice before we decide what it means.`,
    FIRST_IMPRESSION: `${input.notes?.overallTake ?? "The novel's restraint kept challenging my first judgment."} I am not willing to call that detachment morally neutral.`,
    CHALLENGE_USER: "I hear the user's point, but the scene-level evidence does not let us stop there. If the character's honesty harms other people, why should honesty alone earn our sympathy?",
    MEMORABLE_SCENE: shelfRef
      ? `My shelf connection is ${shelfRef}: ${(speaker?.bookshelf[0]?.takeaway ?? "it sharpens the moral question").replace(/[.!?]+$/u, "")}. In this novel, the courtroom's return to the funeral makes social conformity feel like the hidden crime on trial.`
      : "Did anyone else catch how the courtroom keeps circling back to the funeral, almost replacing the actual charge? That scene made social conformity feel like the hidden crime on trial.",
    REACT_TO_USER_SCENE: "That scene matters because it turns physical detail into moral pressure without explaining it for us. I think the user's reading catches the discomfort, but not yet the responsibility attached to it.",
    TOPIC_POSITION: `My position is ${input.notes?.stanceByTopic.find((item) => item.topic === input.activeTopic)?.reason ?? "that the text resists a clean verdict"} The ambiguity is deliberate, but ambiguity does not erase consequence.`,
    PERSONA_EXCHANGE: "I agree that the form withholds easy judgment, but that does not make every judgment equally weak. The courtroom may be unfair and Meursault may still be responsible; those claims can coexist.",
    CLOSING_REFLECTION: "The discussion moved me on how strongly the trial polices recognizable grief. I still hold my core position, but I now see the social verdict and the moral verdict as less separable than I did at the start.",
  };
  const koreanResponses: Partial<Record<UtteranceRequest["task"], string>> = {
    PERSONA_INTRODUCTION: `저는 ${koreanName}이고, 익숙한 판단보다 장면이 실제로 보여 주는 것을 먼저 살피는 편이에요. 이 책이 의미를 말하기 전에 우리에게 무엇을 보라고 요구하는지 궁금합니다.`,
    FIRST_IMPRESSION: `${input.notes?.overallTake ?? "이 소설의 절제된 태도는 첫 판단을 계속 흔듭니다."} 그렇다고 그 거리두기를 도덕적으로 중립이라고 부르지는 않겠습니다.`,
    CHALLENGE_USER: "말씀하신 구분은 이해하지만 장면 속 증거를 보면 거기서 멈출 수는 없습니다. 인물의 정직함이 다른 사람에게 해를 준다면, 정직하다는 이유만으로 왜 우리의 공감을 받아야 할까요?",
    MEMORABLE_SCENE: shelfRef
      ? `제 책장에서는 ${shelfRef}가 이 장면의 도덕적 질문을 더 선명하게 해 줍니다. 이 소설에서 재판정이 계속 장례식으로 돌아가는 순간, 사회적 순응이 숨겨진 죄목처럼 느껴집니다.`
      : "재판정이 실제 혐의보다 장례식으로 계속 돌아가는 장면을 보셨나요? 그 순간 사회적 순응이 숨겨진 죄목처럼 느껴졌습니다.",
    REACT_TO_USER_SCENE: "그 장면은 신체적 감각을 설명 없이 도덕적 압력으로 바꾸기 때문에 중요합니다. 사용자의 해석은 불편함을 정확히 짚었지만 그 뒤에 따르는 책임까지는 아직 충분히 다루지 않았다고 봅니다.",
    TOPIC_POSITION: `제 입장은 ${input.notes?.stanceByTopic.find((item) => item.topic === input.activeTopic)?.reason ?? "본문이 단순한 판결을 거부한다는 것"} 모호함은 의도적이지만, 모호하다고 해서 결과에 대한 책임까지 사라지지는 않습니다.`,
    PERSONA_EXCHANGE: "작품의 형식이 쉬운 판단을 막는다는 점에는 동의하지만, 그렇다고 모든 판단이 똑같이 약한 것은 아닙니다. 재판은 부당할 수 있고 동시에 뫼르소에게 책임이 있을 수도 있습니다.",
    CLOSING_REFLECTION: "이번 대화를 통해 재판이 알아보기 쉬운 슬픔을 얼마나 강하게 요구하는지 더 분명히 보게 됐습니다. 핵심 입장은 유지하지만 사회적 판결과 도덕적 판결이 처음 생각보다 더 얽혀 있다는 점은 인정합니다.",
  };

  return utteranceSchema.parse({
    utterance:
      (isKorean ? koreanResponses[input.task] : englishResponses[input.task]) ??
      (isKorean
        ? `${input.book.title}의 이 장면에 대해서는 분명한 생각이 있습니다. 이 장면은 하나의 판결로 정리되지 않습니다.`
        : `I have a clear response to this moment in ${input.book.title}. The scene complicates any single verdict.`),
    stance:
      input.activeTopic && input.notes
        ? (input.notes.stanceByTopic.find((item) => item.topic === input.activeTopic)?.stance ??
          input.notes.overallStance)
        : (input.notes?.overallStance ?? null),
    refers_to: input.targetSpeaker ?? null,
    shelf_ref: shelfRef,
  });
}

function moderatorUtterance(input: UtteranceRequest): UtteranceOutput {
  const isKorean = input.language === "ko";
  const englishResponses: Partial<Record<UtteranceRequest["task"], string>> = {
    WELCOME: `Welcome to The Reading Table for ${input.book.title} by ${input.book.author}. Tonight our three readers will test three different readings rather than chase one correct answer.`,
    INVITE_USER: "And you—what brings you to this book?",
    FIRST_IMPRESSIONS_OPEN: "Let's go around: what was your first honest impression?",
    DEVILS_ADVOCATE: "Let me push back for a moment: if everyone accepts that reading, what uncomfortable evidence are we choosing not to test?",
    SCENES_OPEN: "Which scene stayed with you after the plot itself began to fade?",
    TOPIC_OPEN: `Our central question is this: ${input.activeTopic}`,
    ASK_USER_POSITION: "You have heard the edges of the disagreement; where do you land?",
    TOPIC_CLOSE: "The tension remains: social judgment can be distorted while personal responsibility remains real.",
    WRAP_OPEN: "Before we leave the table, did this discussion move your view?",
    DISCUSSION_SUMMARY: "Tonight we disagreed over whether Meursault's detachment is honesty or an escape from responsibility. The courtroom's prejudice remained real, but so did the harm he refuses to examine, and the distinction between sympathy and absolution held those tensions together. I will leave that unresolved question in our meeting recap.",
  };
  const koreanResponses: Partial<Record<UtteranceRequest["task"], string>> = {
    WELCOME: `${input.book.author}의 『${input.book.title}』을 이야기하는 리딩 테이블에 오신 것을 환영합니다. 오늘 세 독자는 하나의 정답을 찾기보다 서로 다른 세 해석을 직접 부딪쳐 볼 겁니다.`,
    INVITE_USER: "여러분은 어떤 이유로 이 책을 펼치게 되었나요?",
    FIRST_IMPRESSIONS_OPEN: "한 분씩 돌아가며 가장 솔직한 첫인상을 이야기해 볼까요?",
    DEVILS_ADVOCATE: "잠시 반대편에서 밀어붙여 보겠습니다. 모두가 이 해석에 동의한다면 우리가 애써 시험하지 않고 지나치는 불편한 증거는 무엇일까요?",
    SCENES_OPEN: "줄거리보다 오래 남아 있던 장면은 무엇이었나요?",
    TOPIC_OPEN: `오늘의 중심 질문은 이것입니다. ${input.activeTopic}`,
    ASK_USER_POSITION: "서로 다른 입장의 끝을 들어봤습니다. 여러분은 어디에 서 있나요?",
    TOPIC_CLOSE: "긴장은 남아 있습니다. 사회의 판단은 왜곡될 수 있지만 개인의 책임까지 사라지는 것은 아닙니다.",
    WRAP_OPEN: "테이블을 떠나기 전에 묻겠습니다. 오늘 대화가 여러분의 생각을 움직였나요?",
    DISCUSSION_SUMMARY: "오늘 우리는 뫼르소의 거리두기가 정직함인지 책임 회피인지를 두고 의견을 나눴습니다. 재판의 편견은 분명했지만 그가 외면한 책임도 남았고, 공감과 면죄를 구분해야 한다는 관점이 두 긴장을 함께 붙잡았습니다. 이 결론 나지 않은 질문까지 모임 기록에 남기겠습니다.",
  };

  return utteranceSchema.parse({
    utterance:
      (isKorean ? koreanResponses[input.task] : englishResponses[input.task]) ??
      (isKorean
        ? "질문을 정확하게 붙잡고 다시 책으로 돌아가 보겠습니다."
        : "Let's keep the question precise and return to the book."),
    stance: null,
    refers_to: input.targetSpeaker ?? null,
    shelf_ref: null,
  });
}

export class MockGenerationClient implements GenerationClient {
  async identifyBook(input: BookIdentificationRequest) {
    const fixture = input.language === "ko" ? koreanBook : englishBook;
    if (["the stranger", "이방인"].includes(input.title.trim().toLowerCase())) {
      return structuredClone(fixture);
    }
    return bookIdentificationSchema.parse({
      ...fixture,
      canonical_title: input.title.trim(),
      author: input.author?.trim() || (input.language === "ko" ? "알 수 없는 저자" : "Unknown author"),
      confidence: "low",
    });
  }

  async generateReadingNotes(input: ReadingNotesRequest) {
    return makeNotes(input);
  }

  async generateUtterance(input: UtteranceRequest) {
    return input.speaker === "moderator" ? moderatorUtterance(input) : personaUtterance(input);
  }

  async extractUserStance(input: UserStanceRequest) {
    return userStanceSchema.parse({
      stance: input.target === "overall_impression" ? 0.6 : -0.7,
      paraphrase: input.text.trim().slice(0, 240),
    });
  }

  async generateRecap(input: RecapRequest) {
    const topic = input.book.candidateTopics[0];
    const user = input.userStances[topic];
    const personaCells = input.personas
      .map((persona) => `${input.personaStances[persona.id].toFixed(1)} — ${input.language === "ko" ? koreanNames[persona.id] : persona.lens.split(":")[0]}`)
      .join(" | ");
    const citedBooks = input.transcript
      .filter((utterance) => utterance.shelfRef)
      .map((utterance) =>
        input.language === "ko"
          ? `- *${utterance.shelfRef}*가 ${STAGE_LABELS.ko[utterance.stage]} 단계에서 언급되었습니다.`
          : `- *${utterance.shelfRef}* was cited during ${STAGE_LABELS.en[utterance.stage].toLowerCase()}.`,
      );
    const markdown =
      input.language === "ko"
        ? `# ${input.book.title} — 리딩 테이블 모임 기록, ${input.date}

## 토론 요약
테이블은 뫼르소의 거리두기를 정직함, 방어, 도덕적 거부 가운데 무엇으로 읽어야 하는지 살폈습니다. 독자들은 재판정의 사회적 편견이 그의 행동에 대한 판단을 얼마나 바꾸는지 의견을 달리했습니다. 사용자는 공감과 면죄를 분리했고, 그 주장이 가장 강한 반박을 이끌었습니다. 누구도 이 소설을 하나의 교훈으로 줄이지 않았습니다.

## 모두의 최종 입장
| 주제 | ${input.personas.map((persona) => koreanNames[persona.id] ?? persona.name).join(" | ")} | 나 |
|---|---|---|---|---|
| ${topic} | ${personaCells} | ${user?.stance.toFixed(1) ?? "통과"} — ${user?.paraphrase ?? "기록된 입장 없음"} |

## 불꽃 — 실제로 부딪힌 순간
- 사용자는 감정적 정직함과 도덕적 책임이 함께 존재할 수 있다고 주장했고, 마커스는 공감에 앞서 장면 속 증거를 요구했습니다.

## 놓치기 쉬운 장면
- 재판정은 살인보다 장례식으로 계속 돌아가며, 알아보기 쉬운 슬픔 자체가 심판받고 있음을 보여 줍니다.

## 책장에서 꺼낸 연결
${citedBooks.length > 0 ? citedBooks.join("\n") : "- 이번 모임에서는 다른 책과의 연결을 사용하지 않았습니다."}

## 잠들기 전 생각할 질문
사회가 잘못된 증거로 한 사람을 판단한다면, 그는 책임에서 멀어지는 걸까요, 아니면 다른 방식으로 단죄되는 걸까요?`
        : `# ${input.book.title} — Reading Table Recap, ${input.date}

## Discussion summary
The table tested whether Meursault's detachment should be read as honesty, defense, or moral refusal. The readers disagreed over how much the courtroom's social prejudice changes our judgment of his actions. The user separated sympathy from absolution, which sharpened the strongest rebuttal. Nobody reduced the novel to a single lesson.

## Where everyone landed
| Topic | ${input.personas.map((persona) => persona.name).join(" | ")} | You |
|---|---|---|---|---|
| ${topic} | ${personaCells} | ${user?.stance.toFixed(1) ?? "pass"} — ${user?.paraphrase ?? "No position recorded"} |

## Sparks — moments of real disagreement
- The user argued that emotional honesty can coexist with moral responsibility; Marcus demanded scene-level evidence before granting sympathy.

## Scenes you might have missed
- The courtroom repeatedly returns to the funeral, suggesting that recognizable grief is itself being judged.

## From the shelves
${citedBooks.length > 0 ? citedBooks.join("\n") : "- No shelf comparison was used in this session."}

## A question to sleep on
If society judges the wrong evidence, does that make its defendant less responsible—or only differently condemned?`;

    return recapSchema.parse({ markdown });
  }
}
