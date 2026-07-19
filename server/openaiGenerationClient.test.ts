import { describe, expect, it } from "vitest";

import {
  IncompleteGenerationError,
  InvalidStructuredOutputError,
  ModelRefusalError,
} from "../src/api/errors";
import {
  extractWebSearchSources,
  requireParsedOutput,
} from "./openaiGenerationClient";

describe("OpenAI structured response handling", () => {
  it("recognizes an explicit safety refusal", () => {
    expect(() =>
      requireParsedOutput({
        status: "completed",
        output_parsed: null,
        output: [
          {
            content: [{ type: "refusal", refusal: "I cannot help with that." }],
          },
        ],
      }),
    ).toThrow(ModelRefusalError);
  });

  it("distinguishes token-limited incomplete output from a refusal", () => {
    expect(() =>
      requireParsedOutput({
        status: "incomplete",
        incomplete_details: { reason: "max_output_tokens" },
        output_parsed: null,
        output: [],
      }),
    ).toThrow(IncompleteGenerationError);
  });

  it("distinguishes a completed but unparsed response from a refusal", () => {
    expect(() =>
      requireParsedOutput({
        status: "completed",
        incomplete_details: null,
        output_parsed: null,
        output: [],
      }),
    ).toThrow(InvalidStructuredOutputError);
  });

  it("returns parsed structured output", () => {
    const parsed = { value: "ready" };
    expect(
      requireParsedOutput({
        status: "completed",
        incomplete_details: null,
        output_parsed: parsed,
        output: [],
      }),
    ).toBe(parsed);
  });
});

describe("book verification source extraction", () => {
  it("uses only actual HTTPS sources returned by web search and removes duplicates", () => {
    expect(
      extractWebSearchSources({
        output: [
          {
            type: "web_search_call",
            action: {
              type: "search",
              sources: [
                { type: "url", url: "https://publisher.example/book" },
                { type: "url", url: "http://unsafe.example/book" },
              ],
            },
          },
          {
            type: "message",
            content: [
              {
                type: "output_text",
                annotations: [
                  {
                    type: "url_citation",
                    url: "https://publisher.example/book",
                    title: "Publisher",
                  },
                  {
                    type: "url_citation",
                    url: "https://library.example/record",
                    title: "Library",
                  },
                ],
              },
            ],
          },
        ],
      }),
    ).toEqual([
      { url: "https://publisher.example/book" },
      { url: "https://library.example/record" },
    ]);
  });
});
