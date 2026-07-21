import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

const functionsDirectory = dirname(fileURLToPath(import.meta.url));
const outputDirectory = join(functionsDirectory, "lib");

await rm(outputDirectory, { recursive: true, force: true });
await build({
  entryPoints: [join(functionsDirectory, "src", "index.ts")],
  outfile: join(outputDirectory, "index.cjs"),
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  sourcemap: true,
  sourcesContent: false,
  external: ["firebase-admin", "firebase-admin/*", "firebase-functions", "firebase-functions/*"],
  logLevel: "info",
});
