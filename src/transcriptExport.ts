import { localizedSpeakerName, STAGE_LABELS } from "./localization";
import type { AppLanguage, Utterance } from "./types";

export interface TranscriptExperimentMetadata {
  version: "v2";
  enabledReaderNames: string[];
  maxGenerationRequests: 45;
}

export function formatTranscriptAsMarkdown(
  transcript: Utterance[],
  language: AppLanguage,
  userDisplayName?: string,
  experiment?: TranscriptExperimentMetadata,
): string {
  const blocks: string[] = [];
  let previousStage: Utterance["stage"] | undefined;

  if (experiment) {
    blocks.push([
      "# LOCAL EXPERIMENT · Character Core v2",
      "",
      `- Enabled readers: ${experiment.enabledReaderNames.join(", ") || "None"}`,
      `- Safety cap: ${experiment.maxGenerationRequests} generation requests max`,
    ].join("\n"));
  }

  for (const utterance of transcript) {
    if (utterance.stage !== previousStage) {
      blocks.push(`## ${STAGE_LABELS[language][utterance.stage]}`);
      previousStage = utterance.stage;
    }
    const speakerName =
      utterance.speaker === "user" && userDisplayName?.trim()
        ? userDisplayName.trim()
        : localizedSpeakerName(utterance.speaker, language);
    blocks.push(`**${speakerName}**\n\n${utterance.text}`);
  }

  return blocks.join("\n\n");
}
