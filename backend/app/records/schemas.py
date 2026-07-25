from datetime import datetime

from pydantic import BaseModel, ConfigDict


class ResultOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    matched_gesture: str | None
    score: float
    detail: dict


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    gesture_type: str | None
    submitted_at: datetime
    result: ResultOut | None
