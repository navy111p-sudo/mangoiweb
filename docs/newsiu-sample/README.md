# New SIU 샘플 — SIU BASIC 001 «A Talk with You» (2026-09-28)

- 미리보기: https://claude.ai/artifact/3AHU6SANvdFNGAjaSHeidQ (2판 · 18쪽)
- **2판(현재)** `build2.mjs` + `style2.css` — 사장님 「더 흥미진진하고 다이나믹하게」.
  표지 → 오늘의 미션 → 만화 웜업 → VS 투표 → 폴라로이드 낱말 2쪽 → 그림 맞히기 게임 →
  폰 채팅 표현 → 카페 만화 대화 → 잡지 읽기(DO/DON'T) → «대화는 캐치볼» → O/X 퀴즈 →
  2 Truths & 1 Lie → Find Someone Who 빙고 → 역할극 미션 카드 → Would you rather →
  60초 챌린지 → 마무리 복습.
- 1판 `build.mjs` + `siu-basic-001.content.json`(16쪽, 차분한 교재형)은 비교용으로 남겨 둠.
- `jpg/SlideN.JPG` — 1280×720 쪽 그림. 올릴 때 폴더: `SIU BASIC 001 - A talk with you/New/SlideN.JPG`
- `siu-basic-01.say.json` — 쪽별 읽을 문장(18쪽 · 78줄). 키는 새 BTS(`/data/tb-say/bts-NN.json`)와 같은 모양.
- 사진: 저장소의 힉스필드 실사(`img/scene-words`·`img/scene-clips`) + 새로 만든 6장(`gen/` — 표지·미래인·발표자·캐치볼·점프·서퍼).
  새 사진은 프록시가 힉스필드 CDN 을 막아 CI 러너(임시 브랜치)로 받았습니다.
- 다시 만들기: `fonts2.css`(구글 폰트 base64, 깃에 없음)를 만든 뒤 `node build2.mjs && node shot.mjs jpg`.

⚠️ 쪽 내용은 원본 SIU 교재가 아니라 제목·주제(A talk with you)에 맞춰 새로 쓴 것입니다.
⛔ 저장소의 `speech-data-siu-basic.js` 문장(공용 더미)은 쓰지 않았습니다.
⚠️ 미리보기의 🔊 는 브라우저 목소리입니다. 실제 수업 화면 🔊 는 PR #1272 병합 뒤 SIU 이름 규칙을 더해야 뜹니다.
