# Open Reading Club

An AI book club where three readers with committed viewpoints debate the book
you read, challenge your interpretation, and create a downloadable recap.

**[Try the live app](https://reading-table-buildweek.web.app)** ·
**[Watch the 2:46 demo](https://www.youtube.com/watch?v=H6an4WAsfyA)**

The judging build is deployed and uses GPT-5.6 Terra for live book verification,
dialogue, private reading notes, stance extraction, and the final meeting recap.
No account or credentials are required.

## Why this is not another agreeable chatbot

Open Reading Club recreates the part of a real book club that matters most:
different people can finish the same book with incompatible interpretations.

- **Code controls the meeting; GPT-5.6 supplies the language.** A deterministic
  TypeScript engine owns stage order, speakers, rebuttal targets, turn caps, and
  user checkpoints.
- **Disagreement is enforced, not merely prompted.** Two readers clash before
  inviting the user, and a user who states a position receives a directed
  challenge.
- **Readers remain distinct.** Emotional, analytical, and contextual readers
  prepare private notes and defend revisable but committed positions.
- **Almost any book can come to the table.** Live sessions verify a single book
  or a full series with GPT-5.6 web search and show the retrieved sources before
  the meeting starts.
- **Imagined guests create special encounters.** One of 21 historical,
  legendary, or literary guests can replace a regular reader without turning
  the conversation into biography recitation or fake quotation.
- **The conversation leaves an artifact.** Every completed meeting produces a
  styled recap, final-position table, moments of real disagreement, and a full
  transcript that can be copied, downloaded, shared, or sent by email.

## Try the judging build

Open the **[live demo](https://reading-table-buildweek.web.app)** and follow this
short path:

1. Choose English or Korean.
2. Select **One book**.
3. Enter `Hamlet` by `William Shakespeare` and verify it.
4. Join the regular club or invite William Shakespeare as an imagined guest.
5. Select a user profile and enter the meeting.
6. Use **Next** to advance. When the table turns to you, write a response and
   select **Share**.
7. Complete the discussion to open the recap and full transcript.

Live generation can take several seconds, especially after a Firebase cold
start. The interface exposes verification, reading-note, dialogue, transition,
and recap preparation states instead of silently waiting.

For a repeatable regular-reader draw while preserving live GPT-5.6 generation,
use the **[seeded live demo](https://reading-table-buildweek.web.app/?seed=demo)**.
The seed changes only the deterministic reader draw; it never supplies book
content or generated answers.

Maintainers can append `?mock=1&seed=demo` for the internal, credit-free UI
path. Mock book information is explicitly labeled unverified and is not the
judging path.

## The five-stage meeting

1. **Intro** — readers introduce themselves as people before discussing the
   book.
2. **First impressions** — each reader states an independent reaction without
   bending around the user's opinion.
3. **Scenes** — the table grounds interpretations in concrete moments from the
   verified work.
4. **Discussion** — code selects opposed lead readers, directs one clash, then
   lets the user join, keep listening, add another thought, or wrap up. The
   original challenger responds after the user answers, so the exchange remains
   conversational rather than becoming a queue of unrelated monologues.
5. **Wrap-up** — every reader gives a distinct closing reflection, Alex connects
   the major arguments, and GPT-5.6 produces the written recap.

## Architecture

```text
React / Vite UI
  |
  +-- deterministic TypeScript session engine
  |     stage order | speaker selection | directed rebuttals | turn limits
  |
  +-- GenerationClient
        |-- local: same-origin Express /api/generate
        |-- deployed: Cloud Functions for Firebase v2
                    |
                    +-- OpenAI Responses API / GPT-5.6 Terra
                        strict structured output; hosted web search for verification
```

The browser and console harness share one `GenerationClient` contract. The
public deployment sends generation requests directly to the Cloud Function to
avoid Firebase Hosting's dynamic-rewrite timeout; local development uses the
same-origin Express proxy. The six generation routes are protected by allowed
origins, rate limits, body-size limits, and per-session call limits.

Every model call uses a strict structured-output schema. Responses are validated
with Zod plus task-specific quality rules for sentence count, complete endings,
topic grounding, directed targets, stance bounds, and recap evidence. Invalid
responses receive one bounded repair attempt rather than entering the session.

The engine and prompts remain book-agnostic. Book facts arrive through the
verified session input and generated private notes; persona cards contain no
title-specific answers. Neutral cross-genre fixtures guard against development
books leaking into unrelated sessions.

## Local setup

### Requirements

- Node.js 22+
- An OpenAI API key for live sessions only

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
# macOS / Linux
cp .env.example .env
```

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

Put `OPENAI_API_KEY` in `.env`. Never expose it through a `VITE_` variable or
commit the file. The optional settings and safe defaults are documented in
[`.env.example`](.env.example).

Start the Vite client and local Express proxy:

```bash
npm run dev
```

Open `http://localhost:5173`. Use `http://localhost:5173/?seed=demo` for the
repeatable live reader draw or `http://localhost:5173/?mock=1&seed=demo` for the
credit-free deterministic UI path.

## Verification

The primary feedback loop is API-free and deterministic:

```bash
npm run test
npm run typecheck
npm run lint
```

At submission, the fast suite passes **201 tests across 16 files**. It covers
the five-stage state machine, persona-category draw, directed disagreement,
user rebuttal, discussion caps, quality validation, strict server contracts,
guest participation, sharing, and a complete mock session. Five neutral mock
sessions also pass all 15 dialogue-flow checks.

Paid checks are deliberately separate:

```bash
npm run test:live
npm run evaluate:guests:live -- --language=ko
```

`test:live` validates properties such as schema conformance, sentence bounds,
stance variance, and copyright limits; it never asserts exact generated prose.

## Commands

```bash
npm run dev          # Vite + local Express proxy
npm run session      # Full real console session; uses API credits
npm run session:mock # Free deterministic five-stage console session
npm run evaluate:mock
npm run test         # Fast unit, contract, and mock-session tests
npm run test:live    # Real API smoke tests only
npm run typecheck
npm run lint
npm run build
npm run build:functions
npm run typecheck:functions
```

## Firebase deployment

The judging build uses the isolated `reading-table` Hosting target in the
existing Firebase project. Install both dependency sets once, authenticate the
Firebase CLI, and register the OpenAI key in Google Cloud Secret Manager:

```bash
npm install
npm --prefix functions install
firebase login
firebase functions:secrets:set OPENAI_API_KEY --project fir-test-f3fef
```

Never pass the secret through a `VITE_` variable or deploy the local `.env`.
Deploy only this app's named Hosting target and function:

```bash
npm run deploy:firebase
```

The function runs on Node.js 22, can scale down to zero, and is capped at two
instances. Before publishing a fork, set a hard OpenAI project usage limit and
Firebase billing alerts.

## How Codex accelerated the work

Codex served as an implementation partner and an instrumented test loop, not
only as a code generator. The workflow repeatedly followed this cycle:

1. Run a complete Korean or English book-club session.
2. Review the transcript as a human social experience.
3. Give Codex the transcript and privacy-safe request diagnostics.
4. Turn qualitative problems into deterministic engine rules, prompt
   constraints, and API-free regression tests.
5. Reserve paid GPT-5.6 runs for language-quality validation.

That loop converted observations such as “everyone only listens to the user,”
“the debate stops when it becomes interesting,” and “the challenger disappears
after the user answers” into testable behavior: independent first impressions,
one code-owned reader clash, a guaranteed user challenge, a same-challenger
response, a third-reader bridge, and bounded continue/listen/wrap checkpoints.

Codex also helped:

- prove the entire engine in console and mock sessions before visual UI work;
- diagnose live latency and structured-output failures without logging private
  dialogue;
- separate refusals, incomplete outputs, and invalid schemas;
- remove early overfitting to a single development book;
- simulate cross-genre sessions without spending credits;
- evaluate all 21 imagined guests with neutral fixtures;
- translate conversation-quality feedback into the current 201-test suite; and
- document the server-only key boundary, Firebase deployment, and privacy model.

GPT-5.6 supplies book verification, private notes, natural dialogue, stance
extraction, and the recap. TypeScript owns the meeting. This boundary was the
key product and engineering decision: language remains flexible while the
social contract remains deterministic and testable.

The chronological evidence is in [`NOTES.md`](NOTES.md). The major visual and
interaction pivot is documented in [`REDESIGN_PLAN.md`](REDESIGN_PLAN.md), and
the product behavior is specified in [`SPEC.md`](SPEC.md). The commit history
preserves the smaller implementation decisions.

## Data and privacy

In Live mode, verified book details, user messages, and the minimum transcript
context required for a turn are sent to OpenAI through the server proxy. Mock
mode sends no content to OpenAI.

- Session state is stored only in the current browser's `localStorage`.
- Open Reading Club has no account system, database, or server-side transcript
  store.
- Starting a new session clears the active local session.
- The server must not log prompts, reading notes, request bodies, user messages,
  or transcripts.
- Operational diagnostics contain only endpoint, outcome, status, duration,
  safe error code, and request ID.
- The OpenAI API key stays in local `.env` or Google Cloud Secret Manager and
  never reaches the browser.

## License and media

The source code is available under the [MIT License](LICENSE).

The MIT License does **not** cover the non-code media under `public/`, including
portraits, the reading-room background, `MyBookClub.mp3`, and sound effects.
Those assets were created for this project or are used under their applicable
licenses and remain all rights reserved unless separately stated. The background
music was generated by the project creator with Suno and is used under the
creator's applicable Suno plan rights.
