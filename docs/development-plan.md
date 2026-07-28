# 개발 방안

Motion Recognition 서비스의 API 사용 예시, 저장·캐시 전략, 기술 선정 근거, 배포·운영 방안.

관련 문서:
- [architecture.md](architecture.md) — 계층 간 호출 다이어그램
- [system-design.md](system-design.md) — 계층 구성, DB 설계, 인증, 확장 전략

## 0. 문서 표기

| 표시 | 뜻 |
|------|-----|
| **[구현됨]** | 저장소 코드에 존재하고 실행·검증됨 |
| **[미구현 — 방안]** | 코드에 없음. 도입 시 방침 |
| **[도입 안 함]** | 검토했고 현 단계에서 넣지 않기로 판단 |

**1절의 모든 요청/응답은 실제로 서버를 띄워 호출한 실측값이다.** 손으로 작성한 예시가
아니며, 상태 코드와 본문이 실제 응답 그대로다.

---

## 1. 주요 API Request / Response 예시 **[구현됨]**

- Base URL (로컬): `http://localhost:8000`
- 인증 필요 요청: `Authorization: Bearer <access_token>`
- 자동 문서: `http://localhost:8000/docs`

### 1.1 헬스체크

```http
GET /health
```

```json
{ "status": "ok" }
```

### 1.2 회원가입

```http
POST /auth/register
Content-Type: application/json

{ "email": "docs@example.com", "password": "docs-password-123" }
```

**201 Created**

```json
{
  "id": 6,
  "email": "docs@example.com",
  "created_at": "2026-07-28T08:47:58.667452Z"
}
```

응답에 비밀번호 관련 필드가 없다. Pydantic 응답 스키마(`UserOut`)가 `id`, `email`,
`created_at`만 허용하므로 ORM 객체의 `hashed_password`는 구조적으로 새어 나갈 수 없다.

**409 Conflict** — 이메일 중복

```json
{ "detail": "Email already registered" }
```

**422 Unprocessable Entity** — 검증 실패 (필드별로 사유가 나온다)

```json
{
  "detail": [
    {
      "type": "value_error",
      "loc": ["body", "email"],
      "msg": "value is not a valid email address: An email address must have an @-sign.",
      "input": "not-an-email"
    },
    {
      "type": "string_too_short",
      "loc": ["body", "password"],
      "msg": "String should have at least 8 characters",
      "input": "short",
      "ctx": { "min_length": 8 }
    }
  ]
}
```

### 1.3 로그인

OAuth2 password flow를 따르므로 **JSON이 아니라 form-encoded**이고, 필드명이
`username`이다 (값은 이메일).

```http
POST /auth/login
Content-Type: application/x-www-form-urlencoded

username=docs@example.com&password=docs-password-123
```

**200 OK**

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2IiwiaWF0IjoxNzg1MjI4NDc5LCJleHAiOjE3ODUyMzAyNzksInR5cGUiOiJhY2Nlc3MifQ.V3QkGcV9TYAY7LWDj3eEHx3oxH6ljBv36Q0JBapAfoU",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI2IiwiaWF0IjoxNzg1MjI4NDc5LCJleHAiOjE3ODU4MzMyNzksInR5cGUiOiJyZWZyZXNoIn0.cl_F22tuKPR_X9wTILOoG-Xays-1qMEQmkeSR50dcFc",
  "token_type": "bearer"
}
```

access 토큰의 payload를 디코딩하면:

```json
{ "sub": "6", "iat": 1785228479, "exp": 1785230279, "type": "access" }
```

`exp - iat = 1800`초 = 30분. refresh 토큰은 같은 구조에 `"type": "refresh"`,
수명 7일이다.

**401 Unauthorized** — 비밀번호 불일치

```json
{ "detail": "Incorrect email or password" }
```

존재하지 않는 이메일도 **같은 메시지**를 반환한다. 메시지를 나누면 가입 여부를
확인하는 계정 열거 수단이 된다.

### 1.4 토큰 재발급

```http
POST /auth/refresh
Content-Type: application/json

