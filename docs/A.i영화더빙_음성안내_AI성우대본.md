# 🔊 A.i영화더빙 «사용방법» 음성 안내 — AI 성우 대본 / Voice-guide script (AI voice)

Rev. A / 2026-10-26 · 화면 정본: `cloudflare-deploy/public/ai-dubbing.html` · 소리 정본: `cloudflare-deploy/public/js/ai-dubbing-guide-voice.js`

> 이 대본을 **AI 음성(Higgsfield Seed Audio · 회사 등록 목소리 «망고아이 안내 목소리»)** 으로 읽혀
> `public/audio/dubbing-guide/guide-ko.mp3`·`guide-en.mp3` 를 만들었습니다(장면 11개, 장면 사이 0.8초, 모노 64kbps).
> 안내창(❓ 사용방법)을 **사람이 눌러 열면 바로** 들리고, 창 안 ‘■ 소리 끄기’·화면 아래 «■ 끄기» 로 끕니다.
> 📌 사람 성우용 3단계 대본은 따로 있습니다 — `docs/A.i영화더빙_사용방법_성우대본.md`(안내창 그림 순서 그대로, 약 2분).
> ⚠️ 이 대본의 ‘…’ 버튼 이름이 화면에서 바뀌면 음성을 다시 만들어야 합니다 — 그때 `AUDIO_V` 를 올리고
> 장면 시작 시각(`OFFSETS`)을 새 파일에 맞춰 함께 바꿉니다(`test-harness/ai_dubbing_guide_voice_harness.mjs` 가 길이를 대조).

## 만든 방법(다시 만들 때)

| 단계 | 내용 |
|---|---|
| 음성 | Higgsfield `seed_audio`, 목소리 `망고아이 안내 목소리`(element), `speech_rate -10`, mp3 44.1kHz — 장면마다 1개(한/영 각 11개) |
| 다듬기 | AI 음성이 문장 사이를 **3~7초** 쉬는 곳이 있었습니다(무음 검출 실측) → 0.55초 넘는 쉼은 0.45초로, 앞뒤 무음은 0.1/0.15초로 |
| 합치기 | 장면 사이 0.8초 무음, `loudnorm I=-17`, 모노 64kbps mp3 |
| 결과 | 한국어 2분 54초(1.4MB) · 영어 2분 32초(1.2MB) |
| 화면에서 읽는 말 | TTS 에는 «에이아이»·«A.I.» 로 적어 넣었습니다(A.i영화더빙 → 에이아이영화더빙) |

장면 시작 시각(초) — `OFFSETS`:

- 한국어: 0 · 12.1 · 27.95 · 46.52 · 62.08 · 80.69 · 100 · 114.52 · 132.41 · 150.49 · 161.02
- 영어: 0 · 11.19 · 26.51 · 42.31 · 55.52 · 71.84 · 91.41 · 104 · 116.94 · 132.52 · 141.55

## 녹음 안내
- 기준 화면 / Based on: mangoiweb `cloudflare-deploy/public/ai-dubbing.html` (커밋 6dd01a3, 2026-10-26)
- 길이 / Length: 11개 씬 — 한국어 2분 54초 · 영어 2분 32초 / 11 scenes — KO 2:54 · EN 2:32
- 말투 / Tone: 존댓말, 밝고 따뜻한 선생님 안내 톤 / Polite, warm, teacher-like guide tone
- 속도 / Pace: 보통보다 약간 느리게 / Slightly slower than normal
- 기호 / Marks: `/` = 0.5초 쉼, `//` = 1초 쉼, **굵게** = 또박또박 강조 / `/` = 0.5s pause, `//` = 1s pause, **bold** = emphasize
- ‘작은따옴표’ 안의 문구는 실제 화면 버튼·제목 그대로입니다. / Text in ‘quotes’ matches the real on-screen labels.

---

## 씬 1. 인트로 / Intro (한국어 음원 0:00–0:11)
- 화면 / Screen: A.i영화더빙 첫 화면 + 포스터 / A.i Dubbing home + poster
- 화살표 / Arrow: 없음 (포스터 천천히 줌인) / None (slow zoom-in on poster)

KO: 안녕하세요. / 망고에이아이 **A.i영화더빙**입니다. // 캐릭터를 골라 영어 대사를 녹음하면, / **내 목소리로 만드는 영어 영화**가 완성됩니다.

