// Stages everything MediaPipe needs into public/ so the running app makes no
// external requests. The npm package ships the WASM runtime but not the model,
// which has to come from Google's model storage.
import { createWriteStream } from "node:fs";
import { cp, mkdir, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const target = join(root, "public", "mediapipe");
const wasmSource = join(root, "node_modules", "@mediapipe", "tasks-vision", "wasm");
const modelPath = join(target, "hand_landmarker.task");
const MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

async function exists(path) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

await mkdir(target, { recursive: true });

if (!(await exists(wasmSource))) {
  console.error(`MediaPipe WASM not found at ${wasmSource}. Run npm install first.`);
  process.exit(1);
}
await cp(wasmSource, join(target, "wasm"), { recursive: true });
console.log("MediaPipe WASM staged.");

if (await exists(modelPath)) {
  console.log("Hand landmarker model already present, skipping download.");
} else {
  console.log(`Downloading hand landmarker model from ${MODEL_URL}`);
  const response = await fetch(MODEL_URL);
  if (!response.ok || !response.body) {
    console.error(`Model download failed with status ${response.status}.`);
    process.exit(1);
  }
  await pipeline(Readable.fromWeb(response.body), createWriteStream(modelPath));
  console.log(`Model saved to ${modelPath}`);
}
