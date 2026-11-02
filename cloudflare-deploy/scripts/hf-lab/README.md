# hf-lab — Hugging Face 오프라인 비교 실험 (KO / EN)

## 한국어
- **목적:** 보고서 빈칸 B(아이 음성 인식 정확도)를 위해, 동의받은 짧은 샘플로 ASR 모델을 WER 로 비교합니다.
- **범위:** 실험 전용입니다. 라우트·워커·`server.js` 어디에도 연결하지 않으며, 배포되지 않습니다.
- **금지:** 실시간 WebRTC 음성을 보내지 않습니다. 샘플은 공개 데이터셋 또는 별도 동의를 받은 것만 씁니다.
- **실행:** `HF_API_TOKEN=... node scripts/hf-lab/asr-compare.mjs <클립폴더> whisper-large-v3-turbo,openai/whisper-small`
  - 클립폴더에는 `clips.csv`(헤더 `file,reference`)와 오디오 파일을 둡니다. 클립당 2MB 이하.
  - 추론 주소는 `HF_INFERENCE_BASE` 로 바꿀 수 있습니다. 기본값은 **이 컨테이너에서 실측하지 않았습니다**.
- **테스트:** `node --test scripts/hf-lab/asr-compare.test.mjs` (네트워크 없이 가짜 fetch 로 검증)

## English
- **Purpose:** compare ASR models by WER on consented short clips (report gap B).
- **Scope:** experiment only. Not wired to any route or worker; not deployed.
- **Rules:** never send live WebRTC audio; use public or consented samples only.
- **Run:** see the command above. The default inference base URL is unverified; override with `HF_INFERENCE_BASE`.
- **Test:** `node --test scripts/hf-lab/asr-compare.test.mjs` (offline, fake fetch).
