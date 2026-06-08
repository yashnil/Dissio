"""Evidence support check service.

Given a speech claim and a list of candidate evidence card texts,
determines whether the uploaded cards support the claim.

Steps:
  1. Score each candidate card by keyword overlap (lexical match).
  2. Take the top-N candidates.
  3. If no candidates pass threshold → return 'unverifiable'.
  4. Otherwise, call the LLM with strict constraints:
     - Only the provided card texts may be used as evidence.
     - The LLM must not use outside knowledge.
     - It must return one of four support levels.

Support levels:
  - supported           — uploaded card clearly supports exact claim/warrant
  - partially_supported — card supports topic but not specific magnitude/impact
  - unsupported         — card contradicts or does not support the claim
  - unverifiable        — no uploaded card matches the claim at all
"""

from __future__ import annotations

import logging
import re
from typing import Optional

import openai
from pydantic import BaseModel

from app.config import settings
from app.models.document import EvidenceCardRow, EvidenceSupportLevel

logger = logging.getLogger(__name__)

# Minimum word-overlap score to consider a card as a candidate
_MIN_OVERLAP_SCORE = 2
# Maximum candidates sent to LLM
_MAX_CANDIDATES = 5


# ── Lexical scoring ────────────────────────────────────────────────────────────

_STOP_WORDS = frozenset({
    "the", "a", "an", "is", "are", "was", "were", "be", "been",
    "have", "has", "had", "do", "does", "did", "will", "would",
    "could", "should", "may", "might", "shall", "to", "of", "in",
    "on", "at", "by", "for", "with", "from", "this", "that",
    "it", "its", "they", "their", "and", "or", "but", "not",
    "if", "as", "so", "than", "more", "less", "such", "also",
})


def _keywords(text: str) -> set[str]:
    words = re.findall(r"\b[a-z]{3,}\b", text.lower())
    return {w for w in words if w not in _STOP_WORDS}


def _overlap_score(query_kw: set[str], card_text: str) -> int:
    card_kw = _keywords(card_text)
    return len(query_kw & card_kw)


def _rank_candidates(
    claim: str,
    evidence_from_speech: Optional[str],
    cards: list[EvidenceCardRow],
) -> list[tuple[int, EvidenceCardRow]]:
    """Return (score, card) pairs sorted by overlap score descending."""
    query = f"{claim} {evidence_from_speech or ''}"
    query_kw = _keywords(query)
    if not query_kw:
        return []

    scored = [
        (_overlap_score(query_kw, card.card_text), card)
        for card in cards
    ]
    scored.sort(key=lambda x: x[0], reverse=True)
    return [(score, card) for score, card in scored if score >= _MIN_OVERLAP_SCORE]


# ── LLM classification ─────────────────────────────────────────────────────────

class _SupportCheckOutput(BaseModel):
    support_level: str
    """One of: supported, partially_supported, unsupported, unverifiable"""
    explanation: str
    """One or two sentences. Cite specific text from the provided card. No outside knowledge."""


_SYSTEM_PROMPT = """\
You are a debate coach reviewing whether an uploaded evidence card supports a debater's claim.

RULES — you must follow these exactly:
1. Base your judgment ONLY on the provided card text below. Do not use outside knowledge.
2. If none of the provided card texts support the claim, output support_level = "unverifiable".
3. Choose exactly one support_level from: supported, partially_supported, unsupported, unverifiable.
   - supported: the card clearly establishes the specific claim and mechanism the debater stated
   - partially_supported: the card is relevant to the topic but does not prove the exact claim or magnitude
   - unsupported: the card contradicts the claim or is completely irrelevant
   - unverifiable: no provided card addresses the claim at all
4. In explanation, quote or closely paraphrase the card text you relied on.
   Do not invent evidence or reference sources not provided.
"""


