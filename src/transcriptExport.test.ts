import { describe, expect, it } from "vitest";

import { formatTranscriptAsMarkdown } from "./transcriptExport";
import type { Utterance } from "./types";

const sample: Utterance[] = [
  {
    speaker: "moderator",
    text: "테이블에 오신 것을 환영합니다.",
    stage: "INTRO",
  },
  {
    speaker: "maddie",
    text: "저는 장면이 보여 주는 감정을 먼저 살핍니다.",
    stage: "INTRO",
  },
  {
    speaker: "user",
    text: "저는 슬픔에 대해 이야기하고 싶습니다.",
    stage: "FIRST_IMPRESSIONS",
  },
];

describe("formatTranscriptAsMarkdown", () => {
  it("exports clean Korean Markdown without avatar initials", () => {
    const markdown = formatTranscriptAsMarkdown(sample, "ko");

    expect(markdown).toBe(`## 소개

**알렉스**

테이블에 오신 것을 환영합니다.

**매디**

저는 장면이 보여 주는 감정을 먼저 살핍니다.

## 첫인상

**나**

저는 슬픔에 대해 이야기하고 싶습니다.`);
    expect(markdown).not.toContain("\n알\n");
  });

  it("uses English stage and speaker labels when selected", () => {
    const markdown = formatTranscriptAsMarkdown(sample, "en");
    expect(markdown).toContain("## Intro");
    expect(markdown).toContain("**Alex**");
    expect(markdown).toContain("**You**");
  });
});
