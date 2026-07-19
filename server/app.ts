import { randomUUID } from "node:crypto";

import cors from "cors";
import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { APIError } from "openai";
import { ZodError } from "zod";

import {
  bookIdentificationRequestSchema,
  discussionFocusRequestSchema,
  readingNotesRequestSchema,
  recapRequestSchema,
  userStanceRequestSchema,
  utteranceRequestSchema,
} from "../src/api/contracts";
import {
  IncompleteGenerationError,
  InvalidStructuredOutputError,
  MissingConfigurationError,
  ModelRefusalError,
} from "../src/api/errors";
import type { GenerationClient } from "../src/api/generationClient";

interface RequestLogger {
  info(message: string): void;
  error(message: string): void;
}

interface CreateAppOptions {
  generationClient: GenerationClient;
  allowedOrigins: string[];
  sessionCallLimit?: number;
  liveGenerationAvailable?: boolean;
  model?: string;
  exposeErrorDetails?: boolean;
  logger?: RequestLogger;
}

interface DiagnosticError {
  code: string;
  detail: string;
  upstreamStatus?: number;
  upstreamCode?: string;
  upstreamType?: string;
  upstreamRequestId?: string;
}

interface ErrorResponseBody {
  error: string;
  requestId: string;
  detail?: string;
  upstream?: {
    status?: number;
    code?: string;
    type?: string;
    requestId?: string;
  };
  issues?: ZodError["issues"];
}

const consoleLogger: RequestLogger = {
  info: (message) => console.info(message),
  error: (message) => console.error(message),
};

function requestIdFor(response: express.Response): string {
  return typeof response.locals.requestId === "string" ? response.locals.requestId : "unknown";
}

function setDiagnosticError(response: express.Response, error: DiagnosticError): void {
  response.locals.diagnosticError = error;
}

function sendTypedError(
  response: express.Response,
  status: number,
  diagnostic: DiagnosticError,
  exposeErrorDetails: boolean,
  issues?: ZodError["issues"],
): void {
  setDiagnosticError(response, diagnostic);
  const body: ErrorResponseBody = {
    error: diagnostic.code,
    requestId: requestIdFor(response),
  };

  if (issues) body.issues = issues;
  if (exposeErrorDetails) {
    body.detail = diagnostic.detail;
    if (
      diagnostic.upstreamStatus !== undefined ||
      diagnostic.upstreamCode ||
      diagnostic.upstreamType ||
      diagnostic.upstreamRequestId
    ) {
      body.upstream = {
        status: diagnostic.upstreamStatus,
        code: diagnostic.upstreamCode,
        type: diagnostic.upstreamType,
        requestId: diagnostic.upstreamRequestId,
      };
    }
  }

  response.status(status).json(body);
}

function classifyOpenAIError(error: APIError): { status: number; diagnostic: DiagnosticError } {
  const upstreamStatus = error.status;
  const status = upstreamStatus ?? 502;
  const diagnosticBase = {
    upstreamStatus,
    upstreamCode: error.code ?? undefined,
    upstreamType: error.type,
    upstreamRequestId: error.requestID ?? undefined,
  };

  if (upstreamStatus === 400) {
    return {
      status,
      diagnostic: {
        ...diagnosticBase,
        code: "openai_invalid_request",
        detail: "OpenAI rejected the request configuration or structured output schema.",
      },
    };
  }
  if (upstreamStatus === 401) {
    return {
      status,
      diagnostic: {
        ...diagnosticBase,
        code: "openai_authentication_failed",
        detail: "OpenAI rejected the configured API key.",
      },
    };
  }
  if (upstreamStatus === 403) {
    return {
      status,
      diagnostic: {
        ...diagnosticBase,
        code: "openai_permission_denied",
        detail: "The OpenAI project does not have permission for this request.",
      },
    };
  }
  if (upstreamStatus === 404) {
    return {
      status,
      diagnostic: {
        ...diagnosticBase,
        code: "openai_resource_not_found",
        detail: "The configured OpenAI model or endpoint was not found.",
      },
    };
  }
  if (upstreamStatus === 429) {
    return {
      status,
      diagnostic: {
        ...diagnosticBase,
        code: "openai_rate_limited",
        detail: "OpenAI rate limits or available quota prevented this request.",
      },
    };
  }
  if (upstreamStatus && upstreamStatus >= 500) {
    return {
      status,
      diagnostic: {
        ...diagnosticBase,
        code: "openai_unavailable",
        detail: "OpenAI is temporarily unavailable.",
      },
    };
  }

  return {
    status: 502,
    diagnostic: {
      ...diagnosticBase,
      code: "openai_connection_failed",
      detail: "The server could not complete its connection to OpenAI.",
    },
  };
}

