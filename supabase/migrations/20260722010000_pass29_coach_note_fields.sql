-- Pass 29 / Phase 9F — Coach Review Mode and shared room notes.
--
-- Additive-only: two nullable columns on the existing round_coach_annotations
-- table (Pass 17), which is already round-scoped and therefore already
-- room-safe (a room wraps exactly one round). No new table needed; every
-- existing row and every existing caller that omits these fields is
-- unaffected.

ALTER TABLE round_coach_annotations
    ADD COLUMN IF NOT EXISTS phase TEXT,
    ADD COLUMN IF NOT EXISTS note_type TEXT CHECK (
        note_type IS NULL OR note_type IN ('general', 'flow', 'crossfire', 'drill', 'ballot')
    );