{ "refresh_token": "eyJhbGciOiJIUzI1NiIs..." }
```

**200 OK** — 로그인과 동일한 `Token` 형식

**401 Unauthorized** — access 토큰을 넣은 경우

```json
{ "detail": "Invalid refresh token" }
```

`type` 클레임 검사가 이걸 막는다. 없으면 수명 7일짜리 refresh 토큰이 사실상 무제한
access 토큰이 된다.

> **실측에서 확인된 동작**: 재발급을 로그인과 같은 초에 호출하면 발급된 토큰 문자열이
> 이전과 완전히 동일하다. `iat`/`exp`가 초 단위라 payload가 같아지고, JWT 서명이
> 결정적이기 때문이다. 기능상 문제는 아니지만 **토큰 회전(rotation)을 넣으려면
> `jti` 같은 고유 클레임이 반드시 필요하다**는 뜻이다.

### 1.5 세션 제출 (판정)

```http
POST /sessions/submit
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "target_gesture": "open_palm",
  "frames": [
    { "landmarks": [
        {"x": 0.0, "y": 0.0, "z": 0.0},
        ... 정확히 21개 ...
    ]}
  ]
}
```

**200 OK** — 10프레임 중 8프레임이 목표와 일치한 경우

```json
{
  "matched_gesture": "open_palm",
  "score": 80.0,
  "frames_total": 10,
  "frames_matched": 8
}
```

`target_gesture`를 생략하면 가장 많이 인식된 제스처를 그 자신의 비율과 함께 보고한다.

```json
{
  "matched_gesture": "peace",
  "score": 100.0,
  "frames_total": 5,
  "frames_matched": 5
}
```

**401 Unauthorized** — 헤더 없음

```json
{ "detail": "Not authenticated" }
```

**422** — 랜드마크가 21개가 아닐 때 (어느 프레임인지 `loc`에 인덱스로 나온다)

```json
{
  "detail": [
    {
      "type": "too_short",
      "loc": ["body", "frames", 0, "landmarks"],
      "msg": "List should have at least 21 items after validation, not 20",
      "ctx": { "min_length": 21, "actual_length": 20 }
    }
  ]
}
```

**422** — 빈 프레임 배열

```json
{
  "detail": [
    {
      "type": "too_short",
      "loc": ["body", "frames"],
      "msg": "List should have at least 1 item after validation, not 0",
      "ctx": { "min_length": 1, "actual_length": 0 }
    }
  ]
}
```

900프레임 초과도 같은 형식의 `too_long`으로 거부된다.

### 1.6 세션 목록

```http
GET /sessions
Authorization: Bearer <access_token>
```

**200 OK** — 최신순 정렬, 판정 결과 포함

```json
[
  {
    "id": 39,
    "gesture_type": null,
    "submitted_at": "2026-07-28T08:47:59.412866Z",
    "result": {
      "matched_gesture": "peace",
      "score": 100.0,
      "detail": { "frames_total": 5, "frames_matched": 5 }
    }
  },
  {
    "id": 38,
    "gesture_type": "open_palm",
    "submitted_at": "2026-07-28T08:47:59.402895Z",
    "result": {
      "matched_gesture": "open_palm",
      "score": 80.0,
      "detail": { "frames_total": 10, "frames_matched": 8 }
    }
  }
]
```

`gesture_type`은 사용자가 지정한 **목표** 제스처(미지정 시 `null`),
`result.matched_gesture`는 실제 **인식된** 제스처다. 둘은 다를 수 있고, 그 차이가
곧 채점 결과다.

### 1.7 세션 상세

```http
GET /sessions/39
Authorization: Bearer <access_token>
```

**200 OK** — 목록 항목과 동일한 구조의 단일 객체

**404 Not Found** — 없는 세션, **그리고 타인의 세션**

```json
{ "detail": "Session not found" }
```

403이 아니라 404다. 403은 "존재하지만 권한 없음"을 알려주므로 ID를 훑어 타인의
세션 개수와 ID 범위를 추정할 수 있다.

**401 Unauthorized** — 위조·만료 토큰

```json
{ "detail": "Could not validate credentials" }
```

### 1.8 에러 응답 규약 요약

| 상태 | 의미 | `detail` 타입 | 클라이언트 처리 |
|------|------|---------------|-----------------|
| 401 | 인증 실패·만료 | 문자열 | 토큰 폐기 후 로그인 화면 |
| 404 | 없음 또는 타인 소유 | 문자열 | "기록을 찾을 수 없음" 표시 |
| 409 | 이메일 중복 | 문자열 | 해당 입력란에 표시 |
| 422 | 스키마 검증 실패 | **배열** | `loc`로 필드 매핑, 재시도 금지 |
| 5xx | 서버 오류 | 문자열 | 재시도 가능 |

클라이언트(`frontend/src/api/client.ts`)는 `detail`이 문자열이 아니면 직렬화해
표시하며, 네트워크 자체가 실패하면 `ApiError(0, "서버에 연결할 수 없습니다.")`를
던진다.

---

## 2. AI 분석 결과 저장 방식

### 2.1 무엇을 저장하는가 **[구현됨]**

**분석(추론)은 브라우저에서, 판정(채점)은 서버에서** 일어난다. 저장 대상은 판정 결과다.

| 데이터 | 생성 위치 | 저장 여부 | 이유 |
|--------|-----------|-----------|------|
| 원본 영상 프레임 | 브라우저 | **저장 안 함** | 단말을 떠나지 않음 (개인정보) |
| 랜드마크 시퀀스 (최대 1MB) | 브라우저 MediaPipe | **저장 안 함** | 재채점 기능이 없어 보관 이유 없음 |
| 프레임별 분류 결과 | 서버 `engine.py` | **저장 안 함** | 집계값으로 충분 |
| 판정 요약 | 서버 | **저장함** | 조회·통계 대상 |

서버는 랜드마크를 **요청 처리 중에만 메모리에 두고 응답 후 버린다.**

### 2.2 저장 구조 **[구현됨]**

`sessions` (무엇을 시도했나) + `session_results` (어떻게 나왔나), 1:1.

```sql
-- 실제 저장 예시
sessions:        id=38, user_id=6, gesture_type='open_palm', submitted_at='2026-07-28 08:47:59.402895+00'
session_results: id=…, session_id=38, matched_gesture='open_palm', score=80.0,
                 detail='{"frames_total": 10, "frames_matched": 8}'::jsonb
