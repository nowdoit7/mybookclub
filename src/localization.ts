import { findPersona } from "./personas";
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
  "blaise-pascal": "블레즈 파스칼",
  "isaac-newton": "아이작 뉴턴",
  "adam-smith": "애덤 스미스",
  "charles-darwin": "찰스 다윈",
  homer: "호메로스",
  "sherlock-holmes": "셜록 홈즈",
  sappho: "사포",
  "mary-shelley": "메리 셸리",
  machiavelli: "니콜로 마키아벨리",
  socrates: "소크라테스",
  "carl-jung": "카를 융",
  plutarch: "플루타르코스",
  "jane-austen": "제인 오스틴",
  "william-shakespeare": "윌리엄 셰익스피어",
  "hans-christian-andersen": "한스 크리스티안 안데르센",
  "octavia-butler": "옥타비아 버틀러",
  "toni-morrison": "토니 모리슨",
  "murasaki-shikibu": "무라사키 시키부",
  "sor-juana-ines-de-la-cruz": "소르 후아나 이네스 데 라 크루스",
  "ibn-khaldun": "이븐 할둔",
  "rabindranath-tagore": "라빈드라나트 타고르",
};

export function localizedSpeakerName(speaker: string, language: AppLanguage): string {
  if (speaker === "moderator") return language === "ko" ? "알렉스" : "Alex";
  if (speaker === "user") return language === "ko" ? "나" : "You";
  if (language === "ko") return KOREAN_PERSONA_NAMES[speaker] ?? speaker;
  return findPersona(speaker)?.name ?? speaker;
}

export function localizedSpeakerRole(speaker: string, language: AppLanguage): string {
  if (speaker === "moderator") return language === "ko" ? "진행자" : "Moderator";
  if (speaker === "user") return language === "ko" ? "모임 참여자" : "Club member";
  return findPersona(speaker)?.roleLabel[language] ?? "";
}
