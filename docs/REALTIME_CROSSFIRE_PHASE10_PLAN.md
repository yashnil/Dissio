# Realtime Crossfire — Phase 10A Audit and Phase 10B Plan

## Status

Phase 10A (this doc): architecture audit and plan. No realtime infrastructure exists yet and none was added in this pass.

## Current async crossfire architecture

```
crossfire_simulator.py
  ├── generate_crossfire_question()   — AI asks (targets a live/extended/introduced argument)
  ├── generate_followup_question()    — AI presses an evasive answer
  ├── generate_ai_answer()            — AI answers a student-initiated question
  └── process_crossfire_response()    — classifies a student answer (concession/contradiction/evasion)
```

Request flow (`round_simulations.py`): `GET /{id}/crossfire/question` → `POST /{id}/crossfire/answer` → `POST /{id}/crossfire/student-question` → `POST /{id}/crossfire/follow-up`. All four are plain HTTP request/response — the frontend (`CrossfireCapture.tsx`) polls-on-demand (fetch on mount, fetch after each submit) with **no interval polling and no subscriptions of any kind**. `round_crossfire_exchanges` is the only crossfire table; there is no session/turn table.

**Important scoping finding:** the AI is always the opponent. `RoundSimulationConfig.student_side` is a single side; multiplayer rooms let several humans share that *one* side as partners (`debater_a`/`debater_b`, split by `speaker_slot`) — there is no human-vs-human opposing-side crossfire anywhere in the current model. So "realtime crossfire" for Phase 10 can only mean making the existing human⇄AI exchange feel synchronized *across partnered humans on the same side*, not a new opponent protocol. Audio, human-vs-human sides, and live transcription are out of scope not just by instruction but because nothing in the data model supports them yet.

**Existing race condition (found, not fixed — out of scope for this pass):** `submit_crossfire_answer` (`round_simulations.py:1172`) does `unanswered = [... not e.answer]` then updates `unanswered[-1]` with no lock/idempotency key. If `debater_a` and `debater_b` (same side) both answer the same pending AI question concurrently, the second write silently overwrites the first — both requests return 200. This is real, pre-existing, and exactly what a "ready state / who's answering" indicator would help a team avoid in practice, without needing a backend fix in this pass.

## Current multiplayer/permission architecture relevant to realtime

- `round_rooms` / `round_room_participants` (`round_room_service.py`): role (`owner|debater_a|debater_b|coach|observer`), side, `speaker_slot`, `status` (`invited|joined|left`). No ready/presence concept exists.
- Permission tiers live entirely in Python (`round_simulations.py`): `_load_round_access` (read: owner or joined, any role), `_require_turn_access` (crossfire submit: joined, non-observer/coach, matching side), `_require_general_mutate_access`, `_require_room_not_closed`. The Supabase client used here is **service-role** and bypasses RLS — RLS is not the enforcement layer for any of this.
- `TurnContext` (already on `RoundRoomStateResponse`) is the existing backend-computed "can I act right now, and why not" result the frontend already consumes instead of re-deriving turn logic client-side. Any realtime "whose turn" indicator should extend this, not replace it.

## Critical finding: RLS is stale for the multiplayer model

`docs/ROUND_SIMULATION_PERMISSIONS.md` (Pass 16, pre-multiplayer) shows every round table's RLS policy is `auth.uid() = user_id` — i.e. **only the round's original owner**, full stop. It was never updated for the Phase 9A+ participant model. Practically:

