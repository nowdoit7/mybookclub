# Round 1 Results

Date: 2026-07-19

This round used three frozen A/B conversations and three independent agent
evaluators. The evaluators saw the book context and anonymized samples first,
locked their scores and preference, and only then learned which sample was the
imagined guest. No product API credits were used.

## Result

| Audition | Guest sample | Guest average | Blind guest preference | Interpretation delta | Naturalness delta | Gate |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| *Same as Ever* × Adam Smith | A | 4.67 | 67% | +1.00 | -0.67 | Fail |
| *Same as Ever* × Blaise Pascal | A | 4.40 | 100% | +2.00 | -0.33 | Fail |
| *Remembrance of Earth's Past* × Isaac Newton | B | 4.20 | 0% | -0.33 | -0.33 | Fail |

All samples had zero hard safety failures and all candidate turns stayed within
two to four sentences. None passed every pre-registered quality gate.

## Interpretation

**Pascal is the strongest revision candidate, not yet a product candidate.**
All three evaluators preferred the hidden Pascal sample, and it added the
largest interpretive gain by asking who defines loss before a safety margin is
calculated. It missed only the relative-naturalness gate: its aphoristic,
translated cadence sounded more written than the regular-reader baseline.

**Adam Smith added a valuable lens but sounded too essayistic.** Two evaluators
preferred the guest, and the guest reframed prudence as institutional voice and
responsibility. The naturalness loss was large, and the phrase equivalent to
"the book repeatedly says" came too close to implying that the historical
figure personally read a modern work. The imagined-guest disclosure prevents a
hard failure, but production wording should avoid the ambiguity entirely.

**Newton did not improve this exchange.** All evaluators preferred the regular
reader, who pressed the user with sharper trilogy-specific counterevidence. The
hidden Newton sample was careful and safe, but its hypothesis-versus-law method
became agreeable seminar commentary. This is evidence against this portrayal in
this conversation, not a universal claim that Newton can never work.

## Decision

Do not change the runtime or `SPEC.md` yet. Round 2 should:

1. rewrite Pascal and Smith in shorter, more spoken language without weakening
   their disagreement;
2. keep Newton only as a contrast case while testing a less generic, more
   text-responsive natural-philosophy lens;
3. test each candidate on at least two dissimilar books within an affinity
   genre and one deliberate mismatch;
4. repeat the same blind-then-reveal protocol before any live API smoke test.

The useful outcome is not that a famous name scores highly. It is that the lab
can reject a recognizable but weaker performance before celebrity recognition
reaches the UI.

## Limits

The evaluators were language agents, not target users. The cases reuse completed
session transcripts and cannot establish cross-book generalization, historical
accuracy, legal safety, real-user authority bias, or production latency. Those
remain separate review gates.