```

**정규 컬럼 vs JSONB 기준:**

- **컬럼** — `score`, `matched_gesture`. 정렬·집계·통계의 대상이므로 인덱싱과 타입이
  필요하다.
- **JSONB `detail`** — `frames_total`, `frames_matched` 등 판정 부산물. 알고리즘이
  바뀌면 담을 항목도 바뀌는데, 그때마다 마이그레이션하지 않기 위해 스키마리스로 뒀다.

> 기준 한 줄: **조회 조건이 되는 값은 컬럼, 부산물은 JSON.**

이식성을 위해 `JSON().with_variant(JSONB, "postgresql")`로 선언했다 — PostgreSQL에서는
JSONB, 테스트용 SQLite에서는 일반 JSON.

### 2.3 트랜잭션 **[구현됨]**

`Session`과 `SessionResult`를 ORM 관계로 묶어 **한 트랜잭션에서 커밋한다.**
"세션은 있는데 결과가 없는" 중간 상태가 생기지 않는다.

판정은 DB 접근 **이전에** 끝난다 (`engine.judge()`는 DB 임포트가 없는 순수 함수).
DB가 죽으면 저장에 실패할 뿐, 채점이 절반만 되는 일은 없다.

### 2.4 재채점을 지원하려면 **[미구현 — 방안]**

판정 알고리즘을 고칠 때 과거 데이터로 회귀 검증을 하려면 랜드마크 원본이 필요하다.
그 시점의 설계:

1. 랜드마크 시퀀스를 **객체 스토리지**(S3/MinIO)에 gzip JSON으로 저장
2. `sessions`에 `raw_landmarks_key`(문자열) 컬럼 추가 — DB에는 키만
3. `session_results`에 `engine_version` 컬럼 추가, 1:1 제약을 풀어 버전별 이력 보관
4. 보존 기간 정책 필수 (예: 90일 후 삭제) — 생체 정보에 준하는 데이터다

세션당 최대 1MB짜리 배열은 **RDB에 넣을 데이터가 아니다.** 백업 크기와 복구 시간이
바로 무너진다.

---

## 3. 캐시 및 파일 저장 전략

### 3.1 캐시 — 현재 없음 **[도입 안 함]**

애플리케이션 캐시 계층(Redis 등)이 없다. 이유:

- **조회가 전부 개인 데이터다.** `/sessions`는 항상 `WHERE user_id = ?`로 시작한다.
  사용자 간 공유가 없어 캐시 적중률이 근본적으로 낮다.
- **쓰기 직후 읽기 패턴이다.** 제출하고 바로 기록을 확인한다. 캐시를 두면 무효화
  타이밍 문제만 생긴다.
- **참조 데이터가 코드 상수다.** 제스처 정의(`gestures.py`)는 프로세스 메모리에 있는
  dict이므로 이미 조회 비용이 0이다.

현재 규모에서 캐시는 **적중률 없는 정합성 리스크**다.

### 3.2 캐시가 필요해지는 시점 **[미구현 — 방안]**

Redis는 캐시 목적이 아니라 **상태 저장 목적**으로 먼저 필요해진다.

| 계기 | 용도 | 자료구조 |
|------|------|----------|
| refresh 토큰 폐기·로그아웃 | 폐기된 `jti` 목록 | Set + TTL(토큰 잔여 수명) |
| 로그인 레이트리밋 | IP·계정별 실패 카운터 | Counter + TTL |
| 판정 큐 도입 | 작업 큐 | List / Stream |
| 통계 대시보드 | 제스처별 평균 점수 집계 | 값 캐시 + 짧은 TTL |

**하나라도 필요해지면 Redis를 넣고, 그때 캐시도 같이 얹는 것이 맞다.** 캐시만을 위해
인프라를 늘리지 않는다.

### 3.3 HTTP 캐시 **[미구현 — 방안]**

- **API 응답**: `Cache-Control: no-store`. 전부 개인 데이터이므로 중간 프록시에
  남으면 안 된다.
- **정적 자산**: Vite 빌드 산출물은 파일명에 해시가 붙는다 →
  `Cache-Control: public, max-age=31536000, immutable`. `index.html`만 `no-cache`.

### 3.4 파일 저장 — 현재 상태 **[구현됨]**

서버는 **업로드 파일을 전혀 받지 않는다.** 모든 요청이 JSON이며 multipart 엔드포인트가
없다. 파일 시스템 쓰기가 없으므로 컨테이너를 완전히 읽기 전용으로 운영할 수 있다.

취급하는 파일은 **MediaPipe 모델 자산** 하나다.

| 항목 | 값 |
|------|-----|
| 파일 | `hand_landmarker.task` (7,819,105 바이트) + WASM 런타임 |
| 위치 | `frontend/public/mediapipe/` |
| 버전 관리 | **gitignore** — 저장소에 8MB 바이너리를 넣지 않음 |
| 획득 | `npm run setup` (`scripts/setup-mediapipe.mjs`) |
| 방식 | WASM은 `node_modules`에서 복사, 모델은 Google 스토리지에서 다운로드 |

`npm install`의 `postinstall`로도 걸려 있지만, 설치 스크립트를 차단하는 환경을 위해
독립 실행 가능한 `npm run setup`을 함께 제공한다.

> **배포 시 주의**: 이 스크립트는 외부 네트워크를 탄다. 폐쇄망이나 재현 가능한 빌드가
> 필요하면 모델 파일을 사내 아티팩트 저장소에 올리고 URL만 바꾸는 것이 맞다.

### 3.5 파일 저장이 필요해지는 경우 **[미구현 — 방안]**

| 데이터 | 저장소 | 이유 |
|--------|--------|------|
| 랜드마크 원본 (2.4절) | 객체 스토리지 | 대용량·순차 접근·저비용 |
| 세션 리플레이 영상 | 객체 스토리지 + 서명 URL | 앱 서버를 거치지 않게 |
| 사용자 업로드 | 객체 스토리지 | 로컬 디스크는 수평 확장 시 공유 불가 |

원칙: **앱 서버 로컬 디스크에 영속 데이터를 두지 않는다.** 인스턴스를 늘리는 순간
정합성이 깨진다.

---

## 4. Queue 사용 여부

### 4.1 결론: 사용하지 않음 **[도입 안 함]**

판정은 요청 스레드에서 **동기적으로** 처리하고 즉시 결과를 응답한다.

근거:

- **판정 비용이 낮다.** 프레임당 부동소수 거리 계산 5회 + dict 조회. 900프레임 전체를
  계산해도 밀리초 단위다.
- **사용자가 결과를 즉시 기다린다.** 큐를 쓰면 202를 반환하고 폴링/웹소켓으로 결과를
  받아야 한다. 클라이언트 복잡도가 크게 오른다.
- **부수 작업이 없다.** 메일 발송, 외부 API 호출, 썸네일 생성처럼 실패해도 재시도하면
  되는 작업이 없다.
- **운영 비용.** 브로커·워커·모니터링·DLQ 관리가 추가된다.

큐는 **느리거나 실패할 수 있는 작업을 요청 경로에서 떼어낼 때** 쓰는 도구다. 지금은
둘 다 해당하지 않는다.

### 4.2 도입 트리거 **[미구현 — 방안]**

| 트리거 | 판단 기준 |
|--------|-----------|
| 판정이 무거워짐 | 학습 모델·DTW 도입으로 p95 판정 시간이 **1초 초과** |
| 부수 작업 발생 | 결과 메일, 주간 리포트, 외부 연동 |
| 배치 처리 | 알고리즘 개선 후 과거 세션 전체 재채점 |
| 트래픽 급증 흡수 | 순간 부하를 큐 길이로 완충 |

### 4.3 도입 시 설계 **[미구현 — 방안]**

```mermaid
sequenceDiagram
    participant UI as 클라이언트
    participant API as FastAPI
    participant Q as Queue
    participant W as 판정 워커
    participant DB as PostgreSQL

    UI->>API: POST /sessions/submit
    API->>DB: INSERT sessions (status='pending')
    API->>Q: enqueue(session_id, landmarks_key)
    API-->>UI: 202 { session_id, status: "pending" }
    W->>Q: dequeue
    W->>W: engine.judge()
    W->>DB: INSERT session_results, status='done'
    UI->>API: GET /sessions/{id} (폴링)
    API-->>UI: 200 { status: "done", result }
