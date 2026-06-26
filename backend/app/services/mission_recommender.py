"""
Deterministic Next Mission Recommendation — v1.

No LLM calls. Scores candidate skills from existing feedback, delivery,
and drill data, then returns the single most important mission for the
student to work on next.

Priority factors (in descending weight):
  1. Severity of issue in latest speech (0–5 pts)
  2. Repetition across recent speeches (2 pts per extra speech, capped at 3)
  3. Rubric dimension deficit — lower score = higher priority (0–8 pts)
  4. Speech-type criticality (3 pts)
  5. Coach-assigned skill (5 pts)
  6. Penalty: incomplete drill already targeting this skill (−2 pts)
  7. Penalty: mission for this skill completed in last 30 days (−10 pts)
"""

from __future__ import annotations

from collections import defaultdict
from typing import Any, Optional

# ── Skill taxonomy ─────────────────────────────────────────────────────────────

SKILL_LABELS: dict[str, str] = {
    "warranting":       "Warranting",
    "weighing":         "Impact Weighing",
    "extensions":       "Extensions",
    "drops":            "Drop Prevention",
    "evidence_use":     "Evidence Use",
    "clash":            "Clash",
    "judge_adaptation": "Judge Adaptation",
    "delivery":         "Delivery",
    "organization":     "Organization",
}

# Structured issue_type → skill
ISSUE_TO_SKILL: dict[str, str] = {
    "missing_warrant":  "warranting",
    "weak_evidence":    "evidence_use",
    "unclear_impact":   "weighing",
    "no_weighing":      "weighing",
    "dropped_argument": "drops",
    "weak_extension":   "extensions",
    "no_clash":         "clash",
    "new_argument":     "drops",
    "organization":     "organization",
    "delivery":         "delivery",
}

# Skill → rubric dimension key in feedback scores
SKILL_TO_DIM: dict[str, str] = {
    "weighing":         "weighing",
    "extensions":       "extensions",
    "drops":            "drops",
    "clash":            "clash",
    "judge_adaptation": "judge_adaptation",
}

# Critical skills by speech type
_SPEECH_TYPE_CRITICAL: dict[str, set[str]] = {
    "constructive": {"warranting", "evidence_use", "organization"},
    "rebuttal":     {"clash", "drops", "evidence_use"},
    "summary":      {"extensions", "weighing", "drops"},
    "final_focus":  {"weighing", "judge_adaptation", "extensions"},
    "crossfire":    {"clash", "judge_adaptation"},
}

SEVERITY_BASE: dict[str, float] = {"high": 5.0, "medium": 3.0, "low": 1.5}

# Per-skill success criteria shown to the student
SUCCESS_CRITERIA: dict[str, list[str]] = {
    "warranting": [
        "Your claim, the causal mechanism (WHY), and the resulting impact are all present.",
        "You can state the causal chain in under 45 seconds without stopping.",
    ],
    "weighing": [
        "You explicitly name both sides' impacts.",
        "You use at least one weighing mechanism: magnitude, timeframe, probability, or reversibility.",
        "Your comparison closes with a clear voting issue statement.",
    ],
    "extensions": [
        "You name the argument being extended.",
        "You explain why their response fails the warrant.",
        "You re-establish the impact with full force.",
    ],
    "drops": [
        "Every opponent argument has at least a one-sentence direct response.",
        "No opponent argument is left completely unaddressed.",
    ],
    "evidence_use": [
        "Your tag line is a direct inference from card language — no overreach.",
        "The card directly supports the claim you are making.",
        "You identify the strongest sentence from the card and anchor your claim there.",
    ],
    "clash": [
        "Your response directly names the opponent's argument — no generic rebuttal.",
        "You provide a turn, no-link, or direct counter-argument.",
        "You explain why their argument fails or why your world still wins even if true.",
    ],
    "judge_adaptation": [
        "Your vocabulary and explanation depth match the judge's expertise level.",
        "You open with the argument the judge cares most about.",
    ],
    "delivery": [
        "Your pace stays in the 150–175 WPM target range.",
        "Filler word count is at least 50% lower than in your original speech.",
    ],
    "organization": [
        "Every argument block starts with a numbered label or signpost.",
        "Claim, warrant, and impact are clearly separated within each block.",
    ],
}

