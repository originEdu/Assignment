"""Reference gesture definitions.

Each gesture is a finger-extension pattern in the order:
    (thumb, index, middle, ring, pinky)
where True means the finger is extended.

Kept as plain code constants for now; can be promoted to a `gesture_types`
DB table later without touching the judgment engine.
"""

GESTURES: dict[str, tuple[bool, bool, bool, bool, bool]] = {
    "open_palm": (True, True, True, True, True),
    "fist": (False, False, False, False, False),
    "thumbs_up": (True, False, False, False, False),
    "peace": (False, True, True, False, False),
    "pointing": (False, True, False, False, False),
}