```

필요한 변경:

1. `sessions.status` 컬럼 추가 (`pending` / `done` / `failed`)
2. 제출 응답을 **202 + 세션 ID**로 변경 — 클라이언트 폴링 필요
3. **멱등성 보장** — 워커 재시도 시 결과가 중복 저장되면 안 된다.
   `session_results.session_id`의 UNIQUE 제약이 이미 이를 막는다
4. 재시도 상한 + DLQ, 실패 시 `status='failed'`로 사용자에게 노출
5. 랜드마크를 워커에 전달할 경로 필요 → 객체 스토리지 (2.4절과 함께 도입)

기술 선택은 **Redis + RQ / Celery**가 무난하다. 이미 Redis가 들어와 있다면 브로커를
추가하지 않아도 된다.

---

## 5. 기술 스택 선정 이유

### 5.1 백엔드 **[구현됨]**

| 기술 | 선정 이유 | 대안과 비교 |
|------|-----------|-------------|
| **FastAPI** | Pydantic 기반 요청 검증이 프레임워크에 내장. "랜드마크 정확히 21개, 프레임 1~900개" 같은 제약을 **선언만으로** 강제하고, 위반 시 필드별 422가 자동 생성된다. OpenAPI 문서도 자동 | Django: ORM·admin·인증이 딸려오지만 이 서비스는 admin이 불필요하고 async 지원이 뒤늦다. Flask: 검증·문서화를 직접 붙여야 함 |
| **async SQLAlchemy 2.0 + asyncpg** | 워크로드가 CPU가 아니라 **DB 대기** 중심. 비동기 I/O로 대기 중 다른 요청을 처리한다. 2.0의 `Mapped[]` 타입 주석으로 모델이 정적 타입 검사 대상이 됨 | 동기 ORM: 커넥션 점유 시간만큼 워커가 막힌다 |
| **PostgreSQL** | `JSONB`로 판정 부산물을 스키마 변경 없이 담으면서, 점수·시각은 정규 컬럼으로 인덱싱. **한 DB에서 정형과 반정형을 동시에** 처리 | MySQL: JSON 지원이 상대적으로 약함. MongoDB: 사용자–세션–결과가 명확한 관계형 구조라 이점이 없고 제약·조인을 잃는다 |
| **Alembic** | 스키마 변경을 코드로 남기고 재현 가능하게 적용. 모델에서 autogenerate | 수동 SQL: 환경 간 드리프트를 막을 수 없다 |
| **JWT (python-jose)** | 무상태 인증 → **서버 세션 저장소 없이 수평 확장 가능**. sticky 세션 불필요 | 서버 세션: 확장 시 공유 저장소가 강제된다 |
| **bcrypt** | 검증된 느린 해시, 솔트 자동 처리 | 평문·단순 해시는 논외. Argon2도 좋지만 bcrypt로 충분 |
| **pydantic-settings** | 환경변수를 타입 검증된 객체로 로드. 누락 시 **기동 단계에서 실패** | `os.getenv`: 오타·누락이 런타임에야 드러난다 |
| **pytest + aiosqlite** | 인메모리 SQLite로 PostgreSQL 없이 전체 API 테스트 실행 | 실 DB 의존 테스트: 실행 장벽이 높아 자주 안 돌린다 |

**모듈러 모놀리스**를 택한 이유: `auth`/`judgment`/`records`가 디렉터리와 라우터로
분리되어 있으나 배포 단위는 하나다. 마이크로서비스는 지금 규모에서 운영 복잡도만
늘린다. 경계가 이미 코드에 있으므로 필요할 때 떼어내면 된다.

### 5.2 프론트엔드 **[구현됨]**

| 기술 | 선정 이유 |
|------|-----------|
| **React 19 + TypeScript** | API 응답 타입을 클라이언트와 공유해 컴파일 시점에 불일치를 잡는다 |
| **Vite 6** | 개발 서버 기동이 빠르고, 빌드 산출물이 해시 파일명이라 캐시 전략이 단순해진다 |
| **MediaPipe Tasks Vision** | 브라우저 WASM 온디바이스 추론. 21개 랜드마크 표준 출력. **GPU 서버 불필요** |
| **react-router** | 화면 3개(로그인/녹화/기록)에 필요한 최소 라우팅 |
| **Vitest + Testing Library** | Vite 설정을 그대로 공유. 순수 로직은 node 환경, 렌더 테스트만 jsdom |

**MediaPipe를 클라이언트에 둔 것이 이 시스템의 핵심 선택이다.** 영상을 서버로 보내면
프레임당 수십 KB인데 랜드마크만 보내면 약 1KB다. 게다가 원본 영상이 단말을 떠나지
않아 개인정보 노출면이 줄고, 실시간 오버레이가 네트워크 왕복 없이 동작한다.

### 5.3 판정 로직을 서버에 둔 이유 **[구현됨]**

추론은 클라이언트, **채점은 서버**다. 클라이언트가 점수를 계산하면 조작할 수 있다.
`engine.py`는 FastAPI·DB 임포트가 전혀 없는 순수 모듈이라 단위 테스트가 쉽고,
필요하면 별도 서비스로 그대로 떼어낼 수 있다.

---

## 6. Docker 기반 배포 방식 **[미구현 — 방안]**

현재 저장소에 Dockerfile과 compose 파일이 **없다.** 아래는 도입 시의 구성이다.

### 6.1 구성

| 서비스 | 이미지 | 역할 |
|--------|--------|------|
| `db` | `postgres:16-alpine` | 데이터 저장. 볼륨 영속화 |
| `api` | 자체 빌드 (python:3.12-slim) | FastAPI + uvicorn |
| `web` | 자체 빌드 (node 빌드 → nginx) | 정적 자산 서빙 + `/api` 리버스 프록시 |

### 6.2 백엔드 Dockerfile

```dockerfile
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1

