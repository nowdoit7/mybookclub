import { describe, expect, it } from "vitest";
import {
  findCorruptTextSignals,
  findVisibleInternalTerms,
  groundingSupportIsLinked,
  hasVisibleQuestionOrConfirmation,
  largestSentenceCountBucketShare,
  sentenceCountIsAllowed,
} from "./dialoguePolicy";
import type { RealBookDialogueLogEntry } from "./realBookModel";

function groundingFixture(
  overrides: Partial<RealBookDialogueLogEntry> = {},
): RealBookDialogueLogEntry {
  return {
    schemaVersion: 1,
    sampleId: "sample-1",
    baseCaseId: "case-1",
    runId: "run-1",
    repeatIndex: 0,
    variant: "character_core",
    language: "ko",
    bookId: "book-1",
    bookSet: "development",
    personaId: "marcus",
    questionId: "q-1",
    turnType: "respond_to_user",
    targetState: "engaged",
    prompt: "A controlled prompt",
    allowedEvidence: [
      {
        id: "A-1",
        claim: "A supported claim",
        sourceKind: "verified_source",
        sourceUrls: ["https://example.com/source"],
        spoilerLevel: 0,
      },
    ],
    selectedValueIds: ["fair-accountability"],
    dialogueMove: "Test the claim against counterevidence.",
    usedEvidenceIds: ["A-1"],
    groundingDecision: {
      evidenceBackedBookClaim: "The supplied source supports the book claim.",
      personaInference: "Marcus checks attribution and counterevidence.",
      uncertainty: null,
      supportIds: ["A-1"],
    },
    dialogue: "그 책임을 바로 확정하기는 어렵습니다. 반대 장면도 확인했나요?",
    generator: { kind: "subagent", label: "fixture" },
    ...overrides,
  };
}

describe("visible Character Core dialogue policy", () => {
  it("rejects internal grounding vocabulary only when it appears in visible dialogue", () => {
    expect(findVisibleInternalTerms("이 근거팩으로는 사용자 발제를 확인할 수 없습니다."))
      .toEqual(["근거팩", "사용자 발제"]);
    expect(findVisibleInternalTerms("이 장면만으로는 그 동기를 확정하기 어렵습니다."))
      .toEqual([]);
  });

  it("recognizes actual questions and Korean confirmation endings", () => {
    expect(hasVisibleQuestionOrConfirmation("그 장면도 같은 책임을 보여 주나요?")).toBe(true);
    expect(hasVisibleQuestionOrConfirmation("제가 이해한 범위가 맞습니까.")).toBe(true);
    expect(hasVisibleQuestionOrConfirmation("그 장면을 확인해야 합니다.")).toBe(false);
  });

  it("allows one to three sentences and caps a dominant sentence-count bucket at 80 percent", () => {
    expect(sentenceCountIsAllowed("한 문장입니다.")).toBe(true);
    expect(sentenceCountIsAllowed("하나입니다. 둘입니다. 셋입니다.")).toBe(true);
    expect(sentenceCountIsAllowed("하나입니다. 둘입니다. 셋입니다. 넷입니다.")).toBe(false);

    expect(
      largestSentenceCountBucketShare([
        "하나.",
        "둘.",
        "셋.",
        "넷.",
        "하나. 둘.",
      ]),
    ).toBe(0.8);
    expect(largestSentenceCountBucketShare(["하나.", "둘.", "셋.", "하나. 둘."]))
      .toBe(0.75);
  });

  it("detects replacement characters, mojibake, controls, and suspicious question-mark runs", () => {
    expect(findCorruptTextSignals("깨진 � 문자열")).toContain("mojibake");
    expect(findCorruptTextSignals("broken Ã© text")).toContain("mojibake");
    expect(findCorruptTextSignals("control\u0001text")).toContain("control-character");
    expect(findCorruptTextSignals("??????")).toContain("question-mark-run");
    expect(findCorruptTextSignals("정상적인 한국어 문장입니다.")).toEqual([]);
  });

  it("requires grounding support to match allowed and used evidence", () => {
    expect(groundingSupportIsLinked(groundingFixture())).toBe(true);
    expect(
      groundingSupportIsLinked(
        groundingFixture({
          groundingDecision: {
            evidenceBackedBookClaim: "A claim",
            personaInference: "A persona inference",
            uncertainty: null,
            supportIds: ["MISSING"],
          },
        }),
      ),
    ).toBe(false);
    expect(
      groundingSupportIsLinked(
        groundingFixture({
          variant: "legacy_card",
          selectedValueIds: ["fair-accountability"],
        }),
      ),
    ).toBe(false);
    expect(
      groundingSupportIsLinked(
        groundingFixture({
          variant: "legacy_card",
          selectedValueIds: [],
        }),
      ),
    ).toBe(true);
  });
});
