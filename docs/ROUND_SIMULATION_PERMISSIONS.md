# Round Simulation Permissions

## Update — Phase 9 / Phase 10D (read this first)

The sections below describe the **original, Pass-16, solo-only** model. Two things have since changed and this doc was never updated until now:

1. **Phase 9A** added `round_rooms` / `round_room_participants` for multiplayer rooms, each with their own correct, participant-aware RLS from day one (a `SECURITY DEFINER` helper, `current_user_is_round_room_participant(room_id)`) — not the owner-only pattern described below.
2. **Phase 10D** (`20260724000000_pass31_round_content_participant_rls.sql`) closed the gap this left: the *round-content* tables listed below (`round_simulations`, `round_speeches`, `round_crossfire_exchanges`, `round_arguments`, `round_decisions`, `round_drills`, `round_drill_attempts`, `round_coach_annotations`) each gained one new, **additive** SELECT policy using a new helper, `current_user_can_read_round(round_id)`:
   ```sql
   select exists (round owner) or exists (
     joined participant of the room wrapping this round_id
   )
   ```
   The pre-existing owner-only policy on each table is untouched — Postgres OR's same-command policies together, so this can only ever grant *more* SELECT access, never less. No table in this list gained an INSERT/UPDATE/DELETE policy for `authenticated` — every one of them still has none (or, for `round_simulations`/`round_coach_annotations`, still only the original owner/coach-scoped write policy). Writes remain backend-mediated; `_verify_owner()`/`_load_round_access()` remain the real, authoritative permission layer.

   **Not touched**: `round_evidence_uses`, `round_legality_checks`, `round_flow_events`, `opponent_round_plans`, `round_adaptation_reviews`, and every Pass 17 table (`round_finding_ratings`, `round_strategic_memory`, `round_replay_markers`, `round_quality_reports`) — still owner-only, deliberately deferred (see `docs/REALTIME_AUTHORIZATION_PHASE10C.md`).

The RLS/policy text quoted below is now historical for the tables Phase 10D touched — read it as "what owners always had," not "the complete picture."

## Row-Level Security

All 9 new tables have RLS enabled with two policies each:

```sql
-- Students can only access their own rounds
CREATE POLICY "user owns round" ON round_simulations
  FOR ALL USING (auth.uid() = user_id);

-- Service role bypass for background operations
CREATE POLICY "service_role bypass" ON round_simulations
  FOR ALL USING (auth.role() = 'service_role');
```

The same pattern applies to: `round_participants`, `round_speeches`, `round_crossfire_exchanges`, `round_arguments`, `round_flow_events`, `round_evidence_uses`, `round_decisions`, `round_drills`, `opponent_round_plans`, `round_adaptation_reviews`.

## API-Level Ownership Check

Every endpoint that operates on an existing round calls `_verify_owner()`:

```python
async def _verify_owner(round_id: str, user_id: str) -> dict:
    resp = supabase.table("round_simulations").select("*").eq("id", round_id).execute()
    if not resp.data:
        raise HTTPException(404)
    if resp.data[0]["user_id"] != user_id:
        raise HTTPException(403)
    return resp.data[0]
```

This is defense-in-depth: even if an RLS policy were misconfigured, the API layer independently blocks cross-user access.

## Card Ownership

Before building an opponent plan, `_fetch_approved_cards()` filters by `user_id == requesting_user_id`. A card owned by a different user is silently excluded, preventing card sharing even if its UUID is passed.

## Prep Gap Writes

`record_post_round_gaps()` only inserts gap records for the requesting user's `prep_plan_id`. It does not read or modify other users' prep plans.

## What Service Role Can Do

The service role bypass is only used for background operations initiated by the API handler itself (not user-initiated). The API handler has already performed ownership validation before any service-role call.
