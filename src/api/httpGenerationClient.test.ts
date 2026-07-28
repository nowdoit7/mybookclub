import { afterEach, describe, expect, it, vi } from "vitest";

import {
  GenerationApiError,
  HttpGenerationClient,
  resolveGenerationApiBaseUrl,
} from "./httpGenerationClient";
import { clearGenerationDiagnostics, getGenerationDiagnostics } from "./diagnostics";
import type {
  MeetingPlanRequest,
  ReadingNotesRequest,
  UtteranceRequest,
} from "./generationClient";

const identifiedBookResponse = {
  canonical_title: "A Reader-Selected Book",
  author: "A. Reader",
  work_scope: "single_book",
  included_titles: ["A Reader-Selected Book"],
  summary:
    "The opening establishes a central question for the reader. A later change complicates the first interpretation. The structure makes two readings plausible. The ending leaves their tension unresolved.",
  main_characters: ["Ari"],
  candidate_topics: ["Topic one?", "Topic two?", "Topic three?"],
  verification_status: "verified",
  verification_note: "Two sources matched this book.",
  sources: [
    { url: "https://publisher.example/book" },
    { url: "https://library.example/record" },
  ],
};

afterEach(() => {
  vi.restoreAllMocks();
  clearGenerationDiagnostics();
});

