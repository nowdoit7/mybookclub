import "dotenv/config";

import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

import { OpenAIGenerationClient } from "../server/openaiGenerationClient";
import { SessionEngine } from "../src/engine/sessionEngine";
import { selectPersonas } from "../src/personas";
import { formatTranscriptAsMarkdown } from "../src/transcriptExport";
import type { Utterance } from "../src/types";

if (!process.env.OPENAI_API_KEY) {
  throw new Error(
    "OPENAI_API_KEY is required. Add it to this process or set DOTENV_CONFIG_PATH, then run npm run session:review:live.",
  );
}

const outputPath = process.env.LIVE_REVIEW_OUTPUT;
const personas = selectPersonas("review:honmono:ko");
const capturedTranscript: Utterance[] = [];
const engine = new SessionEngine(
  new OpenAIGenerationClient(
    process.env.OPENAI_API_KEY,
    process.env.OPENAI_MODEL ?? "gpt-5.6-terra",
  ),
  {
    onStatus(message) {
      console.error(`[${message}]`);
    },
    onUtterance(utterance) {
      capturedTranscript.push(utterance);
    },
  },
);

const sessionInput = {
  title: "혼모노",
  author: "성해나",
  language: "ko",
  seed: "review:honmono:ko",
  personas,
  userDisplayName: "데이비드",
  userInputs: {
    intro:
      "저는 게임 개발자로 일하고 있습니다. 혼자 읽을 때 놓친 부분을 다른 독자들은 어떻게 봤는지 듣고 싶어 참여했습니다.",
    firstImpression:
      "제목만 보고는 오타쿠나 팬덤의 이야기일 거라 예상했는데, 읽고 나니 무엇이 진짜이고 가짜인지, 또 누가 그것을 판정하는지를 묻는 소설집처럼 느꼈습니다. 전체적으로는 좋았습니다.",
    memorableScene:
      "〈메탈〉이 가장 기억에 남았습니다. 저도 한때 음악과 메탈을 좋아했던 시절이 있어서, 시간이 지나 열정이 희미해지고 과거의 나와 지금의 나 사이에 거리가 생기는 감각에 공감했습니다.",
    discussion:
      "저는 진짜와 가짜를 나누는 기준 자체보다 누가 그런 판정을 내릴 권력을 갖는지가 더 중요하다고 봅니다. 진정성이라는 말이 타인을 배제하는 도구가 되는 순간을 작품들이 보여 준다고 느꼈습니다.",
    discussionSecond:
      "표제작에서 문수는 신을 잃지만 인간의 의지와 광기로 굿판을 밀어붙입니다. 그래서 그 장면을 진짜가 가짜를 이긴 결말이라기보다, 자신을 지탱하던 세계가 무너진 뒤에도 스스로 의미를 만들어 내는 장면으로 읽었습니다.",
    wrapUp:
      "오늘은 『혼모노』를 진짜와 가짜의 판정 이야기뿐 아니라, 정체성과 권력 그리고 시간이 사람을 어떻게 바꾸는지 묻는 소설집으로 다시 보게 됐습니다.",
  },
} as const;

async function publish(report: string): Promise<void> {
  console.log(report);
  if (!outputPath) return;
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, report, "utf8");
  console.error(`[Saved live review: ${outputPath}]`);
}

try {
  const result = await engine.run(sessionInput);
  const report = [
    `# 실제 API 대화 품질 검토 — 『${result.state.book.title}』`,
    "",
    `- 모델: ${process.env.OPENAI_MODEL ?? "gpt-5.6-terra"}`,
    `- 검증 상태: ${result.state.book.verificationStatus}`,
    `- 참가자: ${result.state.personas.map(({ name }) => name).join(", ")}, 데이비드`,
    `- 발제 1: ${result.state.agendaRounds[0]?.topic ?? "생성되지 않음"}`,
    `- 발제 2: ${result.state.agendaRounds[1]?.topic ?? "생성되지 않음"}`,
    "",
    formatTranscriptAsMarkdown(result.state.transcript, "ko"),
    "",
    "# 모임 기록",
    "",
    result.recapMarkdown,
  ].join("\n");
  await publish(report);
} catch (error) {
  const report = [
    "# 실제 API 대화 품질 검토 — 세션 미완료",
    "",
    formatTranscriptAsMarkdown(capturedTranscript, "ko"),
  ].join("\n");
  await publish(report);
  console.error(error);
  process.exitCode = 1;
}
