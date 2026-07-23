-- Pass 30 / Phase 10B — Polling-based synchronized crossfire readiness.
--
-- Additive-only: two nullable/defaulted columns on the existing
-- round_room_participants table. Readiness is phase-scoped by construction
-- (is_ready is only meaningful when ready_phase matches the round's current
-- phase), so it never needs a reset write when the round advances -- stale
-- readiness from a prior crossfire phase simply stops matching on read.

ALTER TABLE round_room_participants
    ADD COLUMN IF NOT EXISTS is_ready BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS ready_phase TEXT CHECK (
        ready_phase IS NULL OR ready_phase IN ('first_crossfire', 'grand_crossfire', 'final_crossfire')
    );