# ── Helpers ────────────────────────────────────────────────────────────────────

_SKILL_KEYWORDS: list[tuple[str, str]] = [
    ("judge adaptation", "judge_adaptation"),
    ("evidence use",     "evidence_use"),
    ("evidence",         "evidence_use"),
    ("warranting",       "warranting"),
    ("weighing",         "weighing"),
    ("extensions",       "extensions"),
    ("drops",            "drops"),
    ("clash",            "clash"),
    ("delivery",         "delivery"),
    ("organization",     "organization"),
]


def _extract_skill_from_text(text: str) -> Optional[str]:
    """Return a canonical skill name found in free text, or None."""
    lower = text.lower()
    for keyword, skill in _SKILL_KEYWORDS:
        if keyword in lower:
            return skill
    return None


def _build_title(skill: str, speech_type: str) -> str:
    label = SKILL_LABELS.get(skill, skill)
    type_label = {
        "constructive": "Constructive",
        "rebuttal":     "Rebuttal",
        "summary":      "Summary",
        "final_focus":  "Final Focus",
        "crossfire":    "Crossfire",
    }.get(speech_type, "Speech")
    return f"Build {label} in Your {type_label}"


def _build_reason(
    skill: str,
    latest_issues: list[tuple[str, str]],  # (severity, explanation)
    factors: dict[str, Any],
    speech_type: str,
) -> str:
    label = SKILL_LABELS.get(skill, skill)
    parts: list[str] = []

    if latest_issues:
        sev, _ = max(latest_issues, key=lambda x: SEVERITY_BASE.get(x[0], 0))
        sev_phrase = {"high": "a critical", "medium": "a notable", "low": "a minor"}.get(sev, "a")
        parts.append(f"Your last speech showed {sev_phrase} gap in {label.lower()}.")
    elif factors.get("dimension_score") is not None:
        dim_score = factors["dimension_score"]
        parts.append(
            f"Your {label.lower()} score ({dim_score}/20) is below the target range."
        )

    if factors.get("repeated_across_speeches"):
        n = factors["repeated_across_speeches"]
        parts.append(
            f"This weakness has appeared in {n} of your recent speeches"
            " — addressing it now will have the biggest impact."
        )

    if factors.get("speech_type_relevant"):
        type_phrase = {
            "constructive": "constructive speeches",
            "rebuttal":     "rebuttal speeches",
            "summary":      "summary speeches",
            "final_focus":  "final focus speeches",
            "crossfire":    "crossfire rounds",
        }.get(speech_type, "this speech type")
        parts.append(f"{label} is especially critical for {type_phrase}.")

    if factors.get("coach_assigned"):
        parts.append("Your coach has flagged this skill as a priority.")

    if not parts:
        parts.append(f"Improving {label.lower()} will strengthen your next speech.")

    return " ".join(parts)


def _build_evidence(
    latest_issues: list[tuple[str, str]],  # (severity, explanation)
    report: dict,
) -> str:
    if latest_issues:
        _, explanation = max(latest_issues, key=lambda x: SEVERITY_BASE.get(x[0], 0))
        if explanation:
            return explanation[:300]

    for weakness in (report.get("weaknesses") or []):
        if weakness:
            return weakness[:300]

    summary = report.get("summary") or ""
    if summary:
        return summary[:200]

    return "Identified as a priority area in your latest speech report."


# ── Public entry point ─────────────────────────────────────────────────────────

