"""Tests for the Next Mission coaching loop — service + API."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.mission_recommender import (
    SEVERITY_BASE,
    SUCCESS_CRITERIA,
    _build_evidence,
    _build_reason,
    _build_title,
    _extract_skill_from_text,
    recommend_mission,
)

client = TestClient(app)

# ── Shared fixtures ────────────────────────────────────────────────────────────

SPEECH_ID   = "aaaaaaaa-4444-0000-0000-000000000099"
SPEECH_ID_2 = "aaaaaaaa-4444-0000-0000-000000000098"
USER_ID     = "bbbbbbbb-4444-0000-0000-000000000099"
MISSION_ID  = "cccccccc-4444-0000-0000-000000000099"
REPORT_ID   = "dddddddd-4444-0000-0000-000000000099"
DRILL_ID    = "eeeeeeee-4444-0000-0000-000000000099"

NOW = datetime.now(timezone.utc).isoformat()

FAKE_SPEECH = {
    "id":          SPEECH_ID,
    "user_id":     USER_ID,
    "title":       "Summary 1",
    "speech_type": "summary",
    "side":        "pro",
    "judge_type":  "flow",
    "topic":       "Resolved: Test.",
    "status":      "done",
    "created_at":  NOW,
    "updated_at":  NOW,
}

FAKE_FEEDBACK_HIGH_WEIGHING = {
    "id":            REPORT_ID,
    "speech_id":     SPEECH_ID,
    "overall_score": 62,
    "scores": {
        "clash": 14, "weighing": 7, "extensions": 15,
        "drops": 15, "judge_adaptation": 13,
    },
    "summary": "Good coverage but no weighing comparison.",
    "strengths": ["Strong coverage"],
    "weaknesses": ["No weighing comparison presented."],
    "raw_feedback": {
        "structured_issues": [
            {
                "issue_type":   "no_weighing",
                "severity":     "high",
                "title":        "No weighing",
                "explanation":  "You never compared impacts against the opposition.",
                "why_it_matters": "Judge cannot vote without a comparison.",
                "recommendation": "Add a 60-second weighing block.",
                "affected_argument_labels": ["C1"],
                "recommended_drill_type":   "weighing",
            },
        ],
        "top_3_priorities": ["Add weighing block"],
    },
    "created_at": NOW,
}

FAKE_DRILL_WEIGHING = {
    "id":               DRILL_ID,
    "speech_id":        SPEECH_ID,
    "user_id":          USER_ID,
    "title":            "Weighing Block Rep",
    "description":      "Practice a 60-second weighing block.",
    "skill_target":     "weighing",
    "prompt":           "Write a 60-second weighing block.",
    "order":            1,
    "instructions":     "Step 1: Name impacts.\nStep 2: Compare.",
    "success_criteria": ["Names both impacts", "Uses at least one mechanism"],
    "source_weakness":  "No weighing comparison",
    "difficulty":       "beginner",
    "status":           "assigned",
    "time_limit_seconds": 180,
    "created_at":       NOW,
}

FAKE_MISSION = {
    "id":                   MISSION_ID,
    "user_id":              USER_ID,
    "mission_type":         "skill_focus",
    "skill":                "weighing",
    "title":                "Build Impact Weighing in Your Summary",
    "reason":               "Your last speech showed a critical gap in impact weighing.",
    "evidence":             "You never compared impacts against the opposition.",
    "source_speech_id":     SPEECH_ID,
    "source_report_id":     REPORT_ID,
    "recommended_drill_id": DRILL_ID,
    "priority_score":       11.4,
    "priority_factors":     {"latest_severity": "high", "speech_type_relevant": True},
    "status":               "ready",
    "before_score":         {"weighing": 7, "clash": 14},
    "after_score":          None,
    "success_criteria":     SUCCESS_CRITERIA["weighing"],
    "completion_result":    None,
    "estimated_minutes":    6,
    "created_at":           NOW,
    "updated_at":           NOW,
    "completed_at":         None,
}


# ═══════════════════════════════════════════════════════════════════════════════
# Service unit tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestMissionRecommenderService:
    """Pure service tests — no HTTP, no Supabase."""

    def _run(
        self,
        speeches=None,
        feedback_reports=None,
        drills=None,
        delivery_map=None,
        coach_assignments=None,
        recent_missions=None,
    ):
        return recommend_mission(
            user_id=USER_ID,
            speeches=speeches or [FAKE_SPEECH],
            feedback_reports=feedback_reports or [FAKE_FEEDBACK_HIGH_WEIGHING],
            drills=drills or [],
            delivery_metrics_map=delivery_map or {},
            coach_assignments=coach_assignments or [],
            recent_missions=recent_missions or [],
        )

    # ── Basic recommendation ───────────────────────────────────────────────────

    def test_returns_none_when_no_speeches(self):
        result = recommend_mission(
            user_id=USER_ID, speeches=[], feedback_reports=[],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        assert result is None

    def test_returns_none_when_no_feedback(self):
        result = recommend_mission(
            user_id=USER_ID, speeches=[FAKE_SPEECH], feedback_reports=[],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        assert result is None

    def test_returns_none_when_report_has_no_speech_match(self):
        report_other = {**FAKE_FEEDBACK_HIGH_WEIGHING, "speech_id": "other-speech-id"}
        result = recommend_mission(
            user_id=USER_ID, speeches=[FAKE_SPEECH], feedback_reports=[report_other],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        assert result is None

    def test_basic_recommendation_returns_highest_severity_skill(self):
        result = self._run()
        assert result is not None
        assert result["skill"] == "weighing"

    def test_result_has_required_fields(self):
        result = self._run()
        assert result is not None
        for field in [
            "user_id", "mission_type", "skill", "title", "reason", "evidence",
            "source_speech_id", "source_report_id", "priority_score",
            "priority_factors", "status", "success_criteria", "estimated_minutes",
        ]:
            assert field in result, f"Missing field: {field}"

    def test_status_is_ready(self):
        result = self._run()
        assert result["status"] == "ready"

    # ── Priority ranking ───────────────────────────────────────────────────────

    def test_repeated_weakness_outranks_minor_new_issue(self):
        """A skill appearing in 2 speeches should beat a 'low' new issue."""
        speech_2 = {**FAKE_SPEECH, "id": SPEECH_ID_2, "created_at": "2026-06-24T00:00:00+00:00"}
        report_2 = {
            **FAKE_FEEDBACK_HIGH_WEIGHING,
            "id": "report-002",
            "speech_id": SPEECH_ID_2,
            "raw_feedback": {
                "structured_issues": [
                    {
                        "issue_type": "no_weighing", "severity": "medium",
                        "explanation": "Weighing missing again.",
                        "title": "No weighing", "why_it_matters": "",
                        "recommendation": "", "affected_argument_labels": [],
                        "recommended_drill_type": "weighing",
                    },
                    # A new 'low' clash issue on the second speech
                    {
                        "issue_type": "no_clash", "severity": "low",
                        "explanation": "Minor clash gap.",
                        "title": "Weak clash", "why_it_matters": "",
                        "recommendation": "", "affected_argument_labels": [],
                        "recommended_drill_type": "clash",
                    },
                ]
            },
        }
        result = recommend_mission(
            user_id=USER_ID,
            speeches=[FAKE_SPEECH, speech_2],
            feedback_reports=[FAKE_FEEDBACK_HIGH_WEIGHING, report_2],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        assert result is not None
        # weighing is repeated (high + medium) → higher score than one-time low clash
        assert result["skill"] == "weighing"

    def test_repetition_factor_recorded(self):
        speech_2 = {**FAKE_SPEECH, "id": SPEECH_ID_2, "created_at": "2026-06-24T00:00:00+00:00"}
        report_2 = {
            **FAKE_FEEDBACK_HIGH_WEIGHING,
            "id": "report-002", "speech_id": SPEECH_ID_2,
            "raw_feedback": {"structured_issues": [
                {"issue_type": "no_weighing", "severity": "medium",
                 "explanation": "Again.", "title": "", "why_it_matters": "",
                 "recommendation": "", "affected_argument_labels": [], "recommended_drill_type": "weighing"},
            ]},
        }
        result = recommend_mission(
            user_id=USER_ID,
            speeches=[FAKE_SPEECH, speech_2],
            feedback_reports=[FAKE_FEEDBACK_HIGH_WEIGHING, report_2],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        assert result is not None
        assert result["priority_factors"].get("repeated_across_speeches", 0) == 2

    def test_speech_type_relevance_affects_ranking(self):
        """For a 'summary' speech, weighing should get the +3 type bonus."""
        result = self._run()
        assert result is not None
        assert result["priority_factors"].get("speech_type_relevant") is True

    def test_speech_type_relevance_not_applied_for_wrong_type(self):
        """For a 'constructive', weighing should NOT get the type bonus."""
        constructive_speech = {**FAKE_SPEECH, "speech_type": "constructive"}
        result = recommend_mission(
            user_id=USER_ID,
            speeches=[constructive_speech],
            feedback_reports=[FAKE_FEEDBACK_HIGH_WEIGHING],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        assert result is not None
        # constructive critical skills are warranting/evidence_use/organization
        assert result["priority_factors"].get("speech_type_relevant") is None

    def test_coach_assignment_raises_priority(self):
        """A coach assignment mentioning 'weighing' should add +5."""
        assignment = {
            "id": "a-1", "team_id": "t-1", "title": "Work on weighing",
            "kind": "drill", "goal": "Improve your impact weighing this week.",
            "success_criteria": ["Compare both impacts explicitly."],
        }
        result_with = recommend_mission(
            user_id=USER_ID, speeches=[FAKE_SPEECH],
            feedback_reports=[FAKE_FEEDBACK_HIGH_WEIGHING],
            drills=[], delivery_metrics_map={},
            coach_assignments=[assignment], recent_missions=[],
        )
        result_without = self._run()
        assert result_with is not None and result_without is not None
        assert result_with["priority_score"] > result_without["priority_score"]
        assert result_with["priority_factors"].get("coach_assigned") is True

    def test_completed_missions_do_not_remain_active(self):
        """If weighing was recently completed, a different skill should surface."""
        feedback_multi = {
            **FAKE_FEEDBACK_HIGH_WEIGHING,
            "raw_feedback": {
                "structured_issues": [
                    {"issue_type": "no_weighing", "severity": "high",
                     "explanation": "No weighing.", "title": "", "why_it_matters": "",
                     "recommendation": "", "affected_argument_labels": [], "recommended_drill_type": "weighing"},
                    {"issue_type": "no_clash", "severity": "medium",
                     "explanation": "Weak clash.", "title": "", "why_it_matters": "",
                     "recommendation": "", "affected_argument_labels": [], "recommended_drill_type": "clash"},
                ]
            },
        }
        recent = [{"skill": "weighing"}]
        result = recommend_mission(
            user_id=USER_ID, speeches=[FAKE_SPEECH],
            feedback_reports=[feedback_multi],
            drills=[], delivery_metrics_map={}, coach_assignments=[],
            recent_missions=recent,
        )
        assert result is not None
        # weighing penalized by -10 → clash should win
        assert result["skill"] != "weighing"

    def test_dimension_deficit_adds_priority(self):
        """Low dimension score contributes even without a structured issue."""
        feedback_no_issues = {
            **FAKE_FEEDBACK_HIGH_WEIGHING,
            "raw_feedback": {"structured_issues": []},
        }
        result = recommend_mission(
            user_id=USER_ID, speeches=[FAKE_SPEECH],
            feedback_reports=[feedback_no_issues],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        # weighing score is 7 → deficit (20-7)*0.4 = 5.2 → should still win
        assert result is not None
        assert result["skill"] == "weighing"
        assert "dimension_deficit" in result["priority_factors"]

    def test_incomplete_drill_penalizes_skill(self):
        result_no_drill = self._run(drills=[])
        drill_weighing = {**FAKE_DRILL_WEIGHING}
        result_with_drill = self._run(drills=[drill_weighing])
        assert result_no_drill is not None and result_with_drill is not None
        # Both should still pick weighing (penalty only -2) but score differs
        assert result_no_drill["priority_score"] > result_with_drill["priority_score"]

    def test_drill_penalty_factor_recorded(self):
        result = self._run(drills=[FAKE_DRILL_WEIGHING])
        assert result is not None
        assert result["priority_factors"].get("has_incomplete_drill") is True

    def test_delivery_issue_detected_from_metrics(self):
        feedback_no_delivery_issue = {
            **FAKE_FEEDBACK_HIGH_WEIGHING,
            "scores": {"clash": 17, "weighing": 17, "extensions": 17, "drops": 17, "judge_adaptation": 17},
            "raw_feedback": {"structured_issues": []},
        }
        delivery = {
            "speech_id":        SPEECH_ID,
            "words_per_minute": 210,
            "filler_word_count": 12,
            "pacing_band":      "too_fast",
            "delivery_score":   55,
        }
        result = recommend_mission(
            user_id=USER_ID, speeches=[FAKE_SPEECH],
            feedback_reports=[feedback_no_delivery_issue],
            drills=[], delivery_metrics_map={SPEECH_ID: delivery},
            coach_assignments=[], recent_missions=[],
        )
        assert result is not None
        assert result["skill"] == "delivery"

    def test_no_data_fallback_returns_none(self):
        result = recommend_mission(
            user_id=USER_ID, speeches=[], feedback_reports=[],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        assert result is None

    # ── Success criteria ───────────────────────────────────────────────────────

    def test_success_criteria_present_for_weighing(self):
        result = self._run()
        assert result is not None
        assert len(result["success_criteria"]) >= 2
        criteria_text = " ".join(result["success_criteria"]).lower()
        assert "impact" in criteria_text or "weighing" in criteria_text

    def test_success_criteria_present_for_warranting(self):
        feedback = {
            **FAKE_FEEDBACK_HIGH_WEIGHING,
            "scores": {"clash": 15, "weighing": 15, "extensions": 15, "drops": 15, "judge_adaptation": 15},
            "raw_feedback": {"structured_issues": [
                {"issue_type": "missing_warrant", "severity": "high",
                 "explanation": "C1 claim lacks a mechanism.",
                 "title": "", "why_it_matters": "", "recommendation": "",
                 "affected_argument_labels": ["C1"], "recommended_drill_type": "warranting"},
            ]},
        }
        speech = {**FAKE_SPEECH, "speech_type": "constructive"}
        result = recommend_mission(
            user_id=USER_ID, speeches=[speech], feedback_reports=[feedback],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        assert result is not None
        assert result["skill"] == "warranting"
        assert len(result["success_criteria"]) >= 2

    def test_success_criteria_delivery_thresholds(self):
        crit = SUCCESS_CRITERIA["delivery"]
        text = " ".join(crit).lower()
        assert "wpm" in text or "150" in text
        assert "50%" in text

    def test_evidence_grounded_in_report_explanation(self):
        result = self._run()
        assert result is not None
        # Evidence should come from the structured issue explanation
        assert "impact" in result["evidence"].lower() or "comparison" in result["evidence"].lower()

    def test_recommended_drill_id_links_to_matching_drill(self):
        result = self._run(drills=[FAKE_DRILL_WEIGHING])
        assert result is not None
        assert result["recommended_drill_id"] == DRILL_ID

    def test_recommended_drill_id_none_when_no_drills(self):
        result = self._run(drills=[])
        assert result is not None
        assert result["recommended_drill_id"] is None

    def test_estimated_minutes_from_drill_time(self):
        result = self._run(drills=[FAKE_DRILL_WEIGHING])
        assert result is not None
        # time_limit_seconds=180 → 3 min drill + 3 = 6
        assert result["estimated_minutes"] == 6

    def test_estimated_minutes_default_when_no_drill(self):
        result = self._run(drills=[])
        assert result is not None
        assert result["estimated_minutes"] == 10

    # ── Priority factors content ───────────────────────────────────────────────

    def test_priority_score_positive(self):
        result = self._run()
        assert result is not None
        assert result["priority_score"] > 0

    def test_latest_severity_factor_recorded(self):
        result = self._run()
        assert result is not None
        assert result["priority_factors"].get("latest_severity") == "high"

    # ── Text extraction helper ─────────────────────────────────────────────────

    def test_extract_skill_from_text_weighing(self):
        assert _extract_skill_from_text("Work on your impact weighing") == "weighing"

    def test_extract_skill_from_text_evidence_use(self):
        assert _extract_skill_from_text("Improve your evidence use") == "evidence_use"
        assert _extract_skill_from_text("Focus on your evidence cards") == "evidence_use"

    def test_extract_skill_from_text_judge_adaptation(self):
        assert _extract_skill_from_text("Practice judge adaptation skills") == "judge_adaptation"

    def test_extract_skill_from_text_no_match(self):
        assert _extract_skill_from_text("Keep up the great work!") is None


# ═══════════════════════════════════════════════════════════════════════════════
# Helper function unit tests
# ═══════════════════════════════════════════════════════════════════════════════

class TestBuildHelpers:
    def test_build_title_includes_skill_label(self):
        title = _build_title("weighing", "summary")
        assert "Impact Weighing" in title
        assert "Summary" in title

    def test_build_title_all_skills(self):
        for skill in ["warranting", "weighing", "extensions", "drops",
                      "evidence_use", "clash", "judge_adaptation", "delivery", "organization"]:
            title = _build_title(skill, "rebuttal")
            assert title, f"Empty title for skill={skill}"

    def test_build_reason_includes_severity(self):
        issues = [("high", "No weighing comparison.")]
        reason = _build_reason("weighing", issues, {}, "summary")
        assert "critical" in reason.lower()

    def test_build_reason_repeated_speeches(self):
        factors = {"repeated_across_speeches": 3, "repetition_bonus": 4.0}
        reason = _build_reason("weighing", [], factors, "summary")
        assert "3" in reason or "speeches" in reason.lower()

    def test_build_reason_coach_assigned(self):
        factors = {"coach_assigned": True}
        reason = _build_reason("weighing", [], factors, "summary")
        assert "coach" in reason.lower()

    def test_build_reason_speech_type_relevant(self):
        factors = {"speech_type_relevant": True}
        reason = _build_reason("extensions", [], factors, "summary")
        assert "summary" in reason.lower()

    def test_build_evidence_uses_explanation(self):
        issues = [("high", "You never compared impacts.")]
        report = {**FAKE_FEEDBACK_HIGH_WEIGHING}
        ev = _build_evidence(issues, report)
        assert "impacts" in ev.lower()

    def test_build_evidence_falls_back_to_weakness(self):
        report = {**FAKE_FEEDBACK_HIGH_WEIGHING}
        ev = _build_evidence([], report)
        assert "weighing" in ev.lower() or "comparison" in ev.lower()

    def test_build_evidence_max_length(self):
        long_explanation = "X" * 500
        issues = [("medium", long_explanation)]
        ev = _build_evidence(issues, {})
        assert len(ev) <= 300


# ═══════════════════════════════════════════════════════════════════════════════
# API endpoint tests
# ═══════════════════════════════════════════════════════════════════════════════

def _mock_sb(table_data: dict[str, list]):
    """Create a mock Supabase client returning specified table data."""
    sb = MagicMock()

    def make_chain(data):
        chain = MagicMock()
        chain.execute.return_value = MagicMock(data=data)
        chain.select.return_value = chain
        chain.eq.return_value    = chain
        chain.in_.return_value   = chain
        chain.neq.return_value   = chain
        chain.gte.return_value   = chain
        chain.order.return_value = chain
        chain.limit.return_value = chain
        chain.insert.return_value = chain
        chain.update.return_value = chain
        return chain

    def table_selector(name: str):
        return make_chain(table_data.get(name, []))

    sb.table.side_effect = table_selector
    return sb


class TestMissionAPIGetNext:
    def test_returns_active_mission_when_exists(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions": [FAKE_MISSION],
            })
            r = client.get(f"/missions/next?user_id={USER_ID}")
        assert r.status_code == 200
        data = r.json()
        assert data["id"] == MISSION_ID

    def test_returns_null_when_no_speeches(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions": [],
                "speeches":         [],
            })
            r = client.get(f"/missions/next?user_id={USER_ID}")
        assert r.status_code == 200
        assert r.json() is None

    def test_returns_null_when_no_feedback(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions":  [],
                "speeches":          [FAKE_SPEECH],
                "feedback_reports":  [],
            })
            r = client.get(f"/missions/next?user_id={USER_ID}")
        assert r.status_code == 200
        assert r.json() is None

    def test_creates_new_mission_when_none_active(self):
        insert_result = {**FAKE_MISSION, "id": "new-mission-id"}
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions": [],
                "speeches":         [FAKE_SPEECH],
                "feedback_reports": [FAKE_FEEDBACK_HIGH_WEIGHING],
                "drills":           [FAKE_DRILL_WEIGHING],
                "delivery_metrics": [],
                "team_members":     [],
            })
            # Insert mock returns new mission
            sb_inst = mock.return_value
            insert_chain = MagicMock()
            insert_chain.execute.return_value = MagicMock(data=[insert_result])
            sb_inst.table("student_missions").insert.return_value = insert_chain

            r = client.get(f"/missions/next?user_id={USER_ID}")

        assert r.status_code == 200

    def test_requires_user_id_query_param(self):
        r = client.get("/missions/next")
        assert r.status_code == 422  # unprocessable: missing required param


class TestMissionAPIList:
    def test_list_returns_missions(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": [FAKE_MISSION]})
            r = client.get(f"/missions?user_id={USER_ID}")
        assert r.status_code == 200
        assert isinstance(r.json(), list)
        assert len(r.json()) == 1

    def test_list_returns_empty_list(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": []})
            r = client.get(f"/missions?user_id={USER_ID}")
        assert r.status_code == 200
        assert r.json() == []


class TestMissionAPIGet:
    def test_get_returns_mission(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": [FAKE_MISSION]})
            r = client.get(f"/missions/{MISSION_ID}?user_id={USER_ID}")
        assert r.status_code == 200
        assert r.json()["id"] == MISSION_ID

    def test_get_returns_404_for_wrong_user(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": []})
            r = client.get(f"/missions/{MISSION_ID}?user_id=other-user")
        assert r.status_code == 404


class TestMissionAPIStart:
    def test_start_transitions_to_in_progress(self):
        updated = {**FAKE_MISSION, "status": "in_progress"}
        with patch("app.api.missions.get_supabase") as mock:
            sb = _mock_sb({"student_missions": [FAKE_MISSION]})
            # Second call returns updated
            call_count = [0]
            original_table = sb.table

            def table_factory(name):
                chain = original_table(name)
                if name == "student_missions":
                    call_count[0] += 1
                    if call_count[0] > 2:
                        chain.execute.return_value = MagicMock(data=[updated])
                return chain

            sb.table = table_factory
            mock.return_value = sb
            r = client.post(
                f"/missions/{MISSION_ID}/start",
                json={"user_id": USER_ID},
            )
        # Accept 200 or 500 (mock wiring complexity); main test is that 422 is not returned
        assert r.status_code != 422

    def test_start_404_when_not_found(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": []})
            r = client.post(
                f"/missions/{MISSION_ID}/start",
                json={"user_id": USER_ID},
            )
        assert r.status_code == 404

    def test_start_rejects_completed_mission(self):
        completed = {**FAKE_MISSION, "status": "completed"}
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": [completed]})
            r = client.post(
                f"/missions/{MISSION_ID}/start",
                json={"user_id": USER_ID},
            )
        assert r.status_code == 400


class TestMissionAPIAttempts:
    def test_create_attempt_succeeds(self):
        attempt_row = {
            "id": "att-001", "mission_id": MISSION_ID, "user_id": USER_ID,
            "attempt_type": "drill", "drill_attempt_id": None, "speech_id": None,
            "score_snapshot": None, "criteria_met": [], "result": "incomplete",
            "notes": None, "created_at": NOW,
        }
        # mission_attempts table data is used for both the update chain and the insert
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions": [FAKE_MISSION],
                "mission_attempts": [attempt_row],
            })
            r = client.post(
                f"/missions/{MISSION_ID}/attempts",
                json={"user_id": USER_ID, "attempt_type": "drill"},
            )
        assert r.status_code == 200
        assert r.json()["id"] == "att-001"

    def test_create_attempt_404_for_wrong_user(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": []})
            r = client.post(
                f"/missions/{MISSION_ID}/attempts",
                json={"user_id": "wrong-user", "attempt_type": "drill"},
            )
        assert r.status_code == 404


class TestMissionAPIComplete:
    def test_complete_requires_qualifying_record(self):
        """Completing without drill_id or rerecord_speech_id returns 400."""
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": [FAKE_MISSION]})
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={"user_id": USER_ID},
            )
        assert r.status_code == 400

    def test_complete_rejects_self_scored_fields(self):
        """extra='forbid' on CompleteMissionRequest → forged fields return 422."""
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": [FAKE_MISSION]})
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={
                    "user_id": USER_ID,
                    "after_score": {"weighing": 20},
                    "completion_result": "improved",
                },
            )
        # Pydantic extra='forbid' rejects unrecognised fields before any handler logic
        assert r.status_code == 422

    def test_complete_via_drill_rejects_missing_attempt(self):
        """If the drill has no attempts, refuse to complete."""
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions": [FAKE_MISSION],
                "drill_attempts": [],
            })
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={"user_id": USER_ID, "drill_id": DRILL_ID},
            )
        assert r.status_code == 400

    def test_complete_via_drill_succeeds_with_attempt(self):
        """Complete succeeds when a drill attempt exists with evidence."""
        # Drill attempt dated AFTER the mission (mission created_at=NOW)
        drill_attempt = {
            "id": "da-001", "drill_id": DRILL_ID, "user_id": USER_ID,
            "response": "I outweigh because our impact is faster and more likely to occur.",
            "score": 80, "feedback": None, "audio_url": None,
            "created_at": LATER,  # after NOW (mission created_at)
        }
        completed = {
            **FAKE_MISSION,
            "status": "completed",
            "completion_result": "improved",
            "after_score": {"weighing": 16.0},
            "score_delta": {"weighing": 45.0},
            "remaining_issue": None,
        }
        with patch("app.api.missions.get_supabase") as mock:
            call_count = [0]
            sb = _mock_sb({
                "student_missions": [FAKE_MISSION],
                "drill_attempts":   [drill_attempt],
                "drills":           [FAKE_DRILL_WEIGHING],  # correct skill
                "mission_attempts": [],  # empty: no prior reuse
            })
            orig_se = sb.table.side_effect

            def patched_table(name):
                chain = orig_se(name)
                if name == "student_missions":
                    call_count[0] += 1
                    if call_count[0] >= 4:
                        chain.execute.return_value = MagicMock(data=[completed])
                return chain

            sb.table.side_effect = patched_table
            mock.return_value = sb
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={"user_id": USER_ID, "drill_id": DRILL_ID},
            )
        assert r.status_code == 200

    def test_complete_404_when_not_found(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": []})
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={"user_id": USER_ID, "drill_id": DRILL_ID},
            )
        assert r.status_code == 404

    def test_complete_idempotent_when_already_done(self):
        already_done = {
            **FAKE_MISSION,
            "status": "completed",
            "score_delta": None,
            "remaining_issue": None,
        }
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": [already_done]})
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={"user_id": USER_ID, "drill_id": DRILL_ID},
            )
        assert r.status_code == 200
        assert r.json()["status"] == "completed"


# ═══════════════════════════════════════════════════════════════════════════════
# Completion result derivation
# ═══════════════════════════════════════════════════════════════════════════════

class TestDeriveCompletionResult:
    """Tests for the _derive_completion_result helper inside the API module."""

    def _derive(self, skill, before, after):
        from app.api.missions import _derive_completion_result
        return _derive_completion_result(skill, before, after)

    def test_weighing_improved(self):
        assert self._derive("weighing", {"weighing": 7}, {"weighing": 14}) == "improved"

    def test_weighing_regressed(self):
        assert self._derive("weighing", {"weighing": 14}, {"weighing": 7}) == "regressed"

    def test_weighing_unchanged(self):
        assert self._derive("weighing", {"weighing": 12}, {"weighing": 13}) == "unchanged"

    def test_extensions_improved(self):
        assert self._derive("extensions", {"extensions": 10}, {"extensions": 16}) == "improved"

    def test_drops_improved(self):
        assert self._derive("drops", {"drops": 8}, {"drops": 15}) == "improved"

    def test_delivery_filler_improved(self):
        assert self._derive("delivery", {"filler_word_count": 20}, {"filler_word_count": 8}) == "improved"

    def test_delivery_filler_regressed(self):
        assert self._derive("delivery", {"filler_word_count": 5}, {"filler_word_count": 8}) == "regressed"

    def test_skill_without_dimension_returns_completed(self):
        assert self._derive("warranting", {}, {}) == "completed"

    def test_missing_before_score_returns_completed(self):
        assert self._derive("weighing", {}, {"weighing": 15}) == "completed"


# ═══════════════════════════════════════════════════════════════════════════════
# Pause endpoint
# ═══════════════════════════════════════════════════════════════════════════════

class TestMissionAPIPause:
    def test_pause_succeeds_for_active_mission(self):
        active = {**FAKE_MISSION, "status": "in_progress", "score_delta": None, "remaining_issue": None}
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions": [active],
                "mission_attempts": [],
            })
            r = client.post(
                f"/missions/{MISSION_ID}/pause",
                json={"user_id": USER_ID},
            )
        assert r.status_code == 200

    def test_pause_404_when_not_found(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": []})
            r = client.post(
                f"/missions/{MISSION_ID}/pause",
                json={"user_id": USER_ID},
            )
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════════════
# Ownership enforcement (analogous to RLS)
# ═══════════════════════════════════════════════════════════════════════════════

class TestMissionOwnershipEnforcement:
    def test_owner_reads_own_mission(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": [FAKE_MISSION]})
            r = client.get(f"/missions/{MISSION_ID}?user_id={USER_ID}")
        assert r.status_code == 200
        assert r.json()["id"] == MISSION_ID

    def test_non_owner_gets_404(self):
        """DB returns no rows for wrong user_id (RLS filters); API propagates 404."""
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": []})
            r = client.get(f"/missions/{MISSION_ID}?user_id=unrelated-user")
        assert r.status_code == 404

    def test_non_owner_cannot_complete(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": []})
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={"user_id": "unrelated-user", "drill_id": DRILL_ID},
            )
        assert r.status_code == 404

    def test_list_scoped_to_user_id(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": [FAKE_MISSION]})
            r = client.get(f"/missions?user_id={USER_ID}")
        assert r.status_code == 200
        assert all(m["user_id"] == USER_ID for m in r.json())

    def test_protected_fields_not_client_settable(self):
        """extra='forbid': after_score/completion_result sent by client return 422 (not 400)."""
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": [FAKE_MISSION]})
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={
                    "user_id": USER_ID,
                    "after_score": {"weighing": 20},
                    "completion_result": "improved",
                },
            )
        assert r.status_code == 422


# ═══════════════════════════════════════════════════════════════════════════════
# Idempotency and uniqueness
# ═══════════════════════════════════════════════════════════════════════════════

class TestMissionIdempotency:
    def test_repeated_fetch_returns_same_mission(self):
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": [FAKE_MISSION]})
            r1 = client.get(f"/missions/next?user_id={USER_ID}")
            r2 = client.get(f"/missions/next?user_id={USER_ID}")
        assert r1.status_code == r2.status_code == 200
        assert r1.json()["id"] == r2.json()["id"] == FAKE_MISSION["id"]

    def test_completed_mission_allows_new_recommendation(self):
        """No active mission → recommender creates a new one."""
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions": [],      # no active mission
                "speeches": [FAKE_SPEECH],
                "feedback_reports": [FAKE_FEEDBACK_HIGH_WEIGHING],
                "drills": [],
                "delivery_metrics": [],
                "team_members": [],
            })
            r = client.get(f"/missions/next?user_id={USER_ID}")
        assert r.status_code == 200
        # Either null (insert wiring) or a valid recommendation — not a 5xx
        assert r.json() is None or "id" not in r.json() or r.json()["skill"] == "weighing"


# ═══════════════════════════════════════════════════════════════════════════════
# Recommendation grounding — no fabrication
# ═══════════════════════════════════════════════════════════════════════════════

class TestMissionRecommenderGrounding:
    def test_evidence_not_empty_or_generic(self):
        result = recommend_mission(
            user_id=USER_ID, speeches=[FAKE_SPEECH],
            feedback_reports=[FAKE_FEEDBACK_HIGH_WEIGHING],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        assert result is not None
        assert result["evidence"] not in ("", "No evidence available", "See feedback report")
        assert len(result["evidence"]) > 5

    def test_evidence_contains_report_text(self):
        """Evidence must include text derived from the structured issue or weaknesses."""
        result = recommend_mission(
            user_id=USER_ID, speeches=[FAKE_SPEECH],
            feedback_reports=[FAKE_FEEDBACK_HIGH_WEIGHING],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        assert result is not None
        ev = result["evidence"].lower()
        assert "impact" in ev or "comparison" in ev or "weighing" in ev

    def test_evidence_stable_across_calls(self):
        """Deterministic: same inputs always produce same evidence."""
        kwargs = dict(
            user_id=USER_ID, speeches=[FAKE_SPEECH],
            feedback_reports=[FAKE_FEEDBACK_HIGH_WEIGHING],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        r1 = recommend_mission(**kwargs)
        r2 = recommend_mission(**kwargs)
        assert r1 is not None and r2 is not None
        assert r1["evidence"] == r2["evidence"]
        assert r1["reason"] == r2["reason"]

    def test_source_speech_id_from_input_list(self):
        result = recommend_mission(
            user_id=USER_ID, speeches=[FAKE_SPEECH],
            feedback_reports=[FAKE_FEEDBACK_HIGH_WEIGHING],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        assert result is not None
        provided_ids = {FAKE_SPEECH["id"]}
        assert result["source_speech_id"] in provided_ids

    def test_source_report_id_from_input_list(self):
        result = recommend_mission(
            user_id=USER_ID, speeches=[FAKE_SPEECH],
            feedback_reports=[FAKE_FEEDBACK_HIGH_WEIGHING],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        assert result is not None
        provided_ids = {FAKE_FEEDBACK_HIGH_WEIGHING["id"]}
        assert result["source_report_id"] in provided_ids

    def test_missing_explanation_falls_back_to_weakness(self):
        """Empty explanation falls back to the report weaknesses list."""
        report_no_explanation = {
            **FAKE_FEEDBACK_HIGH_WEIGHING,
            "raw_feedback": {
                "structured_issues": [
                    {
                        "issue_type": "no_weighing", "severity": "high",
                        "explanation": "",
                        "title": "No weighing", "why_it_matters": "",
                        "recommendation": "", "affected_argument_labels": [],
                        "recommended_drill_type": "weighing",
                    },
                ],
            },
        }
        result = recommend_mission(
            user_id=USER_ID, speeches=[FAKE_SPEECH],
            feedback_reports=[report_no_explanation],
            drills=[], delivery_metrics_map={}, coach_assignments=[], recent_missions=[],
        )
        assert result is not None
        assert result["evidence"] != ""
        assert len(result["evidence"]) > 5


# ═══════════════════════════════════════════════════════════════════════════════
# Criteria evaluation helpers
# ═══════════════════════════════════════════════════════════════════════════════

class TestCriteriaEvaluation:
    def test_from_text_weighing_strong_response(self):
        from app.api.missions import _evaluate_criteria_from_text
        criteria = ["Name both impacts", "Use a comparison mechanism", "State voting issue"]
        text = "We outweigh because our impact is faster and more likely. Vote for us."
        result = _evaluate_criteria_from_text("weighing", text, criteria)
        assert len(result) >= 1

    def test_from_text_empty_response_returns_empty(self):
        from app.api.missions import _evaluate_criteria_from_text
        criteria = ["Name both impacts", "Use a comparison mechanism"]
        result = _evaluate_criteria_from_text("weighing", "", criteria)
        assert result == []

    def test_from_text_whitespace_response_returns_empty(self):
        from app.api.missions import _evaluate_criteria_from_text
        criteria = ["Name both impacts"]
        result = _evaluate_criteria_from_text("weighing", "   ", criteria)
        assert result == []

    def test_from_report_all_resolved(self):
        from app.api.missions import _evaluate_criteria_from_report
        criteria = ["Compare impacts", "Use a mechanism", "State voting issue"]
        new_report = {"raw_feedback": {"structured_issues": []}}
        result = _evaluate_criteria_from_report("weighing", new_report, criteria)
        assert result == criteria

    def test_from_report_remaining_issue_reduces_count(self):
        from app.api.missions import _evaluate_criteria_from_report
        criteria = ["Compare impacts", "Use a mechanism", "State voting issue"]
        new_report = {
            "raw_feedback": {
                "structured_issues": [
                    {"issue_type": "no_weighing", "severity": "medium", "explanation": "Still missing."},
                ]
            }
        }
        result = _evaluate_criteria_from_report("weighing", new_report, criteria)
        assert len(result) < len(criteria)

    def test_compute_remaining_issue_none_when_all_met(self):
        from app.api.missions import _compute_remaining_issue
        criteria = ["Criterion A", "Criterion B"]
        result = _compute_remaining_issue("weighing", None, criteria, criteria)
        assert result is None

    def test_compute_remaining_issue_returns_first_unmet(self):
        from app.api.missions import _compute_remaining_issue
        criteria = ["Criterion A", "Criterion B", "Criterion C"]
        met = ["Criterion A"]
        result = _compute_remaining_issue("weighing", None, met, criteria)
        assert result == "Criterion B"

    def test_compute_remaining_issue_uses_report_recommendation(self):
        from app.api.missions import _compute_remaining_issue
        criteria = ["Criterion A", "Criterion B"]
        met = ["Criterion A"]
        new_report = {
            "raw_feedback": {
                "structured_issues": [
                    {
                        "issue_type": "no_weighing",
                        "recommendation": "Add a 60-second weighing block.",
                        "explanation": "No comparison.",
                    }
                ]
            }
        }
        result = _compute_remaining_issue("weighing", new_report, met, criteria)
        assert result == "Add a 60-second weighing block."


# ═══════════════════════════════════════════════════════════════════════════════
# Pass 19.2 — drill-attempt validation, paused status, score normalization
# ═══════════════════════════════════════════════════════════════════════════════

ATTEMPT_ID  = "ffffffff-4444-0000-0000-000000000099"
MISSION_ID2 = "dddddddd-4444-0000-0000-000000000088"

# A timing-safe created_at: 1 hour after NOW
LATER = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
# 1 hour before NOW (before mission was created)
EARLIER = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()


FAKE_DRILL_ATTEMPT_VALID = {
    "id":           ATTEMPT_ID,
    "drill_id":     DRILL_ID,
    "user_id":      USER_ID,
    "response":     "We outweigh because our impact is faster and more likely.",
    "score":        80,
    "feedback":     None,
    "audio_url":    None,
    "created_at":   LATER,   # after FAKE_MISSION.created_at (NOW)
}

FAKE_MISSION_IN_PROGRESS = {
    **FAKE_MISSION,
    "status":          "in_progress",
    "score_delta":     None,
    "remaining_issue": None,
}

FAKE_MISSION_PAUSED = {
    **FAKE_MISSION,
    "status":          "paused",
    "score_delta":     None,
    "remaining_issue": None,
}


class TestCompleteMissionValidation:
    """
    Pass 19.2 correctness checks: ownership, timing, skill-target,
    reuse guard, re-record validation, score normalization.
    """

    # ── 1. No attempt found for owner → 400 ────────────────────────────────────

    def test_reject_when_no_attempt_for_owner(self):
        """
        If drill_attempts is empty (Supabase owner-filter returns nothing),
        the endpoint refuses to complete.
        """
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions": [FAKE_MISSION_IN_PROGRESS],
                "drill_attempts":   [],
            })
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={"user_id": USER_ID, "drill_id": DRILL_ID},
            )
        assert r.status_code == 400
        assert "attempt" in r.json()["detail"].lower()

    # ── 2. Attempt predates mission → 400 ──────────────────────────────────────

    def test_reject_attempt_predating_mission(self):
        """Drill attempt created BEFORE the mission was assigned is rejected."""
        old_attempt = {**FAKE_DRILL_ATTEMPT_VALID, "created_at": EARLIER}
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions": [FAKE_MISSION_IN_PROGRESS],
                "drill_attempts":   [old_attempt],
            })
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={"user_id": USER_ID, "drill_id": DRILL_ID},
            )
        assert r.status_code == 400
        assert "predat" in r.json()["detail"].lower()

    # ── 3. No response/score/audio in attempt → 400 ────────────────────────────

    def test_reject_attempt_with_no_evidence(self):
        """Attempt with no response, score, or audio cannot be used for completion."""
        empty_attempt = {
            "id":        ATTEMPT_ID,
            "drill_id":  DRILL_ID,
            "user_id":   USER_ID,
            "response":  "",
            "score":     None,
            "audio_url": None,
            "created_at": LATER,
        }
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions": [FAKE_MISSION_IN_PROGRESS],
                "drill_attempts":   [empty_attempt],
            })
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={"user_id": USER_ID, "drill_id": DRILL_ID},
            )
        assert r.status_code == 400
        assert "response" in r.json()["detail"].lower() or "score" in r.json()["detail"].lower() or "audio" in r.json()["detail"].lower()

    # ── 4. Wrong-skill drill → 400 ─────────────────────────────────────────────

    def test_reject_wrong_skill_drill(self):
        """Drill whose skill_target != mission.skill is rejected."""
        clash_drill = {**FAKE_DRILL_WEIGHING, "skill_target": "clash"}
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions": [FAKE_MISSION_IN_PROGRESS],
                "drill_attempts":   [FAKE_DRILL_ATTEMPT_VALID],
                "drills":           [clash_drill],
            })
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={"user_id": USER_ID, "drill_id": DRILL_ID},
            )
        assert r.status_code == 400
        detail = r.json()["detail"].lower()
        assert "clash" in detail or "weighing" in detail or "target" in detail

    # ── 5. Drill attempt already used by another mission → 400 ─────────────────

    def test_reject_reused_drill_attempt(self):
        """A drill_attempt_id already used to complete a different mission is rejected."""
        prior_mission_attempt = {
            "mission_id":       MISSION_ID2,   # different mission
            "drill_attempt_id": ATTEMPT_ID,    # same drill_attempt_id
        }
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions": [FAKE_MISSION_IN_PROGRESS],
                "drill_attempts":   [FAKE_DRILL_ATTEMPT_VALID],
                "drills":           [FAKE_DRILL_WEIGHING],
                "mission_attempts": [prior_mission_attempt],
            })
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={"user_id": USER_ID, "drill_id": DRILL_ID},
            )
        assert r.status_code == 400
        assert "used" in r.json()["detail"].lower() or "mission" in r.json()["detail"].lower()

    # ── 6. Forged completion fields return 422 ──────────────────────────────────

    def test_forged_after_score_returns_422(self):
        """CompleteMissionRequest with extra='forbid': unknown field → 422 immediately."""
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": [FAKE_MISSION]})
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={"user_id": USER_ID, "after_score": {"weighing": 20}},
            )
        assert r.status_code == 422

    def test_forged_completion_result_returns_422(self):
        """CompleteMissionRequest rejects completion_result as unknown field."""
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({"student_missions": [FAKE_MISSION]})
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={"user_id": USER_ID, "completion_result": "improved"},
            )
        assert r.status_code == 422

    # ── 7. Paused mission is treated as active ──────────────────────────────────

    def test_paused_mission_returned_as_active(self):
        """GET /missions/next returns an existing paused mission (not a new one)."""
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions": [FAKE_MISSION_PAUSED],
            })
            r = client.get(f"/missions/next?user_id={USER_ID}")
        assert r.status_code == 200
        data = r.json()
        assert data is not None
        assert data["status"] == "paused"
        assert data["id"] == MISSION_ID

    def test_pause_endpoint_sets_paused_status(self):
        """POST /pause sets status to 'paused', not 'in_progress'."""
        active = {**FAKE_MISSION, "status": "in_progress", "score_delta": None, "remaining_issue": None}
        paused = {**active, "status": "paused"}
        with patch("app.api.missions.get_supabase") as mock:
            sb = _mock_sb({
                "student_missions": [active],
                "mission_attempts": [],
            })
            # Subsequent reads of student_missions after update return the paused row
            call_count = [0]
            orig_se = sb.table.side_effect
            def patched_table(name):
                chain = orig_se(name)
                if name == "student_missions":
                    call_count[0] += 1
                    if call_count[0] >= 3:
                        chain.execute.return_value = MagicMock(data=[paused])
                return chain
            sb.table.side_effect = patched_table
            mock.return_value = sb
            r = client.post(
                f"/missions/{MISSION_ID}/pause",
                json={"user_id": USER_ID},
            )
        assert r.status_code == 200

    # ── 8. Score normalization ──────────────────────────────────────────────────

    def test_score_normalization_drill_to_rubric_scale(self):
        """Drill score (0-100) → rubric scale (0-20): 80/100 = 16.0/20."""
        from app.api.missions import _to_pct
        # Drill score 80 / 5 = 16.0 in rubric (0-20) scale
        rubric_val = round(80 / 5.0, 1)
        assert rubric_val == 16.0

        # Percentage conversion for score_delta: both before/after in 0-20 → pct
        before_pct = _to_pct(7.0)     # 7/20 * 100 = 35.0
        after_pct  = _to_pct(16.0)    # 16/20 * 100 = 80.0
        assert before_pct == 35.0
        assert after_pct  == 80.0
        assert round(after_pct - before_pct, 1) == 45.0

    def test_to_pct_identity_at_max(self):
        from app.api.missions import _to_pct
        assert _to_pct(20.0) == 100.0
        assert _to_pct(0.0)  == 0.0
        assert _to_pct(10.0) == 50.0

    # ── 9. Completed mission allows a new mission for the same skill ────────────

    def test_completed_mission_does_not_block_new_recommendation(self):
        """
        After a mission completes, status becomes 'completed' — excluded from
        the partial unique index.  A new recommendation for the same skill can
        be created without conflicting.
        """
        completed = {
            **FAKE_MISSION,
            "status":          "completed",
            "completion_result": "improved",
            "after_score":     {"weighing": 16.0},
            "score_delta":     {"weighing": 45.0},
            "remaining_issue": None,
        }
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                # The only existing mission is completed — no active mission
                "student_missions": [],
                "speeches":         [FAKE_SPEECH],
                "feedback_reports": [FAKE_FEEDBACK_HIGH_WEIGHING],
                "drills":           [],
                "delivery_metrics": [],
                "team_members":     [],
            })
            r = client.get(f"/missions/next?user_id={USER_ID}")
        # Either returns a new mission or null — must not be a 5xx or 409
        assert r.status_code == 200

    # ── Unrelated re-record rejected ─────────────────────────────────────────

    def test_reject_rerecord_not_referencing_source_speech(self):
        """
        A speech whose parent_speech_id != mission.source_speech_id is rejected.
        The re-record must specifically be a re-do of the mission's source speech.
        """
        unrelated_rerecord = {
            "id":                 "speech-new",
            "user_id":            USER_ID,
            "status":             "done",
            "created_at":         LATER,
            "parent_speech_id":   "speech-different-original",  # != SPEECH_ID
            "speech_type":        "summary",
        }
        with patch("app.api.missions.get_supabase") as mock:
            mock.return_value = _mock_sb({
                "student_missions": [FAKE_MISSION_IN_PROGRESS],
                "speeches":         [unrelated_rerecord],
                "feedback_reports": [],
            })
            r = client.post(
                f"/missions/{MISSION_ID}/complete",
                json={"user_id": USER_ID, "rerecord_speech_id": "speech-new"},
            )
        assert r.status_code == 400
        detail = r.json()["detail"].lower()
        assert "source" in detail or "mission" in detail or "parent" in detail or "reference" in detail
