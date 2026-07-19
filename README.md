# The Reading Table

An AI book club where three committed readers interpret the same book through
different lenses and defend their positions.

> Build status: interactive browser prototype complete. Both deterministic mock
> and server-backed live GPT-5.6 sessions support text-length-aware automatic pacing, pause/skip/manual
> controls, five hard-stop user turns, current/next-speaker cues,
> Korean/English selection, a responsive MVP round-table view, and a localized
> recap screen. The stance map and final visual polish are the next milestones.

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
- Compact participant icons with current/next-speaker highlighting
- Responsive five-seat oval table with a dedicated full current-dialogue panel
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

The project is being built with Codex and GPT-5.6 for OpenAI Build Week. Key
product, engineering, and design decisions are recorded in `NOTES.md`; the final
submission narrative will be completed as the engine and product loop ship.
