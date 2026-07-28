import { HandLandmarker } from "@mediapipe/tasks-vision";

import type { Landmark } from "../api/types";

export function drawOverlay(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  landmarks: Landmark[],
): void {
  const context = canvas.getContext("2d");
  if (!context) return;

  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  context.clearRect(0, 0, canvas.width, canvas.height);
  if (landmarks.length === 0) return;

  const toPixels = (point: Landmark) => ({
    x: point.x * canvas.width,
    y: point.y * canvas.height,
  });

  context.strokeStyle = "#4c8bf5";
  context.lineWidth = 2;
  for (const { start, end } of HandLandmarker.HAND_CONNECTIONS) {
    const from = toPixels(landmarks[start]);
    const to = toPixels(landmarks[end]);
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
  }

  context.fillStyle = "#e8710a";
  for (const point of landmarks) {
    const { x, y } = toPixels(point);
    context.beginPath();
    context.arc(x, y, 3, 0, 2 * Math.PI);
    context.fill();
  }
}
