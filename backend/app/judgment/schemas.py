from pydantic import BaseModel, Field

# MediaPipe Hands returns 21 landmarks per hand.
LANDMARKS_PER_HAND = 21
# Cap the sequence length to bound payload size (e.g. ~30s at 30fps).
MAX_FRAMES = 900


class Landmark(BaseModel):
    x: float
    y: float
    z: float = 0.0


class Frame(BaseModel):
    landmarks: list[Landmark] = Field(
        min_length=LANDMARKS_PER_HAND, max_length=LANDMARKS_PER_HAND
    )


class GestureSubmission(BaseModel):
    # If set, scoring measures how well frames match this target gesture.
    # If omitted, the dominant recognised gesture is reported instead.
    target_gesture: str | None = None
    frames: list[Frame] = Field(min_length=1, max_length=MAX_FRAMES)


class JudgeResult(BaseModel):
    matched_gesture: str | None
    score: float
    frames_total: int
    frames_matched: int
