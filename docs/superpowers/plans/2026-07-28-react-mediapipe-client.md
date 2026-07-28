# React + MediaPipe Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a browser client that records hand landmarks with MediaPipe, submits them to the existing FastAPI backend, and displays the score and past sessions.

**Architecture:** A Vite + React + TypeScript app in `frontend/`, sibling to `backend/`. Pure logic (HTTP client, frame buffer) is isolated from browser APIs so it can be unit-tested; webcam and inference live behind a hook and a canvas helper. MediaPipe WASM and the model file are staged into `public/mediapipe/` by a postinstall script, so the running app makes no external requests.

**Tech Stack:** Vite, React 19, TypeScript, react-router, Vitest, `@mediapipe/tasks-vision`.

## Global Constraints

- Backend code must not change. Spec section 2.
- Node 24.18.0 / npm 11.16.0 are installed on this machine.
- API base URL comes from `VITE_API_BASE`, default `http://localhost:8000`.
- The Vite dev server must run on port 5173 — the backend's default `cors_origins` allows `http://localhost:5173` and `http://localhost:3000` only.
- `numHands: 1`. The backend judgment engine is single-hand.
- Exactly 21 landmarks per frame; `frames` length 1–900. From `backend/app/judgment/schemas.py`.
- Supported gestures, exact strings: `open_palm`, `fist`, `thumbs_up`, `peace`, `pointing`.
- `POST /auth/login` takes **form-encoded** data with the field named `username` holding the email. Every other endpoint takes JSON.
- Tokens live in `sessionStorage`, written only by `AuthContext`.
- No refresh-token renewal. A 401 on an authenticated request logs the user out.

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/package.json` | Scripts, dependencies, postinstall hook |
| `frontend/vite.config.ts` | Vite + React plugin, port 5173, Vitest config |
| `frontend/tsconfig.json` | TypeScript config |
| `frontend/index.html` | Vite entry document |
| `frontend/.gitignore` | Ignores `node_modules/`, `dist/`, `public/mediapipe/` |
| `frontend/scripts/setup-mediapipe.mjs` | Copies WASM, downloads the model |
| `frontend/src/main.tsx` | React root, router |
| `frontend/src/App.tsx` | Route table, nav, auth guard |
| `frontend/src/styles.css` | All styling |
| `frontend/src/api/types.ts` | TypeScript mirrors of backend schemas |
| `frontend/src/api/client.ts` | Fetch wrapper, `ApiError` |
| `frontend/src/api/client.test.ts` | Unit tests for the client |
| `frontend/src/auth/AuthContext.tsx` | Token state, sessionStorage, login/register/logout |
| `frontend/src/hands/frameBuffer.ts` | Pure frame accumulation and payload building |
| `frontend/src/hands/frameBuffer.test.ts` | Unit tests for the buffer |
| `frontend/src/hands/useHandLandmarker.ts` | Loads `HandLandmarker`, exposes `detect` |
| `frontend/src/hands/overlay.ts` | Draws landmarks on a canvas |
| `frontend/src/screens/LoginScreen.tsx` | Register and login forms |
| `frontend/src/screens/RecordScreen.tsx` | Gesture picker, webcam, recording, result |
| `frontend/src/screens/HistoryScreen.tsx` | Session list and detail |
| `frontend/README.md` | Setup, run, manual checklist |

---

### Task 1: Project scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/vite.config.ts`
- Create: `frontend/tsconfig.json`
- Create: `frontend/tsconfig.node.json`
- Create: `frontend/index.html`
- Create: `frontend/.gitignore`
- Create: `frontend/src/main.tsx`
- Create: `frontend/src/App.tsx`
- Create: `frontend/src/styles.css`
- Test: `frontend/src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `npm test`, `npm run dev`, and `npm run build` in `frontend/`.

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "motion-recognition-client",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run"
  },
  "dependencies": {
    "@mediapipe/tasks-vision": "^0.10.18",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-router": "^7.1.1"
  },
  "devDependencies": {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@vitejs/plugin-react": "^4.3.4",
    "typescript": "^5.7.2",
    "vite": "^6.0.7",
    "vitest": "^2.1.8"
  }
}
```

