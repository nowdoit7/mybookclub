import "dotenv/config";

import { OpenAIGenerationClient } from "../server/openaiGenerationClient";
import { SessionEngine } from "../src/engine/sessionEngine";
import { PERSONAS } from "../src/personas";

const title = process.argv.slice(2).join(" ").trim() || "The Stranger";
const client = new OpenAIGenerationClient(
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_MODEL ?? "gpt-5.6",
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
