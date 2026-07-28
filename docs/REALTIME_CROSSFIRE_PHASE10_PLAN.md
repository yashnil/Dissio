# Realtime Crossfire — Phase 10A Audit and Phase 10B Plan

## Status

Phase 10A (this doc): architecture audit and plan. No realtime infrastructure exists yet and none was added in this pass.

**Phase 10E is now implemented** — backend-mediated Broadcast notify-then-refetch, built on top of Phase 10D's RLS work exactly as `docs/REALTIME_AUTHORIZATION_PHASE10C.md`'s "Recommended path" §3 (Option C) called for. See the "Phase 10E — Broadcast notify-then-refetch" section near the end of this doc for the full capability audit, channel/payload design, and implementation summary. 10B's polling (below) is unchanged and remains the transport of record; Broadcast only augments it.

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

## Phase 10E — Broadcast notify-then-refetch (implemented)

Builds on 10D's RLS work and follows `docs/REALTIME_AUTHORIZATION_PHASE10C.md`'s
own recommended path (Option C: backend-mediated Broadcast). Backend HTTP
remains the sole source of truth throughout -- Broadcast is a best-effort
"something changed, refetch" nudge, never client-trusted state, and never a
new authorization surface. 10B's polling is unchanged and stays the
transport of record; this is additive.

### 1. Capability audit

- **Frontend Realtime client**: already available with zero new
  dependencies -- `@supabase/supabase-js` (`^2.106.1`) is a direct
  `package.json` dependency (not just transitive via `@supabase/ssr`), and
  its `channel()`/`.on("broadcast", ...)`/`.subscribe()`/`removeChannel()`
  API supports private channels out of the box.
