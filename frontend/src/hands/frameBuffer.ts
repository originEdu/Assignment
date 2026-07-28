import type { Frame, GestureSubmission, Landmark } from "../api/types";

// Both limits come from backend/app/judgment/schemas.py. Breaking either
// one produces a 422 from the server, so the buffer enforces them first.
export const LANDMARKS_PER_HAND = 21;
export const MAX_FRAMES = 900;

export type PushResult = "accepted" | "rejected" | "full";

export class FrameBuffer {
  private frames: Frame[] = [];

  push(landmarks: Landmark[]): PushResult {
    if (this.isFull) return "full";
    if (landmarks.length !== LANDMARKS_PER_HAND) return "rejected";

    this.frames.push({
      landmarks: landmarks.map(({ x, y, z }) => ({ x, y, z })),
    });
    return "accepted";
  }

  get size(): number {
    return this.frames.length;
  }

  get isFull(): boolean {
    return this.frames.length >= MAX_FRAMES;
  }

  clear(): void {
    this.frames = [];
  }

  toPayload(target: string | null): GestureSubmission | null {
    if (this.frames.length === 0) return null;
    return { target_gesture: target, frames: this.frames };
  }
}