EN: Hello, and welcome to Mango A.I. Dubbing. Choose a character, record the English lines, and you'll have an English movie made with your own voice.

## 씬 2. 첫 화면 / Home Screen (한국어 음원 0:12–0:27)
- 화면 / Screen: ‘처음이라면 여기부터’ 칸 / The “New here? Start here” panel
- 화살표 / Arrow: ‘처음이라면 여기부터’ → 1·2·3 순서 / “New here? Start here” → steps 1·2·3

KO: 처음이시라면, / **‘처음이라면 여기부터’** 칸을 봐 주세요. / 영상 먼저 보기, / 내 목소리로 더빙, / 내 영상 다시 보기. // 이 세 단계로 연습하시면 / 훨씬 쉽습니다.

EN: If it's your first time, look at the panel that says, New here? Start here. Watch the scene, record your voice, then watch your video. Practicing in these three steps makes it much easier.

## 씬 3. 안내창 / Guide Window (한국어 음원 0:28–0:46)
- 화면 / Screen: 접힌 안내창 → 펼쳐진 6단계 / Collapsed guide → expanded 6 steps
- 화살표 / Arrow: ‘친구들과 함께 더빙하는 방법 · 저장 안내’ 제목 → 6단계 목록 / Guide title → 6-step list

KO: 바로 아래 **‘친구들과 함께 더빙하는 방법 · 저장 안내’**를 누르시면, / 안내창이 펼쳐집니다. / 한 컴퓨터와 마이크를 함께 쓰는 순서와 / 저장 방법이, / **여섯 단계**로 정리되어 있습니다.

EN: Just below, tap Record with friends, Saving guide, and the guide opens. It explains, in six steps, how to share one computer and microphone, and how to save your video.

## 씬 4. 이야기 고르기 / Choose a Story (한국어 음원 0:47–1:01)
- 화면 / Screen: ‘이야기 고르기’ 작품 목록 + ‘먼저 보기’ / Story list + preview
- 화살표 / Arrow: 작품·에피소드 → ‘👀 보기’ / Title & episode → “👀 Watch”

KO: 먼저 **‘이야기 고르기’**에서 / 모둠이 함께 할 작품과 에피소드를 골라 주세요. / **‘보기’**를 누르시면 / 원어민 목소리로 먼저 감상할 수 있습니다. / 먼저 보고 익숙해진 다음 더빙하시면, / 훨씬 쉬워요.

EN: First, in Choose a story, pick the title and episode your group will dub. Tap Watch to enjoy it first with native speaker voices. Getting familiar with it before dubbing makes it much easier.

## 씬 5. 역할 고르기 / Choose Roles (한국어 음원 1:02–1:20)
- 화면 / Screen: ‘내 역할 고르기’ 창 / The “Choose my role” window
- 화살표 / Arrow: ‘짧은 더빙 시작’ 또는 ‘더빙’ → ‘모둠 이름 (선택)’ 칸 → 캐릭터 / “Record a short scene” or “Dub” → Group name field → Characters

KO: 이제 **‘짧은 더빙 시작’**이나, / 장면의 **‘더빙’** 버튼을 눌러 주세요. / **‘내 역할 고르기’** 창이 열리면, / 모둠 이름과 학생 이름을 적고, / 각자 맡을 캐릭터를 골라 주세요. / 한 번에 **1명에서 5명**까지 / 함께할 수 있습니다.

EN: Now tap Record a short scene, or a scene's Dub button. When the Choose my role window opens, enter the group and student names, and have each student pick a character. One to five students can take part at once.

## 씬 6. 자막 보며 연습 / Practice with Subtitles (한국어 음원 1:21–1:39)
- 화면 / Screen: 연습 방법 선택 + 녹음 화면 / Practice mode + recording screen
- 화살표 / Arrow: ‘자막 보며 연습 (추천)’ → ‘내 목소리로 녹음 시작’ → ‘✅ 말하기 완료’ → ‘시간 더 주기 +5초’ / “Practise with subtitles (recommended)” → “Start recording my voice” → “✅ Done speaking” → “More time +5s”

KO: 처음에는 **‘자막 보며 연습’**을 추천드립니다. / **‘내 목소리로 녹음 시작’**을 누르고, / 마이크 사용을 **허용**해 주세요. // 내 차례가 오면 대사를 말한 뒤, / **‘말하기 완료’**를 누르시면 / 다음 대사로 넘어갑니다. / 시간이 부족하시면, / **‘시간 더 주기’**를 눌러 주세요.

