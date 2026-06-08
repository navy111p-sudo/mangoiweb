# WebRTC 통합 플랫폼 - Cloudflare Workers 배포

Native WebSocket 기반 WebRTC 통합 플랫폼의 Cloudflare Workers 배포 버전입니다.

## 구조

### 백엔드 (TypeScript + Cloudflare Workers)

```
src/
├── index.ts              # 메인 Worker 진입점, 라우팅, API 엔드포인트
├── signaling-room.ts     # 1:1 시그널링 Durable Object
├── video-call-room.ts    # 멀티유저 비디오 콜 Durable Object  
└── types.ts              # 공유 타입 정의
```

**주요 기능:**
- 2개의 Durable Objects: SignalingRoom (최대 2명), VideoCallRoom (최대 10명)
- WebSocket 업그레이드: `/ws/signaling?roomId=xxx`, `/ws/video-call?roomId=xxx`
- API 엔드포인트:
  - `GET /api/health` - 헬스 체크
  - `GET /api/turn-config` - ICE 서버 설정
  - `POST /api/video-call/upload-pdf` - PDF 업로드
  - `GET /api/video-call/pdf-list` - PDF 목록 조회
- KV 저장소 활용: PDF 파일 저장 (R2 불가능할 경우)
- 정적 자산 서빙: `./public/` 디렉토리

### 프론트엔드 (Native WebSocket)

```
public/
├── index.html            # 메인 대시보드
├── signaling/
│   └── index.html        # 1:1 시그널링 테스트 UI
├── video-call/
│   ├── index.html        # 메인 UI
│   ├── css/
│   │   └── style.css     # 스타일시트
│   └── js/
│       ├── app.js        # 메인 로직, WebSocket 연결
│       ├── webrtc.js     # WebRTC 피어 관리
│       ├── chat.js       # 실시간 채팅
│       ├── whiteboard.js # Canvas 칠판
│       └── pdf-viewer.js # PDF 업로드/표시
└── turn-relay/
    └── index.html        # TURN/STUN 서버 정보
```

**주요 특징:**
- Socket.IO 제거, 순수 WebSocket 사용
- JSON 메시지 프로토콜: `{"type":"event-name","data":{...}}`
- 자동 재연결 로직 내장
- 반응형 디자인

## WebSocket 메시지 프로토콜

### 시그널링 (1:1)

**클라이언트 → 서버:**
```json
{"type":"join"}
{"type":"offer","data":{"targetId":"peer-id","sdp":{...}}}
{"type":"answer","data":{"targetId":"peer-id","sdp":{...}}}
{"type":"ice-candidate","data":{"targetId":"peer-id","candidate":{...}}}
{"type":"leave"}
```

**서버 → 클라이언트:**
```json
{"type":"room-joined","data":{"roomId":"room","peers":["p1","p2"],"isInitiator":true}}
{"type":"peer-joined","data":{"peerId":"peer-id"}}
{"type":"peer-left","data":{"peerId":"peer-id"}}
{"type":"room-full","data":{"roomId":"room"}}
{"type":"offer","data":{"senderId":"peer-id","sdp":{...}}}
{"type":"answer","data":{"senderId":"peer-id","sdp":{...}}}
{"type":"ice-candidate","data":{"senderId":"peer-id","candidate":{...}}}
```

### 비디오 콜 (멀티유저)

**클라이언트 → 서버:**
```json
{"type":"join-room","data":{"roomId":"room","username":"이름"}}
{"type":"leave-room"}
{"type":"chat-message","data":{"message":"메시지"}}
{"type":"whiteboard-draw","data":{"type":"pen","x1":0.5,"y1":0.5,"x2":0.6,"y2":0.6,"color":"#000","size":3}}
{"type":"whiteboard-clear"}
{"type":"pdf-share","data":{"url":"/api/video-call/pdf/...","currentPage":1}}
{"type":"pdf-page-change","data":{"pageNum":2}}
{"type":"pdf-stop-share"}
{"type":"offer","data":{"to":"user-id","offer":{...}}}
{"type":"answer","data":{"to":"user-id","answer":{...}}}
{"type":"ice-candidate","data":{"to":"user-id","candidate":{...}}}
```

