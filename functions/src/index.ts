import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";

import { createApp } from "../../server/app";
import { OpenAIGenerationClient } from "../../server/openaiGenerationClient";

const openAiApiKey = defineSecret("OPENAI_API_KEY");
const productionOrigins = [
  "https://reading-table-buildweek.web.app",
  "https://reading-table-buildweek.firebaseapp.com",
];

type ReadingTableApp = ReturnType<typeof createApp>;

let cachedApp: ReadingTableApp | undefined;

function allowedOrigins(): string[] {
  if (process.env.FUNCTIONS_EMULATOR === "true") {
    return [
      ...productionOrigins,
      "http://localhost:5000",
      "http://127.0.0.1:5000",
      "http://localhost:5173",
    ];
  }

  return productionOrigins;
}

function readingTableApp(): ReadingTableApp {
  if (cachedApp) return cachedApp;

  const apiKey = openAiApiKey.value();
  const model = process.env.OPENAI_MODEL ?? "gpt-5.6-terra";
  const sessionCallLimit = Number(process.env.SESSION_CALL_LIMIT ?? 60);

  cachedApp = createApp({
    generationClient: new OpenAIGenerationClient(apiKey, model),
    allowedOrigins: allowedOrigins(),
    trustProxy: 1,
    sessionCallLimit,
    liveGenerationAvailable: Boolean(apiKey),
    model,
    exposeErrorDetails: false,
  });

  return cachedApp;
}

export const readingTableApi = onRequest(
  {
    region: "us-central1",
    secrets: [openAiApiKey],
    timeoutSeconds: 180,
    memory: "512MiB",
    maxInstances: 2,
  },
  (request, response) => {
    readingTableApp()(request, response);
  },
);
