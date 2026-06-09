-- =============================================================================
-- RoundLab — Pilot Readiness Tables
-- Migration: 20260609000000_add_pilot_tables.sql
--
-- Adds:
--   product_events  — lightweight internal analytics event log
--   drill_ratings   — student helpfulness ratings for drills
--   output_feedback — confusion/quality reports on AI outputs
-- =============================================================================

-- ── product_events ────────────────────────────────────────────────────────────
-- Append-only event log for internal product analytics.
-- Failures writing here must never break user flows (best-effort only).

CREATE TABLE IF NOT EXISTS public.product_events (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    event_name    text NOT NULL,
    speech_id     uuid REFERENCES public.speeches(id) ON DELETE SET NULL,
    drill_id      uuid REFERENCES public.drills(id) ON DELETE SET NULL,
    metadata_json jsonb NOT NULL DEFAULT '{}',
    created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_product_events_user_id   ON public.product_events(user_id);
CREATE INDEX IF NOT EXISTS idx_product_events_event_name ON public.product_events(event_name);
CREATE INDEX IF NOT EXISTS idx_product_events_created_at ON public.product_events(created_at DESC);

COMMENT ON TABLE  public.product_events              IS 'Append-only internal analytics events for pilot readiness tracking';
COMMENT ON COLUMN public.product_events.event_name   IS 'e.g. speech_created, speech_analyzed, feedback_viewed, drill_opened, drill_attempt_saved, drill_attempt_scored, feedback_rated, drill_rated, rerecord_started, comparison_viewed';
COMMENT ON COLUMN public.product_events.metadata_json IS 'Optional structured payload specific to each event type';

-- RLS: users see only their own events; service role can read all
ALTER TABLE public.product_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "product_events_select_own"
    ON public.product_events FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "product_events_insert_own"
    ON public.product_events FOR INSERT
    WITH CHECK (auth.uid() = user_id);


-- ── drill_ratings ─────────────────────────────────────────────────────────────
-- One rating per user per drill (upsert on conflict).

CREATE TABLE IF NOT EXISTS public.drill_ratings (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    drill_id         uuid NOT NULL REFERENCES public.drills(id) ON DELETE CASCADE,
    drill_attempt_id uuid REFERENCES public.drill_attempts(id) ON DELETE SET NULL,
    rating           text NOT NULL CHECK (rating IN ('helpful', 'somewhat', 'not_helpful')),
    comment          text,
    created_at       timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT drill_ratings_user_drill_unique UNIQUE (user_id, drill_id)
);

CREATE INDEX IF NOT EXISTS idx_drill_ratings_user_id  ON public.drill_ratings(user_id);
CREATE INDEX IF NOT EXISTS idx_drill_ratings_drill_id ON public.drill_ratings(drill_id);

COMMENT ON TABLE  public.drill_ratings        IS 'Student helpfulness ratings for drill exercises';
COMMENT ON COLUMN public.drill_ratings.rating IS 'helpful | somewhat | not_helpful';

ALTER TABLE public.drill_ratings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "drill_ratings_select_own"
    ON public.drill_ratings FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "drill_ratings_insert_own"
    ON public.drill_ratings FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "drill_ratings_update_own"
    ON public.drill_ratings FOR UPDATE
    USING (auth.uid() = user_id);


-- ── output_feedback ───────────────────────────────────────────────────────────
-- Confusion / quality reports on AI outputs from pilot testers.

CREATE TABLE IF NOT EXISTS public.output_feedback (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    target_type text NOT NULL,
    target_id   uuid,
    category    text NOT NULL CHECK (category IN (
        'incorrect_issue', 'generic_feedback', 'evidence_mismatch',
        'confusing_wording', 'technical_bug', 'other'
    )),
    comment     text,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_output_feedback_user_id     ON public.output_feedback(user_id);
CREATE INDEX IF NOT EXISTS idx_output_feedback_target_type ON public.output_feedback(target_type);
CREATE INDEX IF NOT EXISTS idx_output_feedback_created_at  ON public.output_feedback(created_at DESC);

COMMENT ON TABLE  public.output_feedback             IS 'Pilot tester confusion/quality reports on AI outputs';
COMMENT ON COLUMN public.output_feedback.target_type IS 'speech_report | drill_feedback | evidence_check';
COMMENT ON COLUMN public.output_feedback.target_id   IS 'UUID of the specific report/drill/check being flagged';
COMMENT ON COLUMN public.output_feedback.category    IS 'incorrect_issue | generic_feedback | evidence_mismatch | confusing_wording | technical_bug | other';

ALTER TABLE public.output_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "output_feedback_select_own"
    ON public.output_feedback FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "output_feedback_insert_own"
    ON public.output_feedback FOR INSERT
    WITH CHECK (auth.uid() = user_id);


-- ── update helpful_rating constraint to allow "somewhat" ─────────────────────
-- The existing column is free text; no constraint to update.
-- Backend validation is the source of truth (see feedback_reports.py).
COMMENT ON COLUMN public.feedback_reports.helpful_rating IS 'Student rating: helpful | somewhat | not_helpful | null';
