# 2026-11-08 A.i 말하기 음성평가 — 실제 Azure 점검 준비와 현재 상태

이슈 #2179 후속. 병합된 #2178·#2185·#2186·#2188·#2189·#2191·#2192·#2194 위에서 «음성 평가가 실제로 어디까지 켜져 있나» 를 코드·운영 D1(SELECT 만)로 다시 확인하고, 운영과 분리된 환경에서 실제 Azure 로 재려고 했다.

## 1. 지금 켜져 있는 것 / 아닌 것 (코드 기준)

| 경로 | 상태 | 근거 |
|---|---|---|
| 자유 대화 5개 축 점수 | **꺼짐** — 화면은 «측정 안 됨» | `ai-speaking-session.ts` `speakingTextScores` 가 `unvalidated_evaluator` 로 던짐, 결과 `status:'unavailable'` |
| 웜업 «녹음으로 평가» 체크 | **없음** | 66048781 에서 넣고 #2188 병합 때 뺐다. 서버에 `progress_audio` 처리기 없음 |
| 서버 기준 문장 읽기 근거(`/api/voice/transcribe` + `reference`) | **코드만 있고 닿지 않음** | `reference` 를 보내는 화면이 0곳. `speech-coach.html` 은 2026-08-08 «REST 가 발음평가 헤더를 무시» 실측으로 일부러 안 보냄 |
| AI 친구 발음 짚기(`pron-focus`) | 켜짐 · 서버 REST 에 의존 | `api-ai.ts` → `assessPronFix` → `assessPronunciation` |
| 음성 코칭(브라우저 SDK) | 켜짐 · 결과는 화면 안에서만 | `js/speech-azure.js`. 성장 기록 근거가 아님(클라이언트 점수) |

⟹ 학부모 보고서의 «기준 문장 읽기» 칸은 지금 구조상 채워질 길이 없다(비어 있는 것이 사실이고, 지어내지 않는다).

## 2. 운영 D1 실측 (SELECT 만, 2026-11-08)

- `voice_coaching.azure_diag`: 서버 REST 시험(2026-08-07) = `no_assessment heard="…"`(말은 알아듣고 발음평가 블록만 없음). 브라우저 SDK `ok(sdk)` 계열 364건(~11-04). `sdk_issue_failed_401` 128건(09-08~10-04).
- `speaking_growth_events`·`ai_speaking_sessions` 표 없음 = 운영에서 한 번도 안 쓰임(지연 생성). «버그가 없다» 의 근거가 아니다.
- 11-08 배포 뒤 웜업 세션 34 중 로그인 0.

## 3. 실제 Azure 점검 — 막힌 곳

- 개인 환경 `mangoiweb` 을 만들고 `koreacentral.stt.speech.microsoft.com` 만 열었다. 테스트 키는 네트워크 시크릿(값 비공개)으로 저장.
- 새 스크립트 `test-harness/manual/azure-speech-live-check.mjs` — 정본 `assessPronunciation`·`referenceReadingEvidence` 를 번들해 합성 음성(ffmpeg flite) 7종(정상·오발화·일부만·느리게·무음·잡음·30초)을 실제 Azure 에 보낸다. 키 값은 찍지 않는다. 운영 DB·KV·R2 를 안 쓴다.
- 결과: 프록시를 지나 Azure 까지 닿았으나 **모든 호출이 `http_401`**(프록시 `X-Proxy-Error: upstream auth failed`). 30초 음성은 호출 전에 `too_long` 으로 정상 거절.
- ⟹ **실제 Azure 결과는 아직 0건.** 아래 4장은 전부 모의(가짜 Azure)다.

필요한 것: 테스트 전용 Azure Speech(또는 다중 서비스) 리소스의 키 — 지역 **Korea Central**, 헤더 `Ocp-Apim-Subscription-Key`(Authorization Bearer 아님, 접두사 없음). 환경 설정 › Network secrets 에서 고친 뒤:

```
NODE_USE_ENV_PROXY=1 node test-harness/manual/azure-speech-live-check.mjs
```

로컬 PC 에서는 `AZURE_SPEECH_KEY=<테스트 키> AZURE_SPEECH_REGION=koreacentral` 로 같은 명령.

## 4. 모의 검증 (격리 workerd·임시 D1/KV, 외부 차단)

| 하니스 | 결과 | 보는 것 |
|---|---|---|
| `speaking_runtime_harness` | PASS | 인증, 보상 우회 차단, 동시 재전송 1회 지급, 상한·롤백 |
| `speaking_growth_rewards_harness` | PASS | 읽기 근거는 서버 Azure 점수만, 공급자 없으면 기록 안 됨, 월간 보고서 반영 |
| `speaking_audio_input_harness` | PASS | WAV 형식·길이 위조·중복, 거절된 입력은 유료 호출 0 |
| `azure_pronunciation_harness` | 85/0 | 사유 이름·재시도·시간초과(가짜) |
| `pron_focus_harness` | 37/0 | 발음 짚기 문턱 |
| 브라우저 `speaking-growth-report` · `ai-speaking-progress`(497 검사) · `ai-speaking-observations` | PASS | 320~1366px, 학부모·월간 보고서 «모름» 표시 |

느린 응답·재시도는 모의로만 확인했다(실제 Azure 지연 아님).

## 5. 사람이 정할 일

1. 테스트 키 수정(3장).
2. 실제 Azure 에서 REST 발음평가가 «돌아오면» — `speech-coach` 가 `reference` 를 보내게 할지(그때 비로소 학부모 보고서 읽기 칸이 채워짐).
3. 돌아오지 «않으면» — `pron-focus` 는 사실상 늘 비어 있으니 브라우저 SDK 로 옮길지, 그 기능을 접을지.
