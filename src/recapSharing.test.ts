import { describe, expect, it } from "vitest";

import { recapEmailSubject, recapFilename, recapMailtoUrl } from "./recapSharing";

describe("recap sharing", () => {
  it("creates a filesystem-safe dated Markdown filename", () => {
    expect(recapFilename("Remembrance of Earth's Past", "2026-07-21")).toBe(
      "recap-remembrance-of-earth-s-past-2026-07-21.md",
    );
    expect(recapFilename("삼체 3부작", "2026-07-21")).toBe("recap-삼체-3부작-2026-07-21.md");
  });

  it("localizes the email subject", () => {
    expect(recapEmailSubject("삼체", "ko")).toBe("[Open Reading Club] 삼체 모임 기록");
    expect(recapEmailSubject("Cosmos", "en")).toBe("[Open Reading Club] Cosmos meeting recap");
  });

  it("keeps mailto fallbacks bounded while explaining where the full recap is", () => {
    const url = recapMailtoUrl({
      title: "A Long Book",
      recap: `# Recap\n\n${"A detailed observation. ".repeat(300)}`,
      language: "en",
      copiedToClipboard: true,
    });
    const parsed = new URL(url);

    expect(parsed.protocol).toBe("mailto:");
    expect(parsed.searchParams.get("subject")).toContain("A Long Book");
    expect(parsed.searchParams.get("body")).toContain("copied to the clipboard");
    expect(parsed.searchParams.get("body")?.length).toBeLessThan(1800);
  });
});
