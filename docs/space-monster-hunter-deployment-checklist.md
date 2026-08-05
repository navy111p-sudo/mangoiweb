# 🛸 Space Monster Hunter — 배포 체크리스트 & 가이드

## ✅ 개발 완료 항목

### **1단계: 게임 파일**
- [x] `cloudflare-deploy/public/student-game-space-monster.html` — 1인칭 라이트건 게임
  - ✅ 크로스헤어 (중앙)
  - ✅ House of the Dead 스타일 원근감
  - ✅ 3 스테이지 진행
  - ✅ 8종 우주 괴물 (이모지 임시, 스프라이트로 교체)
  - ✅ 히트 이펙트
  - ✅ 점수/시간/생명력 HUD

### **2단계: 자동화 스크립트**
- [x] `cloudflare-deploy/build-space-monster-videos.mjs` — Higgsfield AI 호출
  - ✅ 8종 우주 괴물 프롬프트 포함
  - ✅ 2종 배경 프롬프트 포함
  - ✅ 스텁 파일 생성 (테스트 모드)

- [x] `cloudflare-deploy/build-space-monster-sprites.py` — 영상 → 스프라이트 변환
  - ✅ FFmpeg 통합
  - ✅ 배경 제거 (초록/파랑 스크린)
  - ✅ 10 레벨 다중 해상도 생성 (80px ~ 500px)
  - ✅ 자동 캔버스 정렬

### **3단계: 백엔드 API**
- [x] `cloudflare-deploy/src/api-space-monster.ts` — 게임 데이터 저장
  - ✅ POST `/api/games/space-monster/hit` — 사격 기록
  - ✅ POST `/api/games/space-monster/stage-complete` — 스테이지 완료
  - ✅ GET `/api/games/space-monster/results` — 결과 조회
  - ✅ D1 테이블 스키마 생성

- [x] `cloudflare-deploy/src/index.ts` — API 임포트 추가
  - ✅ `import { handleSpaceMonsterApi }`

### **4단계: 문서**
- [x] `docs/space-monster-hunter-overview.md` — 프로젝트 개관
- [x] `docs/space-monster-hunter-production-plan.md` — 상세 제작 계획
- [x] `docs/space-monster-hunter-competitive-analysis.md` — 경쟁사 분석

---

## 🚀 배포 절차 (최종)

### **Step 1: Higgsfield 동영상 생성**
```bash
cd cloudflare-deploy
node build-space-monster-videos.mjs
```
**산출물**: `temp/videos/{creature}.mp4` × 10개

### **Step 2: 스프라이트 시트 생성**
```bash
python3 build-space-monster-sprites.py
```
**산출물**: `public/img/space-monsters/{creature}-level-{01-10}-frame-{00-03}.png`
**총 파일**: 8 괴물 × 10 레벨 × 4 프레임 = **320개 PNG**

### **Step 3: 라우팅 확인**
`src/index.ts`에 이미 추가됨:
```typescript
import { handleSpaceMonsterApi } from './api-space-monster';
```

게임 HTML에서 API 호출:
```javascript
fetch('/api/games/space-monster/hit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ score, creature, stage, word })
})
```

### **Step 4: TypeScript 컴파일**
```bash
cd cloudflare-deploy
npx tsc --noEmit
```
✅ 성공해야 배포 가능

### **Step 5: 회귀 테스트**
```bash
node test-harness/run.mjs --fast
```
✅ 55점 이상 PASS 필요

### **Step 6: 배포**
```bash
.\deploy.ps1
```
- 모든 HTML에 `<!-- BUILD:시각 -->` 스탬프 자동 추가
- Cloudflare Workers 배포
- GitHub Actions 자동 배포 트리거 (선택)

### **Step 7: 라이브 검증**
```bash
curl -s https://test.mangoi.co.kr/student-game-space-monster.html | head -5
```

브라우저에서 확인:
1. https://test.mangoi.co.kr/student-game-space-monster.html 접속
2. 크로스헤어 표시 확인 (중앙)
3. 우주 괴물이 다가오는지 확인
4. 클릭 시 점수 증가 확인
5. 3 스테이지 진행 확인

---

## ⚠️ 주의사항

### **배포 전 반드시 확인**
- [ ] `git status` — 커밋하지 않은 파일 있는지 확인
- [ ] `build-space-monster-videos.mjs` — Higgsfield MCP 설정 확인
- [ ] `temp/videos/` 디렉토리 존재 (또는 생성)
- [ ] FFmpeg 설치 확인: `ffmpeg -version`
- [ ] Python 3.9+ 설치: `python3 --version`
- [ ] PIL/NumPy 설치: `pip list | grep -E "Pillow|numpy"`

