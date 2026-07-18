import { MockGenerationClient } from "../src/api/mockGenerationClient";
import { SessionEngine } from "../src/engine/sessionEngine";
import { PERSONAS } from "../src/personas";

const engine = new SessionEngine(new MockGenerationClient(), {
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

const result = await engine.run({ seed: "demo" });
console.log(`\n${result.recapMarkdown}`);
