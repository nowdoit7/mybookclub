import { describe, expect, it } from "vitest";

import type { ConfirmedBook } from "../types";
import {
  GUEST_WORK_PROFILES,
  resolveGuestAuthorPerspective,
} from "./guestWorkRelations";

function verifiedBook(
  title: string,
  author: string,
  verificationStatus: ConfirmedBook["verificationStatus"] = "verified",
): ConfirmedBook {
  return {
    title,
    author,
    workScope: "single_book",
    includedTitles: [title],
    confirmedSummary:
      "A neutral verified fixture long enough to exercise author and work matching without supplying plot assumptions or generated literary claims.",
    mainCharacters: ["Reader"],
    candidateTopics: ["Power", "Responsibility", "Interpretation"],
    verificationStatus,
    verificationNote: "Verified fixture",
    sources: [{ url: "https://library.example/work" }],
  };
}

describe("imagined guest work relationships", () => {
  it("keeps a relationship profile for every imagined guest", () => {
    expect(GUEST_WORK_PROFILES).toHaveLength(21);
    expect(new Set(GUEST_WORK_PROFILES.map(({ personaId }) => personaId)).size).toBe(21);
    for (const profile of GUEST_WORK_PROFILES) {
      expect(profile.sourceUrls.length).toBeGreaterThan(0);
      expect(profile.sourceUrls.every((url) => url.startsWith("https://"))).toBe(true);
      expect(profile.representativeWorks.length).toBeGreaterThan(0);
    }
  });

  it("matches translated author and title aliases for Machiavelli and The Prince", () => {
    const relation = resolveGuestAuthorPerspective(
      "machiavelli",
      verifiedBook("군주론", "니콜로 마키아벨리"),
    );

    expect(relation).toEqual(
      expect.objectContaining({
        canonicalTitle: "The Prince",
        relationship: "documented_author",
        workForm: "treatise",
      }),
    );
    expect(relation?.firstPersonFrame.ko).toContain("이 책");
  });

  it("uses verified author identity as a non-overfit fallback for an unlisted work", () => {
    const relation = resolveGuestAuthorPerspective(
      "mary-shelley",
      verifiedBook("Lodore", "Mary Shelley"),
    );

    expect(relation).toEqual(
      expect.objectContaining({
        canonicalTitle: "Lodore",
        relationship: "documented_author",
      }),
    );
  });

  it("uses a posthumous-notes frame for Pascal's Pensées", () => {
    const relation = resolveGuestAuthorPerspective(
      "blaise-pascal",
      verifiedBook("팡세", "블레즈 파스칼"),
    );

    expect(relation?.relationship).toBe("posthumous_compilation");
    expect(relation?.firstPersonFrame.ko).toContain("남긴 단상");
    expect(relation?.firstPersonFrame.ko).not.toContain("이 책을 쓸 때");
  });

  it("uses attribution language rather than definite authorship for Homer", () => {
    const relation = resolveGuestAuthorPerspective(
      "homer",
      verifiedBook("오디세이아", "호메로스"),
    );

    expect(relation?.relationship).toBe("traditional_attribution");
    expect(relation?.firstPersonFrame.ko).toContain("내 이름으로 전해진");
  });

  it("uses corpus language for a modern collection of Sappho's surviving poetry", () => {
    const relation = resolveGuestAuthorPerspective(
      "sappho",
      verifiedBook("사포 시집", "사포"),
    );

    expect(relation?.relationship).toBe("poetic_corpus");
    expect(relation?.firstPersonFrame.ko).toContain("노래");
  });

  it("never treats a book about Socrates as a Socrates-authored work", () => {
    expect(
      resolveGuestAuthorPerspective(
        "socrates",
        verifiedBook("소크라테스의 변명", "플라톤"),
      ),
    ).toBeUndefined();
  });

  it("never treats a Sherlock Holmes story as authored by the character", () => {
    expect(
      resolveGuestAuthorPerspective(
        "sherlock-holmes",
        verifiedBook("바스커빌가의 개", "아서 코난 도일"),
      ),
    ).toBeUndefined();
  });

  it("requires verified book metadata before enabling author perspective", () => {
    expect(
      resolveGuestAuthorPerspective(
        "machiavelli",
        verifiedBook("The Prince", "Niccolò Machiavelli", "mock"),
      ),
    ).toBeUndefined();
  });

  it("does not trust a matching title when the verified author is different", () => {
    expect(
      resolveGuestAuthorPerspective(
        "machiavelli",
        verifiedBook("The Prince", "An Unrelated Writer"),
      ),
    ).toBeUndefined();
  });
});
