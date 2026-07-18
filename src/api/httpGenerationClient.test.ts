import { afterEach, describe, expect, it, vi } from "vitest";

import { GenerationApiError, HttpGenerationClient } from "./httpGenerationClient";

afterEach(() => vi.restoreAllMocks());

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
  });

  it("turns typed server failures into client errors", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ error: "server_not_configured" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new HttpGenerationClient("/api/generate", "session-123");

    await expect(
      client.identifyBook({ title: "The Stranger", language: "en" }),
    ).rejects.toEqual(new GenerationApiError("server_not_configured", 503));
  });
});
