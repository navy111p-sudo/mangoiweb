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
- ⟹ (이 시점) 실제 Azure 결과 0건 — **6장에서 공개 토큰으로 실측해 정정했다.**

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

## 6. 정정 — 같은 날 실제 Azure 실측 (2026-11-08 밤)

테스트 키는 끝내 401 이었다(값은 아무도 못 봄 — 지역·키 종류 중 하나로 추정). 대신 **운영이 학생 브라우저에 내주는 공개 10분 토큰**(`/api/voice/azure-token`, DB 기록 없음)으로 운영 Azure 리소스(Korea Central)를 직접 쟀다. 틀린 테스트 키가 프록시에서 계속 덧붙어 «키 없는» 개인 환경을 따로 만들어 옮겼다.

- **REST 발음평가는 동작한다.** 점수가 `NBest[0].AccuracyScore` 처럼 «평평하게» 온다(단어·음소도 같음). 정본은 SDK 식 중첩(`PronunciationAssessment`)만 읽어 **늘 `no_assessment2`** 였다 — 운영 8/7 기록과 같은 증상. 2026-08-08 의 «REST 는 헤더를 무시한다» 는 오진이었다.
- 기존 하니스는 «코드가 기대한 모양» 으로 가짜 응답을 만들어 이것을 못 잡았다.
- 수정: `azure-pronunciation.ts` 가 두 모양을 다 읽고(`paOf`), 잡음(Azure 가 `Success`·0점·Lexical `.` 을 줌)은 `recog_no_words` 로 거절. 실제 응답을 `test-harness/fixtures/azure-rest/` 에 두고 `azure_rest_real_shape_harness` 가 검사(되돌림 6종 전부 실제 FAIL).

| 실제 Azure (합성 음성) | 수정 전 | 수정 후 |
|---|---|---|
| 정상 | no_assessment2 | 98 / 98 / 100 |
| 느리게 | no_assessment2 | 93 / 95 / 100 |
| 일부만 | no_assessment2 | 58 / 97 / 60 (빠진 말 Omission) |
| 다른 문장 | no_assessment2 | 48 / 29 / 60 |
| 무음 | InitialSilenceTimeout | recog_no_words |
| 잡음 | no_assessment2 | recog_no_words (0점을 남기지 않음) |
| 30초 | too_long (호출 안 함) | too_long |
| 집중교정 «student» (문장 녹음) | no_assessment2 | 낱말 88점·오류 없음 → 교정 안 띄움 |

영향: AI 친구 «집중 교정» 의 발음 짚기가 처음으로 실제로 동작한다(낱말 60점 미만 + Mispronunciation 일 때만). 기준 문장 읽기 근거는 여전히 `reference` 를 보내는 화면이 없어 비어 있다 — 음성 코칭이 서버로 보낼지는 사람이 정할 일.

다시 재는 법(키 없이): `AZURE_TOKEN_URL=https://mangoi.ai/api/voice/azure-token NODE_USE_ENV_PROXY=1 node test-harness/manual/azure-speech-live-check.mjs`

## 7. 후속 — AI 친구 발음 짚기 기준 낱말 (2026-11-09, #2210)

6장 수정으로 발음 짚기가 실제로 돌기 시작해, 화면이 고르는 «기준 낱말» 을 운영 D1(SELECT 만, 최근 60일 AI 답 281건)에 다시 대 봤다.

- 질문으로 끝나는 답의 약 30%(78건)가 `? 🐶` 처럼 이모지로 끝나 기준 낱말이 비었다. `☀️`·`🗣️`(FE0F) 는 «AI 가 물었나» 판정까지 틀렸다.
- 이모지만 떼면 앞 문장으로 넘어가 따라 말할 예문(«You can say… "…" Can you say it with me?» 49건 — 따옴표 안에 마침표가 없다)·인사 속 학생 이름·AI 가 받아 적은 틀린 철자를 골랐다.
- 고침(`ai-friend.html`): `aiTextTail()` 이 끝 이모지·보이지 않는 글자·«(💡 …)» 팁을 떼고, `pronTargetFromAi()` 는 마지막 질문 문장의 마지막 쉼표 뒤만 본다(`K-pop`·`don't`·`TV`·`EXO` 건너뜀, 시간 부사 불용어).
- 남긴 것: 문장 중간 고유명사(Baekhyun)는 여전히 기준 낱말이 될 수 있다(막으면 Korea 도 빠짐 — 사람이 정할 일).

## 8. 음성 코칭 — 서버 채점으로 교체 (2026-11-09, 사장님 결정)

**왜**: 학부모 리포트 «기준 문장 읽기» 칸은 서버가 Azure 로 «잰» 결과만 근거로 쌓는다(`referenceReadingEvidence`). 그런데 음성 코칭(`speech-coach.html`)은 서버에 `reference` 를 안 보내고 브라우저 Speech SDK 로만 채점해, 그 칸이 원리상 비어 있었다.

