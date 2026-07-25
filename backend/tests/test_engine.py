from app.judgment import engine
from app.judgment.schemas import Frame, GestureSubmission, Landmark

# (tip, pip) landmark indices per finger, matching engine.FINGER_JOINTS.
JOINTS = [(4, 2), (8, 6), (12, 10), (16, 14), (20, 18)]


def make_landmarks(states: tuple[bool, ...]) -> list[Landmark]:
    """Build 21 landmarks yielding the given finger-extension states.

    Wrist sits at the origin. Each finger's PIP is placed at distance 1 and
    its tip at distance 2 (extended) or 0.5 (curled) from the wrist, so
    `dist(tip, wrist) > dist(pip, wrist)` reproduces the desired state.
    """
    pts = [(0.0, 0.0, 0.0) for _ in range(21)]
    for extended, (tip, pip) in zip(states, JOINTS):
        pts[pip] = (1.0, 0.0, 0.0)
        pts[tip] = (2.0 if extended else 0.5, 0.0, 0.0)
    return [Landmark(x=x, y=y, z=z) for x, y, z in pts]


def test_open_palm_classified():
    assert engine.classify_frame(make_landmarks((True, True, True, True, True))) == "open_palm"


def test_fist_classified():
    assert engine.classify_frame(make_landmarks((False,) * 5)) == "fist"


def test_peace_classified():
    assert engine.classify_frame(make_landmarks((False, True, True, False, False))) == "peace"


def test_unrecognised_returns_none():
    # thumb + pinky only -> not in the gesture table
    assert engine.classify_frame(make_landmarks((True, False, False, False, True))) is None


def test_judge_full_target_match():
    frames = [Frame(landmarks=make_landmarks((True,) * 5)) for _ in range(10)]
    res = engine.judge(GestureSubmission(target_gesture="open_palm", frames=frames))
    assert res["matched_gesture"] == "open_palm"
    assert res["score"] == 100.0
    assert res["frames_matched"] == 10
    assert res["frames_total"] == 10


def test_judge_partial_target_match():
    good = [Frame(landmarks=make_landmarks((True,) * 5)) for _ in range(6)]
    bad = [Frame(landmarks=make_landmarks((False,) * 5)) for _ in range(4)]
    res = engine.judge(GestureSubmission(target_gesture="open_palm", frames=good + bad))
    assert res["score"] == 60.0
    assert res["frames_matched"] == 6


def test_judge_dominant_without_target():
    frames = [Frame(landmarks=make_landmarks((False, True, True, False, False))) for _ in range(5)]
    res = engine.judge(GestureSubmission(frames=frames))
    assert res["matched_gesture"] == "peace"
    assert res["score"] == 100.0
