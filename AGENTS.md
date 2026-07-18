# AGENTS.md

## Project

**The Reading Table** — an AI book club. The user finishes a book, enters the
title, and joins a round table with three AI readers who hold committed
interpretive positions and argue about it.

**`SPEC.md` is the source of truth for product behavior.** Read it before
proposing changes. If something here contradicts SPEC.md, SPEC.md wins — tell
me about the conflict instead of guessing.

This is a hackathon submission (OpenAI Build Week, due **July 21, 2026, 5pm PT**).
Scope discipline matters more than completeness.

## Commands

```bash
npm run dev         # vite dev server + express proxy (concurrently)
npm run session     # console session, REAL api — costs credits, use sparingly
npm run session:mock# console session, MOCK llm — free, instant, use constantly
npm run test        # vitest: engine units + mock-session invariants (no api)
npm run test:live   # smoke test against real api — run before shipping only
npm run build       # production build
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
```

`npm run test` must stay fast (<10s) and require no API key. It is the main
feedback loop — run it after every change without asking.

## Layout

```
src/
  engine/      moderator state machine, speaking-order scheduler,
               rebuttal targeting  ← pure functions, no React, no fetch
  prompts/     prompt assembly, house rules, directive templates
  personas/    persona cards as DATA (one file per persona) + draw logic
  api/         GPT-5.6 client, JSON-schema calls, retry/repair
  ui/          React components
  types.ts     shared types (mirrors SPEC §6)
server/        express proxy — the ONLY place OPENAI_API_KEY is touched
scripts/       session harness
```

## Hard rules

These are project-defining. Do not "improve" past them without asking.

1. **Orchestration is code, speech is model.** The state machine decides the
   stage, who speaks, and when the user is addressed. The LLM only writes
   sentences. Never let a model decide flow control.
2. **The API key never reaches the client.** All model calls go through
   `server/`. No `dangerouslyAllowBrowser`, no key in Vite env vars.
3. **Personas are data, not prose in code.** Cards live in `src/personas/*.ts`
   as typed objects. Adding a persona must require zero engine changes.
4. **Every model call uses strict JSON schema output.** No free-text parsing,
   no regex extraction. Schema in SPEC §6.
5. **Rebuttal enforcement is not optional.** After the user states a position,
   at least one persona challenges it (SPEC §9). This is the reason the product
   exists — if it becomes hard to implement, tell me, don't quietly soften it.
6. **Persona utterances: 2–4 sentences.** Enforced in prompt AND by schema
   maxLength. Personas that monologue are a bug.
7. **Copyright:** discuss themes and scenes; quote at most a short phrase;
   never reproduce passages. This rule goes in the house-rules prompt and stays
   there.
8. **No database, no accounts, no server-side session store.** `localStorage`
   only.

## Build order

Follow SPEC §16. Specifically: **a full session must run in the console
(`npm run session`) before any UI work begins.** If you find yourself writing
components while the engine is incomplete, stop and flag it.

## Testing

The engine is deterministic on purpose — that is what makes this testable
without a browser. Three layers, in priority order:

**1. Engine unit tests** (pure functions, no API). Write these *first* for
engine logic — they're fast and the invariants are known up front:
- state machine visits all 5 stages in order, never skips
- persona draw always yields exactly one emotional / analytical / contextual
- rebuttal targeting picks the persona whose stance is furthest from the user
- the same challenger never fires twice in a row
- shelf-citation budget is capped at one per persona per stage

**2. Mock-LLM session tests** (fake client returns canned JSON, full session
runs in-memory). These assert flow invariants, not text:
- the user is challenged at least once per discussion topic — **this is the
  product's core promise; it must be a test, not a hope**
- no persona speaks twice in a row
- utterances per topic stay under the cap
- every stage is reached and a recap is produced

**3. Live smoke test** (`npm run test:live`, real API, few runs, costs credits).
Assert *properties*, never exact content:
- output parses against the JSON schema
- utterances are ≤4 sentences; stance within [-2, 2]
- persona stances have not converged (variance above a threshold) —
  catches personality collapse
- no long verbatim passages from the book

**Golden transcript:** record one real session to `fixtures/` and replay it for
UI development. Do not burn credits re-running sessions to tweak CSS.

Never assert on generated prose. Assert on structure, flow, and properties.

## Out of scope — do not build

Voice input/output · moderator personality selection · cross-book memory /
library · multi-user rooms · auth · database · i18n framework · analytics ·
UI component tests · E2E/browser automation.

If you think one of these is needed, say so and wait. Do not add it proactively.

## Conventions

- TypeScript strict. No `any` without a comment explaining why.
- **Code, comments, commit messages, and all UI copy in English.** This is an
  English-language submission judged by English speakers.
- Engine code is pure and testable: no fetch, no React, no `Date.now()` inside
  decision logic (inject it).
- Prefer boring, readable code. Judges read this repo.
- Small commits with clear messages — the commit history is part of the
  submission evidence.

## Working loop

For any non-trivial task, run this loop. Keep it lightweight — no ceremony,
no phase announcements.

1. **Plan.** A few bullets: what you'll change, which files, what could break.
   Then explicitly check: does this conflict with anything already built, and
   what does SPEC.md require that the plan is missing? State both, then wait
   for my go-ahead.
2. **Build.** Implement the agreed plan only. If you discover the plan was
   wrong, stop and say so — don't silently expand scope.
3. **Verify.** Run `npm run test` and `npm run typecheck` yourself. Fix what
   fails and re-run. Don't hand me broken code to review.
4. **Log.** Append 1–3 lines to `NOTES.md`: what was built, what decision was
   made and why, what surprised you. This file feeds the README's required
   Codex-collaboration write-up — it is a deliverable, not bookkeeping.

Other expectations:
- Flag ambiguity in SPEC.md rather than guessing — the spec was written before
  the code and will have gaps.
- When something in the spec is wrong or over-engineered for the deadline, say
  so directly. Time is the scarcest resource here.
- Don't refactor unrelated code while fixing something.

## Submission requirements (do not lose these)

- `README.md` must explain **how Codex accelerated the work, the key product /
  engineering / design decisions, and how GPT-5.6 + Codex shaped the result.**
  This is graded. Keep notes as we go — don't reconstruct it at the end.
- The `/feedback` session ID from the session where core functionality was
  built must be submitted. Core engine + persona work should stay in one
  session where possible.
- Repo must be testable by judges who will not build it from scratch: clean
  setup instructions, `.env.example`, and a demo seed (`?seed=demo`).