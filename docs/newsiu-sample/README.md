# 질문 카드 사진 잘림 수정 (2026-10-01)

- 사장님 「사진들이 위에가 모두 잘려서 보여」 — 질문 카드(8~12쪽) 사진 칸이 **118px 고정**(약 5:1)이라 4:3 사진의 가운데 띠만 남아 머리·얼굴이 잘렸습니다.
- 고침(`style7.css` `.qc`·`.qimg`): 사진 칸 = **글이 쓰고 남은 높이(최소 118px)** · **위쪽 25%** 를 남김(`object-position:50% 25%`).
  ⛔ 칸을 고정값으로 키우지 마세요 — 160px 로 해 보니 100판 중 거의 전부에서 글이 잘렸습니다(실측). 지금 판은 넘침·잘림 결과가 고치기 전과 **100판 모두 같습니다**(어려운 판 s13 넘침 1건은 원래부터 있던 것).
- 덤: 9/29 CI 판은 **fonts6 를 빌드보다 먼저** 돌려 한글 글자 목록이 비어, 꼬리말 «💡 뜻 확인 · appliance = 가전제품» 의 한글이 네모(□)로 나왔습니다. 순서는 **빌드 → fonts6 → 다시 빌드** 입니다.
- 사이트 갈아 끼우기 `upload-fix.mjs`(임시 브랜치 `tmp/newsiu-photofix` 의 워크플로) — 바뀐 쪽만 **새 행(새 id)** 으로 넣고 같은 이름의 옛 행은 `active=0`.
  ⚠️ `/api/textbook-files/:id/raw` 는 id 기준 immutable·엣지 캐시라 r2_key 만 바꾸면 옛 그림이 계속 나옵니다. 되돌리기는 파일 머리 주석.

# 사이트 올리기 (2026-09-29 — 사장님 「새 이름으로 따로, 옛것 숨김」)

- 사이트 이름은 **`[NEW SIU BASIC 001 - A talk with you] Easy / SlideN.JPG`** · `… Hard / …` 입니다(ADVANCE 도 같음).
  ⚠️ 앞의 «NEW » 는 옛 SIU 와 묶음 이름을 가르려고 붙였습니다 — 숨김(`textbook_hidden_books`)이 **묶음 이름 단위**라
  같은 이름이면 옛것을 숨길 때 새것까지 숨습니다. ⛔ 떼지 마세요.
- 수업 화면 🔊(`js/idx-vc-tbsay.js` `SIU_RE`)와 문장 파일(`/data/tb-say/siu-*.json`)의 키도 이 이름입니다.
  ⚠️ `build8.mjs` 가 만드는 `say-*.json` 은 아직 옛 모양(`[SIU …] New Easy`)이라, 다시 만들면 키를 바꿔 넣어야 합니다.
- 폴더 만들기 `node pack-new.mjs`(pack/manifest.json) · 올리기 `upload-new.mjs`(깃허브 러너에서 — 올린 행은 `uploaded_by='newsiu-ci-2026-09-29'`).

# NewSIU ADVANCE 20권 (8판, 2026-09-28)

- 미리보기는 BASIC 과 같은 주소(단원 목록 아래 «SIU ADVANCE» 묶음): https://claude.ai/artifact/3AHU6SANvdFNGAjaSHeidQ
- 파일 이름 `units/a001.mjs` ~ `a020.mjs`, 만들기 `node build8.mjs a001 easy|hard` → `u/a001/` (a 로 시작하면 표지·꼬리말이 «SIU ADVANCE»).
- 원본: 구글 드라이브 `SIU -Advance(PDF)/NNN - …(Korean).pdf`. 20쪽 · 말하기 168 / 211번 구조는 BASIC 과 같음.
- 수준: 쉬운 판 = 중고등(2~3문장 + 빈칸 틀), 어려운 판 = 성인(4단 대답 + 생각 질문 3개). 판 자동 선택 기준도 한 단계 위(수준 6 이하·17세 이하 = EASY).
- 민감 주제(Crime·Punishment·Politics·Relationship and Love·Beauty·Education Q4)는 쉬운 판에서 규칙·공정·친구·가족·건강으로 돌려 말하게 했고, 어려운 판에서만 직접 다룸.
  ⚠️ 질문 10개는 원본이라 두 판이 같습니다 — 쉬운 판에도 질문 자체(사형·낙태·데이트 나이 등)는 그대로 보입니다.
- a003 원본 PDF 에는 2번 질문 쪽이 없어(10번이 두 번) 퍼즐 낱말 Slim 으로 새로 만들었습니다 — 실제 책과 대조 필요.

# NewSIU BASIC 30권 (8판, 2026-09-28)

