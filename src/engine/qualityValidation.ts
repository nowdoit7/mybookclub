import type {
  BookIdentificationOutput,
  ReadingNotesOutput,
  UtteranceOutput,
} from "../api/contracts";
import type { AppLanguage } from "../types";
import { countSentences } from "./sentenceValidation";

export function validateBookIdentificationQuality(output: BookIdentificationOutput): string[] {
  const issues: string[] = [];
  const summarySentences = countSentences(output.summary);

  if (summarySentences < 4 || summarySentences > 6) {
    issues.push(`summary must contain 4-6 sentences; received ${summarySentences}`);
  }

  const normalizedTopics = output.candidate_topics.map((topic) => topic.trim().toLowerCase());
  if (new Set(normalizedTopics).size !== output.candidate_topics.length) {
    issues.push("candidate topics must be unique");
  }

  output.candidate_topics.forEach((topic, index) => {
    if (!topic.trim().endsWith("?")) {
      issues.push(`candidate topic ${index + 1} must be a complete discussion question`);
    }
    if (topic.trim().split(/\s+/u).length < 5) {
      issues.push(`candidate topic ${index + 1} is too vague`);
    }
    const quotationMarks = (topic.match(/["“”]/gu) ?? []).length;
    if (quotationMarks % 2 !== 0) {
      issues.push(`candidate topic ${index + 1} contains an unmatched quotation mark`);
    }
  });

  return issues;
}

export function validateReadingNotesQuality(
  output: ReadingNotesOutput,
  expectedTopics: string[],
): string[] {
  const issues: string[] = [];
  const takeSentences = countSentences(output.overall_take);
  if (takeSentences < 2 || takeSentences > 3) {
    issues.push(`overall_take must contain 2-3 sentences; received ${takeSentences}`);
  }

  const returnedTopics = output.stance_by_topic.map(({ topic }) => topic);
  if (
    returnedTopics.length !== expectedTopics.length ||
    returnedTopics.some((topic, index) => topic !== expectedTopics[index])
  ) {
    issues.push("stance_by_topic must preserve all candidate topics verbatim and in order");
  }

  return issues;
}

export function validateUtteranceQuality(
  output: UtteranceOutput,
  speaker: "persona" | "moderator",
  shelfReferenceAllowed: boolean,
): string[] {
  const issues: string[] = [];
  const count = countSentences(output.utterance);
  const minimum = speaker === "persona" ? 2 : 1;
  const maximum = 3;

  if (count < minimum || count > maximum) {
    issues.push(`${speaker} utterance must contain ${minimum}-${maximum} sentences; received ${count}`);
  }
  if (!shelfReferenceAllowed && output.shelf_ref !== null) {
    issues.push("shelf_ref must be null because this turn has no shelf-reference budget");
  }
  if (
    output.shelf_ref !== null &&
    !output.utterance.toLocaleLowerCase().includes(output.shelf_ref.toLocaleLowerCase())
  ) {
    issues.push("shelf_ref must name a book that is explicitly mentioned in the utterance");
  }

  return issues;
}

const RECAP_HEADINGS: Record<AppLanguage, string[]> = {
  en: [
    "## Discussion summary",
    "## Where everyone landed",
    "## Sparks — moments of real disagreement",
    "## Scenes you might have missed",
    "## From the shelves",
    "## A question to sleep on",
  ],
  ko: [
    "## 토론 요약",
    "## 모두의 최종 입장",
    "## 불꽃 — 실제로 부딪힌 순간",
    "## 놓치기 쉬운 장면",
    "## 책장에서 꺼낸 연결",
    "## 잠들기 전 생각할 질문",
  ],
};

export function validateRecapQuality(markdown: string, language: AppLanguage = "en"): string[] {
  const issues = RECAP_HEADINGS[language].filter((heading) => !markdown.includes(heading)).map(
    (heading) => `recap is missing heading: ${heading}`,
  );

  const titlePattern =
    language === "ko"
      ? /^# .+ — 리딩 테이블 모임 기록, \d{4}-\d{2}-\d{2}$/mu
      : /^# .+ — Reading Table Recap, \d{4}-\d{2}-\d{2}$/mu;
  if (!titlePattern.test(markdown)) {
    issues.push("recap must start with a dated level-one Reading Table Recap heading");
  }

  const longQuotedPassage = markdown.match(/[“"][^”"\n]{180,}[”"]/u);
  if (longQuotedPassage) {
    issues.push("recap contains a quotation too long for the short-phrase copyright rule");
  }

  return issues;
}