There is deliberately no `postinstall` entry yet — the script it would call does not exist until Task 4, and `npm install` in Step 11 would fail. Task 4 adds it.

- [ ] **Step 2: Create `frontend/vite.config.ts`**

```ts
import react from "@vitejs/plugin-react";
// `defineConfig` comes from vitest/config, not vite — the plain Vite one has no
// `test` field and rejects the block below.
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, strictPort: true },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});
```

`strictPort` matters: if 5173 is taken Vite would silently move to 5174 and the backend would reject the origin with a CORS error.

- [ ] **Step 3: Create `frontend/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noEmit": true,
    "types": ["vite/client"],
    "skipLibCheck": true
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`"types": ["vite/client"]` is load-bearing: without it `import.meta.env.VITE_API_BASE` in Task 6 fails to type-check.

- [ ] **Step 4: Create `frontend/tsconfig.node.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowSyntheticDefaultImports": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts", "scripts/**/*.mjs"]
}
```

- [ ] **Step 5: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Motion Recognition</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 6: Create `frontend/.gitignore`**

```
node_modules/
dist/
public/mediapipe/
```

- [ ] **Step 7: Create placeholder `frontend/src/App.tsx`**

```tsx
export default function App() {
  return <h1>Motion Recognition</h1>;
}
```

- [ ] **Step 8: Create `frontend/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 9: Create `frontend/src/styles.css`**

```css
:root {
  font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  color-scheme: light dark;
}

body {
  margin: 0;
  padding: 2rem;
  max-width: 60rem;
  margin-inline: auto;
}

button {
  padding: 0.5rem 1rem;
  font: inherit;
  cursor: pointer;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}

.error {
  color: #c0392b;
}

nav {
  display: flex;
  gap: 1rem;
  margin-bottom: 2rem;
}
```

- [ ] **Step 10: Write the smoke test**

Create `frontend/src/smoke.test.ts`:

```ts
import { expect, test } from "vitest";

test("vitest runs", () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 11: Install and run the test**

Run from `frontend/`:

```
npm install
npm test
```

Expected: `1 passed`. `npm install` will warn that no `postinstall` script exists only if you added the entry — it should not be there yet.

- [ ] **Step 12: Verify the build**

Run: `npm run build`
Expected: exits 0, writes `dist/`.

- [ ] **Step 13: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold Vite React TypeScript client"
```

---

### Task 2: API types and client

**Files:**
- Create: `frontend/src/api/types.ts`
- Create: `frontend/src/api/client.ts`
- Test: `frontend/src/api/client.test.ts`
- Delete: `frontend/src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `ApiError` with `status: number` and `detail: string`
  - `createClient(options: ClientOptions): ApiClient`
  - `ClientOptions = { baseUrl: string; fetchImpl?: typeof fetch; getToken?: () => string | null }`
  - `ApiClient` methods: `register(email, password): Promise<UserOut>`, `login(email, password): Promise<Token>`, `submitSession(body: GestureSubmission): Promise<JudgeResult>`, `listSessions(): Promise<SessionOut[]>`, `getSession(id: number): Promise<SessionOut>`
  - Types `Landmark`, `Frame`, `GestureSubmission`, `JudgeResult`, `SessionOut`, `ResultOut`, `Token`, `UserOut`, `GESTURES`

- [ ] **Step 1: Create `frontend/src/api/types.ts`**

Field names mirror `backend/app/auth/schemas.py`, `backend/app/judgment/schemas.py`, and `backend/app/records/schemas.py` exactly.

```ts
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
```

- [ ] **Step 2: Write the failing tests**

Create `frontend/src/api/client.test.ts`. The stub returns real `Response` objects, so assertions are on the request that was built and the error that came out — never on "was the stub called".

```ts
import { describe, expect, test } from "vitest";

import { ApiError, createClient } from "./client";

function stubFetch(status: number, body: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(input), init: init ?? {} });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  };
  return { impl: impl as typeof fetch, calls };
}

