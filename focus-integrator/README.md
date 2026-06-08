# 메인 통합 시스템 (화상 솔루션 집중도 계산기)

에이전트1(시선 / Gaze)과 에이전트2(발화 / Speech)의 JSON 데이터를 받아
**가중치(시선 60%, 발화 40%)** 로 최종 집중도 점수를 계산하는 메인 통합 시스템입니다.
모든 입력과 출력은 JSON 형식이며, GitHub push → Cloudflare Pages 자동 배포를 지원합니다.

## 1. 프로젝트 구조

```
.
├── index.html                 # Cloudflare Pages 정적 프론트엔드
├── functions/
│   └── api/
│       └── integrate.js       # Pages Function: POST /api/integrate
├── main_system.py             # 동일 로직의 Python 구현 (CLI / 테스트용)
├── sample_agent1.json         # 시선 에이전트 샘플 입력
├── sample_agent2.json         # 발화 에이전트 샘플 입력
├── package.json               # wrangler 실행 스크립트
├── .gitignore
└── README.md
```

## 2. 입력 / 출력 스펙 (JSON only)

### 입력 — 에이전트 1 (시선)
```json
{
  "agent": "gaze_agent",
  "status": "success",
  "gaze_score": 92.5
}
```

### 입력 — 에이전트 2 (발화)
```json
{
  "agent": "speech_agent",
  "status": "success",
  "speech_score": 82.5
}
```

### 출력 — 메인 통합 시스템
```json
{
  "agent": "main_system",
  "status": "success",
  "final_focus_score": 88.5,
  "github_push_ready": true
}
```

계산식:
```
final_focus_score = (gaze_score × 0.60) + (speech_score × 0.40)
                  = (92.5 × 0.60) + (82.5 × 0.40)
                  = 55.5 + 33.0
                  = 88.5
```

## 3. 로컬 실행

### Python CLI
```bash
python3 main_system.py sample_agent1.json sample_agent2.json
```

### Cloudflare Pages 로컬 개발
```bash
npm install
npx wrangler pages dev .
# → http://localhost:8788 에서 UI + /api/integrate 확인
```

### API 직접 호출 예시
```bash
curl -X POST http://localhost:8788/api/integrate \
  -H "Content-Type: application/json" \
  -d '{
    "agent1": { "gaze_score": 92.5 },
    "agent2": { "speech_score": 82.5 }
  }'
```

## 4. GitHub 업로드 → Cloudflare Pages 자동 배포

### 4-1. GitHub 저장소에 push
대상 저장소: **https://github.com/navy111p-sudo/webrtc-client-app**

```bash
# 해당 폴더에서
git init -b main
git add .
git commit -m "feat: 메인 통합 시스템 + Cloudflare Pages 배포"
git remote add origin https://github.com/navy111p-sudo/webrtc-client-app.git
git push -u origin main
```

또는 원클릭 스크립트:
```bash
# macOS / Linux
bash deploy.sh

# Windows PowerShell
powershell -ExecutionPolicy Bypass -File .\deploy.ps1
```

### 4-2. Cloudflare Pages 연동 (최초 1회)
1. Cloudflare 대시보드 → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**
2. 방금 push 한 GitHub 저장소 선택
3. Build 설정
   - **Framework preset**: None
   - **Build command**: (비워둠)
   - **Build output directory**: `/` (루트)
4. **Save and Deploy** 클릭

이후에는 `git push` 한 번으로 Cloudflare Pages 가 자동 배포합니다.

## 5. 규칙 준수 체크리스트

- [x] 입력: JSON (에이전트1·시선, 에이전트2·발화)
- [x] 처리: `시선 × 0.6 + 발화 × 0.4`
- [x] 출력: JSON (`final_focus_score`, `github_push_ready: true` 포함)
- [x] GitHub push 시 Cloudflare Pages 자동 배포 구조
