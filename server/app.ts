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
  meetingPlanRequestSchema,
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
import {
  CHARACTER_CORE_EXPERIMENT_VERSION,
  isLoopbackHostname,
} from "../src/characterCore/runtime";

interface RequestLogger {
  info(message: string): void;
  error(message: string): void;
}

interface CreateAppOptions {
  generationClient: GenerationClient;
  allowedOrigins: string[];
  trustProxy?: boolean | number;
  sessionCallLimit?: number;
  requestRateLimit?: number;
  allowLocalCharacterCoreExperiment?: boolean;
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

const LOCAL_CHARACTER_CORE_SESSION_CALL_LIMIT = 45;

export function sessionCallLimitForRequest(
  normalLimit: number,
  isCharacterCoreExperiment: boolean,
): number {
  return isCharacterCoreExperiment
    ? LOCAL_CHARACTER_CORE_SESSION_CALL_LIMIT
    : normalLimit;
}

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

function isLoopbackOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  try {
    const hostname = new URL(origin).hostname.toLowerCase();
    return isLoopbackHostname(hostname);
  } catch {
    return false;
  }
}

export function isLoopbackRemoteAddress(remoteAddress: string | undefined): boolean {
  if (!remoteAddress) return false;
  if (remoteAddress !== remoteAddress.trim()) return false;
  let normalized = remoteAddress.toLowerCase();
  if (normalized.startsWith("[")) {
    if (!normalized.endsWith("]")) return false;
    normalized = normalized.slice(1, -1);
  } else if (normalized.includes("[") || normalized.includes("]")) {
    return false;
  }
  const zoneIndex = normalized.indexOf("%");
  if (zoneIndex >= 0) {
    const baseAddress = normalized.slice(0, zoneIndex);
    const zone = normalized.slice(zoneIndex + 1);
    if (
      baseAddress !== "::1" ||
      !/^[a-z0-9_.-]+$/u.test(zone) ||
      zone.includes("%")
    ) {
      return false;
    }
    normalized = baseAddress;
  }
  return (
    normalized === "127.0.0.1" ||
    normalized === "::1" ||
    normalized === "::ffff:127.0.0.1"
  );
}

function bodyHasCharacterCoreMarker(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    Object.prototype.hasOwnProperty.call(body, "characterCoreExperiment")
  );
}

function bodyCharacterCoreVersion(body: unknown): unknown {
  if (!bodyHasCharacterCoreMarker(body)) return undefined;
  const marker = (body as { characterCoreExperiment?: unknown }).characterCoreExperiment;
  if (typeof marker !== "object" || marker === null) return undefined;
  return (marker as { version?: unknown }).version;
}

function authorizeCharacterCoreExperiment(
  allowLocalCharacterCoreExperiment: boolean,
  exposeErrorDetails: boolean,
) {
  return (request: express.Request, response: express.Response, next: express.NextFunction) => {
    const header = request.header("x-character-core-experiment");
    const hasHeader = header !== undefined;
    const hasBodyMarker = bodyHasCharacterCoreMarker(request.body);
    if (!hasHeader && !hasBodyMarker) {
      next();
      return;
    }

    const supportsBodyMarker =
      request.path === "/reading-notes" || request.path === "/utterance";
    const authorized =
      allowLocalCharacterCoreExperiment &&
      header === CHARACTER_CORE_EXPERIMENT_VERSION &&
      isLoopbackOrigin(request.header("origin")) &&
      isLoopbackRemoteAddress(request.socket.remoteAddress) &&
      (supportsBodyMarker
        ? hasBodyMarker &&
          bodyCharacterCoreVersion(request.body) === CHARACTER_CORE_EXPERIMENT_VERSION
        : !hasBodyMarker);

    if (!authorized) {
      sendTypedError(
        response,
        403,
        {
          code: "character_core_experiment_forbidden",
          detail:
            "The Character Core experiment is available only to an explicitly marked loopback session.",
        },
        exposeErrorDetails,
      );
      return;
    }

    response.locals.characterCoreExperiment = CHARACTER_CORE_EXPERIMENT_VERSION;
    next();
  };
}

function createSessionCallLimiter(normalLimit: number, exposeErrorDetails: boolean) {
  const callCounts = new Map<
    string,
    { count: number; characterCoreExperiment: boolean }
  >();

  return (request: express.Request, response: express.Response, next: express.NextFunction) => {
    const sessionId = request.header("x-session-id")?.trim() || request.ip || "anonymous";
    const isCharacterCoreExperiment =
      response.locals.characterCoreExperiment === CHARACTER_CORE_EXPERIMENT_VERSION;
    const prior = callCounts.get(sessionId);

    if (
      prior &&
      prior.characterCoreExperiment !== isCharacterCoreExperiment
    ) {
      sendTypedError(
        response,
        403,
        {
          code: "session_experiment_mismatch",
          detail: "A session cannot switch Character Core experiment mode after generation begins.",
        },
        exposeErrorDetails,
      );
      return;
    }

    const nextCount = (prior?.count ?? 0) + 1;
    const limit = sessionCallLimitForRequest(normalLimit, isCharacterCoreExperiment);

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

    callCounts.set(sessionId, {
      count: nextCount,
      characterCoreExperiment: isCharacterCoreExperiment,
    });
    next();
  };
}

export function createApp({
  generationClient,
  allowedOrigins,
  trustProxy,
  sessionCallLimit = 60,
  requestRateLimit = 30,
  allowLocalCharacterCoreExperiment = false,
  liveGenerationAvailable = true,
  model = "gpt-5.6-terra",
  exposeErrorDetails = false,
  logger = consoleLogger,
}: CreateAppOptions) {
  const app = express();

  if (trustProxy !== undefined) app.set("trust proxy", trustProxy);
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
    response.json({
      status: "ok",
      liveGenerationAvailable,
      model,
      ...(allowLocalCharacterCoreExperiment
        ? {
            characterCoreExperiment: {
              version: CHARACTER_CORE_EXPERIMENT_VERSION,
              localOnly: true,
              sessionCallLimit: LOCAL_CHARACTER_CORE_SESSION_CALL_LIMIT,
            },
          }
        : {}),
    });
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
  app.use(
    "/api/generate",
    authorizeCharacterCoreExperiment(
      allowLocalCharacterCoreExperiment,
      exposeErrorDetails,
    ),
  );

  const generationRateLimit = rateLimit({
    windowMs: 60_000,
    limit: requestRateLimit,
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
    "/api/generate/meeting-plan",
    generationRateLimit,
    sessionCallLimiter,
    async (request, response, next) => {
      try {
        const input = meetingPlanRequestSchema.parse(request.body);
        response.json(await generationClient.prepareMeetingPlan(input));
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
