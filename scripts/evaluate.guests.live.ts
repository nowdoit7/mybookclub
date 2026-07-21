import "dotenv/config";

import { writeFile } from "node:fs/promises";

import { OpenAIGenerationClient } from "../server/openaiGenerationClient";
import { GUEST_PERSONAS, isImaginedGuestId } from "../src/personas";
import { localizedSpeakerName } from "../src/localization";
import type { AppLanguage, ConfirmedBook, ReadingNotes, Utterance } from "../src/types";

const languageArg = process.argv.find((argument) => argument.startsWith("--language="));
const language = (languageArg?.slice("--language=".length) ?? "ko") as AppLanguage;
if (language !== "ko" && language !== "en") {
  throw new Error("--language must be ko or en");
}

const guestArg = process.argv.find((argument) => argument.startsWith("--guest="));
const requestedGuest = guestArg?.slice("--guest=".length);
if (requestedGuest && !isImaginedGuestId(requestedGuest)) {
  throw new Error(`Unknown guest id: ${requestedGuest}`);
}

const outputArg = process.argv.find((argument) => argument.startsWith("--output="));
const outputPath = outputArg?.slice("--output=".length);

const book: ConfirmedBook = {
  title: language === "ko" ? "경계의 기록" : "The Ledger at the Boundary",
  author: language === "ko" ? "가상 작가" : "A Fictional Writer",
  workScope: "single_book",
  includedTitles: [language === "ko" ? "경계의 기록" : "The Ledger at the Boundary"],
  confirmedSummary:
    language === "ko"
      ? "한 공동체가 모두의 안전을 약속하는 제도를 선택하지만, 그 비용은 목소리가 약한 사람들에게 보이지 않게 옮겨 간다. 시점이 바뀔 때마다 독자는 누구도 완전한 증거를 갖고 있지 않으며 위험을 받아들이는 이유도 서로 다르다는 사실을 알게 된다. 결말은 생존이 그 과정에서 만든 제도와 관계를 정당화하는지 열린 질문으로 남긴다."
      : "A community adopts an institution that promises safety for everyone while shifting hidden costs onto people with the least voice. Changing viewpoints reveal that nobody holds complete evidence and that each person accepts risk for different reasons. The ending leaves open whether survival justifies the institution and relationships created in its name.",
  mainCharacters: [language === "ko" ? "공동체의 구성원들" : "Members of the community"],
  candidateTopics:
    language === "ko"
      ? [
          "공동체의 안전은 누구의 비용으로 유지되는가?",
          "불완전한 증거로 내린 선택에 어떤 책임을 물을 수 있는가?",
          "생존을 위해 만든 제도가 관계를 어떻게 바꾸는가?",
        ]
      : [
          "Whose costs sustain collective safety?",
          "What responsibility follows a choice made with incomplete evidence?",
          "How does an institution built for survival change relationships?",
        ],
  verificationStatus: "mock",
  verificationNote: "Neutral fictional fixture for guest prompt evaluation",
  sources: [],
};

const notes: ReadingNotes = {
  overallTake:
    language === "ko"
      ? "이 작품은 공동체의 안전을 단순한 선으로 제시하지 않고, 그 안전이 누구에게 어떤 비용을 옮기는지 묻게 합니다. 불완전한 증거 속에서도 선택은 필요하지만 책임까지 사라지는지는 의문입니다."
      : "The work refuses to treat collective safety as a simple good and asks whose costs are displaced to maintain it. Choices remain necessary under incomplete evidence, but responsibility does not necessarily disappear.",
  overallStance: 0.4,
  stanceByTopic: book.candidateTopics.map((topic, index) => ({
    topic,
    stance: [0.8, -0.4, 0.5][index],
    reason:
      language === "ko"
        ? "안전과 책임, 관계의 변화를 함께 설명해야 한다."
        : "The interpretation must account for safety, responsibility, and changed relationships together.",
  })),
  keyScenes: [],
  shelfConnections: [],
  personalReaction:
    language === "ko"
      ? "안전의 혜택과 비용이 다른 사람에게 돌아가는 순간이 불편하게 남았습니다."
      : "The separation between those receiving safety and those paying for it stayed with me.",
  unresolvedQuestion:
    language === "ko"
      ? "불완전한 정보는 책임을 줄이는가, 아니면 더 신중하게 만드는가?"
      : "Does incomplete information reduce responsibility or demand greater care?",
  possibleRevision:
    language === "ko"
      ? "제도가 실제로 비용을 공정하게 나누는 구체적 근거가 있다면 판단을 바꾸겠습니다."
      : "I would revise if the institution demonstrably distributes its costs fairly.",
  questionForTable:
    language === "ko"
      ? "이 공동체가 안전이라고 부르는 것은 누구의 관점에서 안전한가요?"
      : "From whose viewpoint is what this community calls safety actually safe?",
};

const recentTranscript: Utterance[] = [
  {
    speaker: "moderator",
    stage: "FIRST_IMPRESSIONS",
    text:
      language === "ko"
        ? "구체적인 장면은 잠시 뒤에 살펴보겠습니다. 먼저 이 작품 전체가 남긴 첫 판단이나 질문을 들려주세요."
        : "We will save concrete scenes for later. Begin with the first judgment or question the work as a whole left with you.",
  },
];

const guests = requestedGuest
  ? GUEST_PERSONAS.filter(({ id }) => id === requestedGuest)
  : [...GUEST_PERSONAS];
const client = new OpenAIGenerationClient(
  process.env.OPENAI_API_KEY,
  process.env.OPENAI_MODEL ?? "gpt-5.6",
);

interface EvaluationResult {
  id: string;
  name: string;
  utterance?: string;
  error?: string;
  durationMs: number;
}

const results = new Array<EvaluationResult>(guests.length);
let nextIndex = 0;

async function worker(): Promise<void> {
  while (nextIndex < guests.length) {
    const index = nextIndex;
    nextIndex += 1;
    const guest = guests[index];
    const startedAt = performance.now();
    try {
      const output = await client.generateUtterance({
        language,
        roomAtmosphere: { warmth: 0.58, playfulness: 0.38, tension: 0.42, energy: 0.52 },
        book,
        speaker: guest,
        notes,
        stage: "FIRST_IMPRESSIONS",
        task: "FIRST_IMPRESSION",
        recentTranscript,
        allowShelfReference: false,
      });
      results[index] = {
        id: guest.id,
        name: localizedSpeakerName(guest.id, language),
        utterance: output.utterance,
        durationMs: Math.round(performance.now() - startedAt),
      };
    } catch (error) {
      results[index] = {
        id: guest.id,
        name: localizedSpeakerName(guest.id, language),
        error: error instanceof Error ? error.message : "Unknown error",
        durationMs: Math.round(performance.now() - startedAt),
      };
    }
  }
}

await Promise.all(Array.from({ length: Math.min(3, guests.length) }, () => worker()));

const reportLines = [
  `# Imagined guest signature evaluation · ${language.toUpperCase()}`,
  "",
  `Fixture: ${book.title} · ${results.length} GPT-5.6 utterance calls`,
];
for (const result of results) {
  reportLines.push("", `## ${result.name} \`${result.id}\``, "");
  reportLines.push(result.utterance ?? `ERROR: ${result.error ?? "Unknown error"}`);
  reportLines.push("", `_${result.durationMs} ms_`);
}

const report = `${reportLines.join("\n")}\n`;
if (outputPath) {
  await writeFile(outputPath, report, "utf8");
  const failures = results.filter(({ error }) => error).length;
  console.log(`Saved ${results.length} results to ${outputPath} (${failures} failures).`);
} else {
  console.log(report);
}
