from fastapi import APIRouter, HTTPException, Query

from app.models.speech import SpeechCreateRequest, SpeechRow, SpeechUpdateRequest
from app.services.supabase_client import get_supabase

router = APIRouter(prefix="/speeches", tags=["speeches"])


@router.post("", response_model=SpeechRow, status_code=201)
async def create_speech(body: SpeechCreateRequest) -> SpeechRow:
    try:
        result = (
            get_supabase()
            .table("speeches")
            .insert(
                {
                    "user_id": body.user_id,
                    "title": body.title,
                    "speech_type": body.speech_type,
                    "side": body.side,
                    "judge_type": body.judge_type,
                    "topic": body.topic,
                    "status": "pending",
                }
            )
            .execute()
        )
        return result.data[0]
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to create speech") from exc


@router.get("", response_model=list[SpeechRow])
async def list_speeches(user_id: str = Query(...)) -> list[SpeechRow]:
    try:
        result = (
            get_supabase()
            .table("speeches")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .execute()
        )
        return result.data
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to fetch speeches") from exc


@router.get("/{speech_id}", response_model=SpeechRow)
async def get_speech(speech_id: str) -> SpeechRow:
    try:
        result = (
            get_supabase()
            .table("speeches")
            .select("*")
            .eq("id", speech_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Speech not found")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to fetch speech") from exc


@router.patch("/{speech_id}", response_model=SpeechRow)
async def update_speech_audio(speech_id: str, body: SpeechUpdateRequest) -> SpeechRow:
    try:
        result = (
            get_supabase()
            .table("speeches")
            .update({"audio_url": body.audio_url})
            .eq("id", speech_id)
            .execute()
        )
        if not result.data:
            raise HTTPException(status_code=404, detail="Speech not found")
        return result.data[0]
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail="Failed to update speech") from exc
