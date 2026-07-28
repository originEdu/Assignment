"""Pure gesture-judgment logic.

This module intentionally has NO FastAPI or database imports so it can be
unit-tested in isolation and later extracted into its own service if needed.
"""

from collections import Counter
from math import dist

from app.judgment.gestures import GESTURES
from app.judgment.schemas import GestureSubmission, Landmark

WRIST = 0
THUMB_TIP, THUMB_IP = 4, 3
PINKY_MCP = 17
# (tip, pip) landmark indices for index through pinky, in gesture-pattern
# order. The thumb is handled separately — see `finger_states`.
FINGER_JOINTS: list[tuple[int, int]] = [
    (8, 6),    # index
    (12, 10),  # middle
    (16, 14),  # ring
    (20, 18),  # pinky
]


def _xyz(landmark: Landmark) -> tuple[float, float, float]:
    return (landmark.x, landmark.y, landmark.z)


def finger_states(landmarks: list[Landmark]) -> tuple[bool, ...]:
    """A finger is 'extended' when its tip is farther from the wrist than its
    PIP joint. Uses distances only, so it is robust to hand orientation and
    left/right handedness.

    The thumb cannot use the wrist as its reference. It folds sideways across
    the palm rather than curling toward the wrist, so a folded thumb tip stays
    farther from the wrist than the joint below it and would always read as
    extended. Measuring against the pinky MCP instead captures the motion that
    actually happens: folding carries the tip across the palm toward the pinky,
    extending carries it away.
    """
    wrist = _xyz(landmarks[WRIST])
    pinky_mcp = _xyz(landmarks[PINKY_MCP])

    thumb_extended = dist(_xyz(landmarks[THUMB_TIP]), pinky_mcp) > dist(
        _xyz(landmarks[THUMB_IP]), pinky_mcp
    )
    states = [thumb_extended]
    for tip, pip in FINGER_JOINTS:
        states.append(dist(_xyz(landmarks[tip]), wrist) > dist(_xyz(landmarks[pip]), wrist))
    return tuple(states)


def classify_frame(landmarks: list[Landmark]) -> str | None:
    """Return the gesture name matching this frame, or None if unrecognised."""
    states = finger_states(landmarks)
    for name, pattern in GESTURES.items():
        if states == pattern:
            return name
    return None


def judge(submission: GestureSubmission) -> dict:
    """Classify every frame and score the submission.

    With a target gesture, the score is the fraction of frames matching it.
    Without one, the dominant recognised gesture is reported at its own
    frame-share as the score.
    """
    per_frame = [classify_frame(frame.landmarks) for frame in submission.frames]
    total = len(per_frame)

    if submission.target_gesture:
        matched = submission.target_gesture
        frames_matched = sum(1 for g in per_frame if g == matched)
    else:
        counts = Counter(g for g in per_frame if g is not None)
        if counts:
            matched, frames_matched = counts.most_common(1)[0]
        else:
            matched, frames_matched = None, 0

    score = round(100 * frames_matched / total, 1) if total else 0.0
    return {
        "matched_gesture": matched,
        "score": score,
        "frames_total": total,
        "frames_matched": frames_matched,
    }
