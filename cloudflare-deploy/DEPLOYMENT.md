# Cloudflare Workers 배포 가이드

## 사전 준비

### 1. Cloudflare 계정 설정
- [Cloudflare](https://dash.cloudflare.com) 계정 생성/로그인
- 도메인 등록 또는 기존 도메인 추가

### 2. 로컬 환경 준비
```bash
# Node.js 18+ 설치 확인
node --version

# Wrangler CLI 설치 (전역)
npm install -g wrangler

# 또는 프로젝트에만 설치
npm install --save-dev wrangler
```

### 3. Wrangler 로그인
```bash
wrangler login
# 브라우저에서 Cloudflare 계정으로 로그인
```

## 배포 단계

### 단계 1: 프로젝트 설정
```bash
cd cloudflare-deploy
npm install
```

### 단계 2: 개발 모드 테스트 (선택사항)
```bash
npm run dev
# http://localhost:8787에서 접근 가능
```

### 단계 3: Durable Objects 마이그레이션 (초회만)
```bash
wrangler migrations create v1
# 자동으로 SignalingRoom, VideoCallRoom이 등록됨
```

### 단계 4: KV 네임스페이스 생성 (초회만)
```bash
wrangler kv:namespace create "PDF_STORE"
wrangler kv:namespace create "PDF_STORE" --preview
```

콘솔 출력에서 나타나는 ID를 `wrangler.toml`의 `kv_namespaces` 섹션에 추가:
```toml
[[kv_namespaces]]
binding = "PDF_STORE"
id = "your-kv-id"
preview_id = "your-preview-id"
```

### 단계 5: 배포
```bash
npm run deploy
# 또는
wrangler publish
```

### 단계 6: 도메인 설정 (선택사항)
`wrangler.toml`의 `[env.production]` 섹션에서 라우트 설정:
```toml
[env.production]
routes = [
  { pattern = "yourdomain.com/*", zone_name = "yourdomain.com" }
]

# 프로덕션 환경으로 배포
wrangler publish --env production
```

## 설정 상세

### wrangler.toml 커스터마이징

#### 프로젝트 이름 변경
```toml
name = "your-project-name"
```

#### TURN 서버 추가 (선택)
src/index.ts의 `handleTurnConfig()` 함수 수정:
```typescript
const response: TurnConfigResponse = {
  iceServers: [
    { urls: ['stun:stun.example.com:3478'] },
    { 
      urls: ['turn:turn.example.com:3478'],
      username: 'user',
      credential: 'pass'
    },
    // 추가 서버...
  ]
};
```

#### PDF 저장소 크기 제한 수정
src/index.ts의 `handlePdfUpload()` 함수에서:
```typescript
const maxSize = 100 * 1024 * 1024; // 100MB로 변경
```

## 모니터링 및 로깅

### Cloudflare 대시보드에서 로그 확인
```bash
wrangler tail
```

### 실시간 로그 스트리밍
```bash
wrangler tail --status ok
wrangler tail --status error
```

## 문제 해결

### Durable Objects 오류
```
Error: Durable Object not found
```
해결: 마이그레이션이 올바르게 적용되었는지 확인
```bash
wrangler migrations list
```

### KV 권한 오류
```
Error: Permission denied accessing KV namespace
```
해결: `wrangler.toml`의 KV 바인딩 ID 확인 및 재생성

### WebSocket 연결 실패
- Cloudflare 무료 플랜에서 WebSocket 지원 여부 확인
- Pro 플랜 이상 권장

### PDF 업로드 실패
- KV 저장소의 용량 확인
- 네트워크 타임아웃 설정 확인 (기본값: 10초)

## 프로덕션 체크리스트

- [ ] 도메인 설정 완료
- [ ] SSL/TLS 인증서 설정 (Cloudflare 자동 관리)
- [ ] KV 네임스페이스 ID 확인
- [ ] 마이그레이션 적용 확인
- [ ] 개발 모드에서 모든 기능 테스트
- [ ] 배포 로그 확인
- [ ] 실제 도메인에서 접속 테스트
- [ ] 모바일/다양한 브라우저에서 테스트

## 성능 최적화

### Worker 메모리 최적화
```toml
[env.production]
limits = { cpu_ms = 50000 }
```

### 캐싱 전략
정적 자산에 캐싱 헤더 추가 (src/index.ts):
```typescript
if (path.endsWith('.js') || path.endsWith('.css')) {
  return new Response(content, {
    headers: {
      'Cache-Control': 'public, max-age=3600'
    }
  });
}
```

## 비용 추정

- **Worker 호출**: 월 1000만 건 무료
- **Durable Objects**: 1일 1GB/$0.15, 쓰기 1GB/$1.25
- **KV 저장소**: 읽기 1000만/$0.50, 쓰기 100만/$5

## 롤백

이전 버전으로 롤백:
```bash
wrangler rollback
```

## 참고 자료

- [Cloudflare Workers 문서](https://developers.cloudflare.com/workers/)
- [Durable Objects API](https://developers.cloudflare.com/durable-objects/api/)
- [KV 저장소 API](https://developers.cloudflare.com/kv/)
- [WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
