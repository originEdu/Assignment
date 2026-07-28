export const GESTURES = [
  "open_palm",
  "fist",
  "thumbs_up",
  "peace",
  "pointing",
] as const;

export type Gesture = (typeof GESTURES)[number];

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
