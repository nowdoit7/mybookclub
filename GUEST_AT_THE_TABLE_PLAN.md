# Guest at the Table — Product and Engineering Plan

## Product thesis

The Reading Table can occasionally seat an imagined historical or literary
guest whom the reader could never meet in real life. The guest is not a novelty
chatbot and never becomes an authority who ends the debate. They occupy one of
the existing three reader seats, arrive with a committed interpretive lens, and
remain open to challenge like every other reader.

Example meetings:

- Isaac Newton reads *Remembrance of Earth's Past* as a natural philosopher.
- Aristotle reads a modern science book through causation and first principles.
- Liu Bei, explicitly as portrayed in *Romance of the Three Kingdoms*, reads the
  novel's choices about loyalty, legitimacy, and rule.

The surprise should feel rare and earned: the ordinary eight readers remain the
heart of the product, while a guest is a memorable event.

## Core decision

Do not add a fourth AI reader. A guest replaces one regular reader in the same
category for that session:

| Guest | Category | Reason |
| --- | --- | --- |
| Isaac Newton | analytical | Evidence, mechanism, mathematical order, and the limits of inference |
| Aristotle | contextual | A historically distant framework that exposes modern assumptions |
| Liu Bei from the novel | contextual | A viewpoint embedded in the work's moral and political world |

Every session therefore still has exactly one emotional, one analytical, and
one contextual reader. The engine, UI, reading-note call count, speaking budget,
and recap structure stay unchanged.

## Reader-facing disclosure

Every guest card carries a persistent `Imagined guest` badge. Alex introduces
the guest with a short disclosure before the social introduction:

> Tonight's imagined guest is Isaac Newton. His responses are a speculative
> interpretation informed by documented ideas, not Newton's actual views.

The disclosure is presentation, not a model decision. Code inserts it whenever
the selected persona has guest metadata.

Hard rules:

- MVP guests are long-deceased historical figures or public-domain literary
  characters, never living celebrities.
- Never fabricate a quotation or present generated dialogue as an authentic
  statement by the represented figure.
- Never claim that a historical figure literally read a modern work.
- Do not grant special authority over other readers or the author.
- Distinguish a historical person from a literary portrayal. `Liu Bei from
  Romance of the Three Kingdoms` is not labeled simply as historical Liu Bei.
- Every claim about the portrayal basis comes from reviewed static source notes;
  no extra runtime web-search call is added.

## Deterministic eligibility and rarity

The model never decides whether a guest appears. A pure code selector requires
all of the following:

1. The session is Live and the book is `verified`.
2. The verified canonical title, author, series, or tightly bounded subject
   matches a static guest rule.
3. The session seed passes a deterministic rarity gate.
4. Exactly one eligible guest wins, and only one regular reader is replaced.

Initial rarity: 15% among eligible books. A reproducible demo seed bypasses only
the probability gate, never the book-eligibility gate.

- `?seed=demo` preserves the current ordinary demo trio.
- `?seed=guest-newton` seats Newton only for an eligible verified work.
- The same seed on an unrelated book safely returns three regular readers.

The first release uses exact canonical-title and author aliases. Broad semantic
topic matching is deferred because the current verification contract does not
return trusted subject tags.

## Proposed data shape

Guest personas remain persona data. The engine must not contain guest-specific
branches.

```ts
interface GuestPortrayal {
  kind: "historical" | "literary";
  displayLabel: Record<AppLanguage, string>;
  disclosure: Record<AppLanguage, string>;
  portrayalBasis: string[];
  sourceUrls: string[];
  eligibility: {
    canonicalTitles?: string[];
    authors?: string[];
    workScopes?: BookScope[];
  };
  rarity: number;
}

interface PersonaCard {
  // existing fields
  guestPortrayal?: GuestPortrayal;
}
```

`REGULAR_PERSONAS` and `GUEST_PERSONAS` are separate exported catalogs. The
selection function becomes `selectPersonas(seed, confirmedBook, mode)` and still
returns exactly three `PersonaCard` values.

## Prompt contract

Guest reading notes receive the same book context and strict schema as regular
readers, plus immutable portrayal rules:

- reason from the documented worldview without claiming literal foreknowledge;
- phrase modern concepts in accessible language rather than parodying archaic
  speech;
- do not invent memories, quotations, meetings, or reactions as historical fact;
- remain a fallible reader who can concede when challenged;
- discuss the book itself instead of delivering a history lecture.

The recap identifies the speaker as an imagined guest and never converts their
generated lines into historical quotations.

## First vertical slice

Recommended demo guest: **Isaac Newton** for a small allowlist of verified works
where cosmology, physical law, or scientific inference is central. The
*Remembrance of Earth's Past* series is the first explicit eligible title because
it already produced the strongest live discussion fixture and the surprise is
globally legible to English-language judges.

The vertical slice includes:

1. SPEC amendment for the curated guest exception and disclosure.
2. `GuestPortrayal` contract and strict validation.
3. One reviewed Newton persona card and one portrait.
4. Pure eligibility, rarity, replacement, and seed logic.
5. Persistent guest badge and Alex disclosure.
6. Mock session coverage and one final Live smoke session only after all
   structural checks pass.

Liu Bei is the safer second guest because his eligibility can be limited to one
public-domain literary work and the portrayal can be named precisely. Aristotle
should follow only after the first two prove that guests deepen interpretation
rather than merely provide recognizable costumes.

## Required tests

- Regular sessions still draw exactly three readers and one per category.
- An unrelated book never receives a guest, including with a guest demo seed.
- The same eligible book and seed always produce the same trio.
- At most one guest appears.
- A guest replaces only a reader from the guest's category.
- `?seed=demo` keeps the existing ordinary trio.
- Guest prompts contain disclosure and false-quotation prohibitions.
- Guest dialogue remains 2–4 sentences and satisfies all existing rebuttal,
  shelf, recap, and copyright invariants.
- Mock mode never claims that a guest knows unverified book facts.

## SPEC conflicts to resolve before implementation

The current SPEC fixes the persona pool at eight, the portrait assets at Alex
plus eight regular readers, and the draw at one reader from each fixed category
pool. The implementation phase must first revise those statements to:

> The core pool contains eight regular readers. A curated imagined guest may
> rarely replace one regular reader in the same category. Every session still
> contains exactly three AI readers and one reader per category.

This document intentionally changes no runtime code. It is the approval boundary
for the separate feature branch.

## Explicit non-goals for the first slice

- No living public figures.
- No user-authored celebrity names.
- No fourth reader or increased model-call budget.
- No model-selected guest.
- No runtime biography research.
- No voice imitation or generated historical quotations.
- No more than one implemented guest before the first full mock evaluation.