- 미리보기(30권): https://claude.ai/artifact/3AHU6SANvdFNGAjaSHeidQ — 단원 고르기 · 판 자동 선택 · 쪽 넘기기 · 문장 듣기(001 녹음, 나머지 브라우저 목소리)
- 구조는 7판 그대로(20쪽 · 쉬운 판 말하기 168번 / 어려운 판 211번). 단원 내용만 `units/NNN.mjs` 로 분리(쓰는 법 `units/GUIDE.md`).
- 원본: 구글 드라이브 `SUI - Basic(PDF)/NNN - …(Korean).pdf` 의 질문 10개 · Keyword 10개 · 문법. 원본 영어 오류 수정 목록은 각 `units/NNN.mjs` 머리 주석 «원본과 다른 점».
- 만들기: `node build8.mjs NNN easy|hard` → `u/NNN/` · 글꼴 `node fonts6.mjs`(전 단원 한글 모아 굽기) 뒤 다시 build8 ·
  찍기 `PORT=9501 node shot.mjs $PWD/u/NNN/slides-easy.html u/NNN/jpg-easy`(overflow·**clipped** 둘 다 none 이어야 함) ·
  미리보기 `node sprite.mjs 001 … 030 && node hub.mjs`.
- 쪽 JPG(`u/*/jpg-*`, 약 150MB)와 미리보기 띠(`sp/`)는 다시 만들 수 있어 깃에 넣지 않았습니다. 사이트에 올릴 폴더(제안): `[SIU BASIC NNN - 이름] New Easy / SlideN.JPG` · `… New Hard / …`.
- 사진은 저장소 기존 사진만(`node findimg.mjs 낱말`). 맞는 사진이 없던 낱말(beggar·vomit·liquor·kiss·hitchhiker·slap·blood donation 등)은 가장 가까운 사진으로 대신함.

# New SIU 샘플 — SIU BASIC 001 «A Talk with You» (2026-09-28)

- 미리보기: https://claude.ai/artifact/3AHU6SANvdFNGAjaSHeidQ (**7판** · 쉬운/어려운 판 각 20쪽 · 판 자동 선택 · 문장별 소리)
- **7판(현재)** `build7.mjs` + `content7.mjs` + `style7.css` — 사장님 「국내외 잘 만든 출판사 교재들을 잘 보고 다시 · 말은 더 많이」.
  - 출판사 장치: 쪽마다 **I can 목표**(Cambridge Four Corners·Evolve) · Think-Pair-Share 도입(NGL) · 낱말마다 말하기(Oxford Speak Now) ·
    **모범 대화 → 색칠한 말 바꿔 말하기**(Interchange) · 대화 전략(Useful language) · 질문 카드 5쪽 · **설문**(Smart Choice) · **정보차 A/B 카드**(British Council) ·
    역할극 · **Time to speak** 과제(Evolve) · 모범 발표 → 개요 → 발표(Compass Speaking Time) · 발음(-s 세 소리·억양) · 돌아보기.
  - 망고아이는 **1:1 화상**이라 짝·모둠 활동을 전부 «학생 ↔ 선생님» 으로 바꿨습니다(설문 = 나 / 선생님, 정보차 = 선생님 A 카드 / 학생 B 카드).
  - 쪽마다 **🗣 My turns ×N**(학생이 말하는 횟수)를 적고 합계를 표지·돌아보기에 보여 줍니다 — 쉬운 판 **168번** · 어려운 판 **211번**(`turns7-*.json`). 6판은 이런 셈이 없었습니다.
  - 다시 만들기: `node build7.mjs easy && node build7.mjs hard && node fonts6.mjs && node build7.mjs easy && node build7.mjs hard && node shot.mjs slides7-easy.html jpg7-easy && node shot.mjs slides7-hard.html jpg7-hard && node tts6.mjs say7-easy.json say7-hard.json && node preview6.mjs 7`
  - 올릴 때 폴더(제안): `[SIU BASIC 001 - A talk with you] New Easy / SlideN.JPG` · `… New Hard / …` (문장 = `say7-easy.json`·`say7-hard.json`).
  - **판 자동 선택(제안 · 미리보기에서만 시연)**: 사이트 수준 1~4 → EASY, 5~8 → HARD · 수준이 없으면 나이(12세 이하 EASY) · 둘 다 모르면 EASY.
    ⚠️ `students_erp` 의 나이·학년 칸은 비어 있어 실제 사이트에서는 **수준(웜업·레벨테스트)** 이 근거가 됩니다. 사이트에 붙이는 것은 PR #1272 병합 뒤 별도 코드 작업(승인 필요).
- **6판** `build6.mjs` + `content6.mjs` + `style6.css` — 잡지 «TALK!» 형식 · 쉬운/어려운 판(`jpg-easy/`·`jpg-hard/`·`preview6.html`).
- 소리: `audio/*.mp3`(문장 해시 이름 · `audio-map.json`) — **미리보기 전용** 구글 번역 음성. 실제 수업은 사이트 목소리로 읽습니다.

