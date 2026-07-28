# React + MediaPipe 클라이언트 설계

작성일: 2026-07-28

## 1. 목표

`backend/`의 FastAPI 서버를 실제로 사용하는 웹 클라이언트를 만든다. 웹캠에서 손 랜드마크를
추출해 세션 종료 후 제출하고, 판정 결과와 과거 기록을 보여준다.

**완성 기준은 과제 제출용 데모다.** 3계층이 실제로 동작함을 보이는 것이 목적이며, 화면은
깔끔하되 최소로 유지한다. 보고서에 넣을 스크린샷을 찍을 수 있는 수준이면 충분하다.

## 2. 배경과 전제

- 백엔드 엔드포인트 6개는 이미 구현·검증되어 있다. 이 작업에서 **백엔드 코드는 바꾸지 않는다.**
- 추론은 브라우저에서 온디바이스로 돌아간다. 별도 AI 서버는 없다 (`docs/architecture.md` 참조).
- 판정 엔진은 단일 손 기준이다 (`backend/app/judgment/engine.py`).
- 이 PC에 Node 24.18.0 / npm 11.16.0이 설치되어 있다.
- 백엔드 CORS 기본값이 Vite 개발 서버 포트(5173)를 이미 허용한다
  (`backend/app/core/config.py`).
- `getUserMedia`는 HTTPS 또는 `localhost`에서만 동작한다. 로컬 개발은 문제없다.

## 3. 산출물

저장소 루트의 **`frontend/`** 디렉터리. `backend/`와 형제 관계다. `docs/architecture.md`가
클라이언트와 백엔드를 별개 계층으로 그리고 있으므로 백엔드 하위에 두지 않는다.

## 4. 스택

| 항목 | 선택 | 이유 |
|---|---|---|
| 빌드 | Vite | React + TS 스캐폴딩이 가장 짧다 |
| 언어 | TypeScript | 백엔드가 타입을 강하게 쓰므로 스키마 대응이 명확해진다 |
| 라우팅 | `react-router` | 화면 3개, 그 이상은 필요 없다 |
| 상태 | `AuthContext` 하나 | 데모 범위에 Redux/Zustand는 과하다 |
| 스타일 | 순수 CSS 한 파일 | Tailwind 빌드 체인을 얹을 이유가 없다 |
| 추론 | `@mediapipe/tasks-vision` | 현재 지원되는 Tasks API. 구 `@mediapipe/hands`는 지원 종료 |
| 테스트 | Vitest | 순수 로직 한정 (8절) |

경로 3개: `/login`, `/record`, `/history`.

API 주소는 `VITE_API_BASE`로 주입하고 기본값은 `http://localhost:8000`이다. 백엔드 CORS가
이미 5173을 허용하므로 개발 프록시는 두지 않는다.

### 4.1 MediaPipe 자산 처리

`@mediapipe/tasks-vision` npm 패키지는 WASM 런타임을 포함하지만 **모델 파일은 포함하지
않는다.** `hand_landmarker.task`(float16, 약 7.5MB)는 Google 스토리지에서 받아야 한다.

`npm install` 시 실행되는 postinstall 스크립트가 두 가지를 `frontend/public/mediapipe/`로
모은다.

1. `node_modules/@mediapipe/tasks-vision/wasm/` 복사
2. `hand_landmarker.task` 다운로드

`public/mediapipe/`는 gitignore한다. 7.5MB 바이너리를 저장소에 넣지 않으면서도, 설치가
끝난 뒤에는 **실행 시 외부 네트워크 요청이 0**이 된다. 이는 `docs/architecture.md`의
"네트워크 호출 없음 — 브라우저 내 추론"과 문자 그대로 일치하며, 채점자의 네트워크 상태와
CDN 가용성에 시연이 좌우되지 않는다.

## 5. 모듈 경계

`frontend/src/` 아래. 순수 로직을 UI·브라우저 API에서 떼어내는 것이 원칙이다. 그래야
테스트할 표면이 생긴다.

