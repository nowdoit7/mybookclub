# Historical Guest Audition Lab

This research-only lab tests whether an imagined historical or literary guest
improves a book-club conversation before any guest enters the product runtime.
It uses no product API key and changes no session orchestration.

- [Round 1 results](./ROUND_01_RESULTS.md)
- [Round 2 speech-fingerprint results](./ROUND_02_RESULTS.md)
- [Genre-family candidate queue](./CANDIDATE_QUEUE.md)

## Method

Each case freezes the book evidence, topic, user claims, turn order, and turn
count. `sample-a` and `sample-b` replace the same reader category. One sample is
the current regular-reader baseline and the other is an imagined guest. The
mapping stays hidden from blind evaluators until their quality scores are fixed.

The case schema rejects a comparison if either sample changes a non-candidate
turn, candidate position, or turn order. Evaluation citations must point to
real turns in the matching sample, so the comparison remains auditable.

Three independent evaluators score both samples from 1 to 5 and cite turn IDs.
After the blind preference is recorded, a red-team pass checks the disclosed
guest for false quotation, invented biography, literal claims of reading a
modern book, authority effects, cross-book leakage, flow violations, historical
voice caricature, and repeated signature phrases.

Round 2 cases add a sourced `speechFingerprint`: recurring reasoning moves,
conversational cadence, newly composed cue patterns, explicit imitation bans,
and a one-cue-per-turn budget. Evaluators still see only anonymized dialogue
during scoring, so recognizable phrasing cannot earn points through a famous
name.

The aggregate command is:

```bash
npm run evaluate:guest-audition
```

## What this can establish

- whether the guest adds a book-specific interpretation;
- whether the guest participates instead of lecturing;
- whether the result stays natural when the famous name is hidden;
- whether the same portrayal overfits one title or leaks across books;
- whether a candidate is worth implementing and live-testing.

It cannot certify historical accuracy, legal safety, real-user authority bias,
or production GPT-5.6 latency. Those require reviewed sources, human review, and
one final Live smoke test after a candidate passes this lab.

## Pass gate

- zero hard failures;
- guest average at least 4.0/5;
- book specificity, novel interpretation, and participation each at least 4.0;
- naturalness and authority balance each at least 3.5;
- blind guest preference at least 65%;
- novel-interpretation improvement at least +0.5 over baseline;
- naturalness no worse than -0.25 from baseline;
- all candidate turns remain 2–4 sentences.

Exact generated prose is never a test oracle. The JSON artifacts preserve
evidence, scores, and structural properties instead.
