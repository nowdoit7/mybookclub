import { MockGenerationClient } from "../src/api/mockGenerationClient";
import { SessionEngine } from "../src/engine/sessionEngine";
import { PERSONAS } from "../src/personas";
import { localizedSpeakerName } from "../src/localization";

const language = process.argv.includes("--ko") ? "ko" : "en";
const scope = process.argv.includes("--series") ? "series" : "single_book";
const args = process.argv
  .slice(2)
  .filter((argument) => argument !== "--ko" && argument !== "--series");
const author = args.find((argument) => argument.startsWith("--author="))?.slice("--author=".length);
const suppliedTitle = args.filter((argument) => !argument.startsWith("--author=")).join(" ").trim();
const title = suppliedTitle || (language === "ko" ? "독자가 선택한 책" : "A Reader-Selected Book");

const engine = new SessionEngine(new MockGenerationClient(), {
  onStatus(message) {
    console.log(`\n[${message}]`);
  },
  onUtterance(utterance) {
    const speaker =
      language === "ko"
        ? localizedSpeakerName(utterance.speaker, language)
        : utterance.speaker === "moderator"
          ? "Alex"
          : utterance.speaker === "user"
            ? "You"
            : (PERSONAS.find((persona) => persona.id === utterance.speaker)?.name ??
              utterance.speaker);
    console.log(`${speaker}: ${utterance.text}`);
  },
});

const result = await engine.run({
  title,
  author,
  scope,
  seed: `mock-console:${title}:${author ?? ""}`,
  language,
  userInputs:
    language === "ko"
      ? {
          intro: "저는 혼자 읽는 경우가 많아서 다른 독자들이 같은 책을 어떻게 받아들였는지 듣고 싶어 왔습니다.",
          firstImpression: "책이 던진 중심 질문은 흥미로웠지만 그것을 제시하는 방식에는 조금 거리감이 있었습니다.",
          memorableScene: "앞에서 이해한 내용을 다시 생각하게 만든 대목이 가장 오래 남았습니다.",
          discussion: "한 가지 해석보다는 책의 형식과 그 결과를 함께 설명하는 해석이 더 설득력 있다고 봅니다.",
          discussionReply: "그 반론은 중요하지만 의도와 결과를 구분하면 제 해석은 여전히 성립한다고 봅니다.",
          wrapUp: "처음 판단을 유지하면서도 다른 관점이 붙잡은 근거를 함께 확인하게 됐습니다.",
        }
      : {
          intro: "I usually read alone and came to hear how other readers experienced the same book.",
          firstImpression: "The central question interested me, although I felt some distance from the way it was presented.",
          memorableScene: "The passage that made me reconsider my earlier understanding stayed with me.",
          discussion: "The strongest interpretation should account for both the book's form and the consequences it leaves behind.",
          discussionReply: "That objection matters, but my reading still holds if intention and consequence are separated.",
          wrapUp: "I kept my first judgment while learning to test it against evidence the other readers noticed.",
        },
});
console.log(`\n${result.recapMarkdown}`);
