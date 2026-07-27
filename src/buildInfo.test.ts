import { describe, expect, it } from "vitest";

import {
  buildIdentifier,
  shouldShowLocalBuildInfo,
} from "./buildInfo";

describe("local build information", () => {
  it("appears only on exact loopback hostnames", () => {
    expect(shouldShowLocalBuildInfo("localhost")).toBe(true);
    expect(shouldShowLocalBuildInfo("127.0.0.1")).toBe(true);
    expect(shouldShowLocalBuildInfo("::1")).toBe(true);
    expect(shouldShowLocalBuildInfo("reading-table-buildweek.web.app")).toBe(
      false,
    );
    expect(shouldShowLocalBuildInfo("localhost.example.com")).toBe(false);
  });

  it("includes the working-tree fingerprint only when the build is dirty", () => {
    expect(
      buildIdentifier({
        version: "0.1.0",
        mode: "development",
        branch: "codex/test",
        commit: "abc1234",
        dirty: true,
        fingerprint: "def56789",
        builtAt: "2026-07-27T00:00:00.000Z",
      }),
    ).toBe("v0.1.0 · development:abc1234-def56789");

    expect(
      buildIdentifier({
        version: "0.1.0",
        mode: "production",
        branch: "main",
        commit: "abc1234",
        dirty: false,
        fingerprint: "clean",
        builtAt: "2026-07-27T00:00:00.000Z",
      }),
    ).toBe("v0.1.0 · production:abc1234");
  });
});
