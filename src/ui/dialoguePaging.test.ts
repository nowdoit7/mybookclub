import { describe, expect, it } from "vitest";

import type { Utterance } from "../types";
import { buildDialoguePages, paginateDialogue } from "./dialoguePaging";

describe("dialogue paging", () => {
  it("keeps a short two-sentence utterance on one page", () => {
    expect(paginateDialogue("첫 문장입니다. 두 번째 문장입니다.", "ko")).toEqual([
      "첫 문장입니다. 두 번째 문장입니다.",
    ]);
  });

  it("groups at most two sentences per page without losing text", () => {
    const source = "One sentence. Two sentences! Three sentences? Four sentences.";
    const pages = paginateDialogue(source, "en");

    expect(pages).toEqual([
      "One sentence. Two sentences!",
      "Three sentences? Four sentences.",
    ]);
    expect(pages.join(" ")).toBe(source);
  });

  it("splits a single oversized sentence without exceeding the page limit", () => {
    const pages = paginateDialogue(`${"긴문장".repeat(80)}.`, "ko");

    expect(pages.length).toBeGreaterThan(1);
    expect(pages.every((page) => page.length <= 150)).toBe(true);
  });

  it("builds a stable flat page sequence for transcript navigation", () => {
    const transcript: Utterance[] = [
      { speaker: "moderator", text: "첫 문장입니다. 두 번째 문장입니다. 세 번째입니다.", stage: "INTRO" },
      { speaker: "user", text: "반갑습니다.", stage: "INTRO" },
    ];
    const pages = buildDialoguePages(transcript, "ko");

    expect(pages.map(({ key }) => key)).toEqual(["0:0", "0:1", "1:0"]);
    expect(pages.at(-1)?.utterance.speaker).toBe("user");
  });
});