WORKDIR /app

# 의존성을 먼저 복사해 레이어 캐시를 살린다 (코드만 바뀌면 재설치 없음)
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/ .

# 루트로 실행하지 않는다
RUN useradd --create-home --uid 1000 appuser
USER appuser

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

`--reload`는 개발 전용이므로 이미지에 넣지 않는다.

### 6.3 프론트엔드 Dockerfile (멀티스테이지)

```dockerfile
FROM node:22-alpine AS build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --ignore-scripts
COPY frontend/ .
# MediaPipe WASM·모델 자산을 public/ 아래로 배치 (외부 네트워크 필요)
RUN npm run setup && npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

빌드 스테이지의 `node_modules`(수백 MB)가 최종 이미지에 남지 않는다. 최종 이미지는
정적 파일 + nginx뿐이다.

> `npm run setup`이 모델 파일(약 7.8MB)을 외부에서 받는다. 폐쇄망에서는 이 단계가
> 실패하므로 사내 저장소 URL로 바꾸거나 파일을 이미지에 미리 넣어야 한다 (3.4절).

### 6.4 docker-compose.yml

```yaml
services:
  db:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: motion
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER} -d motion"]
      interval: 5s
      timeout: 3s
      retries: 10

  api:
    build:
      context: .
      dockerfile: deploy/api.Dockerfile
    environment:
      DATABASE_URL: postgresql+asyncpg://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/motion
      JWT_SECRET: ${JWT_SECRET}
      CORS_ORIGINS: '["https://example.com"]'
    depends_on:
      db:
        condition: service_healthy
    # 기동 시 마이그레이션 적용 후 서버 실행
    command: >
      sh -c "alembic upgrade head &&
             uvicorn app.main:app --host 0.0.0.0 --port 8000"
    ports:
      - "8000:8000"

  web:
    build:
      context: .
      dockerfile: deploy/web.Dockerfile
    depends_on:
      - api
    ports:
      - "80:80"

