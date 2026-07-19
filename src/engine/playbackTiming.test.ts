import { describe, expect, it } from "vitest";

import { calculateReadingDelay } from "./playbackTiming";

describe("calculateReadingDelay", () => {
  it("keeps short turns on screen for at least three seconds", () => {
    expect(calculateReadingDelay("Yes.", "en")).toBe(3_000);
    expect(calculateReadingDelay("네.", "ko")).toBe(3_000);
  });

  it("gives longer turns more reading time", () => {
    const short = calculateReadingDelay("이 장면이 남았어요.", "ko");
    const long = calculateReadingDelay(
      "이 장면이 남았어요. 앞에서 이해한 내용을 뒤집어 보게 만드는 대목이라 오래 생각하게 됐습니다.",
      "ko",
    );

    expect(long).toBeGreaterThan(short);
  });

  it("caps very long turns at ten seconds", () => {
    expect(calculateReadingDelay("word ".repeat(200), "en")).toBe(10_000);
    expect(calculateReadingDelay("긴문장".repeat(200), "ko")).toBe(10_000);
  });
});
