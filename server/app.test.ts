import request from "supertest";
import { describe, expect, it } from "vitest";

import { MockGenerationClient } from "../src/api/mockGenerationClient";
import {
  IncompleteGenerationError,
  InvalidStructuredOutputError,
} from "../src/api/errors";
import { selectPersonas } from "../src/personas";
import { createApp } from "./app";

function testApp(sessionCallLimit = 60) {
  return createApp({
    generationClient: new MockGenerationClient(),
    allowedOrigins: ["http://localhost:5173"],
    sessionCallLimit,
    logger: { info() {}, error() {} },
  });
}

describe("server boundary", () => {
  it("reports health without a model call", async () => {
    const response = await request(testApp()).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      liveGenerationAvailable: true,
      model: "gpt-5.6",
    });
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("validates input before generation", async () => {
    const response = await request(testApp())
      .post("/api/generate/book-identification")
      .set("Origin", "http://localhost:5173")
      .send({ title: "" });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe("invalid_request");
  });

  it("returns a schema-valid mock result", async () => {
    const response = await request(testApp())
      .post("/api/generate/book-identification")
      .set("Origin", "http://localhost:5173")
      .set("x-session-id", "test-session")
      .send({ title: "The Stranger" });

    expect(response.status).toBe(200);
    expect(response.body.canonical_title).toBe("The Stranger");
  });

  it("serves every generation operation needed by a browser session", async () => {
    const app = testApp();
    const client = new MockGenerationClient();
    const identified = await client.identifyBook({ title: "The Stranger", language: "en" });
    const book = {
      title: identified.canonical_title,
      author: identified.author,
      confirmedSummary: identified.summary,
      mainCharacters: identified.main_characters,
      candidateTopics: identified.candidate_topics,
      confidence: identified.confidence,
    };
    const personas = selectPersonas("demo");
    const sessionHeaders = { "x-session-id": "browser-session" };

    const notesResponse = await request(app)
      .post("/api/generate/reading-notes")
      .set(sessionHeaders)
      .send({ language: "en", book, persona: personas[0] });
    expect(notesResponse.status).toBe(200);
    expect(notesResponse.body.overall_take).toBeTruthy();

    const utteranceResponse = await request(app)
      .post("/api/generate/utterance")
      .set(sessionHeaders)
      .send({
        language: "en",
        book,
        speaker: "moderator",
        stage: "INTRO",
        task: "WELCOME",
        recentTranscript: [],
        allowShelfReference: false,
      });
    expect(utteranceResponse.status).toBe(200);
    expect(utteranceResponse.body.utterance).toBeTruthy();

    const stanceResponse = await request(app)
      .post("/api/generate/user-stance")
      .set(sessionHeaders)
      .send({
        language: "en",
        text: "I sympathize with him without excusing him.",
        target: "overall_impression",
        book,
      });
    expect(stanceResponse.status).toBe(200);
    expect(stanceResponse.body.stance).toBeTypeOf("number");

    const recapResponse = await request(app)
      .post("/api/generate/recap")
      .set(sessionHeaders)
      .send({
        language: "en",
        date: "2026-07-17",
        book,
        personas,
        transcript: [
          {
            speaker: "moderator",
            text: utteranceResponse.body.utterance,
            stage: "INTRO",
          },
        ],
        personaStances: Object.fromEntries(personas.map(({ id }) => [id, 0])),
        userStances: {},
      });
    expect(recapResponse.status).toBe(200);
    expect(recapResponse.body.markdown).toContain("## Discussion summary");
  });

  it("enforces a per-session call ceiling", async () => {
    const app = testApp(1);
    await request(app)
      .post("/api/generate/book-identification")
      .set("x-session-id", "limited-session")
      .send({ title: "The Stranger" });
    const response = await request(app)
      .post("/api/generate/book-identification")
      .set("x-session-id", "limited-session")
      .send({ title: "The Stranger" });

    expect(response.status).toBe(429);
    expect(response.body.error).toBe("session_call_limit_reached");
    expect(response.body.requestId).toBe(response.headers["x-request-id"]);
  });

  it("returns and logs safe diagnostics without exposing exception text", async () => {
    const generationClient = new MockGenerationClient();
    generationClient.identifyBook = async () => {
      throw new Error("private request content must not escape");
    };
    const errorLogs: string[] = [];
    const app = createApp({
      generationClient,
      allowedOrigins: ["http://localhost:5173"],
      exposeErrorDetails: true,
      logger: { info() {}, error(message) { errorLogs.push(message); } },
    });

    const response = await request(app)
      .post("/api/generate/book-identification")
      .send({ title: "The Stranger" });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({
      error: "generation_failed",
      requestId: response.headers["x-request-id"],
      detail: "Generation failed for an unexpected server-side reason.",
    });
    expect(JSON.stringify(response.body)).not.toContain("private request content");
    expect(errorLogs).toHaveLength(1);
    expect(errorLogs[0]).toContain('"errorCode":"generation_failed"');
    expect(errorLogs[0]).not.toContain("private request content");
  });

  it.each([
    {
      error: new IncompleteGenerationError("max_output_tokens"),
      code: "incomplete_output",
      detail: "The model response ended before its structured output was complete.",
    },
    {
      error: new InvalidStructuredOutputError(),
      code: "invalid_structured_output",
      detail: "The model returned an unusable structured response.",
    },
  ])("returns a distinct typed error for $code", async ({ error, code, detail }) => {
    const generationClient = new MockGenerationClient();
    generationClient.generateReadingNotes = async () => {
      throw error;
    };
    const app = createApp({
      generationClient,
      allowedOrigins: ["http://localhost:5173"],
      exposeErrorDetails: true,
      logger: { info() {}, error() {} },
    });
    const identified = await generationClient.identifyBook({ title: "The Stranger" });
    const persona = selectPersonas("demo")[0];

    const response = await request(app)
      .post("/api/generate/reading-notes")
      .send({
        language: "en",
        book: {
          title: identified.canonical_title,
          author: identified.author,
          confirmedSummary: identified.summary,
          mainCharacters: identified.main_characters,
          candidateTopics: identified.candidate_topics,
          confidence: identified.confidence,
        },
        persona,
      });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ error: code, detail });
  });
});
