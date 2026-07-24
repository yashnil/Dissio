-- Pass 31 / Phase 10D — Participant-aware SELECT access for round-content
-- tables, closing the gap identified in docs/REALTIME_AUTHORIZATION_PHASE10C.md.
--
-- Every existing SELECT/ALL policy on these tables is left completely
-- untouched. This migration only ADDS new, narrowly-scoped SELECT policies
-- alongside them -- Postgres OR's multiple policies of the same command
-- together, so this can only ever grant additional read access, never
-- remove any. No INSERT/UPDATE/DELETE policy is added anywhere; those
-- remain exactly as restrictive as before (owner-only, coach-only, or
-- service_role-only, per table). Writes stay backend-mediated.
--
-- Mirrors Pass 27's current_user_is_round_room_participant() pattern
-- exactly (SECURITY DEFINER, empty search_path, REVOKE FROM PUBLIC,
-- GRANT to authenticated only) to avoid the same self-referencing-policy
-- recursion class of bug already fixed once for team_members.
--
-- Scope: the crossfire-adjacent tables a joined participant already reads
-- through the Python API today (_load_round_access's owner-or-joined-any-
-- role tier): round_simulations, round_speeches, round_crossfire_exchanges,
-- round_arguments, round_decisions, round_drills, round_drill_attempts,
-- round_coach_annotations. Deliberately NOT touched in this pass:
-- round_evidence_uses, round_legality_checks, round_flow_events,
-- opponent_round_plans, round_adaptation_reviews, round_replay_markers,
-- round_finding_ratings, round_strategic_memory, round_quality_reports --
-- all real candidates for the identical fix later, just not needed for the
-- crossfire-readiness/realtime-prep motivation of this phase. Also NOT
-- touched: round_rooms / round_room_participants (Pass 27) -- already
-- correct, confirmed by direct migration read in the Phase 10C audit.

create or replace function public.current_user_can_read_round(rid uuid)
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.round_simulations rs
    where rs.id = rid and rs.user_id = auth.uid()
  ) or exists (
    select 1
    from public.round_rooms rr
    join public.round_room_participants rrp on rrp.room_id = rr.id
    where rr.round_id = rid
      and rrp.user_id = auth.uid()
      and rrp.status = 'joined'
  );
$$;

revoke all on function public.current_user_can_read_round(uuid) from public;
grant execute on function public.current_user_can_read_round(uuid) to authenticated;

comment on function public.current_user_can_read_round(uuid) is
  'Phase 10D: true iff auth.uid() is the round owner, or a joined participant '
  'of the room wrapping this round (regardless of the room''s open/closed '
  'status -- reads stay available after close, matching Phase 9E policy; '
  'left/invited participants are excluded, matching the Python read tier).';

create policy "round_simulations_select_room_participant"
  on round_simulations for select
  using (public.current_user_can_read_round(id));

create policy "round_speeches_select_room_participant"
  on round_speeches for select
  using (public.current_user_can_read_round(round_id));

create policy "round_crossfire_exchanges_select_room_participant"
  on round_crossfire_exchanges for select
  using (public.current_user_can_read_round(round_id));

create policy "round_arguments_select_room_participant"
  on round_arguments for select
  using (public.current_user_can_read_round(round_id));

create policy "round_decisions_select_room_participant"
  on round_decisions for select
  using (public.current_user_can_read_round(round_id));

create policy "round_drills_select_room_participant"
  on round_drills for select
  using (public.current_user_can_read_round(round_id));

create policy "round_drill_attempts_select_room_participant"
  on round_drill_attempts for select
  using (public.current_user_can_read_round(round_id));

create policy "round_coach_annotations_select_room_participant"
  on round_coach_annotations for select
  using (public.current_user_can_read_round(round_id));
