// @vitest-environment happy-dom

import "@testing-library/jest-dom/vitest";

import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { App, relevantInputContext, resolveSessionSeed } from "./App";
import type {
  GenerationClient,
  UtteranceRequest,
} from "./api/generationClient";
import { MockGenerationClient } from "./api/mockGenerationClient";
import { APP_BUILD_INFO, buildIdentifier } from "./buildInfo";
import { resolveCharacterCoreExperiment } from "./characterCore/runtime";
import { SessionEngine } from "./engine/sessionEngine";
import { selectPersonas } from "./personas";
import type { Utterance } from "./types";

const verifiedLiveBookResponse = {
  canonical_title: "실험용 독서 기록",
  author: "테스트 작가",
  work_scope: "single_book",
  included_titles: ["실험용 독서 기록"],
  summary:
    "검증된 책은 한 독자가 익숙한 판단을 다시 살피는 과정을 다룹니다. 서로 다른 행동의 결과가 처음의 해석을 흔듭니다. 관계의 변화는 세 가지 토론 질문을 뒷받침합니다. 결말은 핵심 긴장을 단정하지 않고 남겨 둡니다.",
  main_characters: ["독자"],
  candidate_topics: [
    "무엇을 가장 중요한 근거로 볼 것인가?",
    "행동의 결과가 처음 판단을 어떻게 바꾸는가?",
    "남은 불확실성을 어디까지 인정해야 하는가?",
  ],
  verification_status: "verified",
  verification_note: "두 개의 독립된 출처에서 제목과 저자를 확인했습니다.",
  sources: [
    { url: "https://publisher.example/experiment" },
    { url: "https://library.example/experiment" },
  ],
};

