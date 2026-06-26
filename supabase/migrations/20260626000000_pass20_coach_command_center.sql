-- Pass 20: Coach Command Center
-- Adds: assignment_templates, coach_notes, team_settings
-- No existing table is altered.

-- ── assignment_templates ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS assignment_templates (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id         UUID REFERENCES teams(id) ON DELETE CASCADE,  -- NULL = built-in
    created_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    title           TEXT NOT NULL,
    description     TEXT,
    kind            TEXT NOT NULL DEFAULT 'speech'
                        CHECK (kind IN ('speech','drill','rerecord')),
    speech_type     TEXT,
    target_skill    TEXT,
    success_criteria TEXT[] NOT NULL DEFAULT '{}',
    goal            TEXT,
    duration_minutes INT,
    due_offset_days INT NOT NULL DEFAULT 7,
    is_built_in     BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- coaches can read their own team's templates + all built-ins
-- service-role writes for coach endpoints
ALTER TABLE assignment_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "read_own_or_builtin" ON assignment_templates
    FOR SELECT USING (
        team_id IS NULL                                           -- built-in
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = assignment_templates.team_id
              AND tm.user_id = auth.uid()
        )
    );

-- ── coach_notes ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS coach_notes (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
    coach_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    student_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    note        TEXT NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE coach_notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coach_read_own_notes" ON coach_notes
    FOR SELECT USING (
        coach_id = auth.uid()
        OR EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = coach_notes.team_id
              AND tm.user_id = auth.uid()
              AND tm.role = 'coach'
        )
    );

-- ── team_settings ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_settings (
    team_id             UUID PRIMARY KEY REFERENCES teams(id) ON DELETE CASCADE,
    competitive_format  TEXT NOT NULL DEFAULT 'pf',
    program_name        TEXT,
    practice_per_week   INT NOT NULL DEFAULT 2,
    onboarding_done     BOOLEAN NOT NULL DEFAULT false,
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE team_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "member_read_team_settings" ON team_settings
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM team_members tm
            WHERE tm.team_id = team_settings.team_id
              AND tm.user_id = auth.uid()
        )
    );

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_assignment_templates_team ON assignment_templates(team_id)
    WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_coach_notes_team_student ON coach_notes(team_id, student_id);
CREATE INDEX IF NOT EXISTS idx_assignment_recipients_submitted ON assignment_recipients(submitted_at)
    WHERE status = 'started';