| 모듈 | 역할 | 의존 |
|---|---|---|
| `api/types.ts` | 백엔드 스키마의 TS 대응 (`Token`, `JudgeResult`, `SessionOut`, `GestureSubmission`) | 없음 |
| `api/client.ts` | fetch 래퍼. base URL 결합, `Authorization` 부착, 에러 정규화 | `types` |
| `auth/AuthContext.tsx` | 토큰 상태 + sessionStorage 동기화, login/register/logout | `client` |
| `hands/frameBuffer.ts` | **순수.** 프레임 누적, 21개 검증, 900 상한, 페이로드 생성 | `types` |
| `hands/useHandLandmarker.ts` | `HandLandmarker` 로드·해제, `detect(video, timestamp)` 노출 | tasks-vision |
| `hands/overlay.ts` | 캔버스에 랜드마크·연결선 그리기 | 없음 |
| `screens/LoginScreen.tsx` | 가입·로그인 폼 | `AuthContext` |
| `screens/RecordScreen.tsx` | 제스처 선택, 웹캠, 녹화, 점수 표시 | `hands/*`, `client` |
| `screens/HistoryScreen.tsx` | 기록 목록과 상세 | `client` |

### 5.1 토큰 보관

**sessionStorage**에 둔다. 새로고침해도 로그인이 유지되어 시연이 끊기지 않고, 탭을 닫으면
사라져 토큰이 디스크에 오래 남지 않는다. XSS가 있으면 읽힌다는 점은 localStorage와 같으며,
이 데모의 위협 모델에서는 감수한다.

`AuthContext`가 sessionStorage 읽기·쓰기를 전담한다. 다른 모듈은 storage를 직접 만지지
않는다.

## 6. 데이터 흐름

### 6.1 녹화

1. 사용자가 목표 제스처를 고른다 (`open_palm`, `fist`, `thumbs_up`, `peace`, `pointing`)
2. 시작 버튼 → `getUserMedia({ video: true })` → `<video>`에 스트림 연결
3. `requestAnimationFrame` 루프마다 `detect(video, timestamp)` 호출
4. 랜드마크를 `frameBuffer.push()`에 넣고 `overlay.draw()`로 캔버스에 표시
5. 종료 버튼 → 루프 정지, 스트림 트랙 해제
6. `frameBuffer.toPayload()` → `POST /sessions/submit`
7. `JudgeResult { matched_gesture, score, frames_total, frames_matched }` 표시

`numHands: 1`로 고정한다. 판정 엔진이 단일 손 기준이다.

### 6.2 프레임 버퍼 규칙

경계에서 지켜야 할 세 가지. 모두 백엔드 제약(`backend/app/judgment/schemas.py`)에서 나온다.

- **손이 잡히지 않은 프레임은 버린다.** MediaPipe가 빈 결과를 주는 프레임을 그대로 넣으면
  "프레임당 랜드마크 정확히 21개" 제약을 깨서 422가 난다. 버퍼는 21개짜리만 받아들이고,
  화면에는 "손이 인식되지 않음"을 표시한다.
- **900프레임에서 자동 종료한다.** 백엔드 `MAX_FRAMES`가 900이다 (30fps 기준 약 30초).
  상한에 닿으면 녹화를 멈추고 사용자에게 알린다. 초과분을 보내 거절당하는 것보다 낫다.
- **버퍼가 비면 제출 버튼을 막는다.** `frames` 최소 길이가 1이다. 손을 한 번도 잡지 못한
  채 종료했다면 보낼 것이 없으므로, 요청을 만들지 않고 다시 녹화하도록 안내한다.

### 6.3 기록 조회

`/history` 진입 시 `GET /sessions` → `SessionOut[]` 목록 표시 (백엔드가 `submitted_at`
내림차순으로 정렬해 준다). 항목 선택 시 `GET /sessions/{session_id}` → 상세 표시.

## 7. 에러 처리

`client.ts`가 FastAPI의 `{"detail": "..."}` 응답을 단일 `ApiError { status, detail }`로
정규화한다. 화면은 상태 코드가 아니라 이 객체만 본다.

| 상황 | 처리 |
|---|---|
| 409 `Email already registered` | 가입 폼에 인라인 표시 |
| 401 (로그인 실패) | 로그인 폼에 인라인 표시 |
| 401 (인증된 요청 중) | 토큰 폐기 → `/login`으로, "세션이 만료되었습니다" |
| 404 `Session not found` | 기록 화면에 "세션을 찾을 수 없습니다" |
| 422 | `detail` 원문 노출. 클라이언트가 먼저 막아야 할 개발 실수다 |
| 네트워크 실패 | "서버에 연결할 수 없습니다" + 재시도 버튼 |