- **4판** `build4.mjs` + `style4.css` — 사장님 「한글 뜻 처리 + 더 흥미롭고 신나게」.
  - 한글 뜻: **짐작 → 확인** — 질문 쪽 카드에서 한글을 빼고 쪽 맨 아래 작은 회색 각주(`.kfn`)에만 둠. 17쪽 «Meaning Match» 게임(선 잇기)에서 처음 크게 보여 줌. 문법 용어(조동사·주어·명사)와 Fix it! 정답도 각주로.
  - 구성: 게임쇼 «The Talk Show Game» — 게임 지도(Level 1 Grammar Gym · Level 2 Question Quest · Level 3 Meaning Match · Crossword Boss), ⭐ 20개 모으기, 질문 10개마다 다른 미니게임(Reason Race·Guess Where·Charades·Dream Pet·Mime It·Compliment Chain·Top 3·Super Helper·Mini Teacher·Find a Match), Stand up! O/X, 마지막 Hot Seat 인터뷰 + 별 세기.
- **3판** `build3.mjs` + `style3.css` + `crossword.mjs` — 사장님 「구글 드라이브 원본을 참고로 다시」.
  원본: 구글 드라이브 `SIU/SIU BOOKS/SUI - Basic(PDF)/001 - A talk with you(Korean).pdf`(2019, 15쪽).
  원본 순서 그대로: 표지 → Simple Present → Are you a student? → 동사 표(like) → 질문 10개(Keyword·뜻·답 시작말) → 낱말 퍼즐.
  더한 것: 오늘의 미션 · Fix it! 게임 · 질문마다 «Ask back» 되묻기 · 인터뷰 챌린지. 퍼즐은 원본 낱말 10개로 실제 풀 수 있는 판을 만듦(정답 `crossword-answer.json`).
  **원본과 다른 점(원본 오류 바로잡음):** He/She/It **like** kimchi → **likes** · What is your **sports**? → What is your **favorite sport**? ·
  What is the best thing that **describe you** friend? → What is the best thing **about your friend**? · What **will** you like to teach? → What **would** you like to teach someone? ·
  What can you do to help → **How can you** help · 낱말 뜻은 원본 사전식 풀이를 쉬운 영어로 줄임 · won't 철자 등.
- 2판 `build2.mjs`(주제만 보고 새로 쓴 게임형 18쪽)은 비교용으로 남겨 둠 — ⚠️ 옛 판(build2·build3)을 다시 돌리면 현재 jpg·say.json 을 덮어씁니다.
- **2판** `build2.mjs` + `style2.css` — 사장님 「더 흥미진진하고 다이나믹하게」.
  표지 → 오늘의 미션 → 만화 웜업 → VS 투표 → 폴라로이드 낱말 2쪽 → 그림 맞히기 게임 →
  폰 채팅 표현 → 카페 만화 대화 → 잡지 읽기(DO/DON'T) → «대화는 캐치볼» → O/X 퀴즈 →
  2 Truths & 1 Lie → Find Someone Who 빙고 → 역할극 미션 카드 → Would you rather →
  60초 챌린지 → 마무리 복습.
- 1판 `build.mjs` + `siu-basic-001.content.json`(16쪽, 차분한 교재형)은 비교용으로 남겨 둠.
- `jpg/SlideN.JPG` — 1280×720 쪽 그림. 올릴 때 폴더: `SIU BASIC 001 - A talk with you/New/SlideN.JPG`
- `siu-basic-01.say.json` — 쪽별 읽을 문장(19쪽 · 90줄). 키는 새 BTS(`/data/tb-say/bts-NN.json`)와 같은 모양.
- 사진: 저장소의 힉스필드 실사(`img/scene-words`·`img/scene-clips`) + 새로 만든 6장(`gen/` — 표지·미래인·발표자·캐치볼·점프·서퍼).
  새 사진은 프록시가 힉스필드 CDN 을 막아 CI 러너(임시 브랜치)로 받았습니다.
- 다시 만들기: `fonts2.css`(구글 폰트 base64, 깃에 없음)를 만든 뒤 `node build4.mjs && node shot.mjs jpg`.

⚠️ 1·2판은 원본을 보기 전에 주제만 보고 새로 쓴 것입니다. 3판부터 원본 기준입니다.
⛔ 저장소의 `speech-data-siu-basic.js` 문장(공용 더미)은 쓰지 않았습니다.
⚠️ 미리보기의 🔊 는 브라우저 목소리입니다. 실제 수업 화면 🔊 는 PR #1272 병합 뒤 SIU 이름 규칙을 더해야 뜹니다.
