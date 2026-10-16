# 지사 화면 통합 검색에 AI 도우미 — testbranch 계정에만 (2026-10-14)

## 왜
사장님: 「통합검색 메뉴에 AI 검색 기능 — 궁금한 점을 물어보면 AI 가 답변을 추천하거나, 어느 메뉴에 그 기능·정보가 있는지 알려 주는 것」 → 「testbranch 계정에만 일단 넣어줘」.

## 한 일
- `src/branch-ai-help.ts`(새 정본): 계정 게이트(`BRANCH_AI_USERS = ['testbranch']`), 카드 목록(branch.html 의 `c-*` 11개), 프롬프트, 응답 읽기(문자열·객체 둘 다), 하루 상한 60회(KV `SESSION_STATE`, 못 읽으면 막지 않음), 모델 실패 시 낱말 일치 폴백(`used_ai:false` 로 정직하게).
- `src/api-mango.ts`: **이미 등록된 `/api/admin/omnisearch` 의 비어 있던 POST** 에 `{action:'ai_help'}` 갈래 — `src/index.ts`(공동 금지구역)를 한 줄도 안 건드림. 모르는 action 은 400, 미로그인 401, 강사 403, 그 밖은 정본이 계정 판정.
- `public/branch.html`: 통합 검색 카드에 「🤖 AI 에게 묻기」 버튼(기본 hidden, `/api/admin/me` 가 testbranch 일 때만 보임) · 답 · 「→ 카드이름」 버튼(누르면 그 카드가 열림). 이 계정에 감춘 카드(본사 전용 등)·없는 id 는 안내하지 않음.

## 검토했다 버린 것
- **관리자 AI 엔진(`ai-command.ts`) 재사용** — 회사 전체 DB 를 조회하고 `admin.html` 카드로 안내함. 지사에 열면 남의 지사 자료가 샘. 그래서 «답 + 메뉴 안내» 로만 좁힘(데이터 조회·실행 없음).
- **새 경로 추가** — 3관문(`src/index.ts`) 수정이 필요. 빈 POST 를 쓰는 길로 대체.
- **시연 예시 답변으로 가짜 처리** — 계정이 testbranch 하나라 진짜 AI 를 부르게 함(시연 가로채기 블록은 POST omnisearch 를 원래 잡지 않음).

## 알려 둘 것
- 기존 GET `/api/admin/omnisearch`(이름 검색)는 **지사 범위로 자르지 않고 회사 전체 학생을 찾습니다**(이번 변경과 무관한 기존 상태 — 지사 화면이 그대로 씀). 사람이 정할 일.
- 다른 지사로 넓히려면 서버 `BRANCH_AI_USERS` 와 화면 `AI_HELP_USERS` 를 **함께** 고칠 것(하니스 ⑥이 대조).
- AI 답은 틀릴 수 있어 화면에 그렇게 적었습니다. 실제 답의 품질은 사람이 써 봐야 확정.

## 확인
- `test-harness/branch_ai_help_harness.mjs` 49종(정본을 실제로 돌림) · 변이 5종 실제 FAIL(게이트 열기·지어낸 id 허용·상한 끄기·[object] 가드 끄기·모르는 action 거절 제거).
- tsc: main 대비 새 오류 0 · `run.mjs --fast` main 대비 새 FAIL 0(admin_write_guard 가 잡아 강사 가드 추가).
- 브라우저(로컬 서버 + CDP, API 스텁) 7종: testbranch 만 버튼 보임 · 보이는 카드만 안내 · 카드 버튼으로 열림.
