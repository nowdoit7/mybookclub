// @vitest-environment happy-dom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(
      JSON.stringify({
        status: "ok",
        liveGenerationAvailable: true,
        model: "gpt-5.6",
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    ),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("text prototype", () => {
  it("offers live mode only after the server reports that it is ready", async () => {
    render(<App />);

    const liveMode = screen.getByRole("button", { name: /실제 GPT-5.6/u });
    await waitFor(() => expect(liveMode).toBeEnabled());
    expect(screen.getByText("서버의 gpt-5.6 연결 준비가 완료되었습니다.")).toBeVisible();

    fireEvent.click(liveMode);
    expect(screen.getByRole("button", { name: "실제 GPT-5.6 세션 시작" })).toBeEnabled();
  });

  it("advances the first reader automatically without a click", async () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "모의 세션 시작" }));
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    const dialogue = screen.getByRole("region", { name: "현재 대화" });

    await waitFor(
      () =>
        expect(
          within(dialogue).getByText(/리딩 테이블에 오신 것을 환영합니다/u),
        ).toBeVisible(),
      { timeout: 2_500 },
    );
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "일시정지" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "바로 다음" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "일시정지" }));
    expect(screen.getByRole("button", { name: "계속" })).toBeVisible();
  });

  it("advances exactly one utterance per Next click", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    fireEvent.click(screen.getByRole("button", { name: "Automatic pacing on" }));
    fireEvent.click(screen.getByRole("button", { name: "Start mock session" }));
    const next = await screen.findByRole("button", { name: "Next →" });
    expect(screen.queryAllByRole("article")).toHaveLength(0);

    fireEvent.click(next);
    const dialogue = screen.getByRole("region", { name: "Current dialogue" });
    await waitFor(() =>
      expect(within(dialogue).getByText(/Welcome to The Reading Table/u)).toBeVisible(),
    );
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(within(dialogue).getByText("Alex")).toBeVisible();
    expect(screen.getByRole("region", { name: "Reading table" })).toBeVisible();
    expect(screen.getByText("Speaking")).toBeVisible();
    expect(screen.getByText("Next")).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "View transcript 1" }));
    expect(screen.getByRole("dialog", { name: "Conversation transcript" })).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Copy full transcript" }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("## Intro\n\n**Alex**"),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied" })).toBeVisible(),
    );
  });

  it("completes all five interactive user turns and reaches the recap", async () => {
    const inputs = [
      "슬픔에 대해 다시 생각하려고 이 책을 펼쳤습니다.",
      "그는 정직하지만 여전히 책임이 있다고 봅니다.",
      "재판정 장면이 가장 오래 남았습니다.",
      "거리두기가 타인의 피해를 외면하는 태도가 됩니다.",
      "공감은 커졌지만 면죄할 수는 없다는 생각을 가지고 떠납니다.",
    ];
    let inputIndex = 0;
    render(<App />);

    expect(screen.getByRole("button", { name: "한국어" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    fireEvent.click(screen.getByRole("button", { name: "자동 진행 켜짐" }));
    fireEvent.click(screen.getByRole("button", { name: "모의 세션 시작" }));

    for (let guard = 0; guard < 45; guard += 1) {
      await waitFor(() => {
        const readyControl =
          screen.queryByRole("heading", { name: "모임이 끝났습니다" }) ??
          screen.queryByRole("textbox") ??
          screen.queryByRole("button", { name: "다음 →" });
        expect(readyControl).not.toBeNull();
      });
      if (screen.queryByRole("heading", { name: "모임이 끝났습니다" })) break;

      const textbox = screen.queryByRole("textbox");
      if (textbox) {
        fireEvent.change(textbox, { target: { value: inputs[inputIndex] } });
        inputIndex += 1;
        fireEvent.click(screen.getByRole("button", { name: "공유" }));
      } else {
        const next = screen.getByRole("button", { name: "다음 →" });
        await waitFor(() => expect(next).toBeEnabled());
        fireEvent.click(next);
      }
    }

    expect(inputIndex).toBe(5);
    expect(await screen.findByRole("heading", { name: "모임이 끝났습니다" })).toBeVisible();
    expect(screen.getByText("세션 완료")).toBeVisible();
    expect(screen.getByText("새 세션 시작")).toBeVisible();
    expect(screen.getByRole("heading", { name: "토론 요약" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "잠들기 전 생각할 질문" })).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.queryByText("## 토론 요약")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Markdown 다운로드" })).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "전체 대화 34" }));
    expect(screen.getAllByRole("article")).toHaveLength(34);
    expect(screen.getByRole("button", { name: "전체 대화 복사" })).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "모임 기록" }));
    expect(screen.getByRole("button", { name: "모임 기록 복사" })).toBeVisible();
  });
});
