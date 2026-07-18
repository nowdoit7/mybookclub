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

export class GenerationApiError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
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
    const response = await fetch(`${this.baseUrl}/${path}`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-session-id": this.sessionId,
      },
      body: JSON.stringify(input),
    });
    const body: unknown = await response.json().catch(() => ({}));

    if (!response.ok) {
      const code =
        typeof body === "object" && body && "error" in body && typeof body.error === "string"
          ? body.error
          : "generation_failed";
      throw new GenerationApiError(code, response.status);
    }

    return schema.parse(body);
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
