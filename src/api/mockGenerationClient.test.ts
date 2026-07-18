import { describe, expect, it } from "vitest";

import { MockGenerationClient } from "./mockGenerationClient";

describe("MockGenerationClient", () => {
  it("returns a deterministic demo fixture", async () => {
    const client = new MockGenerationClient();
    const first = await client.identifyBook({ title: "The Stranger" });
    const second = await client.identifyBook({ title: "The Stranger" });

    expect(first).toEqual(second);
    expect(first.canonical_title).toBe("The Stranger");
    expect(first.candidate_topics).toHaveLength(3);
  });
});
