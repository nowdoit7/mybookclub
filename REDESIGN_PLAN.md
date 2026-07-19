# Conversation Stage Redesign Plan

## Outcome

Make The Reading Table feel like a small group of opinionated readers rather
than a sequence of chatbot replies. The redesigned session should let the user
participate, watch two readers argue, or end a topic when it feels complete.
The interface should foreground faces, targets, and the line currently under
pressure while using a five-person cast lineup to establish the room.

## Product principles

1. **The cast establishes the room; faces carry the conversation.** Show all
   five medium portrait cards on arrival, while a requested line is being
   prepared, at stage transitions, and at closing. During a turn, focus the
   current speaker and the person being addressed.
2. **Testimony precedes debate.** First impressions and memorable scenes are
   independently prepared. Readers do not orbit the user before discussion.
3. **A real disagreement has direction.** `refersTo` is visible in the UI and
   persona-to-persona exchanges are scheduled by code.
4. **The user can participate or observe.** A bounded discussion checkpoint
   offers `Join`, `Keep listening`, and `Wrap up` without giving flow control to
   the model.
5. **Unresolved tension is not a failure.** Alex names what remains open and
   only closes after the user chooses to wrap or the bounded round cap is met.
6. **Atmosphere emerges instead of being selected.** The drawn readers establish
   a baseline; user wording and scheduled conversation events adjust it gradually.
   It changes delivery, never truth, identity, flow, or model-call count.
7. **Reading pace belongs to the reader.** Dialogue never advances on a timer.
   A click completes the current typewriter page, then a second click advances;
   transcript review never changes the live dialogue cursor or engine flow.

## Session experience

### Setup

- Keep language, generation mode, and book-scope selection.
- Let the user choose one of four presentation-only portraits and an optional
  local display name before entering the room.
- Do not add a mood selector. Each persona carries numeric social-temperament
  data; the selected trio deterministically establishes the initial room state.
- Recent user wording may warm, enliven, or sharpen the room. Code-scheduled
  challenges raise tension while support and closing turns soften it.
- The model receives the current state in the existing utterance request. It
  must not mechanically echo laughter, force jokes, or collapse distinct voices
  into one group personality.
- Show the room state only in development diagnostics. Hide it in production
  and automated tests so it remains an implementation aid, not a product control.

### Introduction and testimony

- Start with the five-person cast-card establishing view.
- Reveal Alex and each reader as a focused portrait turn.
- Prepare all first impressions before revealing any of them.
- Prepare both memorable-scene testimonies before revealing either.
- Independent testimony receives only the stage question plus private reading
  notes, not other readers' testimony as a response target.
- Exactly one designated reaction follows the user's memorable scene.

### Discussion

1. Code selects the topic from transcript relevance and stance spread.
2. Code selects the two personas with the widest disagreement on that topic.
3. Alex frames the controversy.
4. Lead reader A states a committed claim and addresses reader B.
5. Lead reader B challenges that claim and addresses reader A.
6. Reader A answers once. Alex then exposes a discussion checkpoint:
   - **Join the discussion**: collect a user position and enforce one direct
     challenge followed by the user's reply and one challenger response.
   - **Keep listening**: schedule one additional two-reader exchange. This
     option is available once per topic.
   - **Wrap up**: preserve the unresolved issue and move toward closing.
7. After either extension, show one final checkpoint: join or wrap.
8. Alex closes only after user choice or the extension cap. The model writes the
   transition, but code owns the decision and cap.

The third reader remains an observer unless code selects them as the closest
supporter after the user joins. No one speaks merely to complete a round.

### Closing

- Keep the user's closing thought first.
- The two people most involved respond briefly.
- Return to the five-person cast lineup for Alex's spoken summary.
- Preserve the full transcript and generate the recap after the reader acknowledges
  the final spoken summary.

## Interface architecture

### Conversation stage

- **Establishing/transition state:** five medium portrait cards with names and
  roles; highlight the known upcoming speaker while a requested line is prepared.
- **Focused state:** large active portrait, optional target portrait, speaker
  nameplate, and a visual-novel-style dialogue box.
- **Debate state:** two portraits face inward; active and target roles are clear.
- **User-response state:** keep the opponent portrait and full challenged line
  visible while the user writes.
- Use generated portraits when available and fall back to colored initials.

### Dialogue paging and transcript

- Keep the active utterance in a fixed-height visual-novel dialogue box so long
  text never covers the speaker portrait.
- Split only at sentence-safe boundaries and retain the untouched utterance in
  the transcript and model context. Oversized single sentences may use a bounded
  display-only fallback split.
- Reveal a fresh page with a fast typewriter effect. Clicking while it types
  completes the page; clicking again moves to the next page or engine-owned turn.
- Previous navigates only already revealed pages. Returning to the live edge must
  not regenerate dialogue or resolve an engine transition.
- Requesting a new turn commits the current page cursor before generation. When
  the utterance arrives, its first page and actual speaker replace the transition
  state; the previous line is available only through Previous or the transcript.
- Keep the complete chat-style transcript closed by default. Open it in an overlay
  drawer for review and copy, then return to the exact same dialogue page.

## Portrait assets

- Produce nine consistent illustrated bust portraits: Alex plus eight readers.
- One asset must work as both a circular face crop and a larger bust.
- Keep a unified medium, lighting direction, crop, and warm-library palette.
- Do not imitate or reuse any specific commercial game character or visual style.
- Provide four consistent user portraits cropped from one lightweight sprite sheet.
- Expression variants are roadmap scope; MVP uses one readable neutral expression.

## Contracts and state

- Add `SocialTemperament` to persona data and `RoomAtmosphere` to `SessionState`,
  utterance requests, and strict HTTP schemas. Atmosphere updates remain pure,
  deterministic engine functions and require no additional generation call.
- Add `DiscussionAction = "join" | "listen" | "wrap"` as a UI/engine callback,
  not a model output.
- Add persona-to-persona utterance tasks with explicit `targetSpeaker`.
- Keep `refersTo` populated for every directed debate turn.
- Keep the existing strict utterance schema; no free-text parsing.

## Test and evaluation plan

- Pure engine tests:
  - first impressions and scene testimony are prepared independently;
  - the widest-spread pair opens the debate;
  - at least one persona-to-persona exchange occurs;
  - `listen` is capped at one extension;
  - a user who joins is challenged and receives the immediate reply turn;
  - `wrap` cannot skip Alex's tension summary;
  - the initial atmosphere is deterministic and all values remain bounded;
  - user wording and scheduled tasks update atmosphere gradually;
  - atmosphere and `refersTo` reach every relevant request.
- Dialogue presentation tests:
  - page splitting preserves text and stays within the display budget;
  - one click advances exactly one page or one code-owned turn;
  - transcript review is closed by default and does not affect engine flow.
- Mock evaluations:
  - join route, observer route, immediate-wrap route;
  - varied persona-derived atmosphere baselines and user-language changes;
  - no book-specific hardcoding.
- Run one paid live session only after all mock and structural checks pass.

## Delivery slices

1. Spec, types, and deterministic engine loop.
2. Prompt behavior and mock simulation.
3. Challenged-line context and explicit discussion checkpoint.
4. Full-viewport focused stage, manual dialogue paging, and transcript drawer.
5. Reader and user portrait generation and integration.
6. Full verification, browser QA, one final live smoke test with user approval.
