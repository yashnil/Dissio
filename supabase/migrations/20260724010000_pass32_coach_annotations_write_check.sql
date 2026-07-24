-- Pass 32 / Phase 10D (live-test finding) — round_coach_annotations had no
-- WITH CHECK clause on its Pass 17 "coach_annotations_owner" FOR ALL policy.
--
-- Postgres reuses a FOR ALL policy's USING clause as the write-time CHECK
-- when no WITH CHECK is given. That USING clause was
--   coach_id = auth.uid() OR (round owner)
-- which is trivially satisfiable on INSERT: any authenticated user can set
-- coach_id to their own auth.uid() in the payload and the check passes,
-- regardless of whether they have any relationship to the round at all.
-- Found live by backend/tests/test_pass31_round_content_rls.py's
-- test_joined_non_coach_participant_cannot_write, which expected a 403/404
-- and got a 201.
--
-- Fix: split the implicit write-check from the read-check. READ access is
-- left byte-for-byte identical (still coach_id = auth.uid() OR round owner
-- -- Pass 31 already added a broader, correct participant-aware SELECT
-- policy alongside this one, so nothing regresses there). WRITE access now
-- requires coach_id to actually equal the caller AND the caller to be
-- either the round owner or a genuinely joined, role='coach' participant
-- of the room wrapping that round -- mirroring the Python
-- _require_coach_or_owner_access tier exactly.

drop policy if exists "coach_annotations_owner" on round_coach_annotations;

create policy "coach_annotations_owner"
  on round_coach_annotations for all
  using (
    coach_id = auth.uid()
    or exists (
      select 1 from round_simulations rs
      where rs.id = round_id and rs.user_id = auth.uid()
    )
  )
  with check (
    coach_id = auth.uid()
    and (
      exists (
        select 1 from round_simulations rs
        where rs.id = round_id and rs.user_id = auth.uid()
      )
      or exists (
        select 1
        from round_rooms rr
        join round_room_participants rrp on rrp.room_id = rr.id
        where rr.round_id = round_coach_annotations.round_id
          and rrp.user_id = auth.uid()
          and rrp.role = 'coach'
          and rrp.status = 'joined'
      )
    )
  );

comment on policy "coach_annotations_owner" on round_coach_annotations is
  'Read: coach_id = self OR round owner (unchanged from Pass 17). '
  'Write: coach_id must equal the caller, AND the caller must be the round '
  'owner or a joined role=coach room participant (Phase 10D/Pass 32 fix -- '
  'closes a self-declared-coach_id write bypass found by a live RLS test).';
