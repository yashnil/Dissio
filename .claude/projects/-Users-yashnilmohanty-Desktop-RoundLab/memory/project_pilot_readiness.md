---
name: project-pilot-readiness
description: Pilot readiness pass (2026-06-09): product analytics, feedback ratings, drill ratings, confusion reporting, pilot dashboard
metadata:
  type: project
---

Pilot readiness pass completed 2026-06-09. Added full pilot analytics, feedback loop infrastructure, and /pilot dashboard.

**Why:** Get RoundLab ready for a 5-10 student pilot — need to track whether students are completing the full loop and whether outputs are useful.

**How to apply:** These are now core features. Do not remove or stub out product event tracking.

## Schema changes (migration 20260609000000)
- `product_events` — internal analytics event log (best-effort, user-scoped)
- `drill_ratings` — student helpfulness ratings for drills (helpful/somewhat/not_helpful)
- `output_feedback` — confusion/quality reports on AI output surfaces

## Backend added
- `app/services/product_events.py` — `track_product_event()` helper (best-effort, never raises)
- `app/api/events.py` — not created (events tracked server-side in existing endpoints)
- `app/api/output_feedback.py` — POST /output-feedback
- `app/api/pilot.py` — GET /users/{user_id}/pilot-summary + GET /pilot
- Drill rating endpoints: POST/GET /drills/{id}/rating
- Feedback rating now supports "helpful" | "somewhat" | "not_helpful" (added "somewhat")
- FeedbackRatingUpdate model now includes optional `helpful_comment`
- Product events tracked in: speech creation, speech analysis, feedback viewed, feedback rated, drill attempt saved/scored, drill rated

## Frontend added
- `components/FeedbackRating.tsx` — 3-option rating with optional comment
- `components/DrillRating.tsx` — drill helpfulness rating after attempt
- `components/ConfusionReport.tsx` — "Report confusing output" inline form
- `components/PilotChecklist.tsx` — 6-step pilot loop checklist with real data
- `components/SkillTrendCard.tsx` — single skill trend viz
- `app/pilot/page.tsx` — /pilot dev dashboard (current-user-only)

## Pages updated
- `/dashboard` — added PilotChecklist + SkillTrendCard sections, fetches pilot-summary
- `/drills/[id]` — added DrillRating + ConfusionReport after first attempt
- `/speech/[id]` — replaced old 2-button rating with FeedbackRating + ConfusionReport

## New types
- `FeedbackRating`, `DrillRating`, `DrillRatingRow`, `OutputFeedbackCategory`, `OutputFeedbackTargetType`
- `SkillTrend`, `SkillTrends`, `PilotSummary`, `PilotAggregate`

## Tests
- 476 backend tests pass (added test_product_events.py, test_drill_ratings.py, test_pilot.py, test_output_feedback.py, rating tests in test_feedback_reports.py)
- 92 frontend tests pass (added src/__tests__/pilotHelpers.test.ts)
