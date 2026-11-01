# 261026 — A.i 상담사 워커 `/api/tts`: Typecast → Azure Speech + R2 캐시

## 왜
- 사장님 지시(2026-10-26): 「typecast 사용하면 안 돼. 비용이 너무 많이 들어」.
  Typecast API 100만 자당 $70~90(Plus $280/400만 자, 추가 $0.08/1천 자) vs Azure Neural $15.
- 같은 날 실측: Typecast 가 `403 UNUSUAL_ACTIVITY_DETECTED` 로 막혀 `/api/tts` 가 502 →
  관리자 AI 운영비서 음성이 `/api/ops-tts` 의 구글 무료 음성 폴백으로 떨어져 있었습니다.

## 무엇을 «안» 바꿨나 (범위)
- `/api/tts` 를 쓰는 곳은 **관리자 AI 운영비서 한국어 음성 하나**입니다(`cloudflare-deploy/public/js/adm-p2.js` → `/api/ops-tts` → 이 워커).
- 학생 상담사(`student.html`)·운영비서 위젯(`index.html`)은 `/api/tts-free`(브라우저 음성 / Aura-2 / 구글 KR 릴레이) — **그대로**.
- 공동 금지구역(`src/index.ts` 의 `/api/ops-tts` 프록시·메인 `wrangler.toml`)은 건드리지 않았습니다.

## 바뀐 것
- `mangoi-ai-avatar-cf/src/index.js` `handleTTS`: ① R2 캐시 → ② Azure(`ko-KR-SunHiNeural` 여성) → ③ 실패는 JSON 오류(화면·프록시가 폴백)
  - 상한: 600자(화면이 600자로 자름), 글자(string)만, 아는 목소리 형식만, SSML 이스케이프, 800B 미만 오디오는 내보내지·저장하지 않음
  - 이모지·마크다운·공백 정리 → 같은 문장은 같은 캐시
- `GET /api/tts/usage?month=YYYY-MM` — 월별 Azure 글자 수·예상 요금·약정 권장(월 6,400만 자 이상 = $960 약정이 더 쌈).
  매월 1일 점검 작업(Claude 예약 작업 「Azure 약정 요금제 점검」)이 이 주소를 읽어 알립니다. ⛔ 약정 가입은 사람이 Azure 포털에서.
- `mangoi-ai-avatar-cf/wrangler.toml`: R2 `TTS_CACHE` → `mangoi-avatar-tts-cache`(2026-10-26 생성).

## 사람이 할 일
- [ ] 워커 `mangoi-ai-avatar-cf` 에 시크릿 `AZURE_SPEECH_KEY`·`AZURE_SPEECH_REGION` 등록(대시보드 → 설정 → 변수 및 비밀). **없으면 계속 구글 음성**입니다.
- [ ] 배포 후 관리자 AI 비서 음성을 귀로 확인(`X-TTS-Provider: azure` / 두 번째부터 `r2-cache`).
- [ ] 확인 후 Typecast 구독 해지.

## ⚠️ 별도 저장소 `navy111p-sudo/mangoi-ai-avatar-cf-` 는 «옛 사본» 입니다
- 2026-06 이후 멈춘 사본(693줄)이고 **정본은 이 저장소의 `mangoi-ai-avatar-cf/`(1,482줄)** 입니다(`deploy.yml` 2-b 가 배포).
- 2026-10-26 그 사본에 같은 작업을 먼저 했다가 «배포해도 안 바뀌는» 일을 겪었습니다. 그 사본을 Cloudflare Git 연결로 배포하면
  **최근 4개월 기능(수강등록·운영 메뉴 라우팅·tts-free 등)이 사라집니다** — 연결하지 마세요.

## 검증
- `test-harness/avatar_tts_azure_harness.mjs` 28종(가짜 Azure·R2 장애 포함). 변이 4종(이스케이프 제거·빈 오디오 가드 제거·글자 상한 제거·상수 export) 각각 실제 FAIL, 옛 Typecast 코드로 돌리면 FAIL.
- 실제 런타임(`wrangler dev` + 로컬 R2, AI 바인딩만 뺀 임시 설정): 시작 정상, 동시 20 × 600건 기대값 일치·런타임 오류 0, R2 저장본 재생 확인.
- ⚠️ 진짜 Azure 합성은 이 환경에 키가 없어 못 했습니다 — 배포 후 사람이 들어 봐야 끝입니다.
