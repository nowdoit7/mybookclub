import { localizedSpeakerName, STAGE_LABELS } from "./localization";
import type { AppLanguage, Utterance } from "./types";

export function formatTranscriptAsMarkdown(
  transcript: Utterance[],
  language: AppLanguage,
): string {
  const blocks: string[] = [];
  let previousStage: Utterance["stage"] | undefined;

  for (const utterance of transcript) {
    if (utterance.stage !== previousStage) {
      blocks.push(`## ${STAGE_LABELS[language][utterance.stage]}`);
      previousStage = utterance.stage;
    }
    blocks.push(
      `**${localizedSpeakerName(utterance.speaker, language)}**\n\n${utterance.text}`,
    );
  }

  return blocks.join("\n\n");
}
