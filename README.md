# The Reading Table

An AI book club where three committed readers interpret the same book through
different lenses and defend their positions.

> Build status: the full mock and server-backed GPT-5.6 session loops are
> implemented. The current redesign adds a portrait-led conversation stage,
> independent reader testimony, directed reader-to-reader disagreement, a
> bounded join/listen/wrap checkpoint, selectable table mood, and a scrollable
> recent-dialogue dock. Final deployment polish remains.

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

Open `http://localhost:5173`, wait for the server-ready message, and explicitly
select **Live GPT-5.6** to use the API. Mock remains the default and never makes
an OpenAI request. Choose **One book** or **Full series** before searching; Live
mode verifies that exact scope, shows the retrieved sources, and lists component
volumes before a series discussion can begin.

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
```

## Architecture

- React/Vite client
- Deterministic TypeScript moderator engine
- Server-only OpenAI Responses API client
- Strict Zod contracts for every browser request and model response
- One browser `GenerationClient` contract with explicit Mock and Live implementations
- Six same-origin generation routes protected by origin, rate, body-size, and session-call limits
- Korean/English generation selected once at session start
- Language-aware 3–10 second reading pace with pause, skip-now, and manual mode
- User-selected warm, playful, or intense conversational delivery
- Code-selected lead debaters with explicit persona-to-persona targets
- A bounded discussion checkpoint: join, listen to one more exchange, or wrap
- A short round-table establishing scene followed by a portrait-led dialogue stage
- Nine optimized illustrated portraits with a neutral user silhouette fallback
- A fixed-height recent-dialogue dock that keeps challenged lines in view
- On-demand transcript view that pauses automatic playback while reviewing history
- Evaluation-ready Markdown transcript copy from the transcript and recap views
- Browser-only session persistence via `localStorage`
- Firebase Hosting + Cloud Functions for Firebase v2 for the judging deployment

## Data & Privacy

In Live mode, book details, user messages, and the minimum transcript context
required for a turn are sent to OpenAI through the server proxy. Mock mode sends
nothing to OpenAI. Session state is stored only
in the current browser's `localStorage`; The Reading Table does not persist
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
turn caps, and pause state. This separation let Codex simulate complete sessions
without spending API credits, diagnose live latency with privacy-safe request
metadata, and reserve paid runs for model-quality validation. Product and
engineering decisions made during that collaboration are recorded in
`NOTES.md`, with the current redesign specified in `REDESIGN_PLAN.md`.
