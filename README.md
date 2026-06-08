# WebRTC 통합 플랫폼

화상통화 관련 4개 프로젝트를 하나의 서비스로 통합한 플랫폼입니다.

## 통합된 프로젝트

| 모듈 | 원본 저장소 | 설명 |
|------|------------|------|
| 화상통화+ | `video-call-plus` | 다자간 영상통화 + 칠판 + 채팅 + PDF 공유 |
| 시그널링 서버 | `webrtc-signaling-server` | 1:1 WebRTC 시그널링 (SDP/ICE 교환) |
| TURN 중계 | `cloudplayer-turn-relay` | Cloudflare Workers 기반 TURN 중계 서버 |
| 클라이언트 앱 | `webrtc-client-app` | 통합 클라이언트 (메인 대시보드) |

## 빠른 시작

```bash
# 설치
bash setup.sh
# 또는
npm install

# 실행
npm start

# 개발 모드
npm run dev
```

## 프로젝트 구조

```
├── server.js                    # 통합 메인 서버
├── package.json                 # 통합 의존성
├── modules/
│   ├── signaling/signaling.js   # 시그널링 모듈
│   ├── video-call/video-call.js # 화상통화+ 모듈
│   └── turn-relay/              # TURN 중계 (Cloudflare Workers)
├── public/
│   ├── index.html               # 메인 대시보드
│   ├── video-call/              # 화상통화+ 클라이언트
│   ├── signaling/               # 시그널링 테스트 클라이언트
│   └── turn-relay/              # TURN 중계 테스트 클라이언트
└── uploads/                     # PDF 업로드 디렉토리
```

## API 엔드포인트

| 경로 | 설명 |
|------|------|
| `GET /` | 메인 대시보드 |
| `GET /video-call` | 화상통화+ |
| `GET /signaling` | 시그널링 테스트 |
| `GET /turn-relay` | TURN 중계 테스트 |
| `GET /api/health` | 통합 헬스 체크 |
| `GET /api/turn-config` | TURN/ICE 서버 설정 |
| `POST /api/video-call/upload-pdf` | PDF 업로드 |
| `GET /api/video-call/pdf-list` | PDF 목록 |

## Socket.IO 네임스페이스

- `/signaling` — 1:1 시그널링 서버
- `/video-call` — 화상통화+ (채팅, 칠판, PDF 포함)

## TURN 중계 서버 배포

TURN 중계는 Cloudflare Workers에 별도 배포합니다:

```bash
npm run turn:dev      # 로컬 테스트
npm run turn:deploy   # Cloudflare 배포
```
