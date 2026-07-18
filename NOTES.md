# Build Notes

- 2026-07-17: Tightened the spec around Responses API + Zod contracts, refusals, sentence validation, stance-extraction stages, latency budgeting, and model-assisted book identification.
- 2026-07-17: Chose a hosted-demo target with lightweight proxy abuse controls while preserving the no-auth, no-database MVP boundary.
- 2026-07-17: Reordered the sprint so mock and live console sessions prove the full discussion loop before UI implementation.
- 2026-07-17: Added the React/Vite/Express foundation, strict Zod contracts, deterministic mock client, and fast contract/security tests without making a paid API call.
- 2026-07-17: Kept keys server-only (`.env` locally, Secret Manager when deployed) and documented browser-only session storage plus the Firebase Hosting/Functions target.
- 2026-07-17: Completed the five-stage deterministic console engine with eight persona cards, parallel private notes, code-selected rebuttals, shelf budgets, stance extraction, and a validated recap.
- 2026-07-17: A full GPT-5.6 session completed; live findings added semantic checks for exact topic framing, spoken shelf references, non-formulaic persuasion, and transcript-only recap evidence.
- 2026-07-17: Added the mock-first browser text prototype with one-turn Next pacing, five interactive user prompts, stage progress, privacy copy, and recap completion before visual UI work.
- 2026-07-17: Added session-level Korean/English selection across UI copy, mock dialogue, recap contracts, and future live-generation prompts; Korean is the prototype default.
- 2026-07-17: Added a bilingual full-transcript clipboard export that removes avatar initials and preserves stage, speaker, and utterance structure for dialogue-quality evaluation.
- 2026-07-17: Replaced the raw recap preview with styled GFM rendering, preserved the 34-turn conversation behind a completion tab, and added separate recap copy/download actions.
- 2026-07-17: Added invisible language-aware automatic pacing, pause/skip/manual controls, hard stops for user turns, and compact current/next participant highlighting.
- 2026-07-17: Replaced the generic closing thanks with Alex's spoken discussion summary and a paced transition into the written meeting recap.
- 2026-07-17: Replaced the flat participant strip with a responsive five-seat oval table showing the book, current utterance, and current/next speaker cues.
- 2026-07-17: Made the round table and full current-dialogue panel the primary session UI; moved the chatbot-style growing transcript into a pausing on-demand record view, with a portrait-ready dialogue slot for future game-style presentation.
- 2026-07-17: Connected the browser session to all five server-side GPT-5.6 generation operations behind strict request/response schemas, health-gated explicit Live selection, and a Mock default that cannot spend credits.