**서버 → 클라이언트:**
```json
{"type":"existing-users","data":[{"userId":"id","username":"이름"},{"userId":"id2","username":"이름2"}]}
{"type":"room-joined","data":{"roomId":"room","users":[...]}}
{"type":"user-joined","data":{"userId":"id","username":"이름"}}
{"type":"user-left","data":{"userId":"id"}}
{"type":"chat-message","data":{"username":"이름","message":"메시지","timestamp":1234567890,"isSystem":false}}
{"type":"whiteboard-draw","data":{"type":"pen","x1":0.5,"y1":0.5,"x2":0.6,"y2":0.6,"color":"#000","size":3}}
{"type":"whiteboard-clear"}
{"type":"pdf-sync","data":{"url":"/api/video-call/pdf/...","currentPage":1}}
{"type":"pdf-page-change","data":{"pageNum":2}}
{"type":"pdf-stop-share"}
{"type":"offer","data":{"from":"user-id","offer":{...}}}
{"type":"answer","data":{"from":"user-id","answer":{...}}}
{"type":"ice-candidate","data":{"from":"user-id","candidate":{...}}}
```

## 배포

### 사전 요구사항
- Node.js 18+
- Wrangler CLI

### 설치
```bash
npm install
```

### 개발 모드
```bash
npm run dev
# 또는
wrangler dev
```

### 배포
```bash
npm run deploy
# 또는
wrangler publish
```

## 설정

### wrangler.toml
- `name`: Worker 이름
- `main`: 진입점 (src/index.ts)
- `compatibility_date`: Cloudflare Workers API 버전
- `durable_objects.bindings`: SignalingRoom, VideoCallRoom
- `kv_namespaces`: PDF_STORE (PDF 저장용)
- `assets.directory`: 정적 파일 디렉토리

### 환경 변수
`.env` 파일 또는 `wrangler.toml`의 `[env.production]` 섹션에서 설정:
```toml
[env.production]
routes = [
  { pattern = "yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

## 주요 변경 사항 (Express + Socket.IO → Cloudflare Workers)

1. **WebSocket 프로토콜**
   - Socket.IO의 자동 직렬화 대신 수동 JSON 메시지 포맷 사용
   - 클라이언트는 `JSON.stringify()`/`JSON.parse()` 직접 호출

2. **방 관리**
   - Durable Objects의 상태 관리 활용
   - 자동 확장성 (각 방이 독립적인 Durable Object)

3. **PDF 저장**
   - 파일시스템 대신 Cloudflare KV 사용
   - 최대 50MB 파일 지원

4. **클라이언트 라이브러리**
   - Socket.IO 제거
   - 순수 WebSocket API 사용 (더 가볍고 빠름)

## API 엔드포인트

### GET /api/health
서버 상태 확인
```json
{"status":"ok","message":"...","timestamp":1234567890}
```

### GET /api/turn-config
TURN/STUN 서버 설정
```json
{
  "iceServers": [
    {"urls":["stun:stun.l.google.com:19302"]},
    ...
  ]
}
```

### POST /api/video-call/upload-pdf
PDF 업로드
```
Content-Type: multipart/form-data
Body: pdf=<file>

Response:
{"success":true,"filename":"file.pdf","url":"/api/video-call/pdf/pdf-123-file.pdf"}
```

### GET /api/video-call/pdf-list
업로드된 PDF 목록
```json
[
  {"filename":"file.pdf","url":"/api/video-call/pdf/...",uploadedAt":"..."},
  ...
]
```

## 성능 특성

- **연결당 메모리**: Durable Objects의 효율적인 메모리 관리
- **확장성**: 자동으로 방별로 Durable Object가 분산됨
- **레이턴시**: HTTP/3 기반 CDN 에지에서 처리
- **동시 연결**: 방당 최대 사용자 수 제한 (시그널링: 2명, 비디오콜: 10명)

## 트러블슈팅

### WebSocket 연결 실패
1. 브라우저 콘솔에서 오류 확인
2. Worker URL 올바른지 확인 (https 필수)
3. Cloudflare 대시보드에서 Worker 배포 확인

### PDF 업로드 실패
1. KV 네임스페이스가 올바르게 바인딩되었는지 확인
2. 파일 크기가 50MB 이하인지 확인
3. PDF MIME 타입 확인 (application/pdf)

### 피어 연결 실패
1. STUN 서버 접근 가능한지 확인
2. 브라우저 WebRTC 지원 확인 (chrome://webrtc-internals)
3. ICE 후보 수집 로그 확인

## 라이센스

MIT

## 추가 정보

- [Cloudflare Workers 문서](https://developers.cloudflare.com/workers/)
- [Durable Objects 문서](https://developers.cloudflare.com/durable-objects/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
- [WebRTC API](https://developer.mozilla.org/en-US/docs/Web/API/WebRTC_API)