- **Backend emission**: the installed Python `realtime` package (`2.30.0`)
  turned out to be a dead end for a synchronous FastAPI handler --
  `realtime._sync.channel.SyncRealtimeChannel` is an empty stub (no send
  method at all; verified by reading the installed package source), and the
  async channel's `send_broadcast` only works over an already-`subscribe()`d
  websocket, which doesn't fit a stateless per-request handler. Instead,
  Supabase Realtime's REST broadcast endpoint
  (`POST {SUPABASE_URL}/realtime/v1/api/broadcast`) works directly with the
  service-role key as a plain, short-lived HTTP POST -- verified with a real
  request against Dissio's local self-hosted Realtime server (`202
  Accepted`). No new dependency: `httpx` is already used for outbound HTTP
  elsewhere in `app/services` (`grobid_extraction.py`, `web_article_extraction.py`).
- **Auth tokens for private channels**: yes -- the frontend's
  `createClient()` (`@supabase/ssr`) already carries the user's session,
  which the Realtime client uses automatically when joining a `private:
  true` channel.
- **Are private channels configured/usable?** Not until this pass --
  `realtime.messages` had RLS enabled with **zero policies** (verified via
  direct query against the local stack: any `SELECT`, even as the `postgres`
  superuser's own probe under a simulated `authenticated` session, returned
  0 rows), meaning private-channel joins were effectively all-deny. Pass 34
  (below) adds the first policy.
- **Safe without new dependencies?** Yes to both ends -- no new Python or
  JS package was added.

### 2. Channel and payload model

- **Channel name**: `room:<room_id>` -- the room's UUID only, **never** the
  invite code, matching `docs/REALTIME_AUTHORIZATION_PHASE10C.md` §7
  exactly. Implemented identically (byte-for-byte) on both ends:
  `app/services/round_broadcast.py`'s `room_channel_topic()` and
  `frontend/src/lib/roomModel.ts`'s `roomBroadcastChannelTopic()`.
- **Payload**: `{event_type, ts, phase?}` only -- no speech/answer/evidence/
  note text, no participant identity, no raw round content of any kind.
  `event_type` is drawn from a 7-value allowlist mirrored on both ends
  (`SAFE_BROADCAST_EVENT_TYPES` in Python, `isSafeBroadcastEventType` in
  TS): `crossfire_ready_changed`, `crossfire_answer_submitted`,
  `crossfire_question_submitted`, `crossfire_followup_requested`,
  `phase_advanced`, `room_closed`, `participant_updated`. `phase` (a
  `RoundPhaseType` enum value, e.g. `"first_crossfire"`) is included only
  where relevant -- it's workflow structure already visible to every joined
  participant via the existing HTTP API, not private content.
- **Client response is always**: receive event → (debounced 400ms) →
  `refreshRoom()`. The payload's contents are never read as state; the
  frontend subscription (`roomRealtime.ts`) doesn't even pass the payload
  object to its `onNotify` callback.

### 3. Channel-join authorization (Pass 34)

Even though the payload carries no exploitable content, relying on
room-UUID obscurity alone contradicts `REALTIME_AUTHORIZATION_PHASE10C.md`
§7's own reasoning ("the channel's authorization check is what actually
gates access, not the name's secrecy"). Migration
`20260726000000_pass34_round_room_broadcast_authorization.sql` adds a
`SELECT`-only RLS policy on `realtime.messages`, scoped to
`topic like 'room:%'`, reusing the existing `current_user_is_round_room_participant`
helper (Pass 27) -- the exact same owner-or-participant tier as
`round_rooms_select_member`. Grants `SELECT` only: clients never need
`INSERT` (the backend's REST broadcast call bypasses RLS via the realtime
server's own internal role regardless). Verified live via a direct
`docker exec ... psql` probe (see `backend/tests/test_round_broadcast.py`):
a room owner sees a probe row inserted for their room's topic; a
non-member sees none. This is explicit defense-in-depth, not the primary
authorization boundary -- that remains the HTTP refetch every event
triggers.

### 4. Backend emission call sites

`app/services/round_broadcast.py`'s `emit_room_event(room_id, event_type,
phase=None)` is called, always *after* its mutation has already succeeded,
from 8 places in `round_simulations.py`: `set_crossfire_ready_endpoint`,
`submit_crossfire_answer`, `submit_student_crossfire_question`,
`request_crossfire_followup`, `advance_phase`, `close_room_endpoint`,
`leave_room_endpoint`, `update_room_participant_endpoint`. The four
crossfire/phase call sites are gated on `access.room` being present (solo
rounds have no room to notify, so they never emit at all). No read endpoint
emits. `emit_room_event` never raises -- an HTTP failure, timeout, or
missing config degrades to a logged warning, and the mutation's own return
value is completely unaffected (verified directly:
`test_mutation_succeeds_even_when_the_real_broadcast_http_call_raises`
patches `httpx.post` itself to raise, not the wrapper function).

### 5. Frontend subscription

`frontend/src/lib/roomRealtime.ts`'s `subscribeToRoomBroadcast(client,
roomId, {onNotify, onStateChange})` is a plain function (not a hook, to
stay testable without React Testing Library -- this repo's jest config runs
no DOM/React tests at all). Called from a `useEffect` in
`round-simulation/page.tsx`, gated by `shouldSubscribeToRoomBroadcast(mode
=== "multiplayer", room)` -- subscribes across the whole room lifecycle
(not just crossfire phases), cleans up on room change/unmount. Notify
events are debounced 400ms before triggering `refreshRoom()`, so a short
burst of events (e.g. a partner's answer plus a resulting phase check)
collapses into one refetch. Connection state
(`"connecting"|"connected"|"unavailable"`) is surfaced via
`realtimeSyncStatusLabel()` next to the existing capability banner in
`page.tsx`, showing one of exactly: "Realtime sync active", "Realtime
unavailable; polling backup active", or "Polling backup active" -- never
overclaiming "live" before Supabase itself reports `SUBSCRIBED`.

### 6. Polling fallback (unchanged)

10B's `CROSSFIRE_POLL_INTERVAL_MS` poll and `pollActive` gating are
untouched byte-for-byte. If the Broadcast subscription never connects (join
denied, network issue, browser without WebSocket support), polling still
covers crossfire phases exactly as before Phase 10E existed -- Broadcast is
strictly additive.

### 7. Known limitations

- Supabase Realtime's REST broadcast endpoint does not persist rows to
  `realtime.messages` in this self-hosted configuration (verified: a probe
  broadcast, even with `private: true` in the message, produced zero rows)
  -- there is no message-replay/history for a client that briefly
  disconnects. This is fine for a notify-only signal (a missed notify just
  means the next poll or user action catches the same state), but would
  matter if this channel were ever asked to carry more than a refetch hint.
- The RLS policy is tested at the SQL level (a direct psql probe simulating
  an authenticated session), not via a full end-to-end WebSocket handshake
  -- no browser/WebSocket test harness exists in this backend-only test
  suite. The policy itself is the actual security-relevant artifact
  Realtime Authorization consults at join time, so this is a faithful test
  of the real gate, just not the full transport.
- No dedicated frontend E2E test exercises a live two-browser Broadcast
  round-trip; `roomRealtime.test.ts` covers the subscription wrapper's
  logic against a mocked channel, and `workspaceShell.spec.ts` (run as part
  of this phase's verification) confirms the page still builds/renders
  correctly with the new subscription wired in.
