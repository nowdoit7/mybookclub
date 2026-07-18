import { PERSONAS } from "./personas";
import type { AppLanguage, StageId } from "./types";

export const STAGE_LABELS: Record<AppLanguage, Record<StageId, string>> = {
  en: {
    INTRO: "Intro",
    FIRST_IMPRESSIONS: "First impressions",
    MEMORABLE_SCENES: "Scenes",
    DISCUSSION: "Discussion",
    WRAP_UP: "Wrap-up",
  },
  ko: {
    INTRO: "소개",
    FIRST_IMPRESSIONS: "첫인상",
    MEMORABLE_SCENES: "기억에 남은 장면",
    DISCUSSION: "본 토론",
    WRAP_UP: "마무리",
  },
};

export const KOREAN_PERSONA_NAMES: Record<string, string> = {
  maddie: "매디",
  dot: "도트",
  tyler: "타일러",
  marcus: "마커스",
  eleanor: "엘리너",
  sarah: "세라",
  dev: "데브",
  jamal: "자말",
};

export function localizedSpeakerName(speaker: string, language: AppLanguage): string {
  if (speaker === "moderator") return language === "ko" ? "알렉스" : "Alex";
  if (speaker === "user") return language === "ko" ? "나" : "You";
  if (language === "ko") return KOREAN_PERSONA_NAMES[speaker] ?? speaker;
  return PERSONAS.find((persona) => persona.id === speaker)?.name ?? speaker;
}
