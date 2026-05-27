import logging
from typing import Optional

import openai
from pydantic import BaseModel

from app.config import settings
from app.models.argument_map import ArgumentItem

logger = logging.getLogger(__name__)


class ArgumentExtractionError(Exception):
    pass


class _ArgumentList(BaseModel):
    """Wrapper used as the structured-output schema for OpenAI."""

    arguments: list[ArgumentItem]


_SPEECH_TYPE_GUIDANCE: dict[str, str] = {
    "constructive": (
        "This is a constructive speech presenting the initial case. "
        "Extract each contention with its full claim/warrant/evidence/impact chain. "
        "Identify the key offense the team is running and any preemptive responses."
    ),
    "rebuttal": (
        "This is a rebuttal speech. "
        "Extract direct responses to the opponent's contentions (argument_type: response or defense) "
        "and any extensions or re-establishments of the team's own case (argument_type: offense). "
        "Note dropped arguments as high-confidence issues."
    ),
    "summary": (
        "This is a summary speech. "
        "Extract what is being extended from the constructive and rebuttal, "
        "how impacts are being weighed (argument_type: weighing), "
        "and any new framing or voting issues introduced."
    ),
    "final_focus": (
        "This is a final focus speech. "
        "Extract the key voting issues, decisive impact comparisons (argument_type: weighing), "
        "and the final framing of why this side wins."
    ),
    "crossfire": (
        "This is a crossfire. "
        "Extract concessions made, critical questions that revealed weaknesses, "
        "and any clarifications that affect other arguments. "
        "Label each with who made the concession or what argument was exposed."
    ),
}

_SYSTEM_PROMPT_TEMPLATE = """\
You are an expert Public Forum debate analyst trained to extract structured argument components from speech transcripts.

Speech context:
- Speech type: {speech_type}
- Side: {side}
- Topic: {topic}
- Judge type: {judge_type}

{speech_type_guidance}

For each distinct argument unit in the transcript, extract:
- label: Short identifier, e.g. "C1: Economic Growth", "Rebuttal: Poverty Link", "Weighing: Magnitude"
- claim: The specific assertion (1-2 sentences). Not a summary—quote or closely paraphrase the debater.
- warrant: The reasoning linking the claim to the evidence or impact (1-2 sentences)
- evidence: The cited study, statistic, expert, or example (null if none given)
- impact: The ultimate harm or benefit argued (1-2 sentences)
- argument_type: One of "offense" (advances own case), "defense" (responds to opponent), \
"weighing" (compares impacts), "response" (direct line-by-line response), "unclear"
- issues: List of identified weaknesses from: ["missing warrant", "unsupported evidence", \
"undeveloped impact", "no weighing", "unclear link", "assertion only", "dropped argument", \
"no internal link", "overextended evidence", "missing impact calculus"]
- confidence: Float 0.0-1.0 for how clearly this argument appears in the transcript

Judge adaptation note for {judge_type} judges:
{judge_guidance}

Do not summarize. Extract the actual arguments made. Be specific and debate-native.\
"""

_JUDGE_GUIDANCE: dict[str, str] = {
    "lay": "Flag missing real-world impact explanations and jargon that needs clarification.",
    "flow": "Flag dropped arguments, incomplete extensions, and missing line-by-line responses.",
    "tech": "Flag missing warrant chains, imprecise weighing, and unresolved argument clashes.",
    "coach": "Flag skill gaps—what the debater needs to learn, not just what they did wrong.",
    None: "Provide general debate feedback.",  # type: ignore[index]
}


def extract_arguments(
    text: str,
    speech_type: str,
    side: Optional[str],
    topic: Optional[str],
    judge_type: Optional[str],
) -> list[ArgumentItem]:
    """Extract structured PF argument components from a transcript using GPT-4o-mini.

    Returns a list of ArgumentItem.
    Raises ArgumentExtractionError with a user-safe message on failure.
    """
    logger.info(
        "argument_extraction: starting | speech_type=%s side=%s judge_type=%s "
        "openai_key_present=%s",
        speech_type,
        side,
        judge_type,
        bool(settings.openai_api_key),
    )

    system_prompt = _SYSTEM_PROMPT_TEMPLATE.format(
        speech_type=speech_type,
        side=side or "unknown",
        topic=topic or "not specified",
        judge_type=judge_type or "not specified",
        speech_type_guidance=_SPEECH_TYPE_GUIDANCE.get(speech_type, ""),
        judge_guidance=_JUDGE_GUIDANCE.get(judge_type, _JUDGE_GUIDANCE[None]),  # type: ignore[arg-type]
    )

    try:
        client = openai.OpenAI(api_key=settings.openai_api_key)
        response = client.beta.chat.completions.parse(
            model="gpt-4o-mini",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Transcript:\n\n{text}"},
            ],
            response_format=_ArgumentList,
        )
    except openai.AuthenticationError as exc:
        logger.error("argument_extraction: openai_auth_error | exc_type=%s", type(exc).__name__)
        raise ArgumentExtractionError(
            "Argument extraction failed. Check OpenAI API key, billing, or quota."
        ) from exc
    except openai.RateLimitError as exc:
        logger.error("argument_extraction: openai_rate_limit | exc_type=%s", type(exc).__name__)
        raise ArgumentExtractionError(
            "Argument extraction failed. Check OpenAI API key, billing, or quota."
        ) from exc
    except Exception as exc:
        logger.error(
            "argument_extraction: openai call failed | exc_type=%s",
            type(exc).__name__,
        )
        raise ArgumentExtractionError(
            "Argument extraction failed. Check backend logs."
        ) from exc

    parsed = response.choices[0].message.parsed
    if parsed is None:
        logger.error("argument_extraction: structured output returned None")
        raise ArgumentExtractionError("Argument extraction returned no data.")

    items = parsed.arguments
    logger.info("argument_extraction: success | argument_count=%d", len(items))
    return items
