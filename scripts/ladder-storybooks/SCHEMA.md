# 영어 독서 사다리 전편(176편) → 그림 동화책 페이지 데이터 (한 편 = `data/<id>.json`)

글(본문)은 **`cloudflare-deploy/public/js/reading-ladder-data.js` 의 `sentences[].en` 을 그대로** 씁니다 —
여기에는 본문을 다시 적지 않고 «문단 나누기·역할·활동 재료» 만 적습니다. 본문을 고치거나 문장을 더하지 마세요.

```jsonc
{
  "id": "s1-01",                       // 사다리 글 id 그대로
  "breaks": [2, 3, 2],                 // 문단마다 문장 수 — 합 = 그 글의 문장 수. 1단계 3문단, 2단계 3~4, 3·4단계 4문단
  "key": { "P": 2, "S": 5 },           // ② 핵심 문장 2개(0부터 센 문장 번호, 서로 다름)
  "roleNames": {                       // ② 두 핵심 문장이 무슨 역할인지(이야기: 문제/해결 · 지식 글: 주제/결론 등)
    "P": { "ko": "문제", "en": "problem" },
    "S": { "ko": "해결", "en": "solution" }
  },
  "keyWhy": { "ko": "핵심은 «…(문제)» 와 «…(해결)» 입니다. 초록색 문장이 정답이에요.",
              "en": "The key ideas are the problem (…) and the solution (…). The green sentences are the answers." },
  "boxes": [                           // ③ 요점정리 위 3칸(정확히 3개)
    { "k": "Who",      "qko": "누가 나오나요?",       "qen": "Who is in the story?",  "a": "Max, his family" },
    { "k": "Problem",  "qko": "무슨 문제가 있었나요?", "qen": "What is the problem?",   "a": "…" },
    { "k": "Solution", "qko": "어떻게 해결했나요?",   "qen": "How is it solved?",      "a": "…" }
  ],                                   // 지식 글은 예: Topic / Key fact / Why it matters
  "sumHowto": { "ko": "먼저 위 세 칸을 보고, 빈칸에 알맞은 단어를 고르세요.", "en": "Look at the three boxes, then choose the right word for each blank." },
  "sum": [                             // ③ 요점정리 빈칸 — 정확히 5칸 + 마지막 꼬리(ans:null). 이어 붙이면 영어 요약 문단이 됨
    { "pre": "Max is a small ", "ans": "puppy", "opts": ["puppy","kitten","bird"] },
    { "pre": ". He runs after a ", "ans": "ball", "opts": [...] },
    ...,                               // 5개
    { "pre": " and Max is happy again.", "ans": null }
  ],
  "words": [                           // ④ 핵심단어 정확히 6개: [영어, 한국어 뜻, 예문(본문 문장 또는 그 일부, 그 낱말을 <b>…</b>), 쉬운 영어 풀이]
    ["puppy", "강아지", "Max is a small brown <b>puppy</b>.", "a young dog"], ...
  ],
  "qs": [ /* ⑤ 근거 찾기 정확히 3문항 — 순서대로 type 은 원인·결과 / 문맥상 의미 / 단서 연결 */
    { "type": ["원인·결과","Cause & effect"],
      "q": "Why …?", "qko": "왜 …?",
      "opts": ["…","…","…"],           // 정확히 3개, 정답 1개
      "ans": 1,
      "evq": ["근거 문장 1개를 고르세요.","Choose 1 evidence sentence."],   // ev 개수와 맞게(1개 또는 2개)
      "evs": ["…","…","…","…"],        // 정확히 4개 — 전부 본문 문장 «글자 그대로»(따옴표·쉼표까지). 오답 후보도 본문 문장
      "ev": [1],                       // evs 안 정답 번호(1~2개)
      "why": ["한국어 해설", "English explanation"] },
    { "type": ["문맥상 의미","Meaning in context"], ... },
    { "type": ["단서 연결","Connecting clues"], ... }   // 이건 ev 2개
  ],
  "ends": [                            // 🗳️ 다음 이야기/글 투표 2개: [기호, 영어 한 줄, 한국어 한 줄, 제목]
    ["A","…","…","…"], ["B","…","…","…"]
  ],
  "write": {                           // ⑥ 바꿔 쓰기 — 아래 «허용 틀» 중 하나만
    "pre": "I think", "mid": "because", "sep": " ", "slots": ["cl","cl"],
    "src": "“I think <u>Max is smart</u> because <u>he follows the smell home</u>.”",  // 이 글에 맞춘 예문(틀 모양 그대로)
    "slotKo": ["내 생각","그렇게 생각한 이유"], "slotEn": ["my idea","my reason"],
    "howtoKo": "예문을 틀로 삼아, 빈칸 두 곳을 «내 생각 + 그 이유» 로 바꿔 영어로 써 보세요.",
    "howtoEn": "Use the example as a pattern. Write your own idea and your reason in English.",
    "chips": [ {"a":"it will rain","b":"the sky is dark","label":"rain"}, {…}, {…} ],   // 정확히 3개, 학생 생활 예시 — 2026-10-20 부터 버튼으로 안 그림(철자 점검 «아는 낱말»·첫 칸 placeholder 에만 씀)
    "aria": ["what you think","why"],
    "moreKo": "한 걸음 더: «because» 뒤에 «누가 + 무엇을» 넣어 이유를 분명하게 써 보세요. (예: because he is smiling)",
    "moreEn": "One more step: after «because», write who + what to make your reason clear. (e.g. because he is smiling)"
  },
  "img": {                             // 그림 3장 — 영어 장면 묘사(스타일 말은 빼고 «무엇이 보이는지» 만, 글 내용과 맞게)
    "cover": "…",                      // 표지: 글 전체를 대표하는 한 장면
    "scenes": { "1": "…", "2": "…" }   // 키 = 그 그림이 «앞에 놓일» 문단 번호(0부터, 0 제외). 정확히 2개
  },
  "alt": { "cover": "…", "1": "…", "2": "…" }   // 짧은 영어 설명(그림 대체 글)
}
```

