-- Pass 26 — Phase 8G: Full Round drill practice attempts.
--
-- round_drills already existed (Pass 16) but had no attempt/persistence path —
-- RoundDrillsView's "Practice" button was a disabled placeholder. This is a
-- new, small table scoped to round_drills/round_simulations, following the
-- same parallel-table convention as every other Full Round subsystem (never
-- reusing the generic speech-practice drills/drill_attempts tables, which are
-- keyed to speech_id and have their own ownership model).
--
-- Denormalizes round_id onto the attempt row (matching round_crossfire_exchanges)
-- so RLS and ownership queries never need to join through round_drills.

create table if not exists round_drill_attempts (
  id              uuid primary key default gen_random_uuid(),
  round_drill_id  uuid not null references round_drills(id) on delete cascade,
  round_id        uuid not null references round_simulations(id) on delete cascade,
  response_text   text not null,
  score           integer,
  feedback        jsonb,
  created_at      timestamptz not null default now()
);

create index if not exists idx_round_drill_attempts_drill on round_drill_attempts(round_drill_id);
create index if not exists idx_round_drill_attempts_round on round_drill_attempts(round_id);

alter table round_drill_attempts enable row level security;

create policy "Users see drill attempts for their rounds"
  on round_drill_attempts for select
  using (
    exists (
      select 1 from round_simulations rs
      where rs.id = round_drill_attempts.round_id and rs.user_id = auth.uid()
    )
  );

create policy "Service role can manage round drill attempts"
  on round_drill_attempts for all
  to service_role using (true) with check (true);
