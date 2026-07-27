import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { MockGenerationClient } from "../src/api/mockGenerationClient";
import {
  IncompleteGenerationError,
  InvalidStructuredOutputError,
} from "../src/api/errors";
import { PERSONAS, selectPersonas } from "../src/personas";
import {
  createApp,
  isLoopbackRemoteAddress,
  sessionCallLimitForRequest,
} from "./app";

function testApp(sessionCallLimit = 60) {
  return createApp({
    generationClient: new MockGenerationClient(),
    allowedOrigins: ["http://localhost:5173"],
    sessionCallLimit,
    logger: { info() {}, error() {} },
  });
}

function localExperimentApp(generationClient = new MockGenerationClient()) {
  return createApp({
    generationClient,
    allowedOrigins: ["http://localhost:5173"],
    trustProxy: 1,
    requestRateLimit: 100,
    allowLocalCharacterCoreExperiment: true,
    logger: { info() {}, error() {} },
  });
}

describe("server boundary", () => {
  it("accepts an explicit proxy trust setting for managed deployments", () => {
    const app = createApp({
      generationClient: new MockGenerationClient(),
      allowedOrigins: ["https://reading-table-buildweek.web.app"],
      trustProxy: 1,
      logger: { info() {}, error() {} },
    });

    expect(app.get("trust proxy")).toBe(1);
  });

  it("reports health without a model call", async () => {
    const response = await request(testApp()).get("/api/health");
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: "ok",
      liveGenerationAvailable: true,
      model: "gpt-5.6-terra",
    });
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("reports local Character Core metadata only when the capability is enabled", async () => {
    const response = await request(localExperimentApp()).get("/api/health");

    expect(response.status).toBe(200);
    expect(response.body.characterCoreExperiment).toEqual({
      version: "v2",
      localOnly: true,
      sessionCallLimit: 45,
    });
    expect((await request(testApp()).get("/api/health")).body).not.toHaveProperty(
      "characterCoreExperiment",
    );
  });

  it("accepts only exact loopback socket addresses", () => {
    expect(isLoopbackRemoteAddress("127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("::1")).toBe(true);
    expect(isLoopbackRemoteAddress("::ffff:127.0.0.1")).toBe(true);
    expect(isLoopbackRemoteAddress("[::1]")).toBe(true);
    expect(isLoopbackRemoteAddress("[::1%lo0]")).toBe(true);

    expect(isLoopbackRemoteAddress("127.0.0.2")).toBe(false);
    expect(isLoopbackRemoteAddress("192.168.1.10")).toBe(false);
    expect(isLoopbackRemoteAddress("203.0.113.8")).toBe(false);
    expect(isLoopbackRemoteAddress("::ffff:203.0.113.8")).toBe(false);
    expect(isLoopbackRemoteAddress("[::1]:3000")).toBe(false);
    expect(isLoopbackRemoteAddress("[::1].example")).toBe(false);
    expect(isLoopbackRemoteAddress(" ::1")).toBe(false);
    expect(isLoopbackRemoteAddress(undefined)).toBe(false);
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
      .send({ title: "A Reader-Selected Book" });

    expect(response.status).toBe(200);
    expect(response.body.canonical_title).toBe("A Reader-Selected Book");
  });

  it("serves every generation operation needed by a browser session", async () => {
    const app = testApp();
    const client = new MockGenerationClient();
    const identified = await client.identifyBook({ title: "A Reader-Selected Book", language: "en" });
    const book = {
      title: identified.canonical_title,
      author: identified.author,
      workScope: identified.work_scope,
      includedTitles: identified.included_titles,
      confirmedSummary: identified.summary,
      mainCharacters: identified.main_characters,
      candidateTopics: identified.candidate_topics,
      verificationStatus: identified.verification_status,
      verificationNote: identified.verification_note,
      sources: identified.sources,
    };
    const personas = selectPersonas("demo", "charles-darwin");
    const imaginedGuest = personas.find(({ id }) => id === "charles-darwin");
    expect(imaginedGuest?.imaginedGuest).toBeDefined();
    const participants = [
      { id: "moderator", displayName: "Alex", role: "moderator" },
      ...personas.map(({ id, name }) => ({ id, displayName: name, role: "reader" })),
      { id: "user", displayName: "You", role: "user" },
    ];
    const sessionHeaders = { "x-session-id": "browser-session" };

    const notesResponse = await request(app)
      .post("/api/generate/reading-notes")
      .set(sessionHeaders)
      .send({ language: "en", book, persona: imaginedGuest });
    expect(notesResponse.status).toBe(200);
    expect(notesResponse.body.overall_take).toBeTruthy();

    const utteranceResponse = await request(app)
      .post("/api/generate/utterance")
      .set(sessionHeaders)
      .send({
        language: "en",
        roomAtmosphere: {
          warmth: 0.7,
          playfulness: 0.35,
          tension: 0.25,
          energy: 0.55,
        },
        book,
        speaker: "moderator",
        stage: "INTRO",
        task: "WELCOME",
        recentTranscript: [],
        participants,
        allowShelfReference: false,
      });
    expect(utteranceResponse.status).toBe(200);
    expect(utteranceResponse.body.utterance).toBeTruthy();

    const guestUtteranceResponse = await request(app)
      .post("/api/generate/utterance")
      .set(sessionHeaders)
      .send({
        language: "en",
        roomAtmosphere: {
          warmth: 0.7,
          playfulness: 0.35,
          tension: 0.25,
          energy: 0.55,
        },
        book,
        speaker: imaginedGuest,
        stage: "FIRST_IMPRESSIONS",
        task: "FIRST_IMPRESSION",
        recentTranscript: [],
        participants,
        allowShelfReference: false,
      });
    expect(guestUtteranceResponse.status).toBe(200);
    expect(guestUtteranceResponse.body.utterance).toBeTruthy();

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
        userDisplayName: "You",
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
      .send({ title: "A Reader-Selected Book" });
    const response = await request(app)
      .post("/api/generate/book-identification")
      .set("x-session-id", "limited-session")
      .send({ title: "A Reader-Selected Book" });

    expect(response.status).toBe(429);
    expect(response.body.error).toBe("session_call_limit_reached");
    expect(response.body.requestId).toBe(response.headers["x-request-id"]);
  });

  it("rejects Character Core markers by default before calling generation", async () => {
    const generationClient = new MockGenerationClient();
    const identifyBook = vi.spyOn(generationClient, "identifyBook");
    const app = createApp({
      generationClient,
      allowedOrigins: ["http://localhost:5173"],
      logger: { info() {}, error() {} },
    });

    const response = await request(app)
      .post("/api/generate/book-identification")
      .set("Origin", "http://localhost:5173")
      .set("x-character-core-experiment", "v2")
      .set("x-session-id", "disabled-core-session")
      .send({ title: "A Reader-Selected Book" });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("character_core_experiment_forbidden");
    expect(identifyBook).not.toHaveBeenCalled();
  });

  it("rejects a Character Core header from a non-loopback origin", async () => {
    const generationClient = new MockGenerationClient();
    const identifyBook = vi.spyOn(generationClient, "identifyBook");
    const app = createApp({
      generationClient,
      allowedOrigins: ["https://example.test"],
      allowLocalCharacterCoreExperiment: true,
      logger: { info() {}, error() {} },
    });

    const response = await request(app)
      .post("/api/generate/book-identification")
      .set("Origin", "https://example.test")
      .set("x-character-core-experiment", "v2")
      .set("x-session-id", "remote-core-session")
      .send({ title: "A Reader-Selected Book" });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("character_core_experiment_forbidden");
    expect(identifyBook).not.toHaveBeenCalled();
  });

  it("allows a matching local header and body marker for supported requests", async () => {
    const generationClient = new MockGenerationClient();
    const generateReadingNotes = vi.spyOn(generationClient, "generateReadingNotes");
    const generateUtterance = vi.spyOn(generationClient, "generateUtterance");
    const marcus = PERSONAS.find(({ id }) => id === "marcus")!;
    const identified = await generationClient.identifyBook({
      title: "A Reader-Selected Book",
      language: "ko",
    });
    const book = {
      title: identified.canonical_title,
      author: identified.author,
      workScope: identified.work_scope,
      includedTitles: identified.included_titles,
      confirmedSummary: identified.summary,
      mainCharacters: identified.main_characters,
      candidateTopics: identified.candidate_topics,
      verificationStatus: identified.verification_status,
      verificationNote: identified.verification_note,
      sources: identified.sources,
    };

    const response = await request(localExperimentApp(generationClient))
      .post("/api/generate/reading-notes")
      .set("Origin", "http://localhost:5173")
      .set("x-character-core-experiment", "v2")
      .set("x-session-id", "local-core-session")
      .send({
        language: "ko",
        book,
        persona: marcus,
        characterCoreExperiment: { version: "v2" },
      });

    expect(response.status).toBe(200);
    expect(generateReadingNotes).toHaveBeenCalledWith(
      expect.objectContaining({
        characterCoreExperiment: { version: "v2" },
      }),
    );

    const utteranceResponse = await request(localExperimentApp(generationClient))
      .post("/api/generate/utterance")
      .set("Origin", "http://localhost:5173")
      .set("x-character-core-experiment", "v2")
      .set("x-session-id", "local-core-utterance-session")
      .send({
        language: "ko",
        roomAtmosphere: {
          warmth: 0.5,
          playfulness: 0.3,
          tension: 0.6,
          energy: 0.5,
        },
        book,
        speaker: marcus,
        stage: "DISCUSSION",
        task: "CHALLENGE_USER",
        recentTranscript: [],
        participants: [
          { id: "moderator", displayName: "알렉스", role: "moderator" },
          { id: "marcus", displayName: "마커스", role: "reader" },
          { id: "reader-b", displayName: "독자 B", role: "reader" },
          { id: "reader-c", displayName: "독자 C", role: "reader" },
          { id: "user", displayName: "David", role: "user" },
        ],
        allowShelfReference: false,
        characterCoreExperiment: { version: "v2" },
      });

    expect(utteranceResponse.status).toBe(200);
    expect(generateUtterance).toHaveBeenCalledWith(
      expect.objectContaining({
        characterCoreExperiment: { version: "v2" },
      }),
    );
  });

  it.each([
    {
      name: "a body marker without its header",
      header: undefined,
      marker: { version: "v2" },
    },
    {
      name: "a header without its body marker",
      header: "v2",
      marker: undefined,
    },
    {
      name: "an unsupported marker version",
      header: "v2",
      marker: { version: "v1" },
    },
  ])("rejects $name before model generation", async ({ header, marker }) => {
    const generationClient = new MockGenerationClient();
    const generateReadingNotes = vi.spyOn(generationClient, "generateReadingNotes");
    const identified = await generationClient.identifyBook({
      title: "A Reader-Selected Book",
    });
    const body = {
      language: "en",
      book: {
        title: identified.canonical_title,
        author: identified.author,
        workScope: identified.work_scope,
        includedTitles: identified.included_titles,
        confirmedSummary: identified.summary,
        mainCharacters: identified.main_characters,
        candidateTopics: identified.candidate_topics,
        verificationStatus: identified.verification_status,
        verificationNote: identified.verification_note,
        sources: identified.sources,
      },
      persona: selectPersonas("demo")[0],
      ...(marker ? { characterCoreExperiment: marker } : {}),
    };
    const pending = request(localExperimentApp(generationClient))
      .post("/api/generate/reading-notes")
      .set("Origin", "http://localhost:5173")
      .set("x-session-id", `marker-mismatch-${header ?? "none"}-${marker?.version ?? "none"}`);
    if (header) pending.set("x-character-core-experiment", header);

    const response = await pending.send(body);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("character_core_experiment_forbidden");
    expect(generateReadingNotes).not.toHaveBeenCalled();
  });

  it("uses 45 calls for local Character Core sessions and retains 60 normally", () => {
    expect(sessionCallLimitForRequest(60, true)).toBe(45);
    expect(sessionCallLimitForRequest(60, false)).toBe(60);
  });

  it("allows experimental request 45 and rejects request 46 on the Express path", async () => {
    const app = localExperimentApp();
    let latestStatus: number | undefined;

    for (let index = 0; index < 45; index += 1) {
      const response = await request(app)
        .post("/api/generate/book-identification")
        .set("Origin", "http://localhost:5173")
        .set("x-character-core-experiment", "v2")
        .set("x-session-id", "core-forty-five")
        .send({ title: "A Reader-Selected Book" });
      latestStatus = response.status;
    }

    expect(latestStatus).toBe(200);
    const overflow = await request(app)
      .post("/api/generate/book-identification")
      .set("Origin", "http://localhost:5173")
      .set("x-character-core-experiment", "v2")
      .set("x-session-id", "core-forty-five")
      .send({ title: "A Reader-Selected Book" });

    expect(overflow.status).toBe(429);
    expect(overflow.body.error).toBe("session_call_limit_reached");
  });

  it.each([
    {
      name: "normal to experiment",
      firstHeaders: {},
      secondHeaders: { "x-character-core-experiment": "v2" },
    },
    {
      name: "experiment to normal",
      firstHeaders: { "x-character-core-experiment": "v2" },
      secondHeaders: {},
    },
  ])("rejects a $name mode switch for one session", async ({
    firstHeaders,
    secondHeaders,
  }) => {
    const generationClient = new MockGenerationClient();
    const identifyBook = vi.spyOn(generationClient, "identifyBook");
    const app = localExperimentApp(generationClient);
    const base = () =>
      request(app)
        .post("/api/generate/book-identification")
        .set("Origin", "http://localhost:5173")
        .set("x-session-id", "mode-bound-session");

    const first = await base()
      .set(firstHeaders)
      .send({ title: "A Reader-Selected Book" });
    const second = await base()
      .set(secondHeaders)
      .send({ title: "A Reader-Selected Book" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(403);
    expect(second.body.error).toBe("session_experiment_mismatch");
    expect(identifyBook).toHaveBeenCalledTimes(1);
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
      .send({ title: "A Reader-Selected Book" });

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
    const identified = await generationClient.identifyBook({ title: "A Reader-Selected Book" });
    const persona = selectPersonas("demo")[0];

    const response = await request(app)
      .post("/api/generate/reading-notes")
      .send({
        language: "en",
        book: {
          title: identified.canonical_title,
          author: identified.author,
          workScope: identified.work_scope,
          includedTitles: identified.included_titles,
          confirmedSummary: identified.summary,
          mainCharacters: identified.main_characters,
          candidateTopics: identified.candidate_topics,
          verificationStatus: identified.verification_status,
          verificationNote: identified.verification_note,
          sources: identified.sources,
        },
        persona,
      });

    expect(response.status).toBe(502);
    expect(response.body).toMatchObject({ error: code, detail });
  });
});