- A `postgres_changes` Realtime subscription on `round_crossfire_exchanges` (or any round table) using the frontend's anon-key client would **silently fail to deliver rows to anyone except the round owner** — debater_b, coach, and observer would get nothing, even though the Python API already correctly grants them read access.
- This is not a bypass today (it under-delivers, it doesn't over-deliver), but it means direct Postgres realtime is not viable for multiplayer rooms without a deliberate RLS rewrite mirroring `_load_round_access`'s owner-or-joined-any-role tier — a nontrivial, security-sensitive change that does not belong in a "smallest safe foundation" pass.
- `@supabase/supabase-js` (already a dependency via `@supabase/ssr`) includes realtime, Presence, and Broadcast — no new package would be needed if/when this is tackled. But doing it without matching RLS (or without Realtime Authorization channel policies scoped to room membership) would be exactly the kind of permission bypass the hard constraints forbid.

**Recommendation: do not wire any `postgres_changes`/Presence/Broadcast channel in Phase 10B.** Keep the backend HTTP API as the sole source of truth, exactly as `DISSIO_PRODUCT_DIRECTION_AND_EXECUTION_PLAN.md` §10.7 already prescribes for the analysis pipeline ("keep server state authoritative... no duplicate polling loops"). Revisit Supabase Realtime only after a dedicated RLS/Realtime-Authorization design pass — record that as its own decision-log entry (§28 of the roadmap doc) before ever subscribing to a channel.

## Recommended realtime definition for Phase 10 (v1)

Not audio, not a new AI protocol, not human-vs-human. Concretely:

1. **Participant ready state** — a partnered debater signals "I'm about to answer" so the other partner doesn't also submit (directly mitigates the race condition above).
2. **Synchronized pending-question visibility** — both partners see the same "AI is asking X" state promptly, via short-interval polling of the room, not a push subscription.
3. **Lightweight timer display** — reuse the existing `crossfire_time` config value client-side for a visual countdown; server remains authoritative on whether the phase can still be advanced (no new backend timer logic needed).
4. Presence/"who's currently viewing" is a stretch goal for a *later* phase once Realtime Authorization is designed — not attempted here.

## Explicitly deferred (not Phase 10B)

- Audio, WebRTC, LiveKit, voice activity detection, interruption handling.
- Live/streaming transcription.
- Human-vs-human opposing sides (unsupported by the data model — would require a much larger redesign than "foundation").
- Coach live moderation (coaches remain read-only per Phase 9F/9G's Coach Review Mode; nothing here changes that).
- Actual Supabase Realtime channel subscriptions (see RLS finding above) — polling only for 10B.

## Proposed schema/API plan for Phase 10B (not implemented in 10A)

Additive only, no new tables needed yet:

- `round_room_participants.is_ready: boolean default false` — cleared on each new crossfire question, set by the participant, readable by the whole room, writable only by the participant themselves (or the owner). Reuses the existing table; no new migration risk beyond one nullable-with-default column.
- No `round_crossfire_sessions` / `live_crossfire_events` table yet — the existing `round_crossfire_exchanges` row plus `TurnContext` already answers "what's the pending question" and "can this viewer act"; a session table would be premature until a real need (e.g. `expires_at` for a server-enforced answer window) is confirmed necessary.
- New endpoint: `POST /round-simulations/rooms/{room_id}/crossfire/ready` — body `{ready: bool}`, permission tier = `_require_turn_access`-equivalent (joined, matching side, non-observer/coach), gated by `_require_room_not_closed`. Returns the updated participant row. Read side: ready state already flows through the existing `GET /rooms/{room_id}` → `RoundRoomStateResponse.participants`, no new read endpoint needed.

## Proposed frontend plan for Phase 10B

New state in `page.tsx` (multiplayer-only, mirroring the existing `coachNoteCount`/`reviewContext` pattern):
- `connectionState`: `"polling" | "stale" | "error"` — truthful, never fakes "live."
- `isReady: boolean` + `partnerReady: boolean` (derived from `participants` already in state).
- Existing `roundState.active_crossfire` / `turnContext` remain the pending-question/can-act source of truth — no duplication.
- A short-interval `refreshRoom` poll (only while `mode === "multiplayer"` and phase is a crossfire phase) replaces manual-refresh-only, with backoff and a visible "last updated" indicator — matching the roadmap's own polling requirements (stop when terminal, resume after refresh, respect rate limits).

New pure helpers in `roomModel.ts` (same no-RTL, pure-function convention as every prior phase):
- `crossfireReadyLabel(isReady, partnerReady): string` — human copy, e.g. "Waiting for your partner" / "Both ready."
- `connectionStateLabel(state): string` — honest fallback copy, never implies realtime when polling.
- No raw IDs in any of these, matching every prior phase's constraint.

## Permission/security risks

- Ready-state writes must reuse `_require_turn_access` exactly — never a looser check, or a coach/observer could falsely signal readiness.
- Closed rooms must reject ready-state changes (`_require_room_not_closed`), matching every other mutate endpoint.
- Left participants (`status != "joined"`) must be rejected, matching the existing tier.
- Do not let ready-state broaden who can submit an answer — it is advisory UI, not a new permission gate.

## Fallback strategy

Polling *is* the primary transport for 10B, not a fallback — this sidesteps the RLS gap entirely and requires zero new security design. If a future phase adds real Supabase Realtime, polling remains the fallback when a channel subscription fails or the RLS/Authorization design isn't ready for a given table yet.

## Tests needed for Phase 10B

Backend (`test_round_rooms.py`, matching existing class-per-tier convention):
- Joined debater on the matching side can set ready state; observer/coach cannot.
- Closed room rejects a ready-state change.
- Left participant rejected.
- Non-member rejected.
- Ready state resets correctly when a new question is generated (if that reset lives server-side).

Frontend (`roomModel.test.ts`):
- `crossfireReadyLabel` for all four combinations (neither/self/partner/both ready).
- `connectionStateLabel` for each state, asserting it never claims "live" while polling.
- No-raw-IDs check on both new helpers.

## Recommended exact Phase 10B implementation prompt

```text
Read docs/REALTIME_CROSSFIRE_PHASE10_PLAN.md.

Implement only the "Proposed schema/API plan" and "Proposed frontend plan"
sections: a is_ready column on round_room_participants, one new
POST /rooms/{room_id}/crossfire/ready endpoint reusing _require_turn_access,
and the two new roomModel.ts helpers plus page.tsx polling-state wiring.

Do NOT add any Supabase Realtime channel, Presence, or Broadcast usage --
that requires its own RLS/Realtime Authorization design pass first.
Do NOT touch crossfire_simulator.py's question/answer generation logic.
Do NOT add human-vs-human opposing sides.

Required tests: see "Tests needed for Phase 10B" in the plan doc.
```
