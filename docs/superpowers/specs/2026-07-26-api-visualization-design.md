# 클라이언트·백엔드·추론 계층 API 시각화 설계

작성일: 2026-07-26

## 1. 목표

Motion Recognition 서비스의 계층 간 API 호출 구조를 한 눈에 읽히는 도해로 만든다.
과제 제출·보고용 산출물이며, 코드 변경 시 손쉽게 갱신할 수 있어야 한다.

## 2. 배경과 전제

- 현재 저장소에는 `backend/`(FastAPI)만 존재한다. 클라이언트는 아직 구현되지 않았다.
- **별도 AI 서버는 없다.** MediaPipe Hands는 브라우저에서 온디바이스로 실행된다.
  도해에서 "AI 계층"은 클라이언트 내부의 논리적 컴포넌트로 표현한다.
- 백엔드는 모듈러 모놀리스이며 `auth` / `judgment` / `records` 3모듈로 나뉜다.
- 이 PC에 Node/npm이 없다. `mermaid-cli`(mmdc)를 이용한 자동 PNG 변환은 불가하다.

## 3. 산출물

단일 파일 **`docs/architecture.md`**.

`backend/` 하위가 아니라 저장소 루트 `docs/`에 둔다. 이 문서는 클라이언트·백엔드·추론
단계를 모두 걸치므로 백엔드 하위에 두면 문서의 범위와 위치가 어긋난다.

## 4. 문서 구조

추상도가 높은 것부터 낮은 순으로 배치한다.

| 절 | 제목 | 형식 |
|---|---|---|
| 0 | 읽는 법 (범례) | 텍스트 |
| 1 | 3계층 아키텍처 전체도 | Mermaid `flowchart TB` × 1 |
| 2 | 시나리오별 플로우 | Mermaid `sequenceDiagram` × 3 |
| 3 | 보고서용 PNG 추출 방법 | 텍스트 |

Mermaid 코드 블록 총 4개.

### 4.0 0절 — 범례

다음 표기 규칙을 문서 첫머리에 명시한다.

- 실선 화살표: 요청 (HTTP 또는 SQL)
- 점선 화살표: 응답
- 자물쇠 표시 `[JWT]`: `Authorization: Bearer <access_token>` 헤더 필요
- 회색 박스: 프로세스 경계 (브라우저 / 서버 / DB)

## 5. 1절 — 3계층 아키텍처 전체도

`flowchart TB`, `subgraph` 3개로 계층을 묶는다.

**클라이언트 (React, 브라우저)**
- `UI 화면`
- `MediaPipe Hands (온디바이스 추론)`
- `프레임 버퍼 (21 landmarks × N frames)`

`MediaPipe Hands` 노드 옆에 "네트워크 호출 없음 — 브라우저 내 추론" 주석을 단다.
별도 AI 서버로 오해하지 않게 하는 것이 이 주석의 목적이다.

**백엔드 (FastAPI)**
- `auth` (`app/auth/router.py`)
- `judgment` (`app/judgment/router.py`) — 내부에 `engine.judge()` (순수 판정 로직, DB 비의존) 표시
- `records` (`app/records/router.py`)

**데이터베이스 (PostgreSQL)**
- `users`
- `sessions`
- `session_results`

**계층 간 화살표 라벨** — 실제 경로와 인증 여부를 그대로 적는다.

| 출발 | 도착 | 라벨 |
|---|---|---|
| UI 화면 | auth | `POST /auth/register` |
| UI 화면 | auth | `POST /auth/login` |
| UI 화면 | auth | `POST /auth/refresh` |
| 프레임 버퍼 | judgment | `POST /sessions/submit [JWT]` |
| UI 화면 | records | `GET /sessions [JWT]` |
| UI 화면 | records | `GET /sessions/{id} [JWT]` |
| 백엔드 | DB | `SQL (async SQLAlchemy 2.0)` |

## 6. 2절 — 시나리오별 시퀀스 다이어그램

세 다이어그램 모두 아래 participant를 **같은 순서로** 선언한다. 레인 순서가 통일되어야
세 도해를 나란히 놓고 비교할 수 있다.