volumes:
  pgdata:
```

**`depends_on` + `condition: service_healthy`가 중요하다.** 이게 없으면 PostgreSQL이
아직 연결을 받기 전에 `alembic upgrade`가 실행되어 기동이 실패한다.

### 6.5 마이그레이션 실행 위치

기동 명령에 `alembic upgrade head`를 넣는 방식은 단일 인스턴스에서 단순하다. 다만
**인스턴스를 여럿으로 늘리면 동시에 마이그레이션을 시도**하게 된다. 그 시점에는
배포 파이프라인의 별도 단계나 Kubernetes init container로 분리해야 한다.

### 6.6 운영 시 추가 사항

| 항목 | 방침 |
|------|------|
| HTTPS | nginx 또는 앞단 LB에서 TLS 종료. **`getUserMedia`가 HTTPS를 요구하므로 선택이 아니라 필수** |
| 이미지 태그 | `latest` 금지. 커밋 SHA로 태그 → 롤백 가능 |
| 헬스체크 | `api`는 `/health`. readiness 분리 후에는 `/health/ready` |
| 로그 | 표준 출력으로만. 파일 회전은 런타임에 위임 |
| 재시작 정책 | `restart: unless-stopped` |
| 리소스 제한 | 컨테이너별 메모리 상한 설정 (1MB 페이로드 동시 처리 대비) |

---

## 7. 환경 변수 관리

### 7.1 현재 방식 **[구현됨]**

`pydantic-settings`가 `.env` 파일과 환경변수를 읽어 **타입 검증된 설정 객체**로 만든다.
환경변수가 `.env`보다 우선하므로, 로컬은 파일 · 배포는 환경변수라는 구성이 코드 수정
없이 성립한다.

| 변수 | 기본값 | 필수 | 설명 |
|------|--------|------|------|
| `DATABASE_URL` | `postgresql+asyncpg://postgres:postgres@localhost:5432/motion` | 아니오 | 비동기 드라이버(`+asyncpg`) 필수 |
| `JWT_SECRET` | **없음** | **예** | 없으면 기동 실패 |
| `JWT_ALGORITHM` | `HS256` | 아니오 | |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `30` | 아니오 | |
| `REFRESH_TOKEN_EXPIRE_DAYS` | `7` | 아니오 | |
| `CORS_ORIGINS` | `["http://localhost:5173","http://localhost:3000"]` | 아니오 | **JSON 배열 문자열** |

