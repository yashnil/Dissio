-- Pass 25 — Phase 8E: turn-based crossfire follow-up questions.
--
-- follow_up_to links a follow-up CrossfireExchange back to the exchange it
-- pressed on, giving the follow-up endpoint an exact, unambiguous idempotency
-- key (instead of matching on sequence/target/side heuristics). Plain nullable
-- column, no foreign key, so it never complicates the existing round-deletion
-- cascade (which deletes all round_crossfire_exchanges for a round in one
-- statement regardless of self-references).

alter table round_crossfire_exchanges
  add column if not exists follow_up_to uuid;

create index if not exists idx_round_crossfire_follow_up_to
  on round_crossfire_exchanges(follow_up_to)
  where follow_up_to is not null;
