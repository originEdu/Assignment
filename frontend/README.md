# Motion Recognition Client (React + MediaPipe)

웹캠에서 손 랜드마크를 추출해 `backend/`의 FastAPI 서버로 제출하고, 판정 점수와 기록을
보여주는 데모 클라이언트.

- **추론**: MediaPipe Hands가 브라우저에서 온디바이스로 실행됩니다. 별도 AI 서버는 없습니다.
- **자산**: WASM과 모델을 `public/mediapipe/`로 내려받아 씁니다. 준비가 끝나면 앱 실행 중
  외부 호스트로 나가는 요청이 없습니다.

## 설치

```powershell
cd frontend
npm install
npm run setup
```

`npm install`에 `postinstall` 훅이 걸려 있지만, npm 설정에 따라 install 스크립트가 차단될 수
있습니다(이 PC가 그렇습니다). **`npm run setup`을 한 번 더 실행하는 것이 안전합니다** —
이미 준비돼 있으면 건너뜁니다.

`setup`은 `hand_landmarker.task`(약 7.8MB)를 내려받으므로 최초 1회는 네트워크가 필요합니다.

## 실행

백엔드를 먼저 띄웁니다 (`backend/README.md` 참고). 그다음:

```powershell
npm run dev
```

<http://localhost:5173> 으로 접속합니다. **포트는 5173으로 고정되어 있습니다** — 백엔드
CORS 허용 목록이 이 포트를 기준으로 하며, 다른 포트로 뜨면 모든 요청이 차단됩니다.

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
