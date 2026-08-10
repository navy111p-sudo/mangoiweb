# 발음 연습 (Speech Coach) — 구조·환경변수·비용

> EN: Architecture, secrets and cost model for the pronunciation-practice feature.
> KO: 발음 연습 기능의 구조·시크릿·과금 구조 정리. (2026-08-10)

## 화면과 파일

| 역할 | 파일 |
|---|---|
| 영어 코치 (Phonics·BTS·SIU 커리큘럼 11,100문장) | `cloudflare-deploy/public/speech-coach.html` |
| 중국어 코치 (다락원 + Lv 1~20) | `cloudflare-deploy/public/speech-coach-cn.html` |
| 커리큘럼 문장 데이터 (코스 선택 시 지연 로드) | `cloudflare-deploy/public/js/speech-data-{phonics,bts,siu-basic,siu-advance}.js` |
| **Azure 서비스 계층** — SDK 로드·토큰·평가·VAD 트리밍·과금 집계 | `cloudflare-deploy/public/js/speech-azure.js` |
| 토큰 발급·TTS·전사·채점 API | `cloudflare-deploy/src/api-games.ts` (`/api/voice/*`) |

화면(컴포넌트)은 Azure SDK 를 직접 부르지 않는다 — 전부 `SpeechAzure.*` 를 통한다.

## Azure 연동

- 브라우저 Speech SDK 의 `PronunciationAssessmentConfig`
  (referenceText=목표 문장 · HundredMark · **Granularity=Phoneme** · **Miscue=true** · **Prosody=true**)
- 로케일: 영어 `en-US` · 중국어 `zh-CN` (`ko-KR` 은 매핑만 존재)
- REST 짧은오디오 창구는 발음평가 헤더를 무시한다(실측) → 반드시 브라우저 SDK 로 평가한다.
- **구독 키는 프론트에 절대 없다.** 서버 `GET /api/voice/azure-token` 이 Azure STS 에서
  10분 임시 토큰을 받아 내려준다. 프론트는 8분마다 갱신(`SpeechAzure.getToken`).

## 시크릿 (.env 대응 — Workers 는 wrangler secret)

| 이름 | 용도 |
|---|---|
| `AZURE_SPEECH_KEY` | Azure Speech 구독 키 (서버 전용) |
| `AZURE_SPEECH_REGION` | 리소스 리전 (예: `koreacentral`) |

- 운영: `npx wrangler secret put AZURE_SPEECH_KEY` (+ `--env production` 한 벌 더)
- 로컬: 리포에 없는 `.dev.vars` 에 같은 이름으로. **깃에 올리지 말 것.**
- 전체 환경변수 목록: [ENVIRONMENT.md](ENVIRONMENT.md)

## 비용 구조와 절감 장치

발음평가 과금은 **실제 전송한 오디오 길이(초)** 기준이다
(표준 $1.32/시간 · 60초 미만 짧은 오디오 $0.66/시간 — 우리는 전부 후자).

| 장치 | 구현 |
|---|---|
| 문장 단위 발화만 전송, **한 번에 최대 15초** (60초 초과 금지) | 양쪽 화면 녹음에 15초 자동 종료 (`MAX_UTTER_SECONDS`) |
| **VAD 묵음 트리밍** — 앞뒤 침묵을 잘라 발화 구간만 전송 | `SpeechAzure.trimWav` (20ms 프레임 RMS, 앞뒤 150ms 여유) |
| TTS 모범 음성은 같은 문장 **1회 생성 후 캐싱** | 서버 `/api/voice/tts` 가 R2 에 SHA-256 키로 캐시 |
| 세션 과금 집계 | 평가 성공마다 콘솔에 `[SpeechAzure] 이 문장 과금 오디오 X.Xs (묵음 컷 -Y.Ys) · 세션 누적 Z.Zs / N회` — `SpeechAzure.billing` 으로도 읽기 가능 |
| SDK(369KB)는 **평가 직전 1회만** 지연 로드 | `SpeechAzure.loadSdk` |

문장 1개(평균 3~5초 발화) 예상 과금: 트리밍 후 약 3초 ≈ **$0.00055** (짧은 오디오 단가).

## 폴백 사슬 — 평가는 «덤», 수업을 세우지 않는다

1. Azure SDK/토큰 실패 → 영어는 Whisper 전사 + 서버 텍스트·음향 채점, 중국어는 글자맞춤 점수로 자동 복귀
2. WAV 생성 실패(구형 브라우저) → webm 으로 Whisper 만 (영어)
3. 서버 TTS 실패 → 브라우저 TTS

## 실행·검증

- 배포 없이 화면 구조 확인: 리포 루트에서 `.claude/launch.json` 의 `admin-static-harness`
  (= `cd cloudflare-deploy; node static-serve.mjs`, http://localhost:4599)
- 컴파일: `cd cloudflare-deploy && node node_modules/typescript/bin/tsc --noEmit`
- 회귀: 리포 루트에서 `node test-harness/run.mjs --fast`
- Azure 실채점은 라이브에서만 가능(토큰 API 필요) — 콘솔의 `[SpeechAzure]` 과금 로그로 확인

## ⚠️ 알려진 함정

- **Workers AI(Whisper)와 Azure 를 «동시에» 부르지 말 것** — 같은 오디오를 두 곳이 물면
  본문 없는 400 이 난다. `processAudio` 는 전사 → 평가 순서로 직렬 실행한다.
- Whisper 에 목표 문장을 initial_prompt 로 주지 말 것 (정답 베껴적기 → 전원 만점 사고, 07-29).
- i18n 은 이 저장소 표준 `data-ko`/`data-en` 방식 — JS 로 라벨을 다시 그릴 때는 두 속성도 갱신.
