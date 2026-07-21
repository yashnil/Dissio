-- Pass 24 — Phase 8D: crossfire consequences on the final ballot.
--
-- RoundDecision gains a crossfire_effects field: a bounded, explainable list
-- of concession/contradiction/evasion consequences derived from persisted
-- round_crossfire_exchanges diagnostics at decision-generation time. Defaults
-- to an empty array, so existing decision rows (and rounds with no crossfire)
-- load unchanged.

alter table round_decisions
  add column if not exists crossfire_effects jsonb not null default '[]';
