import { useCallback, useRef, useState } from "react";

import { ApiError } from "../api/client";
import { GESTURES, gestureLabel } from "../api/types";
import type { Gesture, JudgeResult } from "../api/types";
import { isSessionExpired, useAuth } from "../auth/AuthContext";
import { FrameBuffer, MAX_FRAMES } from "../hands/frameBuffer";
import { drawOverlay } from "../hands/overlay";
import { useHandLandmarker } from "../hands/useHandLandmarker";

function cameraMessage(error: unknown): string {
  if (!navigator.mediaDevices?.getUserMedia) {
    return "이 페이지에서는 웹캠을 쓸 수 없습니다. HTTPS 또는 localhost로 접속하세요.";
  }
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError") {
      return "카메라 권한이 거부되었습니다. 주소창의 카메라 아이콘에서 허용해 주세요.";
    }
    if (error.name === "NotFoundError") {
      return "연결된 카메라를 찾을 수 없습니다.";
    }
  }
  return "카메라를 열지 못했습니다.";
}

export default function RecordScreen() {
  const { client, logout } = useAuth();
  const { detect, loading, error: modelError } = useHandLandmarker();

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const bufferRef = useRef(new FrameBuffer());
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  const [target, setTarget] = useState<Gesture>(GESTURES[0].id);
  const [recording, setRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [handVisible, setHandVisible] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JudgeResult | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const stop = useCallback(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setRecording(false);
  }, []);

  const loop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !detect) return;

    const landmarks = detect(video, performance.now());
    setHandVisible(landmarks.length > 0);
    drawOverlay(canvas, video, landmarks);

    const outcome = bufferRef.current.push(landmarks);
    if (outcome === "accepted") setFrameCount(bufferRef.current.size);
    if (outcome === "full") {
      setNotice(`최대 ${MAX_FRAMES}프레임에 도달하여 녹화를 종료했습니다.`);
      stop();
      return;
    }

    rafRef.current = requestAnimationFrame(loop);
  }, [detect, stop]);

  async function start() {
    setError(null);
    setNotice(null);
    setResult(null);
    bufferRef.current.clear();
    setFrameCount(0);

    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("insecure context");
      // Prefer the rear camera on phones. Without `exact` this is a hint, so
      // desktops with a single camera are unaffected.
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setRecording(true);
      rafRef.current = requestAnimationFrame(loop);
    } catch (caught) {
      setError(cameraMessage(caught));
      stop();
    }
  }

  async function submit() {
    const payload = bufferRef.current.toPayload(target);
    if (!payload) {
      setError("손이 한 번도 인식되지 않아 제출할 내용이 없습니다. 다시 녹화해 주세요.");
      return;
    }

    setSubmitting(true);
    setError(null);
    try {
      setResult(await client.submitSession(payload));
    } catch (caught) {
      if (isSessionExpired(caught)) {
        logout();
        return;
      }
      setError(caught instanceof ApiError ? caught.detail : "제출에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main>
      <h1>동작 녹화</h1>

      {modelError && <p className="error">{modelError}</p>}
      {loading && <p>손 인식 모델을 불러오는 중…</p>}

      <p>
        <label>
          목표 제스처{" "}
          <select
            value={target}
            disabled={recording}
            onChange={(e) => setTarget(e.target.value as Gesture)}
          >
            {GESTURES.map((gesture) => (
              <option key={gesture.id} value={gesture.id}>
                {gesture.label}
              </option>
            ))}
          </select>
        </label>
      </p>

      <div style={{ position: "relative", width: "fit-content" }}>
        <video ref={videoRef} playsInline muted style={{ display: "block" }} />
        <canvas
          ref={canvasRef}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        />
      </div>

      <p>
        {recording && !handVisible && <span className="error">손이 인식되지 않음</span>}
        {recording && handVisible && <span>인식 중</span>}{" "}
        수집된 프레임: {frameCount} / {MAX_FRAMES}
      </p>

      <p>
        {!recording ? (
          <button onClick={start} disabled={!detect || submitting}>
            녹화 시작
          </button>
        ) : (
          <button onClick={stop}>녹화 종료</button>
        )}{" "}
        <button onClick={submit} disabled={recording || submitting || frameCount === 0}>
          제출
        </button>
      </p>

      {notice && <p>{notice}</p>}
      {error && <p className="error">{error}</p>}

      {result && (
        <section>
          <h2>판정 결과</h2>
          <p>인식된 제스처: {gestureLabel(result.matched_gesture) ?? "없음"}</p>
          <p>점수: {result.score}</p>
          <p>
            일치 프레임: {result.frames_matched} / {result.frames_total}
          </p>
        </section>
      )}
    </main>
  );
}
