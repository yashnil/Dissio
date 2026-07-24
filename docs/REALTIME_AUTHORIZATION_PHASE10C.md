# Realtime Authorization — Phase 10C Audit

## Status

10C itself was audit/planning only — no migrations, code, or Realtime channels were added in that pass. **Phase 10D has since implemented the §3/§9 RLS fix** (`20260724000000_pass31_round_content_participant_rls.sql` + `backend/tests/test_pass31_round_content_rls.py`). No Realtime channel, Broadcast, or Presence usage was added — that remains deferred exactly as recommended below. See `docs/ROUND_SIMULATION_PERMISSIONS.md`'s "Update — Phase 9 / Phase 10D" section for the current, accurate policy summary.

Everything in the original audit below was verified by direct read of every `supabase/migrations/*.sql` file touching a `round_*` table (not by re-trusting `docs/ROUND_SIMULATION_PERMISSIONS.md`, which turned out to be *slightly* incomplete — see the correction below).

## Correction to the 10A/10B docs

10A said "RLS is stale for the multiplayer model," full stop. That's true for the **round-content** tables, but **not** for `round_rooms`/`round_room_participants` themselves (Phase 9A, `20260721050000_pass27_round_rooms.sql`) — those two already have real participant-aware RLS via a `SECURITY DEFINER` helper. The gap is narrower and more specific than 10A implied: the room/participant *shell* is fine; the round *content* tables underneath it were never updated to know rooms exist.

## 1. Tables with RLS keyed only on `round_simulations.user_id`

Verified by direct read of the `CREATE POLICY` statements in each migration:

| Table | Migration | Policy |
|---|---|---|
| `round_simulations` | pass16 | `auth.uid() = user_id` |
| `round_participants` | pass16 | owner-only via `EXISTS (... rs.user_id = auth.uid())` |
| `round_speeches` | pass16 | same pattern |
| `round_crossfire_exchanges` | pass16 | same pattern |
| `round_arguments` | pass16 | same pattern |
| `round_flow_events` | pass16 | same pattern |
| `round_evidence_uses` | pass16 | same pattern |
| `round_decisions` | pass16 | same pattern |
| `round_drills` | pass16 | same pattern |
| `opponent_round_plans` | pass16 | same pattern |
| `round_adaptation_reviews` | pass16 | same pattern |
| `round_legality_checks` | pass16.1 | same pattern |
| `round_strategic_memory` / `round_replay_markers` / `round_quality_reports` | pass17 | same pattern |
| `round_drill_attempts` | pass26 | same pattern |
| `round_coach_annotations` | pass17 | `coach_id = auth.uid() OR round owner` — closer, but still not room-aware; a non-owner, non-coach **debater** (who Python's 9F tier explicitly lets read notes) is blocked by RLS |
| `round_finding_ratings` | pass17 | `rater_id = auth.uid()` only — narrowest of all |

**Not in this bucket** — `round_rooms` and `round_room_participants` (pass27) already use `current_user_is_round_room_participant(rid)`, a `SECURITY DEFINER` function checking membership existence for `auth.uid()`, `OR`'d with owner. Also notable: **`round_room_participants` has no `INSERT`/`UPDATE`/`DELETE` policy for `authenticated` at all** — only `service_role` can write it. Every mutation (role/side assignment, leave, 10B's ready-state) is already forced through the Python API by RLS itself, with no separate design work needed there.

## 2. Participant-aware rules enforced only in Python

- Role distinctions (debater vs coach vs observer) for round-content reads — RLS on content tables doesn't know rooms exist at all, so it can't distinguish roles either.
- Turn access (side/speaker-slot matching), closed-room mutation blocking, left-participant rejection, and 10B's crossfire-readiness gating — all Python business logic (`_require_turn_access`, `_require_room_not_closed`, `_participant_turn_state`) with no RLS equivalent, and none should be *moved* into RLS (see §8).
- One asymmetry worth flagging: `current_user_is_round_room_participant` doesn't filter by `status = 'joined'` — an **invited** or **left** participant still passes this check today. That's broader than Python's read tier (`_load_round_access` requires `status == "joined"`), but low-risk (it only affects reading room/participant *metadata* rows, not round content) — noted for completeness, not treated as urgent.

## 3. What participant-aware RLS would need, table by table

A single new `SECURITY DEFINER` helper, mirroring `current_user_is_round_room_participant`'s pattern exactly, added once and reused everywhere:

