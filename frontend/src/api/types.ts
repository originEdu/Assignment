// `id` is the wire value the backend judges against (app/judgment/gestures.py).
// `label` is display-only — changing it never affects scoring.
export const GESTURES = [
  { id: "open_palm", label: "보자기" },
  { id: "fist", label: "주먹" },
  { id: "thumbs_up", label: "엄지척" },
  { id: "peace", label: "브이" },
  { id: "pointing", label: "삿대질" },
] as const;

export type Gesture = (typeof GESTURES)[number]["id"];

/** Display name for a gesture id. Unknown ids pass through unchanged so old
 *  records still render. */
export function gestureLabel(id: string | null): string | null {
  if (id === null) return null;
  return GESTURES.find((gesture) => gesture.id === id)?.label ?? id;
}

export interface Landmark {
  x: number;
  y: number;
  z: number;
}

export interface Frame {
  landmarks: Landmark[];
}

export interface GestureSubmission {
  target_gesture: string | null;
  frames: Frame[];
}

export interface JudgeResult {
  matched_gesture: string | null;
  score: number;
  frames_total: number;
  frames_matched: number;
}

export interface ResultOut {
  matched_gesture: string | null;
  score: number;
  detail: Record<string, number>;
}

export interface SessionOut {
  id: number;
  gesture_type: string | null;
  submitted_at: string;
  result: ResultOut | null;
}

export interface Token {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

export interface UserOut {
  id: number;
  email: string;
  created_at: string;
}
