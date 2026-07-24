-- Pass 33 / Phase 10D bug-class sweep — round_finding_ratings had the same
-- missing-WITH-CHECK vulnerability Pass 32 fixed for round_coach_annotations,
-- except worse: no owner-fallback clause at all.
--
-- The Pass 17 policy was:
--   FOR ALL USING (rater_id = auth.uid())
-- With no WITH CHECK, Postgres reuses USING as the write-time check. Since
-- rater_id is entirely self-declared in the INSERT payload and round_id is
-- never verified against any real relationship, any authenticated user
-- could insert a rating row for ANY round_id at all, just by setting
-- rater_id to their own auth.uid() -- no round ownership or participation
-- required whatsoever. Found by extending the Phase 10D live RLS sweep
-- (backend/tests/test_pass31_round_content_rls.py) to this table.
--
-- Fix: read (USING) stays byte-for-byte identical -- rater_id = auth.uid()
-- only, exactly as before. Write (WITH CHECK) now additionally requires the
-- caller to be the round owner or a genuinely joined role='coach'
-- participant, mirroring rate_finding's Python tier
-- (_require_coach_or_owner_access) exactly -- the same pattern Pass 32
-- already established for round_coach_annotations.

drop policy if exists "finding_ratings_owner" on round_finding_ratings;

create policy "finding_ratings_owner"
  on round_finding_ratings for all
  using (rater_id = auth.uid())
  with check (
    rater_id = auth.uid()
    and (
      exists (
        select 1 from round_simulations rs
        where rs.id = round_id and rs.user_id = auth.uid()
      )
      or exists (
        select 1
        from round_rooms rr
        join round_room_participants rrp on rrp.room_id = rr.id
        where rr.round_id = round_finding_ratings.round_id
          and rrp.user_id = auth.uid()
          and rrp.role = 'coach'
          and rrp.status = 'joined'
      )
    )
  );

comment on policy "finding_ratings_owner" on round_finding_ratings is
  'Read: rater_id = self only (unchanged from Pass 17). '
  'Write: rater_id must equal the caller, AND the caller must be the round '
  'owner or a joined role=coach room participant (Phase 10D/Pass 33 fix -- '
  'closes a self-declared-rater_id write bypass with zero round-relationship '
  'check at all, found by the Phase 10D live RLS sweep).';
