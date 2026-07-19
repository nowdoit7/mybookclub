# Conversation Stage Redesign Plan

## Outcome

Make The Reading Table feel like a small group of opinionated readers rather
than a sequence of chatbot replies. The redesigned session should let the user
participate, watch two readers argue, or end a topic when it feels complete.
The interface should foreground faces, targets, and the line currently under
pressure while retaining the round table as an establishing scene.

## Product principles

1. **The table establishes the room; faces carry the conversation.** Show the
   full table on arrival, stage transitions, and closing. During a turn, focus
   the current speaker and the person being addressed.
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
7. **Playback never loses its reason.** Transcript viewing and page visibility
   pause automatic playback temporarily; manual pause remains manual.

## Session experience

### Setup

- Keep language, generation mode, and book-scope selection.
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

- Start with the full round-table establishing view.
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
- Return to the full table for Alex's spoken summary.
- Preserve the full transcript and generate the recap after the reading delay.

## Interface architecture

### Conversation stage

- **Establishing state:** compact round table with all five seats.
- **Focused state:** large active portrait, optional target portrait, speaker
  nameplate, and a visual-novel-style dialogue box.
- **Debate state:** two portraits face inward; active and target roles are clear.
- **User-response state:** keep the opponent portrait and full challenged line
  visible while the user writes.
- Use generated portraits when available and fall back to colored initials.

### Recent conversation dock

- Fixed-height, internally scrollable history in a desktop right rail, returning
  beneath the stage on narrower screens.
- Keep the user response/playback card in the same rail so it never covers the
  challenged line or active portrait on wide screens.
- Auto-scroll to the newest turn only when the user is already near the bottom.
- Scrolling upward temporarily pauses automatic playback.
- Returning to the bottom resumes only a dock-caused pause.
- Full transcript drawer remains available for review, copy, and evaluation.

### Playback state

Track pause reason explicitly:

```ts
type PlaybackPauseReason = "manual" | "transcript" | "history" | "hidden" | null;
```

- Closing the transcript resumes a `transcript` pause.
- Returning to the visible tab resumes a `hidden` pause.
- Returning the history dock to its bottom resumes a `history` pause.
- A `manual` pause never resumes without an explicit user action.

## Portrait assets

- Produce nine consistent illustrated bust portraits: Alex plus eight readers.
- One asset must work as both a circular face crop and a larger bust.
- Keep a unified medium, lighting direction, crop, and warm-library palette.
- Do not imitate or reuse any specific commercial game character or visual style.
- The user remains a neutral silhouette in MVP.
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
- Playback tests:
  - transient pauses resume from their remaining delay;
  - manual pauses never auto-resume.
- Mock evaluations:
  - join route, observer route, immediate-wrap route;
  - varied persona-derived atmosphere baselines and user-language changes;
  - no book-specific hardcoding.
- Run one paid live session only after all mock and structural checks pass.

## Delivery slices

1. Spec, types, and deterministic engine loop.
2. Prompt behavior and mock simulation.
3. Pause-reason fix and challenged-line context.
4. Focused conversation stage and recent-history dock.
5. Portrait generation and integration.
6. Full verification, browser QA, one final live smoke test with user approval.
