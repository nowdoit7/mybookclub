import { describe, expect, it } from "vitest";

import { MockGenerationClient } from "./mockGenerationClient";

describe("MockGenerationClient", () => {
  it("returns deterministic, book-agnostic identification for any title", async () => {
    const client = new MockGenerationClient();
    const first = await client.identifyBook({ title: "A Reader-Selected Book", author: "A. Reader" });
    const second = await client.identifyBook({ title: "A Reader-Selected Book", author: "A. Reader" });

    expect(first).toEqual(second);
    expect(first.canonical_title).toBe("A Reader-Selected Book");
    expect(first.author).toBe("A. Reader");
    expect(first.work_scope).toBe("single_book");
    expect(first.included_titles).toEqual(["A Reader-Selected Book"]);
    expect(first.main_characters).toEqual([]);
    expect(first.candidate_topics).toHaveLength(3);
    expect(first.verification_status).toBe("mock");
    expect(first.sources).toEqual([]);
    expect(JSON.stringify(first)).not.toMatch(/Meursault|Camus|courtroom|funeral/iu);
  });

  it("keeps a requested series scope without inventing component volumes", async () => {
    const series = await new MockGenerationClient().identifyBook({
      title: "A Reader-Selected Series",
      author: "A. Reader",
      scope: "series",
    });

    expect(series.work_scope).toBe("series");
    expect(series.included_titles).toEqual([]);
    expect(series.verification_status).toBe("mock");
  });

  it("does not carry content from one arbitrary title into another", async () => {
    const client = new MockGenerationClient();
    const essay = await client.identifyBook({ title: "Notes on Attention", language: "en" });
    const novel = await client.identifyBook({ title: "달의 정원", language: "ko" });

    expect(essay.canonical_title).toBe("Notes on Attention");
    expect(novel.canonical_title).toBe("달의 정원");
    expect(essay.summary).not.toContain("달의 정원");
    expect(novel.summary).not.toContain("Notes on Attention");
  });
});