### **Higgsfield AI 프롬프트 최적화**
현재 프롬프트는 **영화급 수준**으로 설계:
- Cinematic lighting ✅
- Photorealistic 4K ✅
- Sci-fi horror aesthetic ✅

필요시 프롬프트 수정:
```javascript
// build-space-monster-videos.mjs 에서 CREATURES 배열 수정
```

### **스프라이트 시트 커스터마이징**
배경 제거 색상 조정 필요시:
```python
# build-space-monster-sprites.py 에서 색상 범위 수정
green_mask = (data[:,:,1] > 120) & (data[:,:,0] < 100) & (data[:,:,2] < 100)
```

### **게임 HTML 커스터마이징**
- 난이도 조정: `getStageSettings()` 함수 수정
- 스폰 간격: `spawnIntervals` 객체 수정
- 이모지 → 스프라이트 이미지: `emojiMap` 제거, `background-image` 추가

---

## 📊 파일 구조

```
cloudflare-deploy/
├── build-space-monster-videos.mjs          # Higgsfield AI 호출
├── build-space-monster-sprites.py          # 영상 처리
├── public/
│   ├── student-game-space-monster.html     # 게임 HTML
│   └── img/space-monsters/                 # 스프라이트 (생성 후)
│       ├── tripod-level-01-frame-00.png
│       ├── tripod-level-01-frame-01.png
│       ├── ... (320개 파일)
│       └── phantom-level-10-frame-03.png
├── src/
│   ├── index.ts                            # API 임포트 추가
│   └── api-space-monster.ts                # 게임 API
└── temp/
    └── videos/                             # Higgsfield 영상 (생성 후)
        ├── tripod.mp4
        ├── blob.mp4
        └── ... (10개 파일)

docs/
├── space-monster-hunter-overview.md        # 프로젝트 개관
├── space-monster-hunter-production-plan.md # 제작 계획
└── space-monster-hunter-competitive-analysis.md # 경쟁사 분석
```

---

## 🎯 기대 효과

### **학생 측면**
- ✨ **오락실 수준의 재미** (1인칭 라이트건)
- 📚 **자연스러운 영어 학습** (8개 단어 마스터)
- 🏆 **성취감** (3 스테이지 클리어)

### **운영 측면**
- 📊 게임 데이터 자동 저장 (D1)
- 📈 학생 활동 통계 수집
- 🎁 포인트/배지 연계 가능

### **기술 측면**
- ⚡ **HTML5 완전 자동화** (프레임 스케일링)
- 🎬 **Higgsfield AI 실사** (영화급 비주얼)
- 🚀 **즉시 배포 가능** (라이브 서버)

---

## 📞 문제 해결

| 문제 | 해결 방법 |
|---|---|
| Higgsfield MCP 연결 실패 | `build-space-monster-videos.mjs`의 MCP 설정 확인 |
| 배경 제거 실패 (스프라이트가 색칠됨) | Python 색상 범위 (RGB 값) 조정 |
| 게임 HTML 렌더링 안 됨 | 브라우저 콘솔 확인, 이모지 폰트 로드 확인 |
| API 404 에러 | `src/index.ts`에 `handleSpaceMonsterApi` 임포트 확인 |
| 스테이지 진행 안 됨 | `getStageSettings()` 함수 검증 |

---

## ✅ 최종 체크리스트 (배포 직전)

```
개발 완료:
  [x] HTML5 게임 파일
  [x] Python 자동화 스크립트
  [x] Node.js Higgsfield 호출
  [x] API 엔드포인트
  [x] 문서 작성

배포 준비:
  [ ] Higgsfield 동영상 생성 (temp/videos/)
  [ ] 스프라이트 시트 생성 (public/img/space-monsters/)
  [ ] TypeScript 컴파일 (npm run build 또는 tsc)
  [ ] 회귀 테스트 (node test-harness/run.mjs --fast)
  [ ] git status 확인 (미커밋 파일 없음)
  [ ] deploy.ps1 실행

검증:
  [ ] 라이브 서버에서 게임 로드 (test.mangoi.co.kr)
  [ ] 크로스헤어 표시
  [ ] 괴물 출현 & 원근감
  [ ] 클릭 시 점수 증가
  [ ] 3 스테이지 진행
  [ ] API 데이터 저장 (D1)
```

---

**🚀 준비 완료! 배포하시겠습니까?**