def recommend_mission(
    user_id: str,
    speeches: list[dict],
    feedback_reports: list[dict],
    drills: list[dict],
    delivery_metrics_map: dict[str, dict],
    coach_assignments: list[dict],
    recent_missions: list[dict],
) -> Optional[dict[str, Any]]:
    """
    Deterministic mission selection.

    ``speeches`` must be sorted most-recent-first and contain only speeches
    whose status is 'done'. ``feedback_reports`` must cover those speeches.
    Returns None when insufficient data is available.
    """
    if not speeches or not feedback_reports:
        return None

    report_by_speech: dict[str, dict] = {r["speech_id"]: r for r in feedback_reports}
    latest_speech = speeches[0]
    latest_report = report_by_speech.get(latest_speech["id"])
    if not latest_report:
        return None

    speech_type    = latest_speech.get("speech_type") or "constructive"
    critical_skills = _SPEECH_TYPE_CRITICAL.get(speech_type, set())

    # ── Gather issues across recent speeches ──────────────────────────────────
    # skill → list of (severity, speech_idx, explanation)
    skill_issues: dict[str, list[tuple[str, int, str]]] = defaultdict(list)

    for speech_idx, speech in enumerate(speeches):
        report = report_by_speech.get(speech["id"])
        if not report:
            continue
        raw = report.get("raw_feedback") or {}
        for issue in (raw.get("structured_issues") or []):
            skill = ISSUE_TO_SKILL.get(issue.get("issue_type", ""), "")
            if not skill:
                continue
            skill_issues[skill].append((
                issue.get("severity", "low"),
                speech_idx,
                issue.get("explanation", ""),
            ))

    # ── Delivery signal ───────────────────────────────────────────────────────
    latest_delivery = delivery_metrics_map.get(latest_speech["id"])
    if latest_delivery:
        wpm    = latest_delivery.get("words_per_minute") or 0
        filler = latest_delivery.get("filler_word_count") or 0
        pacing = latest_delivery.get("pacing_band") or "steady"
        dscore = latest_delivery.get("delivery_score")
        if (
            pacing in ("too_fast", "too_slow")
            or filler >= 8
            or (dscore is not None and dscore < 60)
        ):
            sev = "high" if filler >= 8 else "medium"
            skill_issues["delivery"].append((
                sev, 0,
                f"Pacing: {pacing}, filler words: {filler}, score: {dscore}.",
            ))

    # ── Low judge_adaptation dimension even without structured issue ──────────
    latest_scores = latest_report.get("scores") or {}
    if isinstance(latest_scores, dict):
        ja = latest_scores.get("judge_adaptation")
        if ja is not None and ja < 10:
            skill_issues["judge_adaptation"].append(("medium", 0, f"Judge adaptation score is low ({ja}/20)."))

    # ── Drills by skill (incomplete only) ────────────────────────────────────
    drill_by_skill: dict[str, list[dict]] = defaultdict(list)
    for drill in drills:
        if drill.get("status") != "completed":
            drill_by_skill[drill.get("skill_target", "")].append(drill)

    # ── Recently completed mission skills ─────────────────────────────────────
    completed_skills: set[str] = {m["skill"] for m in recent_missions if m.get("skill")}

    # ── Coach-assigned skills ─────────────────────────────────────────────────
    coach_skills: set[str] = set()
    for assignment in coach_assignments:
        for text in [assignment.get("goal") or ""] + list(assignment.get("success_criteria") or []):
            if text:
                found = _extract_skill_from_text(text)
                if found:
                    coach_skills.add(found)

    # ── Build candidate set ───────────────────────────────────────────────────
    candidates: set[str] = set(skill_issues.keys())
    # Add dimension-deficit candidates even when no structured issues present
    if isinstance(latest_scores, dict):
        for skill, dim in SKILL_TO_DIM.items():
            if (latest_scores.get(dim) or 20) < 12:
                candidates.add(skill)

    # ── Score each candidate ──────────────────────────────────────────────────
    best_skill:    Optional[str]       = None
    best_score:    float               = -1.0
    best_factors:  dict[str, Any]      = {}

    for skill in candidates:
        issues = skill_issues.get(skill, [])
        factors: dict[str, Any] = {}

        # 1. Severity from latest speech
        latest_issues_for_skill = [(sev, exp) for sev, idx, exp in issues if idx == 0]
        if latest_issues_for_skill:
            max_sev, _ = max(latest_issues_for_skill, key=lambda x: SEVERITY_BASE.get(x[0], 0))
            base_score = SEVERITY_BASE[max_sev]
            factors["latest_severity"] = max_sev
        else:
            base_score = 0.0

        # 2. Repetition bonus
        rep_count = len({idx for _, idx, _ in issues})
        rep_bonus = min(rep_count - 1, 3) * 2.0 if rep_count > 1 else 0.0
        if rep_bonus:
            factors["repetition_bonus"]         = rep_bonus
            factors["repeated_across_speeches"] = rep_count

        # 3. Dimension deficit
        dim_deficit = 0.0
        dim_key = SKILL_TO_DIM.get(skill)
        if dim_key and isinstance(latest_scores, dict):
            dim_val = latest_scores.get(dim_key)
            if dim_val is not None:
                dim_deficit = (20 - dim_val) * 0.4  # up to 8 pts
                factors["dimension_score"]   = dim_val
                factors["dimension_deficit"] = round(dim_deficit, 2)

        # 4. Speech-type relevance
        type_bonus = 3.0 if skill in critical_skills else 0.0
        if type_bonus:
            factors["speech_type_relevant"] = True

        # 5. Coach assignment
        coach_bonus = 5.0 if skill in coach_skills else 0.0
        if coach_bonus:
            factors["coach_assigned"] = True

        # 6. Has incomplete drill — penalty (student is already working on it)
        drill_pen = 2.0 if drill_by_skill.get(skill) else 0.0
        if drill_pen:
            factors["has_incomplete_drill"] = True

        # 7. Recently completed — heavy penalty
        recent_pen = 10.0 if skill in completed_skills else 0.0
        if recent_pen:
            factors["recently_completed"] = True

        total = (
            base_score + rep_bonus + dim_deficit + type_bonus + coach_bonus
            - drill_pen - recent_pen
        )

        if total > best_score:
            best_score   = total
            best_skill   = skill
            best_factors = factors

    if best_skill is None or best_score <= 0:
        return None

    # ── Build mission payload ─────────────────────────────────────────────────
    skill_issues_for_best    = skill_issues.get(best_skill, [])
    latest_issues_for_best   = [(sev, exp) for sev, idx, exp in skill_issues_for_best if idx == 0]

    reason   = _build_reason(best_skill, latest_issues_for_best, best_factors, speech_type)
    evidence = _build_evidence(latest_issues_for_best, latest_report)

    # Recommended drill — first incomplete drill matching the skill
    recommended_drill_id: Optional[str] = None
    drill_candidates = drill_by_skill.get(best_skill, [])
    if drill_candidates:
        recommended_drill_id = drill_candidates[0]["id"]

    # Estimated time: drill time + context browsing + potential re-record
    if recommended_drill_id and drill_candidates:
        est_sec = drill_candidates[0].get("time_limit_seconds") or 300
        estimated_minutes = max(5, (est_sec // 60) + 3)
    else:
        estimated_minutes = 10

    # Before-score snapshot
    before_score: dict[str, Any] = {}
    if isinstance(latest_scores, dict):
        before_score.update(latest_scores)
    if latest_delivery:
        before_score["delivery_score"]     = latest_delivery.get("delivery_score")
        before_score["words_per_minute"]   = latest_delivery.get("words_per_minute")
        before_score["filler_word_count"]  = latest_delivery.get("filler_word_count")

    return {
        "user_id":              user_id,
        "mission_type":         "skill_focus",
        "skill":                best_skill,
        "title":                _build_title(best_skill, speech_type),
        "reason":               reason,
        "evidence":             evidence,
        "source_speech_id":     latest_speech["id"],
        "source_report_id":     latest_report["id"],
        "recommended_drill_id": recommended_drill_id,
        "priority_score":       round(best_score, 2),
        "priority_factors":     best_factors,
        "status":               "ready",
        "before_score":         before_score or None,
        "success_criteria":     SUCCESS_CRITERIA.get(best_skill, []),
        "estimated_minutes":    estimated_minutes,
    }
