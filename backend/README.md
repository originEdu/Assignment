# Motion Recognition Backend (손동작 인식)

React + MediaPipe(온디바이스)에서 추출한 **손 랜드마크 시퀀스**를 세션 종료 후 REST로
받아 **판정/채점**하고 결과를 저장하는 FastAPI 백엔드.

- **아키텍처**: 단일 FastAPI 앱 + 모듈 경계 분리(모듈러 모놀리스)
- **인증**: JWT(access/refresh) + bcrypt
- **DB**: PostgreSQL + async SQLAlchemy 2.0 + Alembic
- **판정 엔진**: `app/judgment/engine.py` — FastAPI/DB에 의존하지 않는 순수 로직

## 사전 설치

1. **Python 3.11+** — <https://www.python.org/downloads/> (설치 시 *Add python.exe to PATH* 체크)
   - 또는 winget: `winget install Python.Python.3.12`
2. **PostgreSQL 14+** — <https://www.postgresql.org/download/windows/>
   - 또는 winget: `winget install PostgreSQL.PostgreSQL.16` (**관리자 권한 필요**)
   - 설치 후 DB 생성: `createdb motion` (또는 psql에서 `CREATE DATABASE motion;`)
   - 설치 시 지정한 `postgres` 비밀번호를 `.env`의 `DATABASE_URL`에 반영할 것

> 테스트 스위트(`pytest`)는 인메모리 SQLite를 쓰므로 **PostgreSQL 없이도** 실행됩니다.
> 실제 서버 구동(`uvicorn`) 및 마이그레이션에는 PostgreSQL이 필요합니다.

## 설치

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env   # 값 수정 (특히 JWT_SECRET, DATABASE_URL)
```

## DB 마이그레이션

```powershell
# 최초 1회: 모델로부터 첫 마이그레이션 자동 생성
alembic revision --autogenerate -m "init"
# 적용
alembic upgrade head
```

## 서버 실행

```powershell
uvicorn app.main:app --reload
```

- Swagger 문서: <http://localhost:8000/docs>
- 헬스체크: <http://localhost:8000/health>

## 테스트 (PostgreSQL 불필요)

```powershell
pytest
```

## API 개요

| Method | Path                     | 인증 | 설명 |
|--------|--------------------------|------|------|
| POST   | `/auth/register`         | -    | 회원가입 (email + password) |
| POST   | `/auth/login`            | -    | 로그인 → access/refresh 토큰 (form: username=email) |
| POST   | `/auth/refresh`          | -    | refresh 토큰으로 재발급 |
| POST   | `/sessions/submit`       | ✅   | 랜드마크 시퀀스 제출 → 판정/저장 |
| GET    | `/sessions`              | ✅   | 내 세션 목록 |
| GET    | `/sessions/{id}`         | ✅   | 세션 상세 |

### `/sessions/submit` 페이로드 예시

```json
{
  "target_gesture": "open_palm",
  "frames": [
    { "landmarks": [ {"x":0.0,"y":0.0,"z":0.0}, ... 21개 ... ] }
  ]
}
```

- `landmarks`는 프레임당 **정확히 21개** (MediaPipe Hands, 단일 손 기준).
- `target_gesture` 생략 시 가장 많이 인식된 제스처를 리포트.
- 지원 제스처: `open_palm`, `fist`, `thumbs_up`, `peace`, `pointing` (`app/judgment/gestures.py`).

## 클라이언트 연동 메모

- `getUserMedia`(웹캠)는 **HTTPS 또는 localhost**에서만 동작. 로컬 개발은 OK, 배포 시 HTTPS 필수.
- CORS 허용 오리진은 `.env`의 `CORS_ORIGINS`로 설정 (기본: Vite 5173, CRA 3000).

## 향후 (범위 밖)

- docker-compose (api + postgres), 양손/시퀀스(DTW) 판정, 원시 랜드마크 보관 정책, 실시간 WebSocket 피드백.
