import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import { useEffect, useRef, useState } from "react";

import type { Landmark } from "../api/types";

type Detect = (video: HTMLVideoElement, timestamp: number) => Landmark[];

export function useHandLandmarker() {
  const landmarkerRef = useRef<HandLandmarker | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const fileset = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
        const landmarker = await HandLandmarker.createFromOptions(fileset, {
          baseOptions: { modelAssetPath: "/mediapipe/hand_landmarker.task" },
          runningMode: "VIDEO",
          // The backend judgment engine is single-hand.
          numHands: 1,
        });
        if (cancelled) {
          landmarker.close();
          return;
        }
        landmarkerRef.current = landmarker;
        setReady(true);
      } catch {
        if (!cancelled) {
          setError(
            "손 인식 모델을 불러오지 못했습니다. npm run setup이 public/mediapipe/를 채웠는지 확인하세요.",
          );
        }
      }
    })();

    return () => {
      cancelled = true;
      landmarkerRef.current?.close();
      landmarkerRef.current = null;
    };
  }, []);

  const detect: Detect | null = ready
    ? (video, timestamp) => {
        const result = landmarkerRef.current?.detectForVideo(video, timestamp);
        const hand = result?.landmarks?.[0];
        if (!hand) return [];
        return hand.map(({ x, y, z }) => ({ x, y, z }));
      }
    : null;

  return { detect, loading: !ready && error === null, error };
}
