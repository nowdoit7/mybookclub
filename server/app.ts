import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { ZodError } from "zod";

import {
  bookIdentificationRequestSchema,
  readingNotesRequestSchema,
  recapRequestSchema,
  userStanceRequestSchema,
  utteranceRequestSchema,
} from "../src/api/contracts";
import { MissingConfigurationError, ModelRefusalError } from "../src/api/errors";
import type { GenerationClient } from "../src/api/generationClient";

interface CreateAppOptions {
  generationClient: GenerationClient;
  allowedOrigins: string[];
  sessionCallLimit?: number;
  liveGenerationAvailable?: boolean;
  model?: string;
}

function createSessionCallLimiter(limit: number) {
  const callCounts = new Map<string, number>();

  return (request: express.Request, response: express.Response, next: express.NextFunction) => {
    const sessionId = request.header("x-session-id")?.trim() || request.ip || "anonymous";
    const nextCount = (callCounts.get(sessionId) ?? 0) + 1;

    if (nextCount > limit) {
      response.status(429).json({
        error: "session_call_limit_reached",
        message: "This session has reached its model-call limit.",
      });
      return;
    }

    callCounts.set(sessionId, nextCount);
    next();
  };
}

export function createApp({
  generationClient,
  allowedOrigins,
  sessionCallLimit = 60,
  liveGenerationAvailable = true,
  model = "gpt-5.6",
}: CreateAppOptions) {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin is not allowed."));
      },
    }),
  );
  app.use(express.json({ limit: "128kb" }));

  app.get("/api/health", (_request, response) => {
    response.json({ status: "ok", liveGenerationAvailable, model });
  });

  const generationRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });
  const sessionCallLimiter = createSessionCallLimiter(sessionCallLimit);

  app.post(
    "/api/generate/book-identification",
    generationRateLimit,
    sessionCallLimiter,
    async (request, response, next) => {
      try {
        const input = bookIdentificationRequestSchema.parse(request.body);
        const result = await generationClient.identifyBook(input);
        response.json(result);
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/generate/reading-notes",
    generationRateLimit,
    sessionCallLimiter,
    async (request, response, next) => {
      try {
        const input = readingNotesRequestSchema.parse(request.body);
        response.json(await generationClient.generateReadingNotes(input));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/generate/utterance",
    generationRateLimit,
    sessionCallLimiter,
    async (request, response, next) => {
      try {
        const input = utteranceRequestSchema.parse(request.body);
        response.json(await generationClient.generateUtterance(input));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/generate/user-stance",
    generationRateLimit,
    sessionCallLimiter,
    async (request, response, next) => {
      try {
        const input = userStanceRequestSchema.parse(request.body);
        response.json(await generationClient.extractUserStance(input));
      } catch (error) {
        next(error);
      }
    },
  );

  app.post(
    "/api/generate/recap",
    generationRateLimit,
    sessionCallLimiter,
    async (request, response, next) => {
      try {
        const input = recapRequestSchema.parse(request.body);
        response.json(await generationClient.generateRecap(input));
      } catch (error) {
        next(error);
      }
    },
  );

  app.use(
    (
      error: unknown,
      _request: express.Request,
      response: express.Response,
      _next: express.NextFunction,
    ) => {
      void _next;

      if (error instanceof ZodError) {
        response.status(400).json({ error: "invalid_request", issues: error.issues });
        return;
      }
      if (error instanceof MissingConfigurationError) {
        response.status(503).json({ error: "server_not_configured" });
        return;
      }
      if (error instanceof ModelRefusalError) {
        response.status(422).json({ error: "model_refusal" });
        return;
      }

      response.status(502).json({ error: "generation_failed" });
    },
  );

  return app;
}