def _classify_with_llm(
    claim: str,
    evidence_from_speech: Optional[str],
    candidates: list[EvidenceCardRow],
) -> tuple[str, str]:
    """Call GPT-4o-mini to classify support level. Returns (level, explanation)."""
    if not settings.openai_api_key:
        return EvidenceSupportLevel.UNVERIFIABLE, "OpenAI API key not configured."

    card_blocks = "\n\n---\n\n".join(
        f"CARD {i + 1} (author: {c.author or 'unknown'}, year: {c.year or 'unknown'}):\n{c.card_text[:800]}"
        for i, c in enumerate(candidates)
    )

    user_msg = (
        f"Debater's claim: {claim}\n"
        f"Debater's cited evidence: {evidence_from_speech or '(none stated)'}\n\n"
        f"Uploaded evidence cards:\n{card_blocks}"
    )

    try:
        client = openai.OpenAI(api_key=settings.openai_api_key)
        response = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": _SYSTEM_PROMPT},
                {"role": "user", "content": user_msg},
            ],
            response_format=_SupportCheckOutput,
            max_tokens=200,
        )
        result = response.choices[0].message.parsed
        if result is None:
            return EvidenceSupportLevel.UNVERIFIABLE, "Could not classify support."

        level = result.support_level
        if level not in {
            EvidenceSupportLevel.SUPPORTED,
            EvidenceSupportLevel.PARTIALLY_SUPPORTED,
            EvidenceSupportLevel.UNSUPPORTED,
            EvidenceSupportLevel.UNVERIFIABLE,
        }:
            level = EvidenceSupportLevel.UNVERIFIABLE

        return level, result.explanation

    except openai.AuthenticationError:
        return EvidenceSupportLevel.UNVERIFIABLE, "API authentication error."
    except Exception as exc:
        logger.warning("evidence_support_check: LLM failed | %s", exc)
        return EvidenceSupportLevel.UNVERIFIABLE, "Could not complete support check."


# ── Public entry point ─────────────────────────────────────────────────────────

class SupportCheckResult:
    """Output of check_claim_support."""

    __slots__ = ("support_level", "explanation", "matched_card")

    def __init__(
        self,
        support_level: str,
        explanation: str,
        matched_card: Optional[EvidenceCardRow],
    ) -> None:
        self.support_level = support_level
        self.explanation = explanation
        self.matched_card = matched_card


def check_claim_support(
    claim: str,
    evidence_from_speech: Optional[str],
    library_cards: list[EvidenceCardRow],
) -> SupportCheckResult:
    """Check whether any uploaded evidence card supports a speech claim.

    Args:
        claim: The debater's stated claim (from argument_map).
        evidence_from_speech: The evidence phrase the debater cited (may be None).
        library_cards: All evidence cards in the user's library.

    Returns:
        SupportCheckResult with support_level, explanation, and matched_card.
        support_level is 'unverifiable' when no card is found.
    """
    if not library_cards:
        return SupportCheckResult(
            support_level=EvidenceSupportLevel.UNVERIFIABLE,
            explanation="No evidence has been uploaded to your library.",
            matched_card=None,
        )

    ranked = _rank_candidates(claim, evidence_from_speech, library_cards)

    if not ranked:
        return SupportCheckResult(
            support_level=EvidenceSupportLevel.UNVERIFIABLE,
            explanation=(
                "No uploaded evidence cards matched the keywords in your claim. "
                "Upload a case file that includes evidence for this argument."
            ),
            matched_card=None,
        )

    top_candidates = [card for _, card in ranked[:_MAX_CANDIDATES]]

    logger.info(
        "evidence_support_check: classifying | candidates=%d claim_len=%d",
        len(top_candidates),
        len(claim),
    )

    level, explanation = _classify_with_llm(claim, evidence_from_speech, top_candidates)

    # Best matched card is the top lexical hit (first in ranked list)
    best_card = top_candidates[0] if level != EvidenceSupportLevel.UNVERIFIABLE else None

    return SupportCheckResult(
        support_level=level,
        explanation=explanation,
        matched_card=best_card,
    )
