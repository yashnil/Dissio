"""Pass 22 — Judge Adaptation practice-attempt scoring (Phase 7D).

v1 heuristic scorer: deterministic, keyword/structure-based arithmetic over
the adaptation's own result_json plus the student's pasted attempt text.
No LLM call. Every dimension carries a real explanation of what was
actually checked, so the score is transparent rather than a black box.

This is explicitly NOT a full human judge — it approximates a few
observable signals (vocabulary level, weighing language, flow labeling,
hedged vs. overclaimed causal language, coverage of the adaptation's own
guidance) that correlate with judge-appropriate delivery.
"""

from __future__ import annotations

from app.models.judge_adaptation import JudgeAdaptationAttemptDimension, JudgeType

MIN_ATTEMPT_LENGTH = 40

_JARGON_TERMS = [
    "a priori", "prima facie", "ceteris paribus", "topicality", "kritik",
    "counterplan", "solvency", "uniqueness", "non-unique", "nonunique",
    "impact calculus", "link chain", "internal link", "spike", "perm",
    "condo", "dispo", "theory shell", "framework debate",
]

_WEIGHING_MARKERS = [
    "outweighs", "outweigh", "compared to", "more important than", "bigger than",
    "matters more", "even if", "timeframe", "magnitude", "probability",
    "reverses", "turns their", "on balance", "weigh",
]

_TECHNICAL_MARKERS = [
    "extend", "cross-apply", "concede", "conceded", "dropped", "drop",
    "on this point", "line by line", "the flow", "my opponent's argument",
]

_REAL_WORLD_MARKERS = [
    "for example", "imagine", "think about", "like when", "picture this",
    "in real life", "for instance", "picture",
]

_HEDGE_MARKERS = [
    "suggests", "indicates", "is associated with", "tends to", "likely",
    "according to", "the evidence shows",
]

_OVERCLAIM_MARKERS = [
    "proves", "guarantees", "always causes", "definitely causes",
    "100% certain", "without a doubt", "undeniably",
]

_STOPWORDS = {
    "the", "a", "an", "and", "or", "but", "of", "to", "in", "on", "for",
    "with", "is", "are", "was", "were", "be", "this", "that", "it", "its",
    "as", "at", "by", "from", "your", "you", "not", "no",
}


def _clamp(v: int) -> int:
    return max(0, min(100, v))


def _find_hits(text_lower: str, terms: list[str]) -> list[str]:
    return [t for t in terms if t in text_lower]


def _keyword_tokens(phrase: str) -> list[str]:
    """Non-trivial words (len >= 4, not a stopword) from a guidance phrase —
    used for lenient "did the attempt cover this idea" matching."""
    words = "".join(c if c.isalnum() or c.isspace() else " " for c in phrase.lower()).split()
    return [w for w in words if len(w) >= 4 and w not in _STOPWORDS]


def _phrase_covered(text_lower: str, phrase: str) -> bool:
    tokens = _keyword_tokens(phrase)
    if not tokens:
        return False
    return any(t in text_lower for t in tokens)


def _dim(key: str, score: int, explanation: str) -> JudgeAdaptationAttemptDimension:
    return JudgeAdaptationAttemptDimension(dimension=key, score=_clamp(score), explanation=explanation)


