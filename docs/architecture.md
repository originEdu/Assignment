# 클라이언트·백엔드·추론 계층 API 시각화

Motion Recognition 서비스의 계층 간 API 호출 구조.

## 0. 읽는 법 (범례)

- **실선 화살표** — 요청 (HTTP 또는 SQL)
- **점선 화살표** — 응답
- **`[JWT]`** — `Authorization: Bearer <access_token>` 헤더 필요
- **회색 박스** — 프로세스 경계 (브라우저 / 서버 / DB)

## 1. 3계층 아키텍처 전체도

```mermaid
flowchart TB
    subgraph CLIENT["클라이언트 (React, 브라우저)"]
        UI["UI 화면"]
        MP["MediaPipe Hands<br/>(온디바이스 추론)"]
        BUF["프레임 버퍼<br/>(21 landmarks × N frames)"]
        NOTE["네트워크 호출 없음 — 브라우저 내 추론"]
        UI --> MP
        MP --> BUF
        MP -.- NOTE
    end

    subgraph BACKEND["백엔드 (FastAPI)"]
        AUTH["auth<br/>app/auth/router.py"]
        JUDGE["judgment<br/>app/judgment/router.py"]
        ENGINE["engine.judge()<br/>순수 판정 로직 · DB 비의존"]
        REC["records<br/>app/records/router.py"]
        JUDGE --> ENGINE
    end

    subgraph DATABASE["데이터베이스 (PostgreSQL)"]
        USERS[("users")]
        SESSIONS[("sessions")]
        RESULTS[("session_results")]
    end

    UI -->|"POST /auth/register"| AUTH
    UI -->|"POST /auth/login"| AUTH
    UI -->|"POST /auth/refresh"| AUTH
    BUF -->|"POST /sessions/submit [JWT]"| JUDGE
    UI -->|"GET /sessions [JWT]"| REC
    UI -->|"GET /sessions/{id} [JWT]"| REC

    AUTH --> USERS
    JUDGE --> SESSIONS
    JUDGE --> RESULTS
    REC --> SESSIONS
    REC --> RESULTS

    style CLIENT fill:#f5f5f5
    style BACKEND fill:#f5f5f5
    style DATABASE fill:#f5f5f5
    style NOTE fill:#ffffff,stroke-dasharray: 3 3
```

백엔드 → DB 화살표는 모두 async SQLAlchemy 2.0을 통한 SQL이다.

별도 AI 서버는 없다. MediaPipe Hands는 브라우저에서 온디바이스로 실행되므로
추론 단계에서 네트워크 호출이 발생하지 않는다.

## 2. 시나리오별 플로우

세 다이어그램 모두 participant를 같은 순서로 선언한다 (레인 위치 고정).

### 2.1 시나리오 1 — 가입 & 로그인

```mermaid
sequenceDiagram
    participant U as 사용자
    participant UI as React UI
    participant MP as MediaPipe
    participant API as FastAPI
    participant DB as PostgreSQL

    U->>UI: 이메일 / 비밀번호 입력
    UI->>API: POST /auth/register
    API->>DB: INSERT users
    DB-->>API: user row
    API-->>UI: 201 UserOut { id, email, created_at }
    Note over UI,API: 중복 이메일이면 409 "Email already registered"

    UI->>API: POST /auth/login (form, username=이메일)
    API->>DB: SELECT users WHERE email
    DB-->>API: user row
    API-->>UI: Token { access_token, refresh_token, token_type }
    Note over UI,API: 실패 시 401 "Incorrect email or password"

    UI->>UI: 토큰 보관
    UI-->>U: 로그인 완료
```

이후 모든 인증 요청에 `Authorization: Bearer <access_token>`을 부착한다.
access token 만료 시 `POST /auth/refresh`로 재발급받는다
(요청: `{ refresh_token }`, 응답: 새 `Token`).

### 2.2 시나리오 2 — 동작 인식 & 제출

```mermaid
sequenceDiagram
    participant U as 사용자
    participant UI as React UI
    participant MP as MediaPipe
    participant API as FastAPI
    participant DB as PostgreSQL

    U->>UI: 녹화 시작

    loop 프레임마다 (네트워크 호출 없음)
        UI->>MP: 웹캠 프레임 전달
        MP-->>UI: landmarks 21개 { x, y, z }
        UI->>UI: 프레임 버퍼에 누적
    end

    U->>UI: 녹화 종료
    UI->>API: POST /sessions/submit [JWT]<br/>{ target_gesture?, frames: [{ landmarks: 21개 }] }
    Note over UI,API: 제약 — 프레임당 landmark 정확히 21개, frames 길이 1~900

    API->>API: engine.judge() (DB 접근 없음)
    API->>DB: INSERT sessions
    API->>DB: INSERT session_results
    DB-->>API: commit
    API-->>UI: JudgeResult { matched_gesture, score,<br/>frames_total, frames_matched }
    UI-->>U: 점수 표시
```

### 2.3 시나리오 3 — 기록 조회

```mermaid
sequenceDiagram
    participant U as 사용자
    participant UI as React UI
    participant MP as MediaPipe
    participant API as FastAPI
    participant DB as PostgreSQL

    U->>UI: 기록 화면 진입
    UI->>API: GET /sessions [JWT]
    API->>DB: SELECT sessions + session_results<br/>ORDER BY submitted_at DESC
    DB-->>API: rows
    API-->>UI: SessionOut[] (result 포함)
    UI-->>U: 기록 목록 표시

    U->>UI: 항목 선택
    UI->>API: GET /sessions/{id} [JWT]
    API->>DB: SELECT sessions WHERE id AND user_id
    DB-->>API: row
    API-->>UI: SessionOut { id, gesture_type, submitted_at, result }
    Note over UI,API: 타인 세션이거나 없으면 404 "Session not found"
    UI-->>U: 상세 표시
```

## 3. 보고서용 PNG 추출 방법

Node가 설치되어 있으면 한 줄로 변환된다. 저장소 루트에서:

```
npx -p @mermaid-js/mermaid-cli mmdc -i docs/architecture.md -o docs/architecture.png
```

Mermaid 블록 4개가 `docs/architecture-1.png` ~ `docs/architecture-4.png`로 각각 출력된다.

Node가 없는 환경에서는 수동으로 추출한다.

1. <https://mermaid.live> 에 코드 블록 붙여넣기 → Actions → PNG 다운로드
2. VSCode 확장 `Markdown Preview Mermaid Support` 설치 → 미리보기 → 화면 캡처