describe("HttpGenerationClient", () => {
  it("bypasses the Firebase Hosting timeout on deployed sites", () => {
    expect(resolveGenerationApiBaseUrl("reading-table-buildweek.web.app")).toBe(
      "https://us-central1-fir-test-f3fef.cloudfunctions.net/readingTableApi/api/generate",
    );
    expect(resolveGenerationApiBaseUrl("reading-table-buildweek.firebaseapp.com")).toBe(
      "https://us-central1-fir-test-f3fef.cloudfunctions.net/readingTableApi/api/generate",
    );
    expect(resolveGenerationApiBaseUrl("localhost")).toBe("/api/generate");
  });

  it("sends a stable server-side session id and validates the response", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          stance: 0.5,
          paraphrase: "Sympathy does not remove responsibility.",
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new HttpGenerationClient("/api/generate", "session-123");

    await client.extractUserStance({
      language: "en",
      text: "I sympathize with him without excusing him.",
      target: "overall_impression",
      book: {
        title: "A Reader-Selected Book",
        author: "A. Reader",
        workScope: "single_book",
        includedTitles: ["A Reader-Selected Book"],
        confirmedSummary: "A sufficiently long confirmed summary used only for this client boundary test and no model call.",
        mainCharacters: ["Ari"],
        candidateTopics: ["Topic one?", "Topic two?", "Topic three?"],
        verificationStatus: "verified",
        verificationNote: "Two sources matched this book.",
        sources: [
          { url: "https://publisher.example/book" },
          { url: "https://library.example/record" },
        ],
      },
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generate/user-stance",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "x-session-id": "session-123" }),
      }),
    );
    expect(getGenerationDiagnostics()).toMatchObject([
      { endpoint: "user-stance", outcome: "success", status: 200 },
    ]);
    const request = fetchMock.mock.calls[0][1];
    expect(request?.body).toBe(JSON.stringify({
      language: "en",
      text: "I sympathize with him without excusing him.",
      target: "overall_impression",
      book: {
        title: "A Reader-Selected Book",
        author: "A. Reader",
        workScope: "single_book",
        includedTitles: ["A Reader-Selected Book"],
        confirmedSummary: "A sufficiently long confirmed summary used only for this client boundary test and no model call.",
        mainCharacters: ["Ari"],
        candidateTopics: ["Topic one?", "Topic two?", "Topic three?"],
        verificationStatus: "verified",
        verificationNote: "Two sources matched this book.",
        sources: [
          { url: "https://publisher.example/book" },
          { url: "https://library.example/record" },
        ],
      },
    }));
    expect(request?.headers).not.toHaveProperty("x-character-core-experiment");
  });

  it("uses the dedicated meeting-plan boundary for deep research", async () => {
    const planResponse = {
      research_brief:
        "The plan uses bounded research rather than claiming full-text access. It separates scenes, form, context, and emotion. Common interpretations are labeled. Each reader receives an open entrance rather than a conclusion.",
      anchors: Array.from({ length: 8 }, (_, index) => ({
        id: `anchor-${index + 1}`,
        kind: index % 2 === 0 ? "scene" : "form",
        label: `Anchor ${index + 1}`,
        detail: `A concrete and bounded research detail for anchor ${index + 1}.`,
        is_common_interpretation: index === 0,
      })),
      primary_prompt: "Which moment changed how you understood the book?",
      reserve_prompt: "What would you notice differently on a second reading?",
      assignments: ["reader-a", "reader-b", "reader-c"].map((personaId, index) => ({
        persona_id: personaId,
        anchor_id: `anchor-${index + 1}`,
        emotional_door: "Name the concrete feeling created by this entrance.",
        question_to_explore: "What might another reader notice here?",
      })),
      uncertainties: [],
      connection_concepts: [],
      sources: [
        { url: "https://publisher.example/book" },
        { url: "https://library.example/record" },
      ],
    };
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify(planResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new HttpGenerationClient("/api/generate", "session-123");

    const output = await client.prepareMeetingPlan({
      language: "en",
    } as MeetingPlanRequest);

    expect(output.primary_prompt).toBe(planResponse.primary_prompt);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/generate/meeting-plan",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("marks every experimental post and only adds the Korean prompt marker to notes and utterances", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const path = String(url);
      const body = path.endsWith("/utterance")
        ? { utterance: "근거와 해석을 구분해 보겠습니다.", stance: 0, refers_to: null, shelf_ref: null }
        : path.endsWith("/reading-notes")
          ? {
              overall_take: "이 작품은 판단을 서두르기보다 드러난 행동과 그 결과를 함께 살펴야 합니다.",
              overall_stance: 0,
              stance_by_topic: [
                { topic: "하나", stance: 0, reason: "첫 번째 근거" },
                { topic: "둘", stance: 0, reason: "두 번째 근거" },
                { topic: "셋", stance: 0, reason: "세 번째 근거" },
              ],
              key_scenes: ["첫 번째 장면", "두 번째 장면"],
              shelf_connections: [],
              personal_reaction: "확신을 미루게 만드는 대목이 오래 남았습니다.",
              unresolved_question: "다른 조건에서도 같은 판단이 가능한가요?",
              possible_revision: "반대되는 행동의 결과가 제시된다면 판단을 고치겠습니다.",
              question_for_table: "여러분은 어느 행동을 가장 중요한 근거로 보셨나요?",
            }
        : identifiedBookResponse;
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
    const client = new HttpGenerationClient("/api/generate", "core-session", {
      characterCoreExperiment: { version: "v2" },
    });

    await client.identifyBook({ title: "A Reader-Selected Book", language: "ko" });
    await client.generateReadingNotes({ language: "ko" } as ReadingNotesRequest);
    const utteranceInput = { language: "ko" } as UtteranceRequest;
    await client.generateUtterance(utteranceInput);

    for (const [, request] of fetchMock.mock.calls) {
      expect(request?.headers).toMatchObject({
        "x-session-id": "core-session",
        "x-character-core-experiment": "v2",
      });
    }
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).not.toHaveProperty(
      "characterCoreExperiment",
    );
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toMatchObject({
      language: "ko",
      characterCoreExperiment: { version: "v2" },
    });
    expect(JSON.parse(String(fetchMock.mock.calls[2][1]?.body))).toMatchObject({
      language: "ko",
      characterCoreExperiment: { version: "v2" },
    });
  });

  it("keeps the body marker out of English requests while retaining the experiment header", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          utterance: "Let us separate the evidence from the inference.",
          stance: 0,
          refers_to: null,
          shelf_ref: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new HttpGenerationClient("/api/generate", "core-session", {
      characterCoreExperiment: { version: "v2" },
    });

    await client.generateUtterance({ language: "en" } as UtteranceRequest);

    expect(fetchMock.mock.calls[0][1]?.headers).toMatchObject({
      "x-character-core-experiment": "v2",
    });
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).not.toHaveProperty(
      "characterCoreExperiment",
    );
  });

  it("blocks a local experiment before request 46 leaves the browser", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify(identifiedBookResponse), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new HttpGenerationClient("/api/generate", "core-session", {
      characterCoreExperiment: { version: "v2" },
    });

    for (let request = 0; request < 45; request += 1) {
      await client.identifyBook({ title: "A Reader-Selected Book", language: "ko" });
    }
    const blocked = client.identifyBook({ title: "A Reader-Selected Book", language: "ko" });

    await expect(blocked).rejects.toMatchObject({
      code: "session_call_limit_reached",
      status: 429,
      options: {
        endpoint: "book-identification",
        detail: expect.stringContaining("limited to 45 generation requests"),
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(45);
  });

  it("turns typed server failures into client errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "server_not_configured",
          requestId: "app-request-123",
          detail: "OPENAI_API_KEY is not configured on the server.",
        }),
        {
        status: 503,
          headers: {
            "content-type": "application/json",
            "x-request-id": "app-request-123",
          },
        },
      ),
    );
    const client = new HttpGenerationClient("/api/generate", "session-123");

    const failure = client.identifyBook({ title: "A Reader-Selected Book", language: "en" });
    await expect(failure).rejects.toBeInstanceOf(GenerationApiError);
    await expect(failure).rejects.toMatchObject({
      code: "server_not_configured",
      status: 503,
      options: {
        endpoint: "book-identification",
        requestId: "app-request-123",
        detail: "OPENAI_API_KEY is not configured on the server.",
      },
    });
    expect(getGenerationDiagnostics()).toMatchObject([
      {
        endpoint: "book-identification",
        outcome: "failure",
        status: 503,
        code: "server_not_configured",
        requestId: "app-request-123",
      },
    ]);
  });

  it("shows a request as pending until the server responds", async () => {
    let resolveFetch!: (response: Response) => void;
    vi.spyOn(globalThis, "fetch").mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );
    const client = new HttpGenerationClient("/api/generate", "session-123");

    const request = client.identifyBook({ title: "A Reader-Selected Book", language: "en" });
    expect(getGenerationDiagnostics()).toMatchObject([
      { endpoint: "book-identification", outcome: "pending", status: 0 },
    ]);

    resolveFetch(
      new Response(
        JSON.stringify({
          ...identifiedBookResponse,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    await request;

    expect(getGenerationDiagnostics()).toMatchObject([
      { endpoint: "book-identification", outcome: "success", status: 200 },
    ]);
  });
});