def score_practice_attempt(
    *,
    judge_type: JudgeType,
    source_type: str,
    attempt_text: str,
    result_json: dict,
    card_support_verdict: str | None = None,
) -> tuple[list[JudgeAdaptationAttemptDimension], list[str], list[str], list[str], str]:
    """
    Score a pasted practice-delivery attempt against its adaptation result.

    Returns (dimensions, what_improved, what_still_needs_work,
    integrity_warnings, next_retry_suggestion).
    """
    text = attempt_text.strip()
    text_lower = text.lower()
    word_count = len(text.split())

    emphasize: list[str] = result_json.get("what_to_emphasize") or []
    simplify: list[str] = result_json.get("what_to_simplify") or []
    must_remain_explicit: list[str] = result_json.get("what_must_remain_explicit") or []
    suggested_phrasing: list[str] = result_json.get("suggested_phrasing") or []
    risks: list[dict] = (result_json.get("risks") or []) + (result_json.get("critical_risks") or [])
    evidence_guide: dict = result_json.get("evidence_guide") or {}

    risk_categories = {r.get("category") for r in risks if isinstance(r, dict)}
    dimensions: list[JudgeAdaptationAttemptDimension] = []
    integrity_warnings: list[str] = []

    # ── judge_fit: vocabulary level appropriate to this judge ────────────────
    jargon_hits = _find_hits(text_lower, _JARGON_TERMS)
    if judge_type in ("lay", "parent"):
        deduction = min(70, len(jargon_hits) * 25)
        judge_fit = 95 - deduction
        explanation = (
            f"Uses {len(jargon_hits)} debate-jargon term(s) ({', '.join(jargon_hits[:3])}) a "
            f"{judge_type} judge won't recognize."
            if jargon_hits else
            f"No debate jargon detected — appropriate vocabulary for a {judge_type} judge."
        )
    elif judge_type in ("flow", "technical"):
        technical_hits = _find_hits(text_lower, _TECHNICAL_MARKERS)
        judge_fit = 45 + min(50, len(technical_hits) * 18)
        explanation = (
            f"References the flow directly with {len(technical_hits)} marker(s) "
            f"({', '.join(technical_hits[:3])})."
            if technical_hits else
            f"No explicit flow language (extend / concede / on this point) — a {judge_type} "
            "judge expects the flow referenced directly."
        )
    else:  # coach / custom
        judge_fit = 75
        explanation = "Coach judges weigh strategic soundness broadly — no single vocabulary check applies."
    dimensions.append(_dim("judge_fit", judge_fit, explanation))

    # ── clarity: length in a deliverable range, not a jargon dump ────────────
    if word_count < 15:
        clarity = 35
        clarity_expl = f"Only {word_count} words — too short to judge whether the delivery is clear."
    elif word_count > 220:
        clarity = 60
        clarity_expl = f"{word_count} words is long for a single delivery attempt — consider tightening it."
    else:
        clarity = 90 - min(30, len(jargon_hits) * 10)
        clarity_expl = f"{word_count} words is a reasonable length for a spoken delivery attempt."
    dimensions.append(_dim("clarity", clarity, clarity_expl))

    # ── evidence_preservation: citation marker + explicit-keep coverage ──────
    if source_type == "evidence":
        citation = evidence_guide.get("short_citation") or evidence_guide.get("card_tag")
        cite_tokens = _keyword_tokens(citation) if citation else []
        cite_present = bool(cite_tokens) and any(t in text_lower for t in cite_tokens)
        keep_covered = [k for k in must_remain_explicit if _phrase_covered(text_lower, k)]
        keep_ratio = (len(keep_covered) / len(must_remain_explicit)) if must_remain_explicit else None
        if citation and not cite_present:
            evidence_preservation = 45
            evidence_expl = "No recognizable citation/source reference found for this evidence card."
            integrity_warnings.append(
                "Your attempt doesn't reference the card's source — make sure you still attribute it "
                "when you actually deliver this."
            )
        elif keep_ratio is not None:
            evidence_preservation = _clamp(int(50 + keep_ratio * 50))
            evidence_expl = (
                f"Covers {len(keep_covered)}/{len(must_remain_explicit)} item(s) that must stay explicit."
            )
        else:
            evidence_preservation = 80
            evidence_expl = "Citation reference found; no explicit-keep list was returned to check further."
    else:
        keep_covered = [k for k in must_remain_explicit if _phrase_covered(text_lower, k)]
        if must_remain_explicit:
            keep_ratio = len(keep_covered) / len(must_remain_explicit)
            evidence_preservation = _clamp(int(50 + keep_ratio * 50))
            evidence_expl = f"Covers {len(keep_covered)}/{len(must_remain_explicit)} item(s) that must stay explicit."
        else:
            evidence_preservation = 75
            evidence_expl = "No explicit-keep list returned for this material — nothing specific to check."
    dimensions.append(_dim("evidence_preservation", evidence_preservation, evidence_expl))

    # ── weighing_adaptation: comparative/weighing language ────────────────────
    weighing_hits = _find_hits(text_lower, _WEIGHING_MARKERS)
    if judge_type in ("flow", "technical", "coach"):
        weighing = 40 + min(55, len(weighing_hits) * 20)
        weighing_expl = (
            f"Uses weighing language ({', '.join(weighing_hits[:3])})."
            if weighing_hits else
            f"No comparative/weighing language found — {judge_type} judges expect explicit weighing."
        )
    else:
        weighing = 70 + min(25, len(weighing_hits) * 15)
        weighing_expl = (
            f"Includes comparative language ({', '.join(weighing_hits[:2])}), which helps any judge."
            if weighing_hits else
            "No explicit weighing language — optional for this judge type but never hurts."
        )
    dimensions.append(_dim("weighing_adaptation", weighing, weighing_expl))

    # ── technical_precision: flow labeling (flow/technical) or concreteness ──
    if judge_type in ("flow", "technical"):
        technical_hits = _find_hits(text_lower, _TECHNICAL_MARKERS)
        technical_precision = 40 + min(55, len(technical_hits) * 18)
        technical_expl = (
            f"Labels the argument on the flow ({', '.join(technical_hits[:3])})."
            if technical_hits else
            "No line-by-line/labeling language found — precise judges expect arguments tied to the flow."
        )
    else:
        real_world_hits = _find_hits(text_lower, _REAL_WORLD_MARKERS)
        technical_precision = 55 + min(40, len(real_world_hits) * 20)
        technical_expl = (
            f"Grounds the claim in a concrete example ({', '.join(real_world_hits[:2])})."
            if real_world_hits else
            "No concrete example or real-world framing found."
        )
    dimensions.append(_dim("technical_precision", technical_precision, technical_expl))

    # ── risk_avoidance: mitigates the SPECIFIC risks this adaptation flagged ─
    if not risk_categories:
        risk_avoidance = 85
        risk_expl = "No risks were flagged for this adaptation to check against."
    else:
        mitigated = 0
        checked = 0
        details: list[str] = []
        if "jargon_overflow" in risk_categories:
            checked += 1
            if not jargon_hits:
                mitigated += 1
            else:
                details.append("jargon risk not mitigated")
        if "causal_overstatement" in risk_categories or "source_qualification_inflated" in risk_categories:
            checked += 1
            overclaim_hits = _find_hits(text_lower, _OVERCLAIM_MARKERS)
            hedge_hits = _find_hits(text_lower, _HEDGE_MARKERS)
            if overclaim_hits:
                details.append(f"still overclaims ({overclaim_hits[0]})")
                integrity_warnings.append(
                    f"Your attempt uses absolute language (\"{overclaim_hits[0]}\") on a claim this "
                    "adaptation flagged as a causal-overstatement risk — hedge it instead."
                )
            elif hedge_hits:
                mitigated += 1
            else:
                mitigated += 0.5
        if "under_explanation" in risk_categories:
            checked += 1
            if word_count >= 30:
                mitigated += 1
            else:
                details.append("still under-explained")
        if checked == 0:
            risk_avoidance = 80
            risk_expl = f"{len(risk_categories)} risk(s) flagged, but none have an automated check yet."
        else:
            risk_avoidance = _clamp(int(40 + (mitigated / checked) * 60))
            risk_expl = (
                f"Checked {checked} flagged risk(s); {'no issues found' if not details else '; '.join(details)}."
            )
    dimensions.append(_dim("risk_avoidance", risk_avoidance, risk_expl))

    # ── delivery_focus: covers this adaptation's own emphasis/phrasing ───────
    emphasize_covered = [e for e in emphasize if _phrase_covered(text_lower, e)]
    phrasing_covered = [p for p in suggested_phrasing if _phrase_covered(text_lower, p)]
    simplify_still_present = [s for s in simplify if _phrase_covered(text_lower, s)]
    total_targets = len(emphasize) + len(suggested_phrasing)
    if total_targets == 0:
        delivery_focus = 75
        delivery_expl = "No emphasis or phrasing guidance was returned for this adaptation to check against."
    else:
        hit_count = len(emphasize_covered) + len(phrasing_covered)
        delivery_focus = _clamp(int(40 + (hit_count / total_targets) * 60))
        delivery_expl = (
            f"Covers {len(emphasize_covered)}/{len(emphasize)} emphasis point(s) and "
            f"{len(phrasing_covered)}/{len(suggested_phrasing)} suggested phrasing idea(s)."
        )
    dimensions.append(_dim("delivery_focus", delivery_focus, delivery_expl))

    # ── unsupported/contradicted evidence: never treated as safe ─────────────
    if card_support_verdict in ("unsupported", "contradicted"):
        integrity_warnings.insert(
            0,
            "This card's verdict says it doesn't support its claim — fix the evidence in your "
            "Library before practicing its delivery further.",
        )

    # ── roll-up ────────────────────────────────────────────────────────────
    what_improved = [f"{d.dimension.replace('_', ' ')}: {d.explanation}" for d in dimensions if d.score >= 75]
    what_still_needs_work = [f"{d.dimension.replace('_', ' ')}: {d.explanation}" for d in dimensions if d.score < 55]

    weakest = min(dimensions, key=lambda d: d.score)
    next_retry_suggestion = (
        f"Focus your next attempt on {weakest.dimension.replace('_', ' ')}: {weakest.explanation}"
    )

    return dimensions, what_improved, what_still_needs_work, integrity_warnings, next_retry_suggestion
