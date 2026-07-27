import type {
  BookIdentificationOutput,
  ReadingNotesOutput,
  UtteranceOutput,
} from "../api/contracts";
import type { UtteranceTask } from "../api/generationClient";
import type { AppLanguage } from "../types";
import { countSentences } from "./sentenceValidation";

const EXACT_SENTENCE_COUNTS: Partial<Record<UtteranceTask, number>> = {
  CLOSING_REFLECTION: 2,
  DISCUSSION_SUMMARY: 4,
};

const SENTENCE_COUNT_RANGES: Partial<
  Record<UtteranceTask, { minimum: number; maximum: number }>
> = {
  PERSONA_INTRODUCTION: { minimum: 2, maximum: 3 },
  CHALLENGE_PERSONA: { minimum: 2, maximum: 3 },
  RESPOND_TO_PERSONA: { minimum: 2, maximum: 3 },
  RESPOND_TO_USER_REPLY: { minimum: 2, maximum: 3 },
  RESPOND_TO_USER_FOLLOWUP: { minimum: 2, maximum: 3 },
  BRIDGE_EXCHANGE: { minimum: 2, maximum: 3 },
};

function endsWithCompleteSentence(text: string): boolean {
  return /[.!?…。？！](?:["'”’)\]])*$/u.test(text.trim());
}

export function validateBookIdentificationQuality(output: BookIdentificationOutput): string[] {
  const issues: string[] = [];
  const summarySentences = countSentences(output.summary);

  if (output.verification_status === "verified" && output.sources.length < 2) {
    issues.push("verified books must include at least two retrieved web sources");
  }
  if (output.verification_status === "mock" && output.sources.length > 0) {
    issues.push("mock identification must not claim external sources");
  }
  if (output.sources.some(({ url }) => !url.startsWith("https://"))) {
    issues.push("book verification sources must use HTTPS URLs");
  }
  if (
    output.summary.includes("https://") ||
    output.summary.includes("http://") ||
    output.summary.includes("](")
  ) {
    issues.push("book summary must not contain URLs or inline citation markup");
  }
  if (
    output.verification_status === "verified" &&
    output.work_scope === "single_book" &&
    output.included_titles.length !== 1
  ) {
    issues.push("a verified single book must include exactly one title");
  }
  if (
    output.verification_status === "verified" &&
    output.work_scope === "series" &&
    output.included_titles.length < 2
  ) {
    issues.push("a verified series must include at least two component titles");
  }
  const normalizedIncludedTitles = output.included_titles.map((title) => title.trim().toLowerCase());
  if (new Set(normalizedIncludedTitles).size !== output.included_titles.length) {
    issues.push("included titles must be unique");
  }

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
  context?: { language: AppLanguage; task: UtteranceTask },
): string[] {
  const issues: string[] = [];
  const count = countSentences(output.utterance);
  const minimum = speaker === "persona" ? 2 : 1;
  const maximum = speaker === "persona" ? 4 : 3;
  const exactSentenceCount = context ? EXACT_SENTENCE_COUNTS[context.task] : undefined;
  const sentenceCountRange = context ? SENTENCE_COUNT_RANGES[context.task] : undefined;

  if (exactSentenceCount !== undefined && count !== exactSentenceCount) {
    issues.push(
      `${context!.task} utterance must contain exactly ${exactSentenceCount} sentences; received ${count}`,
    );
  } else if (
    sentenceCountRange &&
    (count < sentenceCountRange.minimum || count > sentenceCountRange.maximum)
  ) {
    issues.push(
      `${context!.task} utterance must contain ${sentenceCountRange.minimum}-${sentenceCountRange.maximum} sentences; received ${count}`,
    );
  } else if (
    exactSentenceCount === undefined &&
    !sentenceCountRange &&
    (count < minimum || count > maximum)
  ) {
    issues.push(`${speaker} utterance must contain ${minimum}-${maximum} sentences; received ${count}`);
  }
  if (context && !endsWithCompleteSentence(output.utterance)) {
    issues.push("utterance must end with a complete sentence");
  }
  if (
    context?.task === "TOPIC_OPEN" &&
    (output.utterance.match(/[?？]/gu)?.length ?? 0) !== 1
  ) {
    issues.push("TOPIC_OPEN must ask exactly one spoken question");
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

  const discussionTasks = new Set<UtteranceTask>([
    "OPEN_PERSONA_POSITION",
    "CHALLENGE_PERSONA",
    "RESPOND_TO_PERSONA",
    "CHALLENGE_USER",
    "RESPOND_TO_USER_REPLY",
    "RESPOND_TO_USER_FOLLOWUP",
    "BRIDGE_EXCHANGE",
    "DISCUSSION_SUMMARY",
  ]);
  if (context && discussionTasks.has(context.task)) {
    if (/[;；]/u.test(output.utterance)) {
      issues.push("spoken discussion dialogue must not use semicolons");
    }

    const sentenceLengthLimit = context.language === "ko" ? 95 : 200;
    const sentenceSegments =
      typeof Intl.Segmenter === "function"
        ? [...new Intl.Segmenter(context.language, { granularity: "sentence" }).segment(output.utterance)]
            .map(({ segment }) => segment.trim())
            .filter(Boolean)
        : output.utterance.split(/(?<=[.!?。？！])(?:["')\]]*)\s+/u).filter(Boolean);
    sentenceSegments.forEach((sentence, index) => {
      if ([...sentence].length > sentenceLengthLimit) {
        issues.push(
          `spoken discussion sentence ${index + 1} exceeds ${sentenceLengthLimit} characters`,
        );
      }
      if (
        context.language === "ko" &&
        (sentence.match(/[,，]/gu)?.length ?? 0) >= 3
      ) {
        issues.push(
          `spoken Korean sentence ${index + 1} contains too many nested clauses`,
        );
      }
    });
  }

  if (
    context?.language === "ko" &&
    (
      /오래\s+남/u.test(output.utterance) ||
      /(?:대목|장면|말|질문|문제|부분|빈틈|사람|피해자)(?:은|는|이|가|도)?\s+(?:(?:가장|제일|특히|더)\s+)?(?:오래\s+)?남/u.test(
        output.utterance,
      )
    )
  ) {
    issues.push(
      "Korean dialogue should use 기억에 남다 or 마음에 걸리다 instead of bare 남다",
    );
  }
  if (
    context?.language === "ko" &&
    context.task === "TOPIC_OPEN" &&
    /무엇을\s+드러내는가/u.test(output.utterance)
  ) {
    issues.push("Korean TOPIC_OPEN must sound spoken rather than reciting an essay prompt");
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

export function validateRecapQuality(
  markdown: string,
  language: AppLanguage = "en",
  participantNames: string[] = [],
): string[] {
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

  const finalPositionHeading = RECAP_HEADINGS[language][1];
  const nextHeading = RECAP_HEADINGS[language][2];
  const finalPositionStart = markdown.indexOf(finalPositionHeading);
  const nextHeadingStart = markdown.indexOf(nextHeading);
  const finalPositionSection =
    finalPositionStart >= 0 && nextHeadingStart > finalPositionStart
      ? markdown.slice(finalPositionStart, nextHeadingStart)
      : "";
  participantNames.forEach((name) => {
    if (!finalPositionSection.includes(name)) {
      issues.push(`recap final-position section must include participant: ${name}`);
    }
  });

  const longQuotedPassage = markdown.match(/[“"][^”"\n]{180,}[”"]/u);
  if (longQuotedPassage) {
    issues.push("recap contains a quotation too long for the short-phrase copyright rule");
  }

  const finalHeading = RECAP_HEADINGS[language].at(-1)!;
  const finalSection = markdown.slice(markdown.indexOf(finalHeading) + finalHeading.length);
  const questionMarkCount = finalSection.match(/[?？]/gu)?.length ?? 0;
  if (questionMarkCount !== 1) {
    issues.push("recap must end with exactly one question to sleep on");
  }

  return issues;
}
