import { describe, expect, test } from "vitest";

import type { Landmark } from "../api/types";
import { FrameBuffer, MAX_FRAMES } from "./frameBuffer";

function landmarks(count: number): Landmark[] {
  return Array.from({ length: count }, (_, i) => ({ x: i / 100, y: 0, z: 0 }));
}

describe("FrameBuffer", () => {
  test("accepts a frame holding exactly 21 landmarks", () => {
    const buffer = new FrameBuffer();

    expect(buffer.push(landmarks(21))).toBe("accepted");
    expect(buffer.size).toBe(1);
  });

  test("rejects a frame that does not hold exactly 21 landmarks", () => {
    const buffer = new FrameBuffer();

    expect(buffer.push(landmarks(0))).toBe("rejected");
    expect(buffer.push(landmarks(20))).toBe("rejected");
    expect(buffer.push(landmarks(42))).toBe("rejected");
    expect(buffer.size).toBe(0);
  });

  test("reports full once MAX_FRAMES have been accepted", () => {
    const buffer = new FrameBuffer();
    for (let i = 0; i < MAX_FRAMES; i++) buffer.push(landmarks(21));

    expect(buffer.isFull).toBe(true);
    expect(buffer.push(landmarks(21))).toBe("full");
    expect(buffer.size).toBe(MAX_FRAMES);
  });

  test("builds no payload while empty", () => {
    expect(new FrameBuffer().toPayload("open_palm")).toBeNull();
  });

  test("builds a payload matching GestureSubmission", () => {
    const buffer = new FrameBuffer();
    buffer.push(landmarks(21));
    buffer.push(landmarks(21));

    const payload = buffer.toPayload("open_palm");

    expect(payload).not.toBeNull();
    expect(payload!.target_gesture).toBe("open_palm");
    expect(payload!.frames).toHaveLength(2);
    expect(payload!.frames[0].landmarks).toHaveLength(21);
    expect(payload!.frames[0].landmarks[1]).toEqual({ x: 0.01, y: 0, z: 0 });
  });

  test("clear empties the buffer", () => {
    const buffer = new FrameBuffer();
    buffer.push(landmarks(21));

    buffer.clear();

    expect(buffer.size).toBe(0);
    expect(buffer.toPayload("fist")).toBeNull();
  });
});
