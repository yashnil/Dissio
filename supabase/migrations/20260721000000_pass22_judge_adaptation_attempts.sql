-- Pass 22 — Judge Adaptation practice attempts (Phase 7D).
--
-- Persists a student's pasted practice-delivery attempt against a specific
-- adaptation, plus the deterministic v1 heuristic score computed for it.
-- Mirrors the ownership/RLS conventions established in Pass 15
-- (judge_adaptations, judge_adaptation_notes).

CREATE TABLE IF NOT EXISTS judge_adaptation_attempts (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    adaptation_id  uuid NOT NULL REFERENCES judge_adaptations(id) ON DELETE CASCADE,
    user_id        uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    judge_type     text NOT NULL,
    source_type    text NOT NULL,
    -- Nullable/untyped like judge_adaptations.source_*_id — no FK constraint
    -- because it points to different tables depending on source_type.
    source_id      text,
    attempt_text   text NOT NULL,
    score_json     jsonb NOT NULL DEFAULT '{}',
    overall_fit    numeric,
    created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_judge_adaptation_attempts_adaptation
    ON judge_adaptation_attempts (adaptation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_judge_adaptation_attempts_user
    ON judge_adaptation_attempts (user_id, created_at DESC);

ALTER TABLE judge_adaptation_attempts ENABLE ROW LEVEL SECURITY;

-- Owner can select/insert/update/delete their own attempts only. No
-- cross-user reads or writes.
CREATE POLICY "judge_adaptation_attempts_owner" ON judge_adaptation_attempts
    FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "judge_adaptation_attempts_service_role" ON judge_adaptation_attempts
    FOR ALL TO service_role USING (true) WITH CHECK (true);

NOTIFY pgrst, 'reload schema';
