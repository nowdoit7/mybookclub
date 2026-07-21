import type { AppLanguage } from "./types";

const MAIL_PREVIEW_LIMIT = 1400;

function safeBookSlug(title: string): string {
  return title
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLocaleLowerCase()
    .slice(0, 80) || "book";
}

export function recapFilename(title: string, date: string): string {
  return `recap-${safeBookSlug(title)}-${date}.md`;
}

export function recapEmailSubject(title: string, language: AppLanguage): string {
  return language === "ko"
    ? `[Open Reading Club] ${title} 모임 기록`
    : `[Open Reading Club] ${title} meeting recap`;
}

export function recapMailtoUrl(input: {
  title: string;
  recap: string;
  language: AppLanguage;
  copiedToClipboard: boolean;
}): string {
  const preview = input.recap.length > MAIL_PREVIEW_LIMIT
    ? `${input.recap.slice(0, MAIL_PREVIEW_LIMIT).trimEnd()}\n\n…`
    : input.recap;
  const clipboardNote = input.copiedToClipboard
    ? input.language === "ko"
      ? "전체 모임 기록은 클립보드에 복사되어 있습니다. 아래에 붙여넣거나 다운로드한 Markdown 파일을 첨부할 수 있습니다."
      : "The full recap is copied to the clipboard. Paste it below or attach the downloaded Markdown file."
    : input.language === "ko"
      ? "아래는 모임 기록의 미리보기입니다. 전체 내용은 Open Reading Club의 복사 또는 Markdown 다운로드 기능으로 가져올 수 있습니다."
      : "Below is a preview. Use Open Reading Club's copy or Markdown download action for the full recap.";
  const body = input.language === "ko"
    ? `《${input.title}》 독서 모임 기록을 공유합니다.\n\n${clipboardNote}\n\n--- 미리보기 ---\n${preview}`
    : `Here is my reading-club recap for ${input.title}.\n\n${clipboardNote}\n\n--- Preview ---\n${preview}`;
  const params = new URLSearchParams({
    subject: recapEmailSubject(input.title, input.language),
    body,
  });
  return `mailto:?${params.toString()}`;
}