function liveHealthResponse(characterCoreExperiment = false): Response {
  return new Response(
    JSON.stringify({
      status: "ok",
      liveGenerationAvailable: true,
      model: "gpt-5.6",
      ...(characterCoreExperiment
        ? {
            characterCoreExperiment: {
              version: "v2",
              localOnly: true,
              sessionCallLimit: 45,
            },
          }
        : {}),
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  window.history.replaceState({}, "", "/?mock=1");
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
  window.history.replaceState({}, "", "/");
  cleanup();
  vi.restoreAllMocks();
});

describe("local build identity", () => {
  it("shows the exact build identity on the local setup screen", () => {
    render(<App />);

    const badge = screen.getByTestId("local-build-badge");
    expect(badge).toHaveAccessibleName("Local development build");
    expect(badge).toHaveTextContent(`LOCAL DEV · ${buildIdentifier(APP_BUILD_INFO)}`);
    expect(badge).toHaveTextContent(APP_BUILD_INFO.branch);
    expect(badge).toHaveTextContent("CHARACTER CORE v2 · CHECKING");
  });
});

async function startMockBook(
  language: "ko" | "en",
  title: string,
  author: string,
  displayName = "",
): Promise<void> {
  fireEvent.change(
    screen.getByRole("textbox", { name: language === "ko" ? "책 제목" : "Book title" }),
    { target: { value: title } },
  );
  fireEvent.change(
    screen.getByRole("textbox", { name: language === "ko" ? "저자 (선택)" : "Author (optional)" }),
    { target: { value: author } },
  );
  fireEvent.click(
    screen.getByRole("button", { name: language === "ko" ? "이 책 확인하기" : "Identify this book" }),
  );
  const confirm = await screen.findByRole("button", {
    name:
      language === "ko"
        ? "네, 이 책이 맞습니다 — 모임 시작"
        : "Yes, this is my book — start the session",
  });
  if (displayName) {
    fireEvent.change(
      screen.getByRole("textbox", {
        name: language === "ko" ? "표시 이름 (선택)" : "Display name (optional)",
      }),
      { target: { value: displayName } },
    );
  }
  fireEvent.click(confirm);
}

describe("user input context", () => {
  it("shows the two replies since the user's last discussion turn", () => {
    const transcript: Utterance[] = [
    { speaker: "marcus", text: "Opening perspective.", stage: "DISCUSSION" },
      { speaker: "user", text: "My distinction.", stage: "DISCUSSION" },
      { speaker: "marcus", text: "Challenge response.", stage: "DISCUSSION" },
      { speaker: "dev", text: "Bridge response.", stage: "DISCUSSION" },
    ];

    expect(
      relevantInputContext(transcript, {
        stage: "DISCUSSION",
        kind: "discussion_followup",
      }).map(({ speaker }) => speaker),
    ).toEqual(["marcus", "dev"]);
  });
});

describe("local Character Core experiment", () => {
  it("uses the demo roster only for a local default experiment", () => {
    const defaultSeed = resolveSessionSeed("?characterCore=1", true, false, "random-seed");
    expect(defaultSeed).toBe("demo");
    expect(selectPersonas(defaultSeed).map(({ id }) => id)).toContain("marcus");

    const explicitSeed = resolveSessionSeed(
      "?characterCore=1&seed=reader-choice",
      true,
      false,
      "random-seed",
    );
    expect(selectPersonas(explicitSeed).map(({ id }) => id)).toEqual(
      selectPersonas("reader-choice").map(({ id }) => id),
    );
    expect(resolveSessionSeed("?characterCore=1", true, true, "guest-seed")).toBe(
      "guest-seed",
    );
    expect(resolveSessionSeed("", false, false, "normal-seed")).toBe("normal-seed");
  });

  it("accepts the query only on loopback and only presents an available Korean live setup", async () => {
    expect(resolveCharacterCoreExperiment("?characterCore=1", "localhost")).toEqual({
      version: "v2",
    });
    expect(
      resolveCharacterCoreExperiment("?characterCore=1", "reading-table-buildweek.web.app"),
    ).toBeUndefined();

    window.history.replaceState({}, "", "/?live=1&characterCore=1");
    vi.mocked(globalThis.fetch).mockResolvedValue(liveHealthResponse(true));
    render(<App />);
    expect(await screen.findByTestId("character-core-experiment")).toHaveTextContent(
      "LOCAL EXPERIMENT · Character Core v2",
    );
    expect(screen.getByTestId("character-core-experiment")).toHaveTextContent(
      "45 generation requests max",
    );
    expect(screen.getByTestId("local-build-badge")).toHaveTextContent(
      "CHARACTER CORE v2 · READY",
    );

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    expect(screen.queryByTestId("character-core-experiment")).not.toBeInTheDocument();
  });

  it("freezes active experiment metadata and the marked client after the URL changes", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/health") return liveHealthResponse(true);
      if (url.endsWith("/book-identification")) {
        return new Response(JSON.stringify(verifiedLiveBookResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/utterance")) {
        return new Response(
          JSON.stringify({
            utterance: "근거를 먼저 확인하고 해석의 범위를 정하겠습니다.",
            stance: 0,
            refers_to: null,
            shelf_ref: null,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    let sessionClient: GenerationClient | undefined;
    vi.spyOn(SessionEngine.prototype, "run").mockImplementation(function (
      this: SessionEngine,
    ) {
      sessionClient = Reflect.get(this, "client") as GenerationClient;
      const onUtterance = Reflect.get(this, "onUtterance") as
        | ((utterance: Utterance) => void)
        | undefined;
      onUtterance?.({
        speaker: "marcus",
        text: "이 판단의 근거부터 확인하겠습니다.",
        stage: "INTRO",
      });
      return new Promise<never>(() => undefined);
    });

    window.history.replaceState({}, "", "/?live=1&characterCore=1");
    render(<App />);
    await screen.findByTestId("character-core-experiment");
    fireEvent.change(screen.getByRole("textbox", { name: "책 제목" }), {
      target: { value: "실험용 독서 기록" },
    });
    fireEvent.click(screen.getByRole("button", { name: "웹에서 도서 검증하기" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "네, 이 책이 맞습니다 — 모임 시작",
      }),
    );

    await waitFor(() => expect(sessionClient).toBeDefined());
    expect(
      screen.getAllByTestId("character-core-experiment").some((notice) =>
        notice.textContent?.includes("마커스"),
      ),
    ).toBe(true);

    window.history.replaceState({}, "", "/?live=1");
    fireEvent.click(screen.getByText(/^SFX /u));
    expect(
      screen.getAllByTestId("character-core-experiment").some((notice) =>
        notice.textContent?.includes("마커스"),
      ),
    ).toBe(true);

    await sessionClient!.generateUtterance({ language: "ko" } as UtteranceRequest);
    const utteranceCall = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/utterance"),
    );
    expect(utteranceCall?.[1]?.headers).toMatchObject({
      "x-character-core-experiment": "v2",
    });
    expect(JSON.parse(String(utteranceCall?.[1]?.body))).toMatchObject({
      characterCoreExperiment: { version: "v2" },
    });

    fireEvent.click(screen.getByRole("button", { name: "대화 기록 보기 1" }));
    fireEvent.click(screen.getByRole("button", { name: "전체 대화 복사" }));
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("# LOCAL EXPERIMENT · Character Core v2"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("- Enabled readers: 마커스"),
    );
  });

  it("keeps the experiment inactive when local health omits the capability", async () => {
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockImplementation(async (input) => {
      const url = String(input);
      if (url === "/api/health") return liveHealthResponse(false);
      if (url.endsWith("/book-identification")) {
        return new Response(JSON.stringify(verifiedLiveBookResponse), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (url.endsWith("/utterance")) {
        return new Response(
          JSON.stringify({
            utterance: "표준 대화 정책으로 이 장면을 살펴보겠습니다.",
            stance: 0,
            refers_to: null,
            shelf_ref: null,
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }
      throw new Error(`Unexpected request: ${url}`);
    });
    let sessionClient: GenerationClient | undefined;
    vi.spyOn(SessionEngine.prototype, "run").mockImplementation(function (
      this: SessionEngine,
    ) {
      sessionClient = Reflect.get(this, "client") as GenerationClient;
      return new Promise<never>(() => undefined);
    });

    window.history.replaceState({}, "", "/?live=1&characterCore=1");
    render(<App />);
    expect(
      await screen.findByTestId("character-core-experiment-availability"),
    ).toHaveTextContent("Unavailable on this server");
    expect(screen.queryByTestId("character-core-experiment")).not.toBeInTheDocument();

    fireEvent.change(screen.getByRole("textbox", { name: "책 제목" }), {
      target: { value: "실험용 독서 기록" },
    });
    fireEvent.click(screen.getByRole("button", { name: "웹에서 도서 검증하기" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "네, 이 책이 맞습니다 — 모임 시작",
      }),
    );
    await waitFor(() => expect(sessionClient).toBeDefined());
    expect(screen.queryByTestId("character-core-experiment")).not.toBeInTheDocument();

    await sessionClient!.generateUtterance({ language: "ko" } as UtteranceRequest);
    const experimentCandidateCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes("/api/generate/"),
    );
    for (const [, request] of experimentCandidateCalls) {
      expect(request?.headers).not.toHaveProperty("x-character-core-experiment");
      expect(JSON.parse(String(request?.body))).not.toHaveProperty(
        "characterCoreExperiment",
      );
    }
  });
});

describe("text prototype", () => {
  it("uses live GPT generation publicly without exposing a mode selector", async () => {
    window.history.replaceState({}, "", "/?live=1");
    render(<App />);

    expect(screen.queryByRole("button", { name: /실제 GPT-5.6/u })).not.toBeInTheDocument();
    expect(await screen.findByText("서버의 gpt-5.6 연결 준비가 완료되었습니다.")).toBeVisible();
    expect(screen.getByRole("button", { name: "도서 검증을 완료해야 시작할 수 있습니다" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "책 제목" })).toBeVisible();
  });

  it("blocks an ambiguous live book and enables the session after sourced verification", async () => {
    window.history.replaceState({}, "", "/?live=1");
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ok",
            liveGenerationAvailable: true,
            model: "gpt-5.6",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            canonical_title: "동일 제목의 책",
            author: "저자 미확정",
            work_scope: "single_book",
            included_titles: [],
            summary:
              "검색 결과에서 동일한 제목의 책이 여러 권 발견되었습니다. 입력한 저자와 정확히 일치하는 기록은 확인하지 못했습니다. 줄거리와 등장인물은 검증 전이므로 확정하지 않습니다. 저자 정보를 보완해 다시 검색해야 합니다.",
            main_characters: [],
            candidate_topics: [
              "이 책의 형식은 독자의 관심을 어디로 이끄는가?",
              "어떤 해석이 사용자가 고른 장면을 가장 잘 설명하는가?",
              "이 책이 남기는 인간적 긴장은 무엇이라고 볼 수 있는가?",
            ],
            verification_status: "ambiguous",
            verification_note: "동일 제목의 후보가 두 권 이상 발견되었습니다.",
            sources: [{ url: "https://catalog.example/first" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            canonical_title: "동일 제목의 책",
            author: "확정 저자",
            work_scope: "single_book",
            included_titles: ["동일 제목의 책"],
            summary:
              "검증된 책은 한 인물이 익숙한 세계를 새롭게 바라보는 과정을 다룹니다. 여러 관계가 그 변화에 서로 다른 압력을 가합니다. 작품의 형식은 독자가 무엇을 먼저 믿는지 계속 시험합니다. 결말은 중심 갈등을 단순하게 닫지 않습니다.",
            main_characters: ["주인공"],
            candidate_topics: [
              "이 책의 형식은 독자의 관심을 어디로 이끄는가?",
              "어떤 해석이 사용자가 고른 장면을 가장 잘 설명하는가?",
              "이 책이 남기는 인간적 긴장은 무엇이라고 볼 수 있는가?",
            ],
            verification_status: "verified",
            verification_note: "제목과 저자가 두 개의 독립적인 출처에서 일치했습니다.",
            sources: [
              { url: "https://publisher.example/book" },
              { url: "https://library.example/record" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    render(<App />);
    await screen.findByText("서버의 gpt-5.6 연결 준비가 완료되었습니다.");
    fireEvent.change(screen.getByRole("textbox", { name: "책 제목" }), {
      target: { value: "동일 제목의 책" },
    });
    fireEvent.click(screen.getByRole("button", { name: "웹에서 도서 검증하기" }));

    expect(
      await screen.findByText(/동일하거나 유사한 책이 여러 권 발견됨/u),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "도서 검증을 완료해야 시작할 수 있습니다" })).toBeDisabled();

    fireEvent.change(screen.getByRole("textbox", { name: "저자 (선택)" }), {
      target: { value: "확정 저자" },
    });
    fireEvent.click(screen.getByRole("button", { name: "웹에서 도서 검증하기" }));

    expect(await screen.findByText(/도서 확인 완료/u)).toBeVisible();
    expect(screen.getByRole("link", { name: "publisher.example" })).toHaveAttribute(
      "href",
      "https://publisher.example/book",
    );
    expect(screen.getByRole("link", { name: "library.example" })).toBeVisible();
    expect(screen.getByRole("button", { name: "네, 이 책이 맞습니다 — 모임 시작" })).toBeEnabled();
  });

  it("verifies and displays every component title for a full series", async () => {
    window.history.replaceState({}, "", "/?live=1");
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ok",
            liveGenerationAvailable: true,
            model: "gpt-5.6",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            canonical_title: "삼체 3부작",
            author: "류츠신",
            work_scope: "series",
            included_titles: ["삼체문제", "암흑의 숲", "사신의 영생"],
            summary:
              "이 시리즈는 인류가 우주 문명과 처음 접촉한 뒤 겪는 장기적인 변화를 다룹니다. 각 권은 과학적 위기에서 문명 간 전략과 우주적 생존 문제로 범위를 넓힙니다. 반복해서 등장하는 선택은 개인의 윤리와 종 전체의 생존을 충돌시킵니다. 마지막 권은 앞선 결정들이 남긴 대가를 더 큰 시간 규모에서 다시 묻습니다.",
            main_characters: ["왕먀오", "뤄지", "청신"],
            candidate_topics: [
              "세 권에 걸쳐 인류의 생존 윤리는 어떻게 달라지는가?",
              "어느 권이 첫 접촉의 의미를 가장 크게 바꾸어 놓는가?",
              "개인의 도덕과 문명의 생존은 어디까지 양립할 수 있는가?",
            ],
            verification_status: "verified",
            verification_note: "시리즈와 세 구성 도서가 두 개의 독립적인 출처에서 일치했습니다.",
            sources: [
              { url: "https://publisher.example/series" },
              { url: "https://library.example/series" },
            ],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    render(<App />);
    await screen.findByText("서버의 gpt-5.6 연결 준비가 완료되었습니다.");
    fireEvent.click(screen.getByRole("button", { name: /시리즈 전체/u }));
    fireEvent.change(screen.getByRole("textbox", { name: "시리즈 제목" }), {
      target: { value: "삼체" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: "저자 (선택)" }), {
      target: { value: "류츠신" },
    });
    fireEvent.click(screen.getByRole("button", { name: "웹에서 시리즈 검증하기" }));

    expect(await screen.findByText("시리즈에 포함된 도서")).toBeVisible();
    expect(screen.getByText("삼체문제")).toBeVisible();
    expect(screen.getByText("암흑의 숲")).toBeVisible();
    expect(screen.getByText("사신의 영생")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "네, 이 시리즈가 맞습니다 — 모임 시작" }),
    ).toBeEnabled();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/generate/book-identification",
      expect.objectContaining({ body: expect.stringContaining('"scope":"series"') }),
    );
  });

  it("shows a visible verification status and locks the book fields while sources are checked", async () => {
    window.history.replaceState({}, "", "/?live=1");
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockReset();
    let finishVerification: ((response: Response) => void) | undefined;
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            status: "ok",
            liveGenerationAvailable: true,
            model: "gpt-5.6",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockImplementationOnce(
        () => new Promise<Response>((resolve) => {
          finishVerification = resolve;
        }),
      );

    render(<App />);
    await screen.findByText("서버의 gpt-5.6 연결 준비가 완료되었습니다.");
    const titleInput = screen.getByRole("textbox", { name: "책 제목" });
    fireEvent.change(titleInput, { target: { value: "느린 검증" } });
    fireEvent.click(screen.getByRole("button", { name: "웹에서 도서 검증하기" }));

    const verificationStatus = screen.getByText(/보통 10~30초/u).closest('[role="status"]');
    expect(verificationStatus).toHaveTextContent("웹에서 도서 정보를 검색하고 검증하고 있습니다");
    expect(verificationStatus).toHaveTextContent("보통 10~30초");
    expect(titleInput).toBeDisabled();
    expect(screen.getByRole("button", { name: /한 권/u })).toBeDisabled();

    finishVerification?.(
      new Response(
        JSON.stringify({
          canonical_title: "느린 검증",
          author: "검증 저자",
          work_scope: "single_book",
          included_titles: ["느린 검증"],
          summary: "검증된 책의 충분히 긴 요약입니다. 작품은 한 인물의 선택을 중심에 둡니다. 관계의 변화가 갈등을 키웁니다. 독자는 서로 다른 증언을 비교하게 됩니다. 결말은 쉬운 답을 주지 않습니다.",
          main_characters: ["주인공"],
          candidate_topics: ["질문 하나", "질문 둘", "질문 셋"],
          verification_status: "verified",
          verification_note: "두 출처에서 확인했습니다.",
          sources: [{ url: "https://one.example/book" }, { url: "https://two.example/book" }],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    expect(await screen.findByText(/도서 확인 완료/u)).toBeVisible();
  });

  it("offers a one-click scope correction when a series search finds only one book", async () => {
    window.history.replaceState({}, "", "/?live=1");
    const fetchMock = vi.mocked(globalThis.fetch);
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ status: "ok", liveGenerationAvailable: true, model: "gpt-5.6" }), {
          status: 200,
          headers: { "content-type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            canonical_title: "코스모스",
            author: "칼 세이건",
            work_scope: "series",
            included_titles: ["코스모스"],
            summary: "검색 결과 한 권의 책만 확인되었습니다. 요청한 시리즈 구성은 확인되지 않았습니다. 책의 정보는 단권으로 다시 확인해야 합니다. 현재 결과로는 세션을 시작하지 않습니다.",
            main_characters: ["독자"],
            candidate_topics: ["질문 하나", "질문 둘", "질문 셋"],
            verification_status: "ambiguous",
            verification_note: "한 권만 발견되었습니다.",
            sources: [{ url: "https://one.example/cosmos" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            canonical_title: "코스모스",
            author: "칼 세이건",
            work_scope: "single_book",
            included_titles: ["코스모스"],
            summary: "검증된 단권은 우주 과학의 발견을 인간의 역사와 연결합니다. 여러 과학자의 탐구를 소개합니다. 독자에게 증거와 회의의 가치를 강조합니다. 우주적 관점에서 인간의 위치를 다시 묻습니다.",
            main_characters: ["칼 세이건"],
            candidate_topics: ["질문 하나", "질문 둘", "질문 셋"],
            verification_status: "verified",
            verification_note: "단권 도서로 확인했습니다.",
            sources: [{ url: "https://one.example/cosmos" }, { url: "https://two.example/cosmos" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      );

    render(<App />);
    await screen.findByText("서버의 gpt-5.6 연결 준비가 완료되었습니다.");
    fireEvent.click(screen.getByRole("button", { name: /시리즈 전체/u }));
    fireEvent.change(screen.getByRole("textbox", { name: "시리즈 제목" }), {
      target: { value: "코스모스" },
    });
    fireEvent.click(screen.getByRole("button", { name: "웹에서 시리즈 검증하기" }));

    const retryButton = await screen.findByRole("button", { name: "이 제목을 한 권으로 다시 검증" });
    fireEvent.click(retryButton);

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    expect(await screen.findByText(/도서 확인 완료/u)).toBeVisible();
    expect(screen.getByRole("textbox", { name: "책 제목" })).toHaveValue("코스모스");
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/generate/book-identification",
      expect.objectContaining({ body: expect.stringContaining('"scope":"single_book"') }),
    );
  });

  it("shows regular and imagined-guest choices only after a book is identified", async () => {
    render(<App />);
    expect(screen.queryByRole("tab", { name: "일반 대화하기" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole("textbox", { name: "책 제목" }), {
      target: { value: "테스트 책" },
    });
    fireEvent.click(screen.getByRole("button", { name: "이 책 확인하기" }));

    expect(await screen.findByRole("tab", { name: "일반 대화하기" })).toHaveAttribute("aria-selected", "true");
    fireEvent.click(screen.getByRole("tab", { name: "상상 속 게스트 초대하기" }));
    expect(screen.getAllByText("모임을 시작하기 전에 초대할 게스트 한 명을 선택해주세요.")[0]).toBeVisible();
    expect(screen.getByRole("button", { name: "모임을 시작하기 전에 초대할 게스트 한 명을 선택해주세요." })).toBeDisabled();
  });

  it("waits for the reader before opening the first line", async () => {
    const generateUtterance = MockGenerationClient.prototype.generateUtterance;
    let releaseWelcome: () => void = () => undefined;
    const welcomeGate = new Promise<void>((resolve) => {
      releaseWelcome = resolve;
    });
    vi.spyOn(MockGenerationClient.prototype, "generateUtterance").mockImplementation(
      async (input) => {
        if (input.task === "WELCOME") await welcomeGate;
        return generateUtterance(input);
      },
    );
    render(<App />);

    await startMockBook("ko", "달의 정원", "한여름");
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    const dialogue = screen.getByRole("region", { name: "현재 대화" });
    expect(
      (await within(dialogue).findAllByText(
        "알렉스의 다음 발언이 준비되었습니다.",
      )).length,
    ).toBeGreaterThan(0);
    expect(within(dialogue).getAllByRole("listitem")).toHaveLength(5);
    expect(screen.getByRole("button", { name: /테이블 입장/u })).toBeEnabled();
    expect(screen.getByRole("button", { name: "대화 기록 보기 0" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: /테이블 입장/u }));
    expect(within(dialogue).getAllByText("알렉스의 발언을 준비하고 있습니다…").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /준비 중/u })).toBeDisabled();
    releaseWelcome();
    expect(
      (await within(dialogue).findAllByText(/리딩 테이블에 오신 것을 환영합니다/u)).length,
    ).toBeGreaterThan(0);
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(screen.getByRole("button", { name: "대화 기록 보기 1" })).toBeEnabled();
    expect(screen.getByRole("button", { name: /^다음/u })).toBeEnabled();
  });

  it("shows the deep-research preparation state before reader notes begin", async () => {
    const prepareMeetingPlan = MockGenerationClient.prototype.prepareMeetingPlan;
    let releaseResearch: () => void = () => undefined;
    const researchGate = new Promise<void>((resolve) => {
      releaseResearch = resolve;
    });
    vi.spyOn(MockGenerationClient.prototype, "prepareMeetingPlan").mockImplementation(
      async (input) => {
        await researchGate;
        return prepareMeetingPlan(input);
      },
    );
    render(<App />);

    await startMockBook("ko", "달의 정원", "한여름");
    expect(
      (
        await screen.findAllByText(
          "책을 더 깊이 살펴보고 알렉스의 발제를 준비하고 있습니다…",
        )
      ).some((element) => element.className !== "sr-only"),
    ).toBe(true);

    releaseResearch();
    expect(
      (await screen.findAllByText("알렉스의 다음 발언이 준비되었습니다.")).length,
    ).toBeGreaterThan(0);
  });

  it("advances one dialogue page at a time and keeps the transcript closed", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    });
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "English" }));
    await startMockBook("en", "The Cartographer's Lantern", "Vale");
    expect(screen.queryAllByRole("article")).toHaveLength(0);

    fireEvent.click(await screen.findByRole("button", { name: /Enter the table/u }));
    const dialogue = screen.getByRole("region", { name: "Current dialogue" });
    await waitFor(() =>
      expect(within(dialogue).getAllByText(/Welcome to Open Reading Club/u).length).toBeGreaterThan(0),
    );
    expect(screen.queryAllByRole("article")).toHaveLength(0);
    expect(within(dialogue).getAllByText("Alex").length).toBeGreaterThan(0);
    expect(within(dialogue).getByRole("img", { name: "Alex" })).toBeVisible();
    expect(screen.getByRole("region", { name: "Reading table" })).toBeVisible();
    expect(screen.getByText(/^Speaking$/u)).toBeVisible();

    fireEvent.click(within(dialogue).getByTestId("dialogue-box"));
    expect(screen.getByRole("button", { name: "View transcript 1" })).toBeEnabled();
    expect(within(dialogue).queryAllByText(/Hi, I'm/u)).toHaveLength(0);

    fireEvent.click(screen.getByRole("button", { name: /^Next/u }));
    await waitFor(() =>
      expect(within(dialogue).getAllByText(/Hi, I'm/u).length).toBeGreaterThan(0),
    );
    expect(within(dialogue).queryByLabelText("Alex")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View transcript 2" }));
    expect(screen.getByRole("dialog", { name: "Conversation transcript" })).toBeVisible();
    expect(screen.getAllByRole("article")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "Copy full transcript" }));
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("## Intro\n\n**Alex**"),
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied" })).toBeVisible(),
    );
  });

  it("completes all six interactive user turns and reaches the recap", async () => {
    const inputs = [
      "혼자 읽을 때 놓친 관점을 듣고 싶어 참여했습니다.",
      "중심 질문은 흥미로웠지만 제시 방식에는 거리감이 있었습니다.",
      "앞에서 이해한 내용을 뒤집어 보게 한 대목이 가장 기억에 남았습니다.",
      "형식과 그 결과를 함께 설명하는 해석이 더 설득력 있다고 봅니다.",
      "그 반론은 중요하지만 의도와 결과를 구분하면 제 해석은 여전히 성립합니다.",
      "다른 독자들의 근거를 들으며 처음 판단을 더 세밀하게 다듬었습니다.",
    ];
    let inputIndex = 0;
    render(<App />);

    expect(screen.getByRole("button", { name: "한국어" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await startMockBook("ko", "천천히 읽는 기술", "김독자", "David");

    for (let guard = 0; guard < 100; guard += 1) {
      await waitFor(() => {
        const readyControl =
          screen.queryByRole("heading", { name: "모임이 끝났습니다" }) ??
          screen.queryByRole("textbox") ??
          screen.queryByRole("button", { name: "내 의견 보태기" }) ??
          screen.queryByRole("button", { name: "책 이야기 조금 더 이어보기" }) ??
          screen.queryByRole("button", {
            name: /(?:테이블 입장|다음|시작|마지막 생각 남기기|모임 기록 보기)/u,
          });
        expect(readyControl).not.toBeNull();
      });
      if (screen.queryByRole("heading", { name: "모임이 끝났습니다" })) break;

      const textbox = screen.queryByRole("textbox");
      if (textbox) {
        expect(screen.getByRole("listitem", { name: "David · 모임 참여자" })).toHaveAttribute(
          "aria-current",
          "true",
        );
        if (inputIndex === 4) {
          expect(screen.getByRole("region", { name: "현재 대화" })).toHaveTextContent(
            "지금 답변할 질문",
          );
        }
        fireEvent.change(textbox, { target: { value: inputs[inputIndex] } });
        inputIndex += 1;
        fireEvent.click(screen.getByRole("button", { name: "공유" }));
      } else if (screen.queryByRole("button", { name: "내 의견 보태기" })) {
        fireEvent.click(screen.getByRole("button", { name: "내 의견 보태기" }));
      } else if (screen.queryByRole("button", { name: "책 이야기 조금 더 이어보기" })) {
        fireEvent.click(screen.getByRole("button", { name: "마무리 순서로 이동" }));
      } else {
        const next = screen.getByRole("button", {
          name: /(?:테이블 입장|다음|시작|마지막 생각 남기기|모임 기록 보기)/u,
        });
        await waitFor(() => expect(next).toBeEnabled());
        fireEvent.click(next);
      }
    }

    expect(inputIndex).toBe(6);
    expect(await screen.findByRole("heading", { name: "모임이 끝났습니다" })).toBeVisible();
    expect(screen.getByText("세션 완료")).toBeVisible();
    expect(screen.getByText("새 세션 시작")).toBeVisible();
    expect(screen.getByRole("heading", { name: "오늘 나눈 이야기" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "잠들기 전 생각할 질문" })).toBeVisible();
    expect(screen.getByRole("table")).toBeVisible();
    expect(screen.queryByText("## 오늘 나눈 이야기")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Markdown 다운로드" })).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "전체 대화 31" }));
    expect(screen.getAllByRole("article")).toHaveLength(31);
    expect(
      screen
        .getAllByRole("article")
        .some((article) => within(article).queryByText("David") !== null),
    ).toBe(true);
    expect(screen.getByRole("button", { name: "전체 대화 복사" })).toBeVisible();

    fireEvent.click(screen.getByRole("tab", { name: "모임 기록" }));
    expect(screen.getByRole("button", { name: "모임 기록 복사" })).toBeVisible();
  });
});
