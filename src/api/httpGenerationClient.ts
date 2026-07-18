import type { z } from "zod";

import {
  bookIdentificationSchema,
  readingNotesSchema,
  recapSchema,
  userStanceSchema,
  utteranceSchema,
} from "./contracts";
import type { BookIdentificationRequest } from "./contracts";
import type {
  GenerationClient,
  ReadingNotesRequest,
  RecapRequest,
  UserStanceRequest,
  UtteranceRequest,
} from "./generationClient";
import {
  completeGenerationDiagnostic,
  startGenerationDiagnostic,
} from "./diagnostics";

interface GenerationApiErrorOptions {
  endpoint?: string;
  durationMs?: number;
  requestId?: string;
  upstreamRequestId?: string;
  detail?: string;
}

export class GenerationApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly options: GenerationApiErrorOptions = {},
  ) {
    super(`Generation request failed (${code}, HTTP ${status}).`);
    this.name = "GenerationApiError";
  }
}

export class HttpGenerationClient implements GenerationClient {
  constructor(
    private readonly baseUrl = "/api/generate",
    private readonly sessionId: string = crypto.randomUUID(),
  ) {}

  private async post<T>(path: string, input: unknown, schema: z.ZodType<T>): Promise<T> {
    const startedAt = performance.now();
    const diagnosticId = startGenerationDiagnostic(path);
    let response: Response;

    try {
      response = await fetch(`${this.baseUrl}/${path}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-session-id": this.sessionId,
        },
        body: JSON.stringify(input),
      });
    } catch {
      const durationMs = Math.round(performance.now() - startedAt);
      const detail = "The browser could not reach the local generation server.";
      completeGenerationDiagnostic(diagnosticId, {
        outcome: "failure",
        status: 0,
        durationMs,
        code: "network_error",
        detail,
      });
      throw new GenerationApiError("network_error", 0, { endpoint: path, durationMs, detail });
    }

    const body: unknown = await response.json().catch(() => ({}));
    const durationMs = Math.round(performance.now() - startedAt);
    const requestId = response.headers.get("x-request-id") ?? readString(body, "requestId");

    if (!response.ok) {
      const code = readString(body, "error") ?? "generation_failed";
      const detail = readString(body, "detail");
      const upstreamRequestId = readNestedString(body, "upstream", "requestId");
      completeGenerationDiagnostic(diagnosticId, {
        outcome: "failure",
        status: response.status,
        durationMs,
        code,
        requestId,
        upstreamRequestId,
        detail,
      });
      throw new GenerationApiError(code, response.status, {
        endpoint: path,
        durationMs,
        requestId,
        upstreamRequestId,
        detail,
      });
    }

    try {
      const parsed = schema.parse(body);
      completeGenerationDiagnostic(diagnosticId, {
        outcome: "success",
        status: response.status,
        durationMs,
        requestId,
      });
      return parsed;
    } catch {
      const detail = "The generation server returned an unexpected response shape.";
      completeGenerationDiagnostic(diagnosticId, {
        outcome: "failure",
        status: response.status,
        durationMs,
        code: "invalid_response",
        requestId,
        detail,
      });
      throw new GenerationApiError("invalid_response", response.status, {
        endpoint: path,
        durationMs,
        requestId,
        detail,
      });
    }
  }

  identifyBook(input: BookIdentificationRequest) {
    return this.post("book-identification", input, bookIdentificationSchema);
  }

  generateReadingNotes(input: ReadingNotesRequest) {
    return this.post("reading-notes", input, readingNotesSchema);
  }

  generateUtterance(input: UtteranceRequest) {
    return this.post("utterance", input, utteranceSchema);
  }

  extractUserStance(input: UserStanceRequest) {
    return this.post("user-stance", input, userStanceSchema);
  }

  generateRecap(input: RecapRequest) {
    return this.post("recap", input, recapSchema);
  }
}

function readString(body: unknown, key: string): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const value = Reflect.get(body, key);
  return typeof value === "string" ? value : undefined;
}

function readNestedString(body: unknown, parentKey: string, key: string): string | undefined {
  if (typeof body !== "object" || body === null) return undefined;
  const parent = Reflect.get(body, parentKey);
  return readString(parent, key);
}
