-- =============================================================================
-- RoundLab — Add Feedback Usefulness Rating
-- Migration: 20260602100000_add_feedback_rating.sql
--
-- Adds lightweight feedback quality rating to help improve AI feedback.
-- =============================================================================

ALTER TABLE public.feedback_reports
  ADD COLUMN helpful_rating text,
  ADD COLUMN helpful_comment text;

COMMENT ON COLUMN public.feedback_reports.helpful_rating IS 'Student rating: helpful | not_helpful | null';
COMMENT ON COLUMN public.feedback_reports.helpful_comment IS 'Optional student comment on feedback quality';
