# New SIU 샘플 — SIU BASIC 001 «A Talk with You» (2026-09-28)

- 미리보기: https://claude.ai/artifact/3AHU6SANvdFNGAjaSHeidQ
- `siu-basic-001.content.json` — 쪽 내용(정본). 16쪽 · 새 BTS 한 과와 같은 흐름(인사 → 생각 질문 → 낱말 → 뜻 → 표현 → 대화 → 읽기 2 → 확인 → 토론 → 역할극 → 재미 질문 → 복습 → 인사).
- `jpg/SlideN.JPG` — 1280×720 쪽 그림. 올릴 때 폴더: `SIU BASIC 001 - A talk with you/New/SlideN.JPG`
- `siu-basic-01.say.json` — 쪽별 읽을 문장(63줄). 키는 새 BTS(`/data/tb-say/bts-NN.json`)와 같은 모양.
- 사진: 전부 저장소에 이미 있는 힉스필드 실사(`img/scene-words`·`img/scene-clips`). 새로 만든 사진 0장.
- 다시 만들기: `fonts.css`(구글 폰트 base64, 깃에 없음)를 만든 뒤 `node build.mjs && node shot.mjs jpg`.

⚠️ 쪽 내용은 원본 SIU 교재가 아니라 제목·주제(A talk with you)에 맞춰 새로 쓴 것입니다.
⛔ 저장소의 `speech-data-siu-basic.js` 문장(공용 더미)은 쓰지 않았습니다.
