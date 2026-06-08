"""Evidence card extraction from parsed document chunks.

Uses heuristic regex to detect:
  - tag / label lines
  - author names (Last, First or First Last pattern)
  - publication source
  - year (4-digit)
  - quoted card text

Optional LLM call generates a claim_summary sentence explaining
what the card actually supports. Never invents missing fields.

Safety rule: if author / source / year cannot be detected,
those fields are set to None and attribution_complete = False.
"""

from __future__ import annotations

import logging
import re
from typing import Optional

import openai
from pydantic import BaseModel

from app.config import settings
from app.services.document_parsing import TextChunk

logger = logging.getLogger(__name__)


# ── Heuristic patterns ─────────────────────────────────────────────────────────

# Year: standalone 4-digit number in the range 1900–2099
_YEAR_RE = re.compile(r"\b((?:19|20)\d{2})\b")

# Author patterns:
# - "Smith 2023" or "Smith and Jones 2023"
# - "Smith, John 2023"
# - "Jones et al. 2023" / "Jones et al 2023"
_AUTHOR_RE = re.compile(
    r"^([A-Z][a-zA-Z\-']{1,30}(?:\s+(?:and|&)\s+[A-Z][a-zA-Z\-']{1,30})?)"
    r"(?:,\s+[A-Z][a-z]+)?(?:\s+et\s+al\.?)?\s+"
    r"(?:(?:19|20)\d{2})",
    re.MULTILINE,
)

# TAG line: lines starting with TAG: or [TAG] or all-caps short labels
_TAG_RE = re.compile(
    r"(?:^TAG\s*:\s*(.+)$|^\[([^\]]+)\]$|^([A-Z][A-Z0-9\s\-]{2,60})\s*:)",
    re.MULTILINE | re.IGNORECASE,
)

# Source / publication (after author/year, common patterns)
_SOURCE_RE = re.compile(
    r"(?:Foreign Affairs|Journal of|Brookings|RAND|Carnegie|Heritage|"
    r"Harvard|MIT|Stanford|Oxford|Nature|Science|Reuters|AP|BBC|"
    r"Washington Post|New York Times|Wall Street Journal|"
    r"International Security|American Economic Review|"
    r"Proceedings of|Policy Review|National Review|"
    r"Foreign Policy|CSIS|Peterson Institute|IMF|World Bank|"
    r"Congressional Research Service|CRS|CBO|GAO)",
    re.IGNORECASE,
)

# Minimum card text length to extract (avoid extracting heading-only chunks)
_MIN_CARD_CHARS = 100


class _ClaimSummaryOutput(BaseModel):
    """Structured output for LLM claim summary."""
    claim_summary: str
    """One sentence explaining exactly what this evidence supports. No invented facts."""


class ExtractedCard:
    """An evidence card extracted from a document chunk (pre-DB insert)."""

    __slots__ = (
        "tag", "author", "source", "year",
        "card_text", "claim_summary", "attribution_complete",
        "chunk_index",
    )

    def __init__(
        self,
        *,
        tag: Optional[str],
        author: Optional[str],
        source: Optional[str],
        year: Optional[int],
        card_text: str,
        claim_summary: Optional[str],
        attribution_complete: bool,
        chunk_index: int,
    ) -> None:
        self.tag = tag
        self.author = author
        self.source = source
        self.year = year
        self.card_text = card_text
        self.claim_summary = claim_summary
        self.attribution_complete = attribution_complete
        self.chunk_index = chunk_index


def _extract_from_chunk(chunk: TextChunk) -> Optional[ExtractedCard]:
    """Apply heuristic extraction to a single chunk. Returns None if too short."""
    text = chunk.chunk_text.strip()
    if len(text) < _MIN_CARD_CHARS:
        return None

    # Tag
    tag: Optional[str] = None
    if chunk.heading:
        tag = chunk.heading.strip()
    else:
        m = _TAG_RE.search(text)
        if m:
            tag = (m.group(1) or m.group(2) or m.group(3) or "").strip() or None

    # Author
    author: Optional[str] = None
    m = _AUTHOR_RE.search(text)
    if m:
        author = m.group(1).strip()

    # Year
    year: Optional[int] = None
    m = _YEAR_RE.search(text)
    if m:
        year = int(m.group(1))

    # Source/publication
    source: Optional[str] = None
    m = _SOURCE_RE.search(text)
    if m:
        source = m.group(0).strip()

    attribution_complete = bool(author and year)

    return ExtractedCard(
        tag=tag,
        author=author,
        source=source,
        year=year,
        card_text=text,
        claim_summary=None,
        attribution_complete=attribution_complete,
        chunk_index=chunk.chunk_index,
    )


def _generate_claim_summary(card_text: str) -> Optional[str]:
    """Ask the LLM to summarize what this evidence actually supports.

    Uses one strict constraint: do not use outside knowledge.
    Returns None if the LLM call fails.
    """
    if not settings.openai_api_key:
        return None

    prompt = (
        "You are reviewing a debate evidence card. "
        "Write ONE sentence explaining exactly what this evidence proves or supports, "
        "based ONLY on its text — do not add outside knowledge or invent claims.\n\n"
        f"Evidence card:\n{card_text[:1500]}"
    )

    try:
        client = openai.OpenAI(api_key=settings.openai_api_key)
        response = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            response_format=_ClaimSummaryOutput,
            max_tokens=100,
        )
        result = response.choices[0].message.parsed
        return result.claim_summary if result else None
    except Exception as exc:
        logger.warning("evidence_extraction: claim_summary LLM failed | %s", exc)
        return None


# ── Public entry point ─────────────────────────────────────────────────────────

def extract_evidence_cards(
    chunks: list[TextChunk],
    *,
    generate_summaries: bool = True,
) -> list[ExtractedCard]:
    """Extract evidence cards from a list of parsed chunks.

    For each chunk that meets the minimum length, apply heuristic extraction.
    Optionally call the LLM to generate a one-sentence claim_summary per card.

    Safety: missing author/year/source fields remain None; never invented.
    """
    cards: list[ExtractedCard] = []

    for chunk in chunks:
        card = _extract_from_chunk(chunk)
        if card is None:
            continue

        if generate_summaries:
            card.claim_summary = _generate_claim_summary(card.card_text)

        cards.append(card)
        logger.debug(
            "evidence_extraction: card | idx=%d tag=%r author=%r year=%s complete=%s",
            card.chunk_index,
            card.tag,
            card.author,
            card.year,
            card.attribution_complete,
        )

    logger.info(
        "evidence_extraction: done | chunks=%d cards=%d",
        len(chunks),
        len(cards),
    )
    return cards
