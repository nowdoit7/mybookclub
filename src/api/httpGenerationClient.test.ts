import { afterEach, describe, expect, it, vi } from "vitest";

import { GenerationApiError, HttpGenerationClient } from "./httpGenerationClient";
import { clearGenerationDiagnostics, getGenerationDiagnostics } from "./diagnostics";

afterEach(() => {
  vi.restoreAllMocks();
  clearGenerationDiagnostics();
});

describe("HttpGenerationClient", () => {
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
        title: "The Stranger",
        author: "Albert Camus",
        confirmedSummary: "A sufficiently long confirmed summary used only for this client boundary test and no model call.",
        mainCharacters: ["Meursault"],
        candidateTopics: ["Topic one?", "Topic two?", "Topic three?"],
        confidence: "high",
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

    const failure = client.identifyBook({ title: "The Stranger", language: "en" });
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

    const request = client.identifyBook({ title: "The Stranger", language: "en" });
    expect(getGenerationDiagnostics()).toMatchObject([
      { endpoint: "book-identification", outcome: "pending", status: 0 },
    ]);

    resolveFetch(
      new Response(
        JSON.stringify({
          canonical_title: "The Stranger",
          author: "Albert Camus",
          summary:
            "A detached clerk moves through grief, intimacy, violence, and judgment in colonial Algiers. His refusal to perform expected emotion becomes central at trial. The court reads character through social ritual. The novel tests absurdity, responsibility, and moral legibility.",
          main_characters: ["Meursault"],
          candidate_topics: ["Topic one?", "Topic two?", "Topic three?"],
          confidence: "high",
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
