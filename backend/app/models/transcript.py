from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class TranscriptRow(BaseModel):
    id: str
    speech_id: str
    text: str
    word_count: Optional[int] = None
    created_at: datetime