```
participant U as 사용자
participant UI as React UI
participant MP as MediaPipe
participant API as FastAPI
participant DB as PostgreSQL
```

해당 시나리오에서 쓰이지 않는 participant도 선언은 유지한다(레인 위치 고정).

### 6.1 시나리오 1 — 가입 & 로그인

1. 사용자가 이메일/비밀번호 입력
2. `POST /auth/register` → 201, `UserOut { id, email, created_at }`
   - 중복 이메일이면 409 `Email already registered`
3. `POST /auth/login` (form, `username`=이메일) → `Token { access_token, refresh_token, token_type }`
   - 실패 시 401 `Incorrect email or password`
4. 클라이언트가 토큰 보관, 이후 요청에 `Authorization: Bearer <access_token>` 부착

다이어그램 아래에 한 줄 주석: "access token 만료 시 `POST /auth/refresh`로 재발급받는다
(요청: `{ refresh_token }`, 응답: 새 `Token`)." 별도 시퀀스 다이어그램은 만들지 않는다.

### 6.2 시나리오 2 — 동작 인식 & 제출

1. 사용자가 녹화 시작
2. UI가 웹캠 프레임 획득 → `MediaPipe` 추론 (loop 블록으로 표현, "네트워크 호출 없음" 명시)
3. 프레임마다 21개 landmark `{x, y, z}` 반환, 클라이언트 버퍼에 누적
4. 사용자가 녹화 종료
5. `POST /sessions/submit [JWT]` — 본문 `{ target_gesture?, frames: [{ landmarks: [21개] }] }`
   - 제약: 프레임당 landmark 정확히 21개, frames 길이 1~900
6. 백엔드가 `engine.judge()` 호출 (DB 접근 없음)
7. `sessions` + `session_results` INSERT
8. 응답 `JudgeResult { matched_gesture, score, frames_total, frames_matched }`
9. UI가 점수 표시

### 6.3 시나리오 3 — 기록 조회

1. 사용자가 기록 화면 진입
2. `GET /sessions [JWT]` → `SessionOut[]` (`submitted_at` 내림차순, `result` 포함)
3. 사용자가 항목 선택
4. `GET /sessions/{id} [JWT]` → `SessionOut { id, gesture_type, submitted_at, result }`
   - 타인 세션이거나 없으면 404 `Session not found`

## 7. 3절 — PNG 추출 방법

Node/npm이 없으므로 수동 절차 2가지를 문서에 적는다.

1. <https://mermaid.live> 에 코드 블록 붙여넣기 → Actions → PNG 다운로드
2. VSCode 확장 `Markdown Preview Mermaid Support` 설치 → 미리보기 → 화면 캡처

추가로, Node 설치 후에는 다음 한 줄로 자동화 가능함을 병기한다.

```
npx -p @mermaid-js/mermaid-cli mmdc -i docs/architecture.md -o docs/architecture.png
```

## 8. 범위 밖

- 엔드포인트별 요청·응답 필드 상세표 (`/docs` Swagger가 이미 제공)
- 데이터 모델 ERD
- JWT access/refresh 토큰 생애주기 전용 다이어그램
- 클라이언트 코드 작성, 백엔드 코드 변경
- 도해 자동 생성·자동 동기화 파이프라인

## 9. 검증 기준

1. **경로 정확성** — 문서에 등장하는 모든 경로·스키마 필드명이 `backend/app/**/router.py`,
   `schemas.py`와 일치한다. 엔드포인트 6개를 코드와 1:1 대조하여 확인.
2. **렌더 성공** — Mermaid 블록 4개가 mermaid.live에서 문법 오류 없이 렌더된다.
3. **커버리지** — 코드에 존재하는 엔드포인트 6개(`/auth/register`, `/auth/login`,
   `/auth/refresh`, `POST /sessions/submit`, `GET /sessions`, `GET /sessions/{id}`)가
   1절 전체도 또는 2절 시나리오 중 최소 한 곳에 등장한다.
