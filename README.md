# Motion Recognition (손동작 인식)

웹캠에서 손동작을 인식해 목표 제스처와 얼마나 일치하는지 채점하는 풀스택 데모.
추론은 브라우저에서 온디바이스로(MediaPipe), 판정·기록은 FastAPI 백엔드에서 처리합니다.

## 구성

| 디렉터리 | 스택 | 역할 |
|----------|------|------|
| [`frontend/`](frontend/) | React 19 + Vite + MediaPipe Hands | 웹캠에서 손 랜드마크 추출, 세션 제출, 결과·기록 표시 |
| [`backend/`](backend/) | FastAPI + PostgreSQL + SQLAlchemy 2.0 | JWT 인증, 랜드마크 시퀀스 판정/채점, 세션 저장 |
| [`docs/`](docs/) | — | 시스템 설계, 아키텍처, 개발 계획 |

MediaPipe가 브라우저에서 온디바이스로 돌기 때문에 별도 AI 서버는 없습니다. 백엔드는
세션 종료 후 받은 랜드마크 시퀀스를 순수 로직(`app/judgment/engine.py`)으로 판정합니다.

## 동작 방식

1. 클라이언트가 웹캠 프레임마다 손 랜드마크 21개를 추출해 버퍼에 쌓음
2. 세션 종료 시 시퀀스를 `POST /sessions/submit`으로 전송
3. 백엔드가 목표 제스처와 비교해 점수 산출 후 저장
4. 클라이언트가 점수와 기록 표시

지원 제스처: `open_palm`, `fist`, `thumbs_up`, `peace`, `pointing`

## 빠른 시작

백엔드와 프론트엔드를 각각 실행합니다. 프론트엔드 포트는 **5173 고정**(백엔드 CORS 기준).

```powershell
# 백엔드 — 자세한 내용은 backend/README.md
cd backend
python -m venv .venv; .\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy .env.example .env   # JWT_SECRET, DATABASE_URL 수정
alembic upgrade head
uvicorn app.main:app --reload
```

```powershell
# 프론트엔드 — 자세한 내용은 frontend/README.md
cd frontend
npm install
npm run setup              # MediaPipe 모델 내려받기 (최초 1회)
npm run dev
```

- 앱: <http://localhost:5173>
- API 문서(Swagger): <http://localhost:8000/docs>

## 테스트

```powershell
cd backend && pytest       # 인메모리 SQLite, PostgreSQL 불필요
cd frontend && npm test    # 순수 로직 (vitest)
```

## 참고

- 웹캠(`getUserMedia`)은 **HTTPS 또는 localhost**에서만 동작.
- 단일 손 기준(`numHands: 1`). 양손·시퀀스(DTW) 판정은 범위 밖.
- 각 하위 프로젝트의 상세 설명은 [`backend/README.md`](backend/README.md),
  [`frontend/README.md`](frontend/README.md) 참고.
