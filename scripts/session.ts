import "dotenv/config";

import { OpenAIGenerationClient } from "../server/openaiGenerationClient";
import type { BookIdentificationRequest } from "../src/api/contracts";
import type {
  GenerationClient,
  ReadingNotesRequest,
  RecapRequest,
  UserStanceRequest,
  UtteranceRequest,
} from "../src/api/generationClient";
import { SessionEngine } from "../src/engine/sessionEngine";
import { PERSONAS } from "../src/personas";

const title = process.argv.slice(2).join(" ").trim() || "The Stranger";

class InstrumentedGenerationClient implements GenerationClient {
  private callCount = 0;
  private readonly startedAt = performance.now();

  constructor(private readonly inner: GenerationClient) {}

  private async track<T>(operation: string, action: () => Promise<T>): Promise<T> {
    const callNumber = ++this.callCount;
    const callStartedAt = performance.now();
    console.log(`\n[API ${callNumber} started: ${operation}]`);
    try {
      const result = await action();
      console.log(`[API ${callNumber} completed: ${operation}, ${Math.round(performance.now() - callStartedAt)} ms]`);
      return result;
    } catch (error) {
      console.error(`[API ${callNumber} failed: ${operation}, ${Math.round(performance.now() - callStartedAt)} ms]`);
      throw error;
    }
  }

  identifyBook(input: BookIdentificationRequest) {
    return this.track("book-identification", () => this.inner.identifyBook(input));
  }

  generateReadingNotes(input: ReadingNotesRequest) {
    return this.track("reading-notes", () => this.inner.generateReadingNotes(input));
  }

  generateUtterance(input: UtteranceRequest) {
    return this.track("utterance", () => this.inner.generateUtterance(input));
  }

  extractUserStance(input: UserStanceRequest) {
    return this.track("user-stance", () => this.inner.extractUserStance(input));
  }

  generateRecap(input: RecapRequest) {
    return this.track("recap", () => this.inner.generateRecap(input));
  }

  report(): void {
    console.log(
      `\n[API summary: ${this.callCount} calls, ${Math.round(performance.now() - this.startedAt)} ms total]`,
    );
  }
}

const client = new InstrumentedGenerationClient(
  new OpenAIGenerationClient(
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_MODEL ?? "gpt-5.6",
  ),
);
const engine = new SessionEngine(client, {
  onStatus(message) {
    console.log(`\n[${message}]`);
  },
  onUtterance(utterance) {
    const speaker =
      utterance.speaker === "moderator"
        ? "Alex"
        : utterance.speaker === "user"
          ? "You"
          : (PERSONAS.find((persona) => persona.id === utterance.speaker)?.name ??
            utterance.speaker);
    console.log(`${speaker}: ${utterance.text}`);
  },
});

const result = await engine.run({ title, seed: "demo" });
console.log(`\n${result.recapMarkdown}`);
client.report();