**고침**
- 화면: `/api/voice/transcribe` 에 `reference`(모범 문장)와 로그인 토큰(`Authorization: Bearer`)을 함께 보낸다. 서버가 Azure 로 잰 결과(`azure.ok`)를 먼저 쓴다. 다시 안 재는 것은 둘뿐이다 — Azure 가 «말이 없다» 고 답한 경우(`recog_NoMatch`·`recog_InitialSilenceTimeout`·`recog_BabbleTimeout`·`recog_no_words`)와 녹음이 너무 긴 경우(`too_long` — 서버가 Azure 를 부르기 «전» 에 거른다). 다시 물어도 같은 답이고 SDK 는 잡음에 0점을 지어낸다. 그 밖의 실패(`http_*` = Azure 가 오류로 답함 · `timeout` · `no_key` · `not_wav` · `dropped` = Whisper 가 못 들음 · `recog_Error` = Azure 내부 오류 · `recog_unknown`)는 예전 브라우저 SDK 로 한 번 더 잰다.
- 서버: `assessPronunciation(…, { prosody: true })` — en-US 에서만 `EnableProsodyAssessment` 를 켜 «🎵 운율 N점» 이 서버 채점에서도 나온다(AI 친구 발음 짚기는 안 켬).
- 진단 글자: `ok(server)` / `server:<사유>|ok(sdk)` / `server:<사유>|sdk:<사유>` / `server:<사유>|sdk:skip`.
- 학부모 보고서 «기록된 연습» 은 대화 단위로 센다(웜업·AI 친구는 대화 하나 = 1회). 문장 읽기는 녹음마다 따로 세면 15문장이 «15회» 가 되므로 **KST 하루를 한 번** 으로 묶는다(`sessionId: 'reading-' + 날짜`). 같은 소리를 다시 보내면 그날 안에서는 한 건만 남는다(다른 날 같은 바이트를 다시 보내면 한 건 더 — 알고 둔 한계).

**잰 것**
- 실제 Azure REST(Korea Central, 합성 음성 «Hello, I am a student.»)에 운율을 켜면 `NBest[0].ProsodyScore` 가 평평하게 온다(83.4 · PronScore 92.6) — 고정 파일 `test-harness/fixtures/azure-rest/prosody.json`(개인정보 없음).
- 하니스 `speech_coach_server_azure_harness`(56종): 화면 `processAudio` 를 오려 내 가짜 fetch·SDK 로 실제 실행 · 정본을 esbuild 로 묶어 고정 파일로 실행 · **진짜 전사 창구(`handleVoiceApi`)를 진짜 SQLite·토큰으로 실행**해 «하루 = 한 번» 을 센다. 배선 검사는 주석을 벗기고 괄호 짝으로 자른다. 변이 17종 전부 실제 FAIL(조건 뒤집기 포함) · 무해한 주석 추가는 통과.
- 적대적 검토(관점 4개 × 검증 2명): 확정 4건(전부 낮음) — `recog_Error` 를 «말 없음» 으로 보고 SDK 를 건너뛰던 것 · 녹음마다 «기록된 연습» 이 늘던 것 · 하니스의 길이 창·주석 미제거 · 작업기록의 «닿았다/못 닿았다» 오기. 넷 다 고침.
- 남긴 것: 정상 경로에서는 브라우저 SDK(369KB)를 안 받는다 — 폴백 때만.

- 배포(2026-11-09 05:08 KST, #2218) 뒤 운영에서 합성 음성으로 `POST /api/voice/transcribe` + reference(비로그인 = 기록 없음) → `azure_diag: ok` · 98/98/100 · pron 93 · **prosody 83** · 낱말 5개.
- 브라우저 검사 `test-harness/manual/speech-coach-server-azure-browser.mjs`(34종 — 자동으로 안 돕니다, 사람이 부릅니다): 진짜 화면을 크로미움에 띄우고 두 창구만 가짜로 답해 `processAudio` 를 실제로 부른다. 서버 점수 → SDK·토큰 안 부름 · 화면에 «🎵 운율 83점»·단어 지도 / http_401·recog_Error·timeout → SDK 폴백 / recog_NoMatch·too_long → SDK 안 부름 / 영어 화면 «Prosody 83». 변이 5종(배포 전 화면·옛 정규식·조건 뒤집기·토큰 빼기·서버 점수 무시) 전부 실제 FAIL.

**사람이 볼 것**: 배포 뒤 로그인한 학생이 음성 코칭을 한 번 하면 `speaking_growth_events` 표가 처음 생긴다(지연 생성). 2026-11-09 23:10 KST 재측정 예약이 그 표를 센다.