프론트엔드는 Vite 규칙에 따라 `VITE_` 접두사 변수만 번들에 주입된다
(`VITE_API_BASE`). **번들에 들어가는 값은 공개된다** — 프론트엔드 환경변수에 비밀을
넣으면 안 된다.

### 7.2 `JWT_SECRET`에 기본값을 두지 않은 이유 **[구현됨]**

```python
# 기본값 없음: 비밀 누락은 조용히 넘어가지 않고 기동 단계에서 실패해야 한다.
jwt_secret: str
```

기본값이 있으면 배포 환경에서 **공개된 키로 토큰이 서명될 수 있다.** 그건 인증이 없는
것과 같으면서, 겉으로는 정상 동작하기 때문에 더 위험하다. 지금은 없으면 즉시 죽는다.

값 생성:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

### 7.3 파일 규칙 **[구현됨]**

| 파일 | 커밋 | 용도 |
|------|------|------|
| `backend/.env.example` | **함** | 템플릿. 키 목록과 형식만, 실제 값 없음 |
| `backend/.env` | **안 함** (gitignore) | 로컬 실제 값 |
| `frontend/.env.local` | **안 함** (gitignore) | 로컬 API 주소 |

새 PC에서는 `.env.example`을 복사해 `JWT_SECRET`과 DB 비밀번호를 채워야 한다.
`JWT_SECRET`에 기본값이 없으므로 이 단계를 건너뛰면 서버가 아예 뜨지 않는다.

### 7.4 환경별 관리 방안 **[미구현 — 방안]**

| 환경 | 방식 |
|------|------|
| 로컬 | `.env` 파일 |
| CI | CI 시크릿 저장소 (테스트는 더미 `JWT_SECRET` 사용) |
| 스테이징·운영 | **파일 금지.** 시크릿 매니저(AWS Secrets Manager, Vault 등)에서 주입 |

추가 원칙:

- **환경별로 `JWT_SECRET`이 달라야 한다.** 같으면 스테이징 토큰이 운영에서 통한다
- 비밀 교체(rotation) 절차를 미리 정한다. 현재 구조에서 `JWT_SECRET`을 바꾸면
  **발급된 모든 토큰이 즉시 무효**가 된다 (전원 재로그인). 무중단 교체를 하려면
  구/신 키를 함께 검증하는 기간이 필요하다
- `CORS_ORIGINS`에 와일드카드를 쓰지 않는다. 현재 `allow_credentials=True`이므로
  더더욱 명시적 목록이어야 한다
- 부팅 시 필수 설정 검증은 이미 pydantic-settings가 수행한다. 새 필수 값을 추가할 때도
  **기본값 없이 선언**해 같은 성질을 유지한다

---

## 8. 모니터링 및 운영 방안

### 8.1 현재 상태 **[알려진 한계]**

애플리케이션 로깅이 **없다.** `app/` 전체에 logger 호출이 0건이고, uvicorn 기본 액세스
로그만 표준 출력으로 나간다. 메트릭·추적·알림 모두 없다.

`/health`는 항상 `{"status":"ok"}`를 반환하며 **DB를 확인하지 않는다** — liveness
용도로만 유효하다.

### 8.2 로깅 방안 **[미구현 — 방안]**

JSON 구조적 로깅, 표준 출력으로만. 파일 회전은 컨테이너 런타임에 위임한다.

```json
{
  "ts": "2026-07-28T08:47:59Z",
  "level": "INFO",
  "request_id": "01J...",
  "user_id": 6,
  "method": "POST",
  "path": "/sessions/submit",
  "status": 200,
  "duration_ms": 34,
  "frames_total": 10,
  "score": 80.0
}
```

`request_id`는 미들웨어에서 발급하고 응답 헤더 `X-Request-ID`로 돌려준다. 사용자가
신고한 실패 건을 로그에서 즉시 찾기 위해서다.

**절대 남기지 않을 것:**

