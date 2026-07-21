"""Pass 23 — Judge Adaptation attempt trend aggregation (Phase 7E).

Pure aggregation over already-scored practice attempts (Phase 7D). No LLM
call, no new scoring logic — this only summarizes overall_fit / score_json
that judge_attempt_scorer already computed and persisted.

Every attempt row already carries judge_type, overall_fit, and score_json
(with its dimension breakdown) directly — no join back to judge_adaptations
is needed to build these summaries.

A single attempt never claims a trend: improvement_from_first is 0 (real,
not fabricated) when there's only one data point, and callers must gate
"improving" language on attempt count >= 2, not on this value alone.
"""

from __future__ import annotations

DIMENSION_LABELS: dict[str, str] = {
    "judge_fit": "Judge fit",
    "clarity": "Clarity",
    "evidence_preservation": "Evidence preservation",
    "weighing_adaptation": "Weighing & adaptation",
    "technical_precision": "Technical precision",
    "risk_avoidance": "Risk avoidance",
    "delivery_focus": "Delivery focus",
}


def _dimension_label(key: str) -> str:
    return DIMENSION_LABELS.get(key, key.replace("_", " ").capitalize())


def _avg(values: list[float]) -> float:
    return round(sum(values) / len(values), 1) if values else 0.0


def _row_dimensions(row: dict) -> list[dict]:
    dims = (row.get("score_json") or {}).get("dimensions")
    return dims if isinstance(dims, list) else []


def _valid_dims(row: dict) -> list[dict]:
    """Dimension entries with a real string key and numeric score only —
    malformed entries are skipped, never crash or get treated as score 0."""
    return [
        d for d in _row_dimensions(row)
        if isinstance(d, dict) and isinstance(d.get("dimension"), str)
        and isinstance(d.get("score"), (int, float))
    ]


def aggregate_attempt_trends(rows: list[dict]) -> dict:
    """
    Build the attempt-trends response from a user's attempt rows.

    `rows` must already be ordered newest-first and bounded by the caller
    (the API layer applies the query limit) — this function does not
    re-sort or re-limit, it only aggregates what it's given.

    Returns real zeros/empty arrays when `rows` is empty — never fabricated
    non-zero values.
    """
    total_attempts = len(rows)
    if total_attempts == 0:
        return {
            "total_attempts": 0,
            "latest_attempt_at": None,
            "latest_overall_fit": None,
            "best_overall_fit": None,
            "average_overall_fit": None,
            "first_overall_fit": None,
            "improvement_from_first": None,
            "attempts_by_judge_type": [],
            "weakest_dimensions": [],
            "strongest_dimensions": [],
            "recent_attempts": [],
        }

    # rows[0] is newest (query orders desc); rows[-1] is oldest in this window.
    fits = [r.get("overall_fit") for r in rows if r.get("overall_fit") is not None]
    latest_fit = rows[0].get("overall_fit")
    first_fit = rows[-1].get("overall_fit")
    improvement_from_first = (
        round(latest_fit - first_fit, 1) if latest_fit is not None and first_fit is not None else None
    )

    # ── Per judge_type ────────────────────────────────────────────────────
    by_judge: dict[str, list[dict]] = {}
    for r in rows:
        by_judge.setdefault(r["judge_type"], []).append(r)

    attempts_by_judge_type = []
    for judge_type, judge_rows in by_judge.items():
        # judge_rows preserves the overall newest-first order (stable partition).
        j_fits = [r.get("overall_fit") for r in judge_rows if r.get("overall_fit") is not None]
        j_latest = judge_rows[0].get("overall_fit")
        j_first = judge_rows[-1].get("overall_fit")
        attempts_by_judge_type.append({
            "judge_type": judge_type,
            "count": len(judge_rows),
            "latest_score": j_latest,
            "best_score": max(j_fits) if j_fits else None,
            "average_score": _avg(j_fits) if j_fits else None,
            "improvement_from_first": (
                round(j_latest - j_first, 1) if j_latest is not None and j_first is not None else None
            ),
            "latest_attempt_at": judge_rows[0].get("created_at"),
        })
    # Deterministic order: most-practiced judge type first, then alphabetical.
    attempts_by_judge_type.sort(key=lambda j: (-j["count"], j["judge_type"]))

    # ── Per dimension (across all judge types) ───────────────────────────
    dim_scores: dict[str, list[float]] = {}
    for r in rows:
        for d in _valid_dims(r):
            dim_scores.setdefault(d["dimension"], []).append(d["score"])

    dim_summaries = [
        {
            "dimension": key,
            "average_score": _avg(scores),
            "count": len(scores),
            "label": _dimension_label(key),
        }
        for key, scores in dim_scores.items()
    ]
    weakest_dimensions = sorted(dim_summaries, key=lambda d: d["average_score"])[:3]
    strongest_dimensions = sorted(dim_summaries, key=lambda d: -d["average_score"])[:3]

    # ── Recent attempts (already-bounded window; show the newest few) ────
    def _weakest_for_row(r: dict) -> str | None:
        valid = _valid_dims(r)
        if not valid:
            return None
        return _dimension_label(min(valid, key=lambda d: d["score"])["dimension"])

    recent_attempts = [
        {
            "judge_type": r["judge_type"],
            "overall_fit": r.get("overall_fit"),
            "created_at": r.get("created_at"),
            "weakest_dimension": _weakest_for_row(r),
        }
        for r in rows[:10]
    ]

    return {
        "total_attempts": total_attempts,
        "latest_attempt_at": rows[0].get("created_at"),
        "latest_overall_fit": latest_fit,
        "best_overall_fit": max(fits) if fits else None,
        "average_overall_fit": _avg(fits) if fits else None,
        "first_overall_fit": first_fit,
        "improvement_from_first": improvement_from_first,
        "attempts_by_judge_type": attempts_by_judge_type,
        "weakest_dimensions": weakest_dimensions,
        "strongest_dimensions": strongest_dimensions,
        "recent_attempts": recent_attempts,
    }