describe("createClient", () => {
  test("joins the base URL with the path", async () => {
    const { impl, calls } = stubFetch(200, []);
    const client = createClient({ baseUrl: "http://localhost:8000", fetchImpl: impl });

    await client.listSessions();

    expect(calls[0].url).toBe("http://localhost:8000/sessions");
  });

  test("attaches the bearer token to authenticated requests", async () => {
    const { impl, calls } = stubFetch(200, []);
    const client = createClient({
      baseUrl: "http://localhost:8000",
      fetchImpl: impl,
      getToken: () => "abc123",
    });

    await client.listSessions();

    const headers = new Headers(calls[0].init.headers);
    expect(headers.get("Authorization")).toBe("Bearer abc123");
  });

  test("sends login as form data with username holding the email", async () => {
    const { impl, calls } = stubFetch(200, {
      access_token: "a",
      refresh_token: "r",
      token_type: "bearer",
    });
    const client = createClient({ baseUrl: "http://localhost:8000", fetchImpl: impl });

    await client.login("user@example.com", "password123");

    const body = calls[0].init.body as URLSearchParams;
    expect(body.get("username")).toBe("user@example.com");
    expect(body.get("password")).toBe("password123");
  });

  test("turns a non-2xx detail into an ApiError", async () => {
    const { impl } = stubFetch(409, { detail: "Email already registered" });
    const client = createClient({ baseUrl: "http://localhost:8000", fetchImpl: impl });

    await expect(client.register("dup@example.com", "password123")).rejects.toThrow(
      ApiError,
    );
    await expect(
      client.register("dup@example.com", "password123"),
    ).rejects.toMatchObject({ status: 409, detail: "Email already registered" });
  });

  test("reports a network failure as status 0", async () => {
    const failing = (async () => {
      throw new TypeError("Failed to fetch");
    }) as unknown as typeof fetch;
    const client = createClient({ baseUrl: "http://localhost:8000", fetchImpl: failing });

    await expect(client.listSessions()).rejects.toMatchObject({ status: 0 });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run from `frontend/`: `npx vitest run src/api/client.test.ts`
Expected: FAIL — cannot resolve `./client`.

- [ ] **Step 4: Write `frontend/src/api/client.ts`**

```ts
import type {
  GestureSubmission,
  JudgeResult,
  SessionOut,
  Token,
  UserOut,
} from "./types";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly detail: string,
  ) {
    super(detail);
    this.name = "ApiError";
  }
}

export interface ClientOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  getToken?: () => string | null;
}

export interface ApiClient {
  register(email: string, password: string): Promise<UserOut>;
  login(email: string, password: string): Promise<Token>;
  submitSession(body: GestureSubmission): Promise<JudgeResult>;
  listSessions(): Promise<SessionOut[]>;
  getSession(id: number): Promise<SessionOut>;
}

export function createClient({
  baseUrl,
  fetchImpl = fetch,
  getToken = () => null,
}: ClientOptions): ApiClient {
  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const headers = new Headers(init.headers);
    const token = getToken();
    if (token) headers.set("Authorization", `Bearer ${token}`);

    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}${path}`, { ...init, headers });
    } catch {
      throw new ApiError(0, "서버에 연결할 수 없습니다.");
    }

    if (!response.ok) {
      throw new ApiError(response.status, await readDetail(response));
    }
    return (await response.json()) as T;
  }

  async function readDetail(response: Response): Promise<string> {
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") return body.detail;
      return JSON.stringify(body.detail ?? body);
    } catch {
      return `요청이 실패했습니다 (${response.status}).`;
    }
  }

  function json(body: unknown): RequestInit {
    return {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  return {
    register: (email, password) =>
      request<UserOut>("/auth/register", json({ email, password })),

    // OAuth2 password flow: form-encoded, and the field is named `username`.
    login: (email, password) =>
      request<Token>("/auth/login", {
        method: "POST",
        body: new URLSearchParams({ username: email, password }),
      }),

    submitSession: (body) => request<JudgeResult>("/sessions/submit", json(body)),

    listSessions: () => request<SessionOut[]>("/sessions"),

    getSession: (id) => request<SessionOut>(`/sessions/${id}`),
  };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run src/api/client.test.ts`
Expected: 5 passed.

- [ ] **Step 6: Delete the smoke test**

```bash
rm frontend/src/smoke.test.ts
```

It existed only to prove the runner worked. Real tests replace it.

- [ ] **Step 7: Run the whole suite**

Run: `npm test`
Expected: 5 passed, no reference to `smoke.test.ts`.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/api frontend/src/smoke.test.ts
git commit -m "feat: add typed API client for the backend"
```

---

### Task 3: Frame buffer

**Files:**
- Create: `frontend/src/hands/frameBuffer.ts`
- Test: `frontend/src/hands/frameBuffer.test.ts`

**Interfaces:**
- Consumes: `Landmark`, `GestureSubmission` from `../api/types`.
- Produces:
  - `LANDMARKS_PER_HAND = 21`, `MAX_FRAMES = 900`
  - `type PushResult = "accepted" | "rejected" | "full"`
  - `class FrameBuffer` with `push(landmarks: Landmark[]): PushResult`, `readonly size: number`, `readonly isFull: boolean`, `clear(): void`, `toPayload(target: string | null): GestureSubmission | null`

- [ ] **Step 1: Write the failing tests**

Create `frontend/src/hands/frameBuffer.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run src/hands/frameBuffer.test.ts`
Expected: FAIL — cannot resolve `./frameBuffer`.

- [ ] **Step 3: Write `frontend/src/hands/frameBuffer.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run src/hands/frameBuffer.test.ts`
Expected: 6 passed.

- [ ] **Step 5: Run the whole suite**

Run: `npm test`
Expected: 11 passed.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/hands
git commit -m "feat: add frame buffer enforcing backend payload limits"
```

---

### Task 4: MediaPipe asset staging

**Files:**
- Create: `frontend/scripts/setup-mediapipe.mjs`
- Modify: `frontend/package.json` (add the `postinstall` script)

**Interfaces:**
- Consumes: nothing.
- Produces: `frontend/public/mediapipe/wasm/` and `frontend/public/mediapipe/hand_landmarker.task`, both served at `/mediapipe/...` by Vite.

- [ ] **Step 1: Write `frontend/scripts/setup-mediapipe.mjs`**

```js
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
```

- [ ] **Step 2: Add the postinstall hook to `frontend/package.json`**

Insert into the `scripts` block, after `"test"`:

```json
    "postinstall": "node scripts/setup-mediapipe.mjs"
```

- [ ] **Step 3: Run the script**

Run from `frontend/`: `node scripts/setup-mediapipe.mjs`
Expected: prints `MediaPipe WASM staged.` and then either the download progress line and `Model saved to ...`, or the skip message.

- [ ] **Step 4: Verify the staged files**

Run: `ls public/mediapipe && ls public/mediapipe/wasm`
Expected: `hand_landmarker.task` and `wasm/` at the top level; `.wasm` and `.js` files inside `wasm/`.

- [ ] **Step 5: Confirm the assets are not tracked by git**

Run: `git status --short frontend/`
Expected: `frontend/scripts/setup-mediapipe.mjs` and the modified `package.json` appear; nothing under `frontend/public/mediapipe/` appears.

- [ ] **Step 6: Commit**

```bash
git add frontend/scripts frontend/package.json
git commit -m "feat: stage MediaPipe wasm and model into public on install"
```

---

### Task 5: Hand landmarker hook and canvas overlay

**Files:**
- Create: `frontend/src/hands/useHandLandmarker.ts`
- Create: `frontend/src/hands/overlay.ts`

**Interfaces:**
- Consumes: `Landmark` from `../api/types`.
- Produces:
  - `useHandLandmarker(): { detect: ((video: HTMLVideoElement, timestamp: number) => Landmark[]) | null; loading: boolean; error: string | null }`
  - `drawOverlay(canvas: HTMLCanvasElement, video: HTMLVideoElement, landmarks: Landmark[]): void`

There are no unit tests here — both units are browser-only. Spec section 8 puts them under manual verification instead.

- [ ] **Step 1: Write `frontend/src/hands/useHandLandmarker.ts`**

```ts
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
            "손 인식 모델을 불러오지 못했습니다. npm install이 public/mediapipe/를 채웠는지 확인하세요.",
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
```

- [ ] **Step 2: Write `frontend/src/hands/overlay.ts`**

```ts
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
```

- [ ] **Step 3: Verify it type-checks**

Run from `frontend/`: `npx tsc -b`
Expected: exits 0 with no output.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/hands/useHandLandmarker.ts frontend/src/hands/overlay.ts
git commit -m "feat: add hand landmarker hook and canvas overlay"
```

---

### Task 6: Auth context and routing

**Files:**
- Create: `frontend/src/auth/AuthContext.tsx`
- Modify: `frontend/src/App.tsx` (replace the placeholder in full)
- Modify: `frontend/src/main.tsx` (wrap in the router and the provider)

**Interfaces:**
- Consumes: `createClient`, `ApiError` from `../api/client`.
- Produces:
  - `AuthProvider` component
  - `useAuth(): { token: string | null; client: ApiClient; login(email, password): Promise<void>; register(email, password): Promise<void>; logout(): void }`

`AuthContext` is the only module that touches `sessionStorage`.

- [ ] **Step 1: Write `frontend/src/auth/AuthContext.tsx`**

```tsx
import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { ApiError, createClient } from "../api/client";
import type { ApiClient } from "../api/client";

const STORAGE_KEY = "motion.access_token";
const BASE_URL = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

interface AuthValue {
  token: string | null;
  client: ApiClient;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string): Promise<void>;
  logout(): void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() =>
    sessionStorage.getItem(STORAGE_KEY),
  );

  // The client reads the token through a ref so a single client instance stays
  // valid across logins instead of being rebuilt on every token change.
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const logout = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setToken(null);
  }, []);

  const client = useMemo(
    () =>
      createClient({
        baseUrl: BASE_URL,
        getToken: () => tokenRef.current,
      }),
    [],
  );

  const store = useCallback((next: string) => {
    sessionStorage.setItem(STORAGE_KEY, next);
    setToken(next);
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const issued = await client.login(email, password);
      store(issued.access_token);
    },
    [client, store],
  );

  const register = useCallback(
    async (email: string, password: string) => {
      await client.register(email, password);
      await login(email, password);
    },
    [client, login],
  );

  const value = useMemo(
    () => ({ token, client, login, register, logout }),
    [token, client, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}

// Spec 7.1: there is no refresh-token renewal. A 401 on an authenticated
// request means the session is over.
export function isSessionExpired(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}
```

- [ ] **Step 2: Replace `frontend/src/App.tsx` in full**

```tsx
import { Navigate, NavLink, Route, Routes } from "react-router";

import { useAuth } from "./auth/AuthContext";
import HistoryScreen from "./screens/HistoryScreen";
import LoginScreen from "./screens/LoginScreen";
import RecordScreen from "./screens/RecordScreen";

export default function App() {
  const { token, logout } = useAuth();

  if (!token) {
    return (
      <Routes>
        <Route path="/login" element={<LoginScreen />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    );
  }

  return (
    <>
      <nav>
        <NavLink to="/record">녹화</NavLink>
        <NavLink to="/history">기록</NavLink>
        <button onClick={logout}>로그아웃</button>
      </nav>
      <Routes>
        <Route path="/record" element={<RecordScreen />} />
        <Route path="/history" element={<HistoryScreen />} />
        <Route path="*" element={<Navigate to="/record" replace />} />
      </Routes>
    </>
  );
}
```

- [ ] **Step 3: Replace `frontend/src/main.tsx` in full**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";

import App from "./App";
import { AuthProvider } from "./auth/AuthContext";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
```

- [ ] **Step 4: Note the expected type errors**

`npx tsc -b` will fail here because `./screens/*` do not exist yet. That is expected — Tasks 7 through 9 create them. Do not stub them out; move on.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/auth frontend/src/App.tsx frontend/src/main.tsx
git commit -m "feat: add auth context and routing"
```

---

### Task 7: Login screen

**Files:**
- Create: `frontend/src/screens/LoginScreen.tsx`

**Interfaces:**
- Consumes: `useAuth` from `../auth/AuthContext`, `ApiError` from `../api/client`.
- Produces: default-exported `LoginScreen` component.

- [ ] **Step 1: Write `frontend/src/screens/LoginScreen.tsx`**

```tsx
import { useState } from "react";
import type { FormEvent } from "react";

import { ApiError } from "../api/client";
import { useAuth } from "../auth/AuthContext";

type Mode = "login" | "register";

export default function LoginScreen() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(email, password);
    } catch (caught) {
      setError(
        caught instanceof ApiError ? caught.detail : "알 수 없는 오류가 발생했습니다.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main>
      <h1>{mode === "login" ? "로그인" : "회원가입"}</h1>
      <form onSubmit={onSubmit}>
        <p>
          <label>
            이메일{" "}
            <input
              type="email"
              value={email}
              required
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
        </p>
        <p>
          <label>
            비밀번호{" "}
            <input
              type="password"
              value={password}
              required
              minLength={8}
              maxLength={72}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
        </p>
        {error && <p className="error">{error}</p>}
        <button type="submit" disabled={busy}>
          {mode === "login" ? "로그인" : "가입하기"}
        </button>
      </form>
      <p>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "login" ? "register" : "login");
            setError(null);
          }}
        >
          {mode === "login" ? "계정이 없으신가요? 가입하기" : "이미 계정이 있으신가요? 로그인"}
        </button>
      </p>
    </main>
  );
}
```

`minLength={8}` and `maxLength={72}` mirror `UserCreate.password` in `backend/app/auth/schemas.py`, so the browser rejects a bad password before the request goes out.

- [ ] **Step 2: Commit**

```bash
git add frontend/src/screens/LoginScreen.tsx
git commit -m "feat: add login and registration screen"
```

---

### Task 8: Record screen

**Files:**
- Create: `frontend/src/screens/RecordScreen.tsx`

**Interfaces:**
- Consumes: `useAuth`, `isSessionExpired`, `useHandLandmarker`, `drawOverlay`, `FrameBuffer`, `MAX_FRAMES`, `GESTURES`, `ApiError`.
- Produces: default-exported `RecordScreen` component.

- [ ] **Step 1: Write `frontend/src/screens/RecordScreen.tsx`**

```tsx
import { useCallback, useRef, useState } from "react";

import { ApiError } from "../api/client";
import { GESTURES } from "../api/types";
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

  const [target, setTarget] = useState<Gesture>(GESTURES[0]);
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
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
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
      setError(
        caught instanceof ApiError ? caught.detail : "제출에 실패했습니다.",
      );
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
              <option key={gesture} value={gesture}>
                {gesture}
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
          <p>인식된 제스처: {result.matched_gesture ?? "없음"}</p>
          <p>점수: {result.score}</p>
          <p>
            일치 프레임: {result.frames_matched} / {result.frames_total}
          </p>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/screens/RecordScreen.tsx
git commit -m "feat: add recording screen with webcam and submission"
```

---

### Task 9: History screen

**Files:**
- Create: `frontend/src/screens/HistoryScreen.tsx`

**Interfaces:**
- Consumes: `useAuth`, `isSessionExpired`, `ApiError`, `SessionOut`.
- Produces: default-exported `HistoryScreen` component.

- [ ] **Step 1: Write `frontend/src/screens/HistoryScreen.tsx`**

```tsx
import { useCallback, useEffect, useState } from "react";

import { ApiError } from "../api/client";
import type { SessionOut } from "../api/types";
import { isSessionExpired, useAuth } from "../auth/AuthContext";

export default function HistoryScreen() {
  const { client, logout } = useAuth();
  const [sessions, setSessions] = useState<SessionOut[]>([]);
  const [selected, setSelected] = useState<SessionOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // The backend already orders by submitted_at descending.
      setSessions(await client.listSessions());
    } catch (caught) {
      if (isSessionExpired(caught)) {
        logout();
        return;
      }
      setError(caught instanceof ApiError ? caught.detail : "기록을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [client, logout]);

  useEffect(() => {
    void load();
  }, [load]);

  async function open(id: number) {
    setError(null);
    try {
      setSelected(await client.getSession(id));
    } catch (caught) {
      if (isSessionExpired(caught)) {
        logout();
        return;
      }
      setError(caught instanceof ApiError ? caught.detail : "세션을 불러오지 못했습니다.");
    }
  }

  return (
    <main>
      <h1>기록</h1>

      {loading && <p>불러오는 중…</p>}
      {error && (
        <p className="error">
          {error} <button onClick={() => void load()}>다시 시도</button>
        </p>
      )}
      {!loading && !error && sessions.length === 0 && <p>아직 기록이 없습니다.</p>}

      <ul>
        {sessions.map((session) => (
          <li key={session.id}>
            <button onClick={() => void open(session.id)}>
              #{session.id} · {session.gesture_type ?? "지정 없음"} ·{" "}
              {session.result ? `${session.result.score}점` : "결과 없음"} ·{" "}
              {new Date(session.submitted_at).toLocaleString()}
            </button>
          </li>
        ))}
      </ul>

      {selected && (
        <section>
          <h2>세션 #{selected.id}</h2>
          <p>목표 제스처: {selected.gesture_type ?? "지정 없음"}</p>
          <p>제출 시각: {new Date(selected.submitted_at).toLocaleString()}</p>
          {selected.result && (
            <>
              <p>인식된 제스처: {selected.result.matched_gesture ?? "없음"}</p>
              <p>점수: {selected.result.score}</p>
              <p>
                일치 프레임: {selected.result.detail.frames_matched} /{" "}
                {selected.result.detail.frames_total}
              </p>
            </>
          )}
        </section>
      )}
    </main>
  );
}
```

`detail` holds `frames_total` and `frames_matched` — see `backend/app/judgment/router.py`, where those two keys are written into the column.

- [ ] **Step 2: Type-check the whole app**

Now that every screen exists, run from `frontend/`: `npx tsc -b`
Expected: exits 0. This is the first point where Task 6's imports resolve.

- [ ] **Step 3: Run the test suite**

Run: `npm test`
Expected: 11 passed.

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/screens/HistoryScreen.tsx
git commit -m "feat: add session history screen"
```

---

### Task 10: Documentation and manual verification

**Files:**
- Create: `frontend/README.md`
- Modify: `backend/README.md` (add a pointer to the client)

**Interfaces:**
- Consumes: everything built so far.
- Produces: the runbook a grader follows.

- [ ] **Step 1: Write `frontend/README.md`**

````markdown
# Motion Recognition Client (React + MediaPipe)

웹캠에서 손 랜드마크를 추출해 `backend/`의 FastAPI 서버로 제출하고, 판정 점수와 기록을
보여주는 데모 클라이언트.

- **추론**: MediaPipe Hands가 브라우저에서 온디바이스로 실행됩니다. 별도 AI 서버는 없습니다.
- **자산**: `npm install`이 WASM과 모델을 `public/mediapipe/`로 내려받습니다. 설치 후에는
  앱 실행 중 외부 호스트로 나가는 요청이 없습니다.

## 설치

```powershell
cd frontend
npm install
```

`npm install`이 `hand_landmarker.task`(약 7.5MB)를 내려받으므로 최초 1회는 네트워크가
필요합니다.

## 실행

백엔드를 먼저 띄웁니다 (`backend/README.md` 참고). 그다음:

```powershell
npm run dev
```

<http://localhost:5173> 으로 접속합니다. **포트는 5173으로 고정되어 있습니다** — 백엔드
CORS 허용 목록이 이 포트를 기준으로 합니다.

API 주소를 바꾸려면 `VITE_API_BASE`를 설정합니다 (기본 `http://localhost:8000`).

## 테스트

```powershell
npm test
```

순수 로직만 테스트합니다: `api/client.ts`(요청 구성, 에러 정규화)와
`hands/frameBuffer.ts`(21개 검증, 900 상한, 페이로드 생성). 웹캠·MediaPipe·화면 렌더링은
아래 수동 확인으로 대체합니다.

## 수동 확인 체크리스트

1. 카메라 권한을 거부하면 권한 안내 문구가 뜬다
2. 손을 화면에서 치우면 "손이 인식되지 않음"이 뜬다
3. 손을 비추면 랜드마크 오버레이가 그려진다
4. 30초 이상 녹화하면 900프레임에서 자동 종료된다
5. 손을 한 번도 잡지 못한 채 종료하면 제출이 막힌다
6. 목표 제스처를 유지하면 점수가 높게, 다른 제스처를 취하면 낮게 나온다
7. 제출 후 기록 화면에 방금 세션이 최상단에 보인다
8. 백엔드를 끄고 요청하면 연결 실패 문구와 재시도 버튼이 뜬다

## 알려진 제한

- **refresh 토큰을 쓰지 않습니다.** access 토큰은 30분이고 시연은 그보다 짧습니다. 401이
  나면 자동 재발급 없이 로그아웃됩니다. `POST /auth/refresh`는 백엔드에 존재하지만 이
  클라이언트가 의도적으로 호출하지 않습니다.
- 토큰은 `sessionStorage`에 있습니다. 탭을 닫으면 사라집니다.
- 단일 손만 인식합니다 (`numHands: 1`). 백엔드 판정 엔진이 단일 손 기준입니다.
- 반응형·모바일 레이아웃은 범위 밖입니다.
````

- [ ] **Step 2: Add a pointer in `backend/README.md`**

Append at the end of the file:

```markdown
## 클라이언트

React + MediaPipe 클라이언트는 저장소 루트의 `frontend/`에 있습니다. 실행 방법은
`frontend/README.md`를 참고하세요.
```

- [ ] **Step 3: Run the manual checklist**

Start the backend on port 8000 and the client on 5173. Walk all 8 items in the checklist above. Record which ones passed. If any fail, fix them before committing and note what changed.

- [ ] **Step 4: Confirm no external requests at runtime**

With the app loaded, open the browser dev tools Network tab, reload, and record a short session.
Expected: every request goes to `localhost:5173` or `localhost:8000`. No `storage.googleapis.com`, no `jsdelivr`, no other host. This is spec verification criterion 4.

- [ ] **Step 5: Final verification**

Run from `frontend/`:

```
npm test
npm run build
```

Expected: 11 passed, build exits 0.

- [ ] **Step 6: Commit**

```bash
git add frontend/README.md backend/README.md
git commit -m "docs: document client setup and manual checklist"
```

---

## Self-Review

**Spec coverage**

| Spec section | Task |
|---|---|
| 3 산출물 (`frontend/`) | 1 |
| 4 스택 | 1 |
| 4.1 MediaPipe 자산 | 4 |
| 5 모듈 경계 | 2, 3, 5, 6, 7, 8, 9 |
| 5.1 토큰 보관 | 6 |
| 6.1 녹화 흐름 | 8 |
| 6.2 프레임 버퍼 규칙 | 3 (enforcement), 8 (UI) |
| 6.3 기록 조회 | 9 |
| 7 에러 표 | 2 (normalisation), 7, 8, 9 (display) |
| 7.1 refresh 미사용 | 6, 10 |
| 7.2 웹캠·모델 에러 | 5, 8 |
| 8 테스트 | 2, 3 |
| 9 수동 확인 | 10 |
| 11 검증 기준 | 2 (types), 3 (tests), 9 (build), 10 (offline, manual) |

No gaps.

**Known type-check gap:** Task 6 leaves `App.tsx` importing screens that do not exist until Tasks 7–9. Task 6 Step 4 says so explicitly, and Task 9 Step 2 is the first full `tsc -b`. This is deliberate — stubbing the screens would mean writing them twice.

**Test count:** Task 2 adds 5 and removes the 1-test smoke file; Task 3 adds 6. Total 11, consistent everywhere it appears.
