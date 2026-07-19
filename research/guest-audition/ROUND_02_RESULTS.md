# Round 2 Results — Speech Fingerprints

Date: 2026-07-20

Round 2 preserved each Round 1 baseline, fixed context, turn order, and book
evidence. Only the imagined guest turns changed. Each guest received a sourced
`speechFingerprint` made of rhetorical moves, modern cadence, newly composed cue
patterns, imitation bans, and a one-cue-per-turn budget. Three fresh evaluators
scored anonymized A/B samples before identity disclosure.

## Result

| Audition | Guest average | Blind guest preference | Interpretation delta | Naturalness delta | Hard-failure findings | Gate |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| *Same as Ever* × Adam Smith R2 | 4.40 | 33% | +0.00 | +1.33 | 0 | Fail |
| *Same as Ever* × Blaise Pascal R2 | 4.67 | 100% | +1.67 | +2.33 | 1 | Fail |
| *Remembrance of Earth's Past* × Isaac Newton R2 | 4.57 | 67% | +0.33 | -0.67 | 4 | Fail |

All candidate turns remained within two to four sentences. No evaluator found a
fake historical quotation, invented biography, literal modern-reading claim,
copyright reproduction, celebrity-authority submission, cross-book leak,
genre mismatch, moderator takeover, or historical voice caricature.

## What changed

**Pascal became substantially better.** All evaluators preferred the guest,
naturalness moved from slightly below the baseline in Round 1 to far above it,
and the guest retained a large interpretive advantage. The revised voice first
acknowledges another reader's concern, then asks whose irreversible loss is
missing from the calculation. One evaluator treated the first turn's concession
plus omitted-outcome question as two cue-like moves, exceeding the one-cue
budget. The other two did not. Under the pre-registered zero-failure gate this
still fails, but it is a narrow copy-and-contract problem rather than a failed
guest thesis.

**Newton became a stronger opponent but over-signaled the method.** Guest blind
preference rose from 0% to 67%, and the voice now preserves a real disagreement
about authorization versus enforceable control. Evaluators repeatedly found
that the same turn combined an observation/inference distinction with a second
counter-scene cue. The result was rigorous but procedural, with four red-team
findings across two turns and three evaluator reports. Novelty and naturalness
also missed the gate.

**Smith traded book specificity for natural speech.** Naturalness improved by
1.33 points, but only one evaluator preferred the guest. The affected-person and
fair-observer lens sounded human and recognizably coherent, yet it stopped using
Arkhipov and the returning-aircraft evidence densely enough. It became broadly
applicable fairness advice, which is exactly the cross-book genericity risk the
lab is intended to catch.

## Blindness incident

One evaluator's first attempt to project the Smith JSON failed because of text
decoding and echoed identity-bearing raw fields. The evaluator disclosed the
incident immediately, produced no Smith score, and continued only with the two
uncontaminated cases. A fresh Smith-only evaluator replaced that slot. No
contaminated score is present in the artifacts or aggregates.

## Decision

Do not change runtime or `SPEC.md` yet.

1. Pascal advances to a minimal Round 3 copy edit: keep only one cue-like move
   in the first turn, clarify whether the budget counts exact cue wording or any
   recurring rhetorical move, then rerun the same blind comparison.
2. Newton remains a research candidate, but each turn must choose either an
   evidence distinction or a counter-scene demand, not both.
3. Smith's next trial must restore one concrete book scene per turn before its
   fair-observer question; naturalness alone is not enough.
4. Even a clean Pascal Round 3 pass would authorize only cross-book auditions:
   two dissimilar affinity books plus one deliberate mismatch are still required
   before product implementation.

The speech-fingerprint idea is supported, but the successful dose is smaller
than a full catchphrase or recognizable imitation.
