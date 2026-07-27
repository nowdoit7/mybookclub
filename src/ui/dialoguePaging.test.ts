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

  it("keeps a single oversized sentence intact for the scrollable dialogue box", () => {
    const source = `${"긴문장".repeat(80)}.`;
    const pages = paginateDialogue(source, "ko");

    expect(pages).toEqual([source]);
  });

  it("never splits a long sentence at a word boundary", () => {
    const first = `${"긴 문장을 자연스럽게 이어 말합니다 ".repeat(8).trim()}.`;
    const second = "다음 문장은 새 페이지에서 시작합니다.";
    const pages = paginateDialogue(`${first} ${second}`, "ko");

    expect(pages).toEqual([first, second]);
    expect(pages.join(" ")).toBe(`${first} ${second}`);
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