EN: To begin, we recommend Practise with subtitles. Tap Start recording my voice, and allow microphone access. When it's your turn, say your line, then tap Done speaking to move to the next line. If you need more time, tap More time.

## 씬 7. 자막 없이 발표 / Presentation (한국어 음원 1:40–1:54)
- 화면 / Screen: 연습 방법에서 ‘자막 없이 발표’ 선택 / Choosing “Perform without subtitles”
- 화살표 / Arrow: ‘자막 없이 발표’ → ‘한국어 자막 켜기’ → ‘완성 영상 만들기’ 체크 / “Perform without subtitles” → “Show Korean subtitles” → “Make my movie” checkbox

KO: 연습을 마치셨다면, / 이번에는 **‘자막 없이 발표’**를 골라 주세요. / 필요하시면 **‘한국어 자막 켜기’**를 선택하실 수 있습니다. / **‘완성 영상 만들기’**도 꼭 체크하신 뒤, / 녹음을 시작해 주세요.

EN: When practice is done, choose Perform without subtitles. If needed, you can turn on Korean subtitles. Be sure to check Make my movie, then start recording.

## 씬 8. 완성 영상 보기 / Watch Your Movie (한국어 음원 1:55–2:12)
- 화면 / Screen: AI 평가 → ‘내 목소리로 만든 영상’ / AI feedback → “Videos with my voice”
- 화살표 / Arrow: ‘▶ 완성 영상 보기’ → 영상의 ▶ 재생 버튼 / “▶ Watch my movie” → ▶ play button

KO: 더빙이 끝나면 / **AI 평가**를 거쳐, / **‘완성 영상 보기’** 버튼이 열립니다. / **‘내 목소리로 만든 영상’**에서 / 재생 버튼을 눌러, / 우리 모둠의 영화를 확인해 보세요.

EN: When dubbing is finished, you'll get A.I. feedback, and the Watch my movie button opens. In Videos with my voice, press play and enjoy your group's movie.

## 씬 9. 꼭 저장하기 / Save It (한국어 음원 2:12–2:30)
- 화면 / Screen: 강조 박스 ‘화면을 닫기 전에 꼭 저장하세요!’ / Callout “Save before you close!”
- 화살표 / Arrow: 영상 아래 ‘⬇ 파일 내려받기’ → 컴퓨터 ‘다운로드’ 폴더 / “⬇ Download a copy” → Downloads folder

KO: 그리고, / 가장 중요한 한 가지! // **화면을 닫기 전에, / 꼭 저장해 주세요.** / 영상 아래 **‘파일 내려받기’**를 누르시면, / 컴퓨터의 **‘다운로드’** 폴더에 저장됩니다. / 다음 모둠으로 바꾸기 전에도, / 먼저 저장해 주세요.

EN: And here is the most important thing. Please save before you close the screen! Tap Download a copy below the video, and it's saved to your computer's Downloads folder. Save first before switching to the next group, too.

## 씬 10. 다시 보기 / Watch Again Later (한국어 음원 2:30–2:40)
- 화면 / Screen: 첫 화면 위쪽 ‘내 영상 보기’ / “My videos” at the top of home
- 화살표 / Arrow: ‘내 영상 보기’ / “My videos”

KO: 로그인하셨다면, / 영상이 내 계정에도 보관됩니다. / 나중에는 위쪽 **‘내 영상 보기’**에서 / 언제든지 다시 열어 보실 수 있습니다.

EN: If you're signed in, your video is also kept in your account. Later, open it anytime from My videos at the top.

## 씬 11. 아웃트로 / Outro (한국어 음원 2:41–2:54)
- 화면 / Screen: ‘이 문장으로 AI 친구와 대화하기’ → 포스터 / “Use these lines with my AI friend” → poster
- 화살표 / Arrow: ‘이 문장으로 AI 친구와 대화하기’ / “Use these lines with my AI friend”

KO: 녹음한 문장으로 / **AI 친구**와 대화도 나눠 보세요. // 재미가 의지를 이깁니다! / **A.i영화더빙**과 함께, / 영어로 나만의 영화를 만들어 보세요. // 감사합니다.

EN: Try chatting with your A.I. friend using the sentences you recorded. Fun beats willpower! Make your very own English movie with A.I. Dubbing. Thank you.
