# Open Reading Club

An AI book club where three committed readers interpret the same book through
different lenses and defend their positions.

> Build status: the full mock and server-backed GPT-5.6 session loops are
> implemented. The current redesign adds a portrait-led conversation stage,
> independent reader testimony, directed reader-to-reader disagreement, a
> bounded join/listen/wrap checkpoint, an emergent room atmosphere, and a
> reader-controlled paged dialogue surface. Final deployment polish remains.

The completion screen renders the recap as a styled document and keeps the full
conversation available in a separate tab for review and export.

## Requirements

- Node.js 22+
- An OpenAI API key for real sessions only

## Setup

```bash
npm install
copy .env.example .env
npm run dev
```

Put `OPENAI_API_KEY` in the local `.env`. Never expose it through a `VITE_`
variable or commit the file.

Open `http://localhost:5173` and wait for the server-ready message. Public app
sessions use GPT-5.6 Terra for a lower-cost quality balance; there is no
user-facing mode selector. Choose **One book**
or **Full series** before searching. The app verifies that exact scope, shows the
retrieved sources, and lists component volumes before a series discussion can
begin. Maintainers can append `?mock=1` for the internal deterministic UI path,
which never makes an OpenAI request.

## Commands

```bash
npm run dev          # Vite + local Express proxy
npm run session      # Full real session; costs roughly 30-40 model calls
npm run session:mock # Free deterministic five-stage session
npm run test         # Fast unit and mock tests
npm run test:live    # Real API smoke tests only
npm run typecheck
npm run lint
npm run build
npm run build:functions
npm run typecheck:functions
npm run evaluate:guests:live -- --language=ko # 21 imagined guests; costs credits
```

## Firebase deployment

The judging build uses the isolated `reading-table` Hosting target in the
existing Firebase project. Its public URL is
`https://reading-table-buildweek.web.app`; the project's default Hosting site
is not changed by this deployment.

Install both dependency sets once, authenticate the Firebase CLI, and register
the OpenAI key directly in Google Cloud Secret Manager:

```bash
npm install
npm --prefix functions install
firebase login
firebase functions:secrets:set OPENAI_API_KEY --project fir-test-f3fef
```

Never pass the secret through a `VITE_` variable or deploy the local `.env`.
Build and deploy only this app's named Hosting target and function:

```bash
npm run deploy:firebase
```

Firebase Hosting forwards `/api/**` to the `readingTableApi` Cloud Functions
v2 function and sends every other route to the Vite SPA. The function runs on
Node.js 22, can scale down to zero, and is capped at two instances. Before
sharing the URL, set a hard usage limit for the OpenAI project and budget alerts
for the Firebase billing account.

## Architecture

- React/Vite client
- Deterministic TypeScript moderator engine
- Server-only OpenAI Responses API client
- Strict Zod contracts for every browser request and model response
- One browser `GenerationClient` contract with public Live and internal Mock implementations
- Six same-origin generation routes protected by origin, rate, body-size, and session-call limits
- Korean/English generation selected once at session start
- Sentence-safe dialogue pages with fast typewriter reveal and reader-controlled advance
- Persona-derived room atmosphere that evolves with user wording and debate events
- Development-only atmosphere diagnostics with no additional model call
- Code-selected lead debaters with explicit persona-to-persona targets
- A bounded discussion checkpoint: join, listen to one more exchange, or wrap
- A five-person cast-card establishing/transition scene followed by a portrait-led dialogue stage
- A category-filtered test selector for 21 imagined historical, legendary, and literary guests
- One bounded, achievement-informed signature moment per imagined guest session, without quotations or résumé recitals
- Optimized portraits for the regular cast, all 21 imagined guests, and four selectable user portraits
- A full-viewport, game-like conversation stage with persistent participant cards
- Licensed background music with best-effort autoplay, a 50% initial volume, and a first-interaction fallback when browsers block autoplay
- An on-demand transcript drawer that is closed by default and never changes session flow
- Evaluation-ready Markdown transcript copy from the transcript and recap views
- Browser-only session persistence via `localStorage`
- Client-side recap email/share handoff with Markdown file sharing and a privacy-safe mail-draft fallback
- Firebase Hosting + Cloud Functions for Firebase v2 for the judging deployment

## Data & Privacy

In Live mode, book details, user messages, and the minimum transcript context
required for a turn are sent to OpenAI through the server proxy. Mock mode sends
nothing to OpenAI. Session state is stored only
in the current browser's `localStorage`; Open Reading Club does not persist
transcripts in a server database. Starting a new session clears the active local
session. The server must not log prompts, reading notes, request bodies, or
transcripts.

## Codex collaboration

Codex was used as an implementation partner and an instrumented test loop, not
only as a code generator. It helped turn qualitative session feedback into
deterministic engine rules: introductions before book talk, independent first
impressions, two-reader conflict before inviting the user, a guaranteed
challenge when the user joins, and an explicit choice to keep listening or end
the topic. Those decisions are covered by fast mock tests instead of depending
on exact generated prose.

GPT-5.6 supplies the language, book verification, private reading notes, and
recap, while TypeScript owns stage order, speaker selection, rebuttal targets,
turn caps, and dialogue-page advancement. This separation let Codex simulate complete sessions
without spending API credits, diagnose live latency with privacy-safe request
metadata, and reserve paid runs for model-quality validation. Product and
engineering decisions made during that collaboration are recorded in
`NOTES.md`, with the current redesign specified in `REDESIGN_PLAN.md`.
