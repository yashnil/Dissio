import logging

from fastapi import APIRouter, HTTPException, Query

from app.models.transcript import TranscriptRow
from app.services.supabase_client import get_supabase
from app.services.transcription import (
    AudioTooLargeError,
    OpenAITranscriptionError,
    StorageDownloadError,
    transcribe_speech,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/speeches", tags=["transcripts"])


@router.post("/{speech_id}/transcribe", response_model=TranscriptRow)
async def transcribe(speech_id: str, user_id: str = Query(...)) -> TranscriptRow:
    supabase = get_supabase()
    logger.info("transcribe: speech_id=%s", speech_id)

    # 1. Fetch speech and verify ownership
    try:
        speech_result = (
            supabase.table("speeches")
            .select("*")
            .eq("id", speech_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
    except Exception as exc:
        logger.error("transcribe: fetch_speech failed | exc_type=%s", type(exc).__name__)
        raise HTTPException(status_code=500, detail="Failed to fetch speech") from exc

    if not speech_result.data:
        raise HTTPException(status_code=404, detail="Speech not found")
    speech = speech_result.data[0]

    audio_url = speech.get("audio_url")
    logger.info(
        "transcribe: audio_url_present=%s path=%s",
        bool(audio_url),
        audio_url,
    )

    # 2. Require audio_url
    if not audio_url:
        raise HTTPException(status_code=400, detail="Speech has no audio uploaded")

    # 3. Mark transcribing (best-effort)
    try:
        supabase.table("speeches").update({"status": "transcribing"}).eq("id", speech_id).execute()
        logger.info("transcribe: status set to transcribing")
    except Exception:
        logger.warning("transcribe: could not set status to transcribing")

    def _set_error_status() -> None:
        try:
            supabase.table("speeches").update({"status": "error"}).eq("id", speech_id).execute()
        except Exception:
            pass

    # 4. Transcribe
    try:
        logger.info("transcribe: calling transcribe_speech")
        text, word_count = transcribe_speech(audio_url)
        logger.info("transcribe: transcription succeeded | word_count=%d", word_count)
    except StorageDownloadError as exc:
        logger.error("transcribe: storage_download step failed")
        _set_error_status()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except AudioTooLargeError as exc:
        logger.warning("transcribe: audio_too_large step")
        _set_error_status()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except OpenAITranscriptionError as exc:
        logger.error("transcribe: openai_transcription step failed")
        _set_error_status()
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("transcribe: unexpected error | exc_type=%s", type(exc).__name__)
        _set_error_status()
        raise HTTPException(
            status_code=500, detail="Transcription failed. Check backend logs."
        ) from exc

    # 5. Persist transcript and mark done
    try:
        transcript_result = (
            supabase.table("transcripts")
            .upsert(
                {"speech_id": speech_id, "text": text, "word_count": word_count},
                on_conflict="speech_id",
            )
            .execute()
        )
        supabase.table("speeches").update({"status": "done"}).eq("id", speech_id).execute()
        logger.info("transcribe: done | speech_id=%s", speech_id)
        return transcript_result.data[0]
    except Exception as exc:
        logger.error(
            "transcribe: upsert_transcript or update_status failed | exc_type=%s",
            type(exc).__name__,
        )
        _set_error_status()
        raise HTTPException(
            status_code=500, detail="Transcription failed. Check backend logs."
        ) from exc


@router.get("/{speech_id}/transcript", response_model=TranscriptRow)
async def get_transcript(speech_id: str, user_id: str = Query(...)) -> TranscriptRow:
    supabase = get_supabase()

    # Verify speech ownership
    try:
        speech_check = (
            supabase.table("speeches")
            .select("id")
            .eq("id", speech_id)
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        if not speech_check.data:
            raise HTTPException(status_code=404, detail="Speech not found")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to verify speech ownership") from exc

    # Fetch transcript
    try:
        result = (
            supabase.table("transcripts")
            .select("*")
            .eq("speech_id", speech_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="No transcript found for this speech")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to fetch transcript") from exc