### 7.1 refresh 토큰 미사용

access 토큰 수명이 30분이고 시연은 그보다 짧다. 401이 나면 자동 재발급을 시도하지 않고
로그아웃시킨다. 자동 갱신은 데모에 필요 없는 상태 기계를 하나 더 만든다.

`POST /auth/refresh`는 백엔드에 존재하고 `docs/architecture.md`에도 나오므로, **클라이언트가
의도적으로 쓰지 않는다는 사실을 `frontend/README.md`에 한 줄 남긴다.**

### 7.2 웹캠·모델 에러

원인별로 다른 문구를 띄운다. 하나의 "카메라 오류"로 뭉치면 사용자가 조치할 수 없다.

| 원인 | 문구 방향 |
|---|---|
| `NotAllowedError` | 권한 거부 — 브라우저 주소창에서 카메라 허용 안내 |
| `NotFoundError` | 연결된 카메라 없음 |
| `getUserMedia` 자체가 없음 | 안전하지 않은 컨텍스트 — HTTPS 또는 `localhost`로 접속 안내 |
| 모델 로드 실패 | `npm install`이 `public/mediapipe/`를 채웠는지 확인 안내 |

## 8. 테스트

Vitest. **순수 로직만** 테스트한다. 웹캠·MediaPipe·화면 렌더링은 자동 테스트 대상에서
제외하고 9절의 수동 확인으로 대체한다.

**`frameBuffer.ts`**
- 랜드마크가 21개가 아닌 프레임을 거부한다
- 900번째 프레임에서 상한에 도달했음을 알린다
- 빈 버퍼는 페이로드를 만들지 않는다
- `toPayload()` 결과가 백엔드 `GestureSubmission` 형태와 일치한다

**`client.ts`**
- 인증 요청에 `Authorization: Bearer <token>`을 붙인다
- 비-2xx 응답의 `detail`을 `ApiError`로 옮긴다
- base URL과 경로를 올바르게 결합한다

`client.ts`는 `fetch`를 주입받도록 만들고, 테스트는 진짜 `Response` 객체를 돌려주는 스텁을
넘긴다. 검증 대상은 "fetch가 호출되었는지"가 아니라 만들어진 요청(URL, 헤더, 본문)과
튀어나온 `ApiError`다.

## 9. 수동 확인 체크리스트

`frontend/README.md`에 싣는다.

1. 카메라 권한을 거부하면 권한 안내 문구가 뜬다
2. 손을 화면에서 치우면 "손이 인식되지 않음"이 뜬다
3. 손을 비추면 랜드마크 오버레이가 그려진다
4. 30초 이상 녹화하면 900프레임에서 자동 종료된다
5. 손을 한 번도 잡지 못한 채 종료하면 제출이 막힌다
6. 목표 제스처를 유지하면 점수가 높게, 다른 제스처를 취하면 낮게 나온다
7. 제출 후 기록 화면에 방금 세션이 최상단에 보인다
8. 백엔드를 끄고 요청하면 연결 실패 문구와 재시도 버튼이 뜬다

## 10. 범위 밖

- 백엔드 코드 변경
- refresh 토큰 자동 재발급 (7.1)
- 양손 인식, 시퀀스(DTW) 판정
- 컴포넌트 렌더링 테스트, E2E 브라우저 자동화
- 반응형·모바일 레이아웃, 다크 모드
- 배포, HTTPS 구성, Docker

## 11. 검증 기준

1. **타입 일치** — `api/types.ts`의 필드명이 `backend/app/**/schemas.py`와 1:1로 맞는다.
2. **테스트 통과** — `npm test`가 8절 항목 전부 통과한다.
3. **빌드 성공** — `npm run build`가 타입 오류 없이 끝난다.
4. **오프라인 실행** — `npm install` 후에는 앱 실행 중 외부 호스트로 나가는 요청이 없다.
   브라우저 개발자 도구 네트워크 탭에서 `localhost` 외 요청이 없음을 확인한다.
5. **수동 확인** — 9절 8개 항목을 실제 브라우저에서 확인한다.
