# Round 3 Live API Audition — Cross-book Results

Date: 2026-07-20

Model: GPT-5.6

Product runtime changed: no

## Method

The sourced portrayals and restrained speech fingerprints for Pascal, Newton,
and Adam Smith were used in real GPT-5.6 generation. The book evidence, topic,
user claims, non-candidate turns, and turn positions were frozen from completed
*Same as Ever* and *Remembrance of Earth's Past* conversations. Each candidate
was generated once in each book context, for six paid samples. The comparison
sample was an existing regular reader in the identical context.

Three new evaluators scored anonymized A/B packets before either identity or
guest mapping was revealed. Scores, preferences, citations, and rationales were
locked before a disclosed-identity red-team pass.

The recorded run made six calls in 45.5 seconds, with individual calls taking
6.0–10.3 seconds. An earlier calibration attempt made four top-level requests:
three completed responses were lost because the first runner lacked per-call
checkpoints, and the fourth ended at its output-token limit. The runner now uses
lower reasoning effort, one bounded repair, per-call checkpoints, and refuses to
overwrite paid artifacts without explicit `--force`. Ten top-level API requests
were therefore made during this work.

## Results

| Book × guest | Guest mean | Blind guest preference | Interpretation delta | Naturalness delta | Hard-failure findings | Gate |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| *Same as Ever* × Pascal | 4.77 | 100% | +1.67 | +2.00 | 0 | Pass |
| *Same as Ever* × Newton | 4.47 | 100% | +1.00 | +1.00 | 0 | Pass |
| *Same as Ever* × Smith | 4.33 | 100% | +1.00 | +1.00 | 0 | Pass |
| *Three-Body* × Pascal | 3.40 | 0% | -1.00 | -3.00 | 8 | Fail |
| *Three-Body* × Newton | 4.23 | 0% | -1.33 | +0.00 | 0 | Fail |
| *Three-Body* × Smith | 4.23 | 0% | -1.33 | +0.00 | 0 | Fail |

The eight Pascal findings are not eight distinct error types. All three readers
flagged both Korean turns in the English case (six findings); two readers also
flagged the first turn's stacked fingerprint moves as either a structure breach
or visible historical-voice over-signaling.

## Interpretation

- Topic affinity mattered more than genre labels. Missing evidence, safety
  margins, and burden allocation gave all three lenses concrete work in *Same
  as Ever*.
- A famous guest did not automatically beat a strong regular reader. The
  *Three-Body* baseline already used more precise scenes and sustained sharper
  pressure, so all three live guests lost the blind comparison.
- Pascal exposed a real multilingual data bug: Korean cue sentences stored in a
  fingerprint overrode the English session instruction. Fingerprints must split
  language-neutral rhetorical moves from localized realization.
- Passing one favorable context does not establish historical distinctiveness
  or production readiness.

## Decision

Runtime and `SPEC.md` remain unchanged. Pascal stays the leading research
candidate but must pass the English cross-book test after fingerprint
localization. Newton and Smith remain context-sensitive research candidates.
Future eligibility experiments should use code-owned topic affinity rather than
genre alone, add a second dissimilar affinity book, and verify that a mismatch
results in no guest invitation. Guests remain rare same-category replacements,
never automatic additions to every table.
