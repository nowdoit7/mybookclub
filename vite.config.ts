import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

interface PackageManifest {
  version: string;
}

// Vite reloads this config before each reviewed live run to refresh the local fingerprint.
function gitOutput(args: string[]): string {
  try {
    return execFileSync("git", args, {
      cwd: import.meta.dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function workingTreeFingerprint(): { dirty: boolean; fingerprint: string } {
  const trackedDiff = gitOutput(["diff", "--binary", "HEAD", "--"]);
  const untrackedOutput = gitOutput(["ls-files", "--others", "--exclude-standard"]);
  const untrackedPaths =
    untrackedOutput === "unknown"
      ? []
      : untrackedOutput.split(/\r?\n/u).filter(Boolean).sort();
  const hash = createHash("sha256").update(trackedDiff);

  for (const path of untrackedPaths) {
    hash.update(path);
    try {
      hash.update(readFileSync(new URL(path.replaceAll("\\", "/"), import.meta.url)));
    } catch {
      hash.update("unreadable");
    }
  }

  const dirty = trackedDiff.length > 0 || untrackedPaths.length > 0;
  return {
    dirty,
    fingerprint: dirty ? hash.digest("hex").slice(0, 8) : "clean",
  };
}

const manifest = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as PackageManifest;
const workingTree = workingTreeFingerprint();

export default defineConfig(({ mode }) => ({
  define: {
    __APP_BUILD_INFO__: JSON.stringify({
      version: manifest.version,
      mode,
      branch: gitOutput(["branch", "--show-current"]),
      commit: gitOutput(["rev-parse", "--short", "HEAD"]),
      dirty: workingTree.dirty,
      fingerprint: workingTree.fingerprint,
      builtAt: new Date().toISOString(),
    }),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
}));
