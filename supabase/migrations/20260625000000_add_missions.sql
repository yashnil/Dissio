-- Pass 19: Next Mission Coaching Loop
-- Adds: student_missions, mission_attempts tables with RLS

-- ── 1. student_missions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS student_missions (
    id                   uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id              uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    mission_type         text        NOT NULL DEFAULT 'skill_focus',
    skill                text        NOT NULL,
    title                text        NOT NULL,
    reason               text        NOT NULL,
    evidence             text        NOT NULL,
    source_speech_id     uuid        REFERENCES speeches(id) ON DELETE SET NULL,
    source_report_id     uuid        REFERENCES feedback_reports(id) ON DELETE SET NULL,
    recommended_drill_id uuid        REFERENCES drills(id) ON DELETE SET NULL,
    priority_score       numeric(6,2) NOT NULL DEFAULT 0,
    priority_factors     jsonb       NOT NULL DEFAULT '{}',
    status               text        NOT NULL DEFAULT 'ready',
    before_score         jsonb,
    after_score          jsonb,
    score_delta          jsonb,
    remaining_issue      text,
    success_criteria     jsonb       NOT NULL DEFAULT '[]',
    completion_result    text,
    estimated_minutes    int         NOT NULL DEFAULT 10,
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    completed_at         timestamptz,
    CONSTRAINT student_missions_skill_check CHECK (
        skill IN (
            'warranting', 'weighing', 'extensions', 'drops',
            'evidence_use', 'clash', 'judge_adaptation', 'delivery', 'organization'
        )
    ),
    CONSTRAINT student_missions_status_check CHECK (
        status IN ('ready', 'in_progress', 'paused', 'completed', 'expired')
    )
);

CREATE INDEX IF NOT EXISTS idx_student_missions_user_status
    ON student_missions (user_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_student_missions_user_created
    ON student_missions (user_id, created_at DESC);

-- At most one active mission per student (prevents duplicate active missions)
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_missions_one_active_per_user
    ON student_missions (user_id)
    WHERE status IN ('ready', 'in_progress', 'paused');

ALTER TABLE student_missions ENABLE ROW LEVEL SECURITY;

-- Students read their own missions; all mutations go through service_role only.
-- Protected fields (priority_score, priority_factors, reason, evidence,
-- source_speech_id, source_report_id, before_score, after_score, score_delta,
-- completion_result, remaining_issue, completed_at) are not client-writable.
DROP POLICY IF EXISTS "missions_owner_select" ON student_missions;
CREATE POLICY "missions_owner_select" ON student_missions
    FOR SELECT USING (auth.uid() = user_id);

-- Coaches on the same team can read student missions
DROP POLICY IF EXISTS "missions_coach_select" ON student_missions;
CREATE POLICY "missions_coach_select" ON student_missions
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM team_members coach_tm
            JOIN team_members student_tm
              ON coach_tm.team_id = student_tm.team_id
            WHERE coach_tm.user_id = auth.uid()
              AND coach_tm.role    = 'coach'
              AND student_tm.user_id = student_missions.user_id
        )
    );

-- Service role manages all inserts/updates
DROP POLICY IF EXISTS "missions_service_role" ON student_missions;
CREATE POLICY "missions_service_role" ON student_missions
    FOR ALL TO service_role USING (true);


-- ── 2. mission_attempts ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mission_attempts (
    id                uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
    mission_id        uuid        NOT NULL REFERENCES student_missions(id) ON DELETE CASCADE,
    user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    attempt_type      text        NOT NULL DEFAULT 'drill',
    drill_attempt_id  uuid        REFERENCES drill_attempts(id) ON DELETE SET NULL,
    speech_id         uuid        REFERENCES speeches(id) ON DELETE SET NULL,
    score_snapshot    jsonb,
    criteria_met      jsonb       NOT NULL DEFAULT '[]',
    result            text        NOT NULL DEFAULT 'incomplete',
    notes             text,
    created_at        timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT mission_attempts_type_check CHECK (
        attempt_type IN ('drill', 'rerecord', 'progress_save')
    ),
    CONSTRAINT mission_attempts_result_check CHECK (
        result IN ('incomplete', 'passed', 'failed')
    )
);

CREATE INDEX IF NOT EXISTS idx_mission_attempts_mission_id
    ON mission_attempts (mission_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_mission_attempts_user_id
    ON mission_attempts (user_id, created_at DESC);

ALTER TABLE mission_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mission_attempts_owner_select" ON mission_attempts;
CREATE POLICY "mission_attempts_owner_select" ON mission_attempts
    FOR SELECT USING (auth.uid() = user_id);

-- Coaches on the same team can read attempts
DROP POLICY IF EXISTS "mission_attempts_coach_select" ON mission_attempts;
CREATE POLICY "mission_attempts_coach_select" ON mission_attempts
    FOR SELECT USING (
        EXISTS (
            SELECT 1
            FROM student_missions sm
            JOIN team_members student_tm ON student_tm.user_id = sm.user_id
            JOIN team_members coach_tm   ON coach_tm.team_id   = student_tm.team_id
            WHERE sm.id               = mission_attempts.mission_id
              AND coach_tm.user_id    = auth.uid()
              AND coach_tm.role       = 'coach'
        )
    );

DROP POLICY IF EXISTS "mission_attempts_service_role" ON mission_attempts;
CREATE POLICY "mission_attempts_service_role" ON mission_attempts
    FOR ALL TO service_role USING (true);
