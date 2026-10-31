# NewSIU 단원 파일 쓰는 법 (8판)

- 본보기: `units/001.mjs` — 모든 칸의 모양이 이 파일에 있습니다. **같은 키·같은 모양**으로 `units/NNN.mjs` 를 씁니다.
- 만들기: `node build8.mjs NNN easy && node build8.mjs NNN hard`
- 찍기: `PORT=<내 포트> node shot.mjs $PWD/u/NNN/slides-easy.html u/NNN/jpg-easy` (hard 도 같게, 사이에 `sleep 2`)
  - `overflow: none` 이어야 합니다(글이 칸 밖으로 넘침 = 글을 줄이세요). 어려운 판 13쪽 `s13:1` 은 1° 기울인 상자라 무해합니다.
  - 한글 각주가 □ 로 보이는 것은 정상입니다(글꼴은 마지막에 한꺼번에 다시 굽습니다).
- 사진: `node findimg.mjs <낱말> ...` → 저장소에 실제로 있는 사진 id(`scene-words/12001` 등). **없는 id 를 지어내지 마세요.**
  - `IMG_E`·`IMG_H` = 질문 10개 사진(낱말·질문 뜻에 맞게), `PICS` = opener·talk·group·speech·reporter·survey·pron·roleB·cover·back.
  - cover·back 은 가로로 넓은 «사람이 있는» 사진(단원 주제와 맞게).

## 내용 규칙
- 뼈대 = 원본 PDF 의 **질문 10개 · Keyword 10개 · 문법**. 원본 영어가 틀렸으면 바로잡고(예: 001 He like → likes) 파일 머리 주석에 «원본과 다른 점» 을 적습니다.
- `KW` = [낱말, 품사(noun/verb/adjective…), 한글 뜻, 쉬운 영어 뜻]. 한글은 각주에만 나옵니다.
- **게임 금지** — 말하기 활동만. 1:1 화상이라 짝 활동은 «학생 ↔ 선생님».
- `E`(쉬운 판, 초등) = 2문장 대답 + 빈칸 틀(`___`) + 낱말 고르기(`bank`) · `H`(어려운 판, 중고등~성인) = 4문장(대답·이유·예·되묻기) + 생각 질문 3개.
- 문법 쪽(`gram1`·`gram2`)은 **그 단원 원본 문법**으로 바꿉니다(`title`/`em`/`rules`/`cols`/`rows`/카드 두 장). 표 `rows` 첫 칸은 `+` `−` `?` 중 하나.
- 대화·설문·정보차(A/B 카드)·역할극·Time to speak·발표·발음도 **그 단원 주제**로 새로 씁니다. 발음은 그 단원 문장에 나오는 것(억양·축약·강세·-ed 소리 등).
- 대화의 `{낱말}` = 학생이 바꿔 말할 색칠 칸, `swap` 은 그 칸 설명 4개.
- 이모지는 Unicode 12 이하만. 한 문장은 짧게(쪽 넘침 주의).
- `next` = 다음 단원 «NNN 제목», 030 은 `next: ''`.
