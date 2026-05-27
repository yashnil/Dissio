import io
import logging

import openai

from app.config import settings
from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

# Whisper hard limit is 25 MB
WHISPER_MAX_BYTES = 25 * 1024 * 1024


class StorageDownloadError(Exception):
    pass


class OpenAITranscriptionError(Exception):
    pass


class AudioTooLargeError(Exception):
    pass


def transcribe_speech(audio_url: str) -> tuple[str, int]:
    """Download audio from Supabase Storage and transcribe via OpenAI Whisper.

    Returns (text, word_count).
    Raises StorageDownloadError, AudioTooLargeError, or OpenAITranscriptionError
    with user-safe messages on failure.
    """
    logger.info(
        "transcription: starting | audio_url=%s | openai_key_present=%s",
        audio_url,
        bool(settings.openai_api_key),
    )

    # Step 1: Download from Supabase Storage
    try:
        audio_bytes: bytes = get_supabase().storage.from_("audio").download(audio_url)
    except Exception as exc:
        logger.error(
            "transcription: storage_download failed | audio_url=%s | exc_type=%s",
            audio_url,
            type(exc).__name__,
        )
        raise StorageDownloadError(
            "Could not download audio from Supabase Storage."
        ) from exc

    byte_size = len(audio_bytes)
    logger.info("transcription: downloaded %d bytes | audio_url=%s", byte_size, audio_url)

    if byte_size > WHISPER_MAX_BYTES:
        logger.warning(
            "transcription: file too large (%d bytes) for Whisper | audio_url=%s",
            byte_size,
            audio_url,
        )
        raise AudioTooLargeError("Audio file is too large for transcription.")

    # Step 2: Transcribe via OpenAI Whisper
    ext = audio_url.rsplit(".", 1)[-1] if "." in audio_url else "mp3"
    audio_file = io.BytesIO(audio_bytes)
    audio_file.name = f"audio.{ext}"

    try:
        client = openai.OpenAI(api_key=settings.openai_api_key)
        result = client.audio.transcriptions.create(model="whisper-1", file=audio_file)
    except openai.AuthenticationError as exc:
        logger.error("transcription: openai_auth_error | exc_type=%s", type(exc).__name__)
        raise OpenAITranscriptionError(
            "OpenAI transcription failed. Check API key, billing, or quota."
        ) from exc
    except openai.RateLimitError as exc:
        logger.error("transcription: openai_rate_limit | exc_type=%s", type(exc).__name__)
        raise OpenAITranscriptionError(
            "OpenAI transcription failed. Check API key, billing, or quota."
        ) from exc
    except openai.BadRequestError as exc:
        msg = str(exc).lower()
        if "too large" in msg or "maximum" in msg or "size" in msg:
            logger.warning("transcription: openai_file_too_large | exc_type=%s", type(exc).__name__)
            raise AudioTooLargeError("Audio file is too large for transcription.") from exc
        logger.error("transcription: openai_bad_request | exc_type=%s", type(exc).__name__)
        raise OpenAITranscriptionError(
            "OpenAI transcription failed. Check API key, billing, or quota."
        ) from exc
    except Exception as exc:
        logger.error(
            "transcription: openai_transcription failed | exc_type=%s",
            type(exc).__name__,
        )
        raise OpenAITranscriptionError(
            "OpenAI transcription failed. Check API key, billing, or quota."
        ) from exc

    text = result.text or ""
    word_count = len(text.split()) if text else 0
    logger.info("transcription: success | word_count=%d | audio_url=%s", word_count, audio_url)
    return text, word_count
