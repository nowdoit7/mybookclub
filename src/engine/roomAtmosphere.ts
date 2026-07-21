import type { UtteranceTask } from "../api/contracts";
import type { AppLanguage, PersonaCard, RoomAtmosphere } from "../types";

const clamp = (value: number): number => Math.round(Math.min(1, Math.max(0, value)) * 100) / 100;

function change(
  current: RoomAtmosphere,
  delta: Partial<RoomAtmosphere>,
): RoomAtmosphere {
  return {
    warmth: clamp(current.warmth + (delta.warmth ?? 0)),
    playfulness: clamp(current.playfulness + (delta.playfulness ?? 0)),
    tension: clamp(current.tension + (delta.tension ?? 0)),
    energy: clamp(current.energy + (delta.energy ?? 0)),
  };
}

export function deriveInitialAtmosphere(personas: PersonaCard[]): RoomAtmosphere {
  if (personas.length === 0) {
    return { warmth: 0.5, playfulness: 0.25, tension: 0.2, energy: 0.45 };
  }
  const average = (key: keyof PersonaCard["socialTemperament"]) =>
    personas.reduce((sum, persona) => sum + persona.socialTemperament[key], 0) /
    personas.length;

  return {
    warmth: clamp(0.38 + average("warmth") * 0.48),
    playfulness: clamp(0.08 + average("playfulness") * 0.55),
    tension: clamp(0.1 + average("directness") * 0.3),
    energy: clamp(0.2 + average("energy") * 0.58),
  };
}

export function updateAtmosphereFromUser(
  current: RoomAtmosphere,
  text: string,
): RoomAtmosphere {
  const normalized = text.trim().toLocaleLowerCase();
  if (!normalized) return current;

  const playful = /(ㅋㅋ|ㅎㅎ|lol\b|haha|hehe|😂|😄|😆|😁|재미있|웃기)/iu.test(normalized);
  const warm = /(안녕|반갑|감사|고맙|공감|좋았|좋아요|welcome|thank|appreciate|i agree)/iu.test(
    normalized,
  );
  const direct = /(반대|동의하기 어렵|아니라고|그렇지만|하지만|납득하기 어렵|disagree|not convinced|however|but\b)/iu.test(
    normalized,
  );
  const reflective = /(생각|느낌|어쩌면|모르겠|궁금|maybe|wonder|i think|i feel)/iu.test(
    normalized,
  );
  const emphatic = (normalized.match(/[!！]/gu)?.length ?? 0) > 0;

  return change(current, {
    warmth: (warm ? 0.08 : 0) + (playful ? 0.03 : 0) - (direct ? 0.02 : 0),
    playfulness: playful ? 0.14 : -0.01,
    tension: (direct ? 0.09 : 0) - (warm ? 0.04 : 0),
    energy: (playful ? 0.07 : 0) + (emphatic ? 0.05 : 0) - (reflective ? 0.01 : 0),
  });
}

const TASK_DELTAS: Partial<Record<UtteranceTask, Partial<RoomAtmosphere>>> = {
  WELCOME: { warmth: 0.03 },
  PERSONA_INTRODUCTION: { warmth: 0.02 },
  CHALLENGE_PERSONA: { tension: 0.11, energy: 0.06, warmth: -0.02 },
  CHALLENGE_USER: { tension: 0.11, energy: 0.06, warmth: -0.02 },
  DEVILS_ADVOCATE: { tension: 0.09, energy: 0.04 },
  RESPOND_TO_PERSONA: { tension: 0.03, energy: 0.03 },
  RESPOND_TO_USER_REPLY: { tension: 0.02 },
  RESPOND_TO_USER_FOLLOWUP: { warmth: 0.02, tension: 0.01 },
  BRIDGE_EXCHANGE: { warmth: 0.03, tension: -0.01, energy: 0.03 },
  TOPIC_CLOSE: { tension: -0.04, energy: -0.02 },
  CLOSING_REFLECTION: { warmth: 0.03, tension: -0.03 },
  DISCUSSION_SUMMARY: { warmth: 0.03, tension: -0.07, energy: -0.04 },
};

export function updateAtmosphereForTask(
  current: RoomAtmosphere,
  task: UtteranceTask,
): RoomAtmosphere {
  return change(current, TASK_DELTAS[task] ?? {});
}

export function describeRoomAtmosphere(
  atmosphere: RoomAtmosphere,
  language: AppLanguage,
): string {
  if (atmosphere.tension >= 0.62 && atmosphere.energy >= 0.52) {
    return language === "ko" ? "의견 차이가 선명해진 분위기" : "Focused, high-tension discussion";
  }
  if (atmosphere.playfulness >= 0.58 && atmosphere.warmth >= 0.55) {
    return language === "ko" ? "농담이 오가는 편안한 분위기" : "Playful and welcoming";
  }
  if (atmosphere.warmth >= 0.68 && atmosphere.tension < 0.5) {
    return language === "ko" ? "편안하고 열린 분위기" : "Warm and open";
  }
  if (atmosphere.energy < 0.4) {
    return language === "ko" ? "차분히 생각이 깊어지는 분위기" : "Quiet and reflective";
  }
  if (atmosphere.energy >= 0.68) {
    return language === "ko" ? "활기차고 진지한 분위기" : "Energetic and thoughtful";
  }
  return language === "ko" ? "서로의 생각을 살피는 분위기" : "Attentive and exploratory";
}