```sql
create or replace function public.current_user_can_read_round(rid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.round_simulations rs
    where rs.id = rid and rs.user_id = auth.uid()
  ) or exists (
    select 1 from public.round_rooms rr
    join public.round_room_participants rrp on rrp.room_id = rr.id
    where rr.round_id = rid and rrp.user_id = auth.uid() and rrp.status = 'joined'
  );
$$;
```

- **`round_rooms` / `round_room_participants`**: no change needed (already correct; see §1).
- **`round_crossfire_exchanges`**: add `OR public.current_user_can_read_round(round_id)` to the existing SELECT policy — this is the one table that actually matters for push-based crossfire.
- **`round_speeches`**, **`round_decisions`**, **`round_drills`**, **`round_drill_attempts`**: same additive `OR` clause — matches what the Python API (`_load_round_access`) already grants; RLS would just stop under-delivering relative to it.
- **`round_coach_annotations`**: same additive `OR` clause alongside the existing `coach_id = auth.uid() OR owner` clause — brings RLS in line with 9F's actual product decision (any joined participant, any role, can read notes).
- Every addition here is **purely additive** (`OR`'d onto an existing policy) — nothing is narrowed, so this can never make Python-authorized access newly fail.

## 4. Tables needed for push-based crossfire specifically

Minimal set: `round_crossfire_exchanges` (the actual content), `round_room_participants` (readiness), `round_rooms` (status/closed), `round_simulations` (current_phase, so a client knows when to stop caring about crossfire at all). Everything else (speeches, decisions, drills, notes) changes far less often and has no latency-sensitive product need — leave those on HTTP regardless of what happens to crossfire.

## 5. Can Postgres Changes safely use participant-aware RLS?

Yes, *if* §3's policies are added and the client subscribes with its authenticated session (not anon-only). But there's a real **operational** risk independent of security: Postgres Changes evaluates its table's RLS policy per row-change, per subscriber. A multi-hop `SECURITY DEFINER` join (round → room → participants) evaluated on every crossfire exchange update, for every connected client, is a real (if likely small-scale-acceptable) cost that Supabase's own guidance advises keeping simple. Worth a load-check before committing, not just a security review.

## 6. Would Broadcast/Presence private channels be safer?

Yes — architecturally simpler and a better fit for this codebase specifically. Channel-join authorization is checked **once per join** (via Realtime Authorization, a policy on a `realtime.messages` proxy), not per-message. Critically, it lets the **backend remain the only writer**: after an already-permission-checked Python endpoint succeeds, it broadcasts a small "something changed, refetch" signal — no round content ever needs to flow through the channel itself, and no content-table RLS needs to be perfectly correct for the transport to be safe (though §3's fixes remain worth doing anyway, for direct-API/defense-in-depth reasons independent of realtime).

## 7. Risk of using room IDs or invite codes as channel names

Room `id` (UUID): fine as a channel name — not guessable, and (critically) the channel's *authorization check* is what actually gates access, not the name's secrecy. **Invite codes must never be used as a channel identifier**: they're deliberately short, human-typeable, and *designed* to be shared out-of-band (verbally, texted) and rotated (9E). Using one as a durable channel name conflates "join credential" with "resource identifier" — a rotated code wouldn't necessarily rotate the channel unless explicitly coordinated, and the small keyspace makes it a weaker identifier than a UUID regardless of any authorization check layered on top. Always key channels by `room_id`.

## 8. What stays HTTP-only even after realtime is added

All writes: crossfire answer/question/follow-up, readiness toggle, phase advancement, room lifecycle (close/leave/rotate), coach notes, drill attempts. Anything requiring the existing Python business logic (turn access, side/slot matching, closed-room checks) — that logic is not RLS-expressible and must not be reimplemented as one. This mirrors the hard constraint repeated across every phase so far: the backend remains authoritative, full stop.

## 9. Smallest safe Phase 10D slice

**Not a realtime channel yet.** The smallest safe next step is the RLS fix in isolation, with zero transport changes: add `current_user_can_read_round` and the additive `OR` clauses from §3, and *prove* they work with real Postgres RLS evaluation — which today's test suite cannot do at all (every existing round test mocks the service-role client and never touches RLS). That's a real gap: this phase's recommendation depends on RLS behavior no automated test currently verifies. 10D's job is to close the schema gap **and** stand up the first real RLS-verifying test for this codebase before anyone builds a channel on top of it.

## Option comparison

| | A: Keep polling | B: Postgres Changes + RLS | C: Broadcast (backend-mediated) | D: Backend event relay (SSE) |
|---|---|---|---|---|
| **Security model** | Unchanged — Python only | Two enforcement layers (RLS + Python); drift risk (how we got here) | Channel-join auth only, once per join; backend is sole writer | Reuses Python auth exactly; no new authorization model |
| **Schema changes** | None | New helper fn + additive policies on ~6 tables + publication config | None to content tables; one channel-authorization policy | None |
| **Frontend changes** | None | Subscribe with authenticated client; real reconnect/backoff | Subscribe to `room:{id}`; on message, refetch via existing HTTP | Replace polling with `EventSource`; browser auto-reconnects |
| **Backend changes** | None | None for writes; ongoing burden to keep RLS in sync with every future Python permission change | Best-effort broadcast call after existing mutations succeed (same pattern as XP/mastery side-effects) | New in-process/Redis pub-sub + streaming endpoint; connection-lifecycle handling |
| **Test strategy** | Existing 10B tests suffice | Needs real Postgres/RLS integration tests — infra that doesn't exist yet | Mock the broadcast call like `track_product_event`; existing patterns suffice | Standard endpoint tests; concurrency/lifecycle testing is the hard part |
| **Risk level** | Lowest | Medium-high (new security surface + new test infra + ongoing drift risk) | Low-medium (smallest new surface; keeps Python as sole logic owner) | Medium (no new auth risk, but real infra/ops risk; most implementation work) |
| **Recommendation** | Keep as the active transport now | Only if a future need demands many tables pushing at once | The right next step **if/when** push becomes a real product priority | Fallback only if B/C prove infeasible |

## Recommended path

1. **Now**: stay on Option A (10B's polling). It works, ships, and needs nothing further.
2. ~~**Phase 10D**~~ **Done**: the RLS-only fix from §3/§9, plus a new RLS-verifying test file (`test_pass31_round_content_rls.py`, both a static migration-text suite that always runs and a live suite gated on Dissio's own local Supabase stack — see that file's own notes on why the live suite skips cleanly rather than failing when a *different* project's local stack happens to be occupying the same default port). No subscription code was added.
3. **Phase 10E** (only if a real product need emerges): Option C (Broadcast, backend-mediated, notify-then-refetch), built on top of 10D's RLS work for defense-in-depth — not Option B, given its higher ongoing drift/operational risk for no clear benefit at Dissio's current scale.

## Explicitly deferred scope

WebRTC, LiveKit, audio/video, live transcription, human-vs-human opposing sides, faked presence, any weakening of existing Python permission checks, any change to 10B's polling behavior.

## Phase 10D implementation prompt

**Fulfilled**, with two corrections found during implementation (both discovered by checking actual Python behavior, not by guessing): `round_arguments` and `round_simulations` itself were added to the table list below — both are read via `_load_round_access`'s owner-or-joined-any-role tier exactly like the other six (`get_round_flow` reads `round_arguments`; `get_round_state`/every endpoint reads `round_simulations` directly), so omitting them would have left the same class of gap unfixed for two more tables. Final list: `round_simulations`, `round_speeches`, `round_crossfire_exchanges`, `round_arguments`, `round_decisions`, `round_drills`, `round_drill_attempts`, `round_coach_annotations` (8 tables, not 6).

```text
Read docs/REALTIME_AUTHORIZATION_PHASE10C.md.

Implement only the RLS fix from section 3/9: add the
current_user_can_read_round(rid) SECURITY DEFINER helper, and add an
additive `OR public.current_user_can_read_round(round_id)` clause to the
existing SELECT policies on round_crossfire_exchanges, round_speeches,
round_decisions, round_drills, round_drill_attempts, and
round_coach_annotations. Every change must be additive (OR'd onto the
existing policy) -- never remove or narrow an existing clause.

Do NOT add any Realtime channel, Postgres Changes subscription, Broadcast,
or Presence usage. Do NOT touch round_rooms/round_room_participants (already
correct). Do NOT change any Python permission-tier code.

Required: since no existing test verifies real RLS evaluation, add the
first RLS-verifying integration test for this codebase (a real or
locally-run Postgres instance evaluating the new policies directly,
independent of the service-role-mocked unit tests already in
test_round_rooms.py) proving a joined non-owner participant can now read
crossfire exchanges/speeches/decisions/drills/attempts/notes via RLS
directly, and a non-member still cannot.
```

## Verification

This was an audit/planning pass — no code, migrations, or dependencies changed.
```
git diff --check
git status --short
```
