import "dotenv/config";

import { createApp } from "./app";
import { OpenAIGenerationClient } from "./openaiGenerationClient";
import { MissingConfigurationError } from "../src/api/errors";
import type { GenerationClient } from "../src/api/generationClient";

const port = Number(process.env.PORT ?? 3001);
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
const sessionCallLimit = Number(process.env.SESSION_CALL_LIMIT ?? 60);
const model = process.env.OPENAI_MODEL ?? "gpt-5.6";

const generationClient: GenerationClient = process.env.OPENAI_API_KEY
  ? new OpenAIGenerationClient(
      process.env.OPENAI_API_KEY,
      model,
    )
  : {
      async identifyBook() {
        throw new MissingConfigurationError(
          "OPENAI_API_KEY must be configured on the server before live generation can run.",
        );
      },
      async generateReadingNotes() {
        throw new MissingConfigurationError("OPENAI_API_KEY is not configured.");
      },
      async generateUtterance() {
        throw new MissingConfigurationError("OPENAI_API_KEY is not configured.");
      },
      async extractUserStance() {
        throw new MissingConfigurationError("OPENAI_API_KEY is not configured.");
      },
      async generateRecap() {
        throw new MissingConfigurationError("OPENAI_API_KEY is not configured.");
      },
    };

createApp({
  generationClient,
  allowedOrigins,
  sessionCallLimit,
  liveGenerationAvailable: Boolean(process.env.OPENAI_API_KEY),
  model,
}).listen(port, () => {
  console.log(`Reading Table API listening on http://localhost:${port}`);
});