- 비밀번호 (평문·해시 모두)
- 토큰 전문 — 필요하면 `sub`, `jti`만
- **랜드마크 좌표 전체** — 생체 정보에 준하고 양이 크다. 개수와 통계만
- 이메일 전문 — 사용자 식별은 `user_id`로

### 8.3 수집 지표 **[미구현 — 방안]**

| 분류 | 지표 |
|------|------|
| 트래픽 | 엔드포인트별 RPS, 상태 코드 분포 |
| 지연 | p50/p95/p99. `/sessions/submit`은 판정 시간과 DB 시간 분리 |
| 오류 | 5xx 비율, 401 급증(공격 징후), 422 급증(클라이언트 회귀 징후) |
| DB | 커넥션 풀 사용률·대기 시간, 느린 쿼리 |
| **도메인** | **제스처별 평균 점수, 인식 실패(`matched_gesture=null`) 비율** |

**마지막 줄이 이 서비스에서 가장 중요하다.** 실제로 이번 개발 중 엄지 판정 버그가
있었는데, 서버는 500을 내지 않았고 지연도 정상이었다. 단위 테스트도 전부 통과했다.
드러난 신호는 **`fist`와 `peace`의 점수가 0으로 붙어 있다**는 것뿐이었다.
인프라 지표만 봤다면 잡을 수 없다.

### 8.4 알림 임계값 **[미구현 — 방안]**

| 조건 | 심각도 | 조치 |
|------|--------|------|
| 5xx 비율 > 1% (5분) | 긴급 | 로그·최근 배포 확인, 필요 시 롤백 |
| `/health/ready` 실패 | 긴급 | DB 상태 확인 |
| p95 지연 > 1초 (10분) | 경고 | 느린 쿼리·커넥션 풀 확인 |
| 401 급증 | 경고 | 무차별 대입 여부 확인 |
| 특정 제스처 평균 점수가 전주 대비 -30% | 경고 | **판정 엔진 회귀 조사** |
| 디스크 사용률 > 80% | 경고 | 용량 증설 |

### 8.5 헬스체크 분리 **[미구현 — 방안]**

- `/health` (liveness) — 프로세스 생존. 현재 구현 그대로
- `/health/ready` (readiness) — `SELECT 1`로 DB 연결 확인, 실패 시 503

둘을 합치면 DB가 잠깐 흔들릴 때 오케스트레이터가 멀쩡한 프로세스를 재시작해 상황을
악화시킨다. **liveness에는 의존성 검사를 넣지 않는다.**

### 8.6 운영 절차 **[미구현 — 방안]**

**배포**

1. CI에서 `pytest`(백엔드) + `tsc && vitest run && npm run build`(프론트) 통과
2. 이미지 빌드, **커밋 SHA로 태그**
3. 스테이징 배포 후 스모크 테스트 (회원가입 → 로그인 → 제출 → 조회)
4. 운영 배포. 마이그레이션은 배포 전 단계에서 별도 실행
5. 배포 후 10분간 5xx·지연 관측

**롤백**

- 애플리케이션: 직전 SHA 이미지로 교체
- **DB 마이그레이션은 자동 롤백하지 않는다.** 파괴적 변경(컬럼 삭제 등)은
  다단계로 나눠 이전 버전 코드와 호환되는 상태를 유지한다

**백업**

- PostgreSQL 일 단위 `pg_dump` + WAL 아카이빙
- **복구 절차를 실제로 한 번 수행해 검증한다.** 검증하지 않은 백업은 백업이 아니다

**로그 보존**

- 애플리케이션 로그 30일, 감사성 이벤트(로그인 성공/실패) 90일
- 개인정보 최소 수집 원칙에 따라 필요 이상 보존하지 않는다

---

## 9. 도입 우선순위 요약

운영 배포 전 필요한 순서.

| 순위 | 항목 | 절 |
|------|------|-----|
| 1 | HTTPS 적용 (`getUserMedia` 필수 요건) | 6.6 |
| 2 | Docker 이미지 + compose 구성 | 6 |
| 3 | 시크릿 매니저 기반 환경변수 주입 | 7.4 |
| 4 | 구조적 로깅 + `request_id` | 8.2 |
| 5 | 전역 예외 핸들러 (내부 정보 노출 차단) | 8.2 |
| 6 | readiness 헬스체크 분리 | 8.5 |
| 7 | 로그인 레이트리밋 (Redis 도입 시점) | 3.2 |
| 8 | refresh 토큰 회전·폐기 (`jti` 필요) | 1.4, 3.2 |
| 9 | DB 백업 + **복구 절차 검증** | 8.6 |
| 10 | `/sessions` 페이지네이션 | — |

Queue(4절)와 객체 스토리지(2.4절)는 이 목록에 없다. **트리거 조건이 생기기 전에는
넣지 않는 것이 맞다.**