function createSessionCallLimiter(limit: number, exposeErrorDetails: boolean) {
  const callCounts = new Map<string, number>();

  return (request: express.Request, response: express.Response, next: express.NextFunction) => {
    const sessionId = request.header("x-session-id")?.trim() || request.ip || "anonymous";
    const nextCount = (callCounts.get(sessionId) ?? 0) + 1;

    if (nextCount > limit) {
      sendTypedError(
        response,
        429,
        {
          code: "session_call_limit_reached",
          detail: "This session has reached its model-call limit.",
        },
        exposeErrorDetails,
      );
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
  exposeErrorDetails = false,
  logger = consoleLogger,
}: CreateAppOptions) {
  const app = express();

  app.disable("x-powered-by");
  app.use((request, response, next) => {
    void request;
    const requestId = randomUUID();
    response.locals.requestId = requestId;
    response.setHeader("x-request-id", requestId);
    next();
  });
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

  app.use("/api/generate", (request, response, next) => {
    const startedAt = performance.now();
    response.on("finish", () => {
      const diagnostic = response.locals.diagnosticError as DiagnosticError | undefined;
      const logRecord = {
        event: "generation_request",
        requestId: requestIdFor(response),
        method: request.method,
        endpoint: request.path,
        status: response.statusCode,
        durationMs: Math.round(performance.now() - startedAt),
        ...(diagnostic
          ? {
              errorCode: diagnostic.code,
              upstreamStatus: diagnostic.upstreamStatus,
              upstreamCode: diagnostic.upstreamCode,
              upstreamType: diagnostic.upstreamType,
              upstreamRequestId: diagnostic.upstreamRequestId,
            }
          : {}),
      };
      const serialized = JSON.stringify(logRecord);
      if (response.statusCode >= 400) logger.error(serialized);
      else logger.info(serialized);
    });
    next();
  });

  const generationRateLimit = rateLimit({
    windowMs: 60_000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler(_request, response) {
      sendTypedError(
        response,
        429,
        {
          code: "request_rate_limit_reached",
          detail: "Too many generation requests were made in a short period. Try again shortly.",
        },
        exposeErrorDetails,
      );
    },
  });
  const sessionCallLimiter = createSessionCallLimiter(sessionCallLimit, exposeErrorDetails);

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
    "/api/generate/discussion-focus",
    generationRateLimit,
    sessionCallLimiter,
    async (request, response, next) => {
      try {
        const input = discussionFocusRequestSchema.parse(request.body);
        response.json(await generationClient.extractDiscussionFocus(input));
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
      void _request;
      void _next;

      if (error instanceof ZodError) {
        sendTypedError(
          response,
          400,
          { code: "invalid_request", detail: "The request did not match the expected schema." },
          exposeErrorDetails,
          error.issues,
        );
        return;
      }
      if (error instanceof MissingConfigurationError) {
        sendTypedError(
          response,
          503,
          { code: "server_not_configured", detail: "OPENAI_API_KEY is not configured on the server." },
          exposeErrorDetails,
        );
        return;
      }
      if (error instanceof ModelRefusalError) {
        sendTypedError(
          response,
          422,
          { code: "model_refusal", detail: "The model refused or could not produce valid structured output." },
          exposeErrorDetails,
        );
        return;
      }
      if (error instanceof IncompleteGenerationError) {
        sendTypedError(
          response,
          502,
          {
            code: "incomplete_output",
            detail: "The model response ended before its structured output was complete.",
            upstreamCode: error.reason,
          },
          exposeErrorDetails,
        );
        return;
      }
      if (error instanceof InvalidStructuredOutputError) {
        sendTypedError(
          response,
          502,
          {
            code: "invalid_structured_output",
            detail: "The model returned an unusable structured response.",
          },
          exposeErrorDetails,
        );
        return;
      }
      if (error instanceof APIError) {
        const classified = classifyOpenAIError(error);
        sendTypedError(response, classified.status, classified.diagnostic, exposeErrorDetails);
        return;
      }

      sendTypedError(
        response,
        502,
        { code: "generation_failed", detail: "Generation failed for an unexpected server-side reason." },
        exposeErrorDetails,
      );
    },
  );

  return app;
}