## 허용 틀(⑥) — 이 밖은 쓰지 마세요(채점기 StoryKit 이 'vp'=동사원형으로 시작 · 'cl'=주어+동사 만 압니다)
| pre | mid | sep | slots |
|---|---|---|---|
| `Let’s` | `before` | `" "` | vp, cl |
| `Let’s` | `so that` | `" "` | vp, cl |
| `I think` | `because` | `" "` | cl, cl |
| `I can’t` | `but I can` | `", "` | vp, vp |
| `I want to` | `because` | `" "` | vp, cl |
| `If` | `we can` | `", "` | cl, vp |
| `We should` | `so that` | `" "` | vp, cl |
| `It is important to` | `because` | `" "` | vp, cl |

- 아포스트로피는 `’` (곧은 `'` 아님). `src` 는 `“` `”` 로 감싸고 두 칸만 `<u>…</u>`.
- 1단계(초1~3)는 쉬운 틀(`I think … because …`, `Let’s … before …`, `I can’t …, but I can …`)·쉬운 낱말. 4단계는 `If…, we can…`, `It is important to … because …` 등.

## 규칙
- 한국어 문장 안 강조는 «», 홑낫표 「」 금지. 이모지 금지(필요 없음).
- 영어 칸에 한글 금지. 한국어 칸은 자연스러운 한국어(초등학생이 읽음 — 1·2단계는 아주 쉽게).
- 본문에 없는 사실을 정답·근거로 만들지 마세요. 오답 보기는 «본문에 없는 말» 이나 «본문과 반대» 로.
- 요점정리 오답 보기(opts)는 정답과 같은 품사, 정답 포함 3개.
- 검증: `node scripts/ladder-storybooks/validate.mjs <id>` 가 PASS 여야 합니다.

## ⚠️ 틀(2권)과 묶여 있습니다
`build.mjs` 는 `cloudflare-deploy/public/story-birthday-cake.html` 을 틀로 읽고, `test-harness/ladder_storybooks_harness.mjs` 는
«생성기 결과 == 지금 페이지» 를 그림책 전부(176권) 대조합니다. 그래서 **2권 파일을 고치면 전 권 페이지도 다시 만들어야** 합니다:
`node scripts/ladder-storybooks/build.mjs` (안 하면 무관한 PR 에서 하니스가 빨간불이 됩니다).
포인트는 기존 규칙 `story_read`(10P · 하루 2회)를 4권과 함께 나눠 씁니다.
