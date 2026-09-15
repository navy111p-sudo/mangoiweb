# 관리자 화면 로딩 — HTML ETag 를 「배포 시각」이 아니라 「파일 내용」 기준으로

- 날짜: 2026-09-15
- 작업자: Claude Code
- 브랜치 / PR: claude/happy-johnson-3gbj4k

## 1. 왜 했나

사장님 제보(`mangoi.ai/admin.html` 실제 화면 스크린샷 첨부): "작업을 할 때마다 너무
로딩이 심해서 작업에 시간이 소요 돼. 로딩 시간을 줄여줘."

읽기 전용으로 원인을 조사해 사장님께 보고했고, 세 선택지 중 **"네, 진행해주세요
(추천)"** 를 골라 `src/index.ts`(공동 금지구역) 수정을 명시적으로 승인받았다.

## 2. 무엇을 바꿨나

- `cloudflare-deploy/src/index.ts` — `htmlEtag304()` 함수(정의는 141행 부근) 하나만
  고쳤다. **6개 호출부는 한 글자도 안 건드렸다** — 모든 호출부가 이미
  `new Headers(xResp.headers)` 로 `headers` 를 만든 뒤 이 함수를 부르고 있어서,
  Cloudflare Assets 가 워커 안에서 실어 주는 파일별 ETag(`headers.get('ETag')`)가
  함수 안에서 그대로 읽힌다.
  - 예전: `tag = W/"b-<BUILD_STAMP>"` — 오직 `env.BUILD_STAMP`(사이트 전체
    배포 시각, 하루에도 여러 번 바뀜) 하나로 모든 HTML 파일의 ETag 를 만들었다.
  - 지금: `headers.get('ETag')` 로 읽은 **그 파일 고유의 native ETag** 를 우선
    사용(`nativeTag || stamp`)하고, native 를 못 구했을 때만 예전처럼 stamp 로
    폴백한다. Last-Modified 는 여전히 stamp 기준(native 에는 시각 정보가 없다) —
    그쪽은 예전과 동일하게 남겨 뒀다(아래 3절 참고).
- `test-harness/html_etag_native_harness.mjs` (신규) — 위 함수를 소스에서 그대로
  오려 내(중괄호 짝) TS 타입만 벗기고 `new Function` 으로 실제 실행하는 하니스.
  18개 검사, A부(핵심 수리: 배포가 갈려도 파일 내용이 같으면 304)·A-2부(파일이 실제로
  바뀌면 304 를 거짓으로 주지 않는다)·B부(native ETag 를 못 구했을 때 예전 동작 보존)·
  C부(범위 밖 동작 무사)·M부(변이시험 — `basis = stamp` 로 되돌리는 변이를 메모리
  안에서만 만들어 A부가 실제로 무너지는지 확인, 디스크 파일은 안 건드림).

## 3. 왜 그렇게 풀었나 — 검토했다가 버린 방법

- **응답 본문을 매 요청마다 직접 해시(sha1 등)해서 검증자로 쓰는 방법** — 버렸다.
  `index.html` 같은 파일은 29,000명 학생이 매번 여는 경로라, 요청마다 본문 전체를
  해시하는 것은 Worker CPU 시간을 크게 태운다. Cloudflare Assets 가 이미 워커 안에서
  파일별 ETag 를 공짜로 계산해 주고 있는데(기존 2026-07-22 주석이 이미 확인해 둔
  사실) 이것을 다시 만드는 것은 낭비다.
- **`BUILD_STAMP` 와 native ETag 를 이어 붙여 하나의 비교 문자열로 만드는 방법**
  (`<stamp>-<nativeTag>` 형태) — 버렸다. 그러면 stamp 부분이 배포마다
  바뀌므로 합친 문자열도 매번 달라져, 정작 고치려던 문제(파일 내용이 안 바뀌었는데도
  배포 때마다 재다운로드)가 그대로 남는다. `nativeTag` 를 **단독** 기준으로 쓰고
  `stamp` 는 (native 가 없을 때만 쓰는) 폴백으로 완전히 분리해야 했다.
- **호출부 6곳에 `nativeTag` 파라미터를 새로 추가해 명시적으로 넘기는 방법** — 처음엔
  이 방식을 계획했지만, 6곳을 전부 읽어 보니 이미 `headers` 자체가 각 호출부의
  `xResp.headers`(= native ETag 포함)를 담고 있어서 **함수 시그니처를 한 글자도
  안 바꿔도** `htmlEtag304()` 안에서 `headers.get('ETag')` 한 줄로 끝났다. 호출부를
  건드리지 않는 쪽이 diff 도 작고, 6곳 중 하나라도 변수명을 잘못 넘길 위험도 없어
  더 안전했다.
- **Last-Modified 도 native 기준으로 바꾸는 방법** — 버렸다. native ETag(해시값)에는
  날짜 정보가 없다. If-Modified-Since 경로는 If-None-Match 가 없을 때만 쓰이는
  보조 경로(HTTP 스펙상 우선순위가 낮음)라, 이번 수리로 ETag 경로가 주력이 된 이상
  그 보조 경로는 예전과 똑같이 둬도(=배포마다 재검증 실패) 실질적인 퇴행이 아니다.

## 4. 확인한 방법

- `cd cloudflare-deploy && node node_modules/typescript/bin/tsc --noEmit` → 통과
  (0 에러).
- `node test-harness/build_stamp_harness.mjs` → PASS 9 / FAIL 0. 이 함수를 이미
  지키던 기존 하니스(BUILD_STAMP 관련)가 여전히 통과하는지 확인. 처음 커밋 때
  새로 넣은 주석이 이 하니스의 `{0,2000}` 길이 창을 넘겨 `status: 304` 검사가
  FAIL 했다 — 내 주석을 줄여서 해결(하니스 창을 넓히는 대신 내 diff 를 줄이는
  쪽을 택함, CLAUDE.md 「가장 안전한 수정」 원칙).
- `node test-harness/html_etag_native_harness.mjs` (신규) → PASS 18 / FAIL 0,
  변이시험(M부)에서 `basis = stamp` 로 되돌리는 변이를 메모리에서 적용하니 A부의
  핵심 케이스가 실제로 무너지는 것을 확인 — 이 하니스가 실제로 이 사고를 잡는다는
  뜻.
- `node test-harness/run.mjs --fast` → 344개 하니스(신규 1개 포함) 전부 `▶` 줄
  기준 `⚠` 0건, `📌 기준선 유지(fast): PASS 344 ≥ 140 · SKIP 20 ≤ 20`.
- `git status --short` → `cloudflare-deploy/src/index.ts` 한 파일만 수정, 신규
  하니스 파일 하나만 추가. 변이시험이 디스크 파일을 건드리지 않았는지도 확인함.
- ⚠️ **실제 배포된 사이트 화면은 확인하지 못했다** — 이 작업 환경의 프록시가
  `mangoi.ai` 를 막아 직접 접속이 안 된다(CLAUDE.md 4-1-1 에 이미 적힌 제약).
  배포 뒤 사람이 브라우저 개발자도구 네트워크 탭에서 `admin.html` 재방문 시
  `304 Not Modified` 가 뜨는지 한 번 확인하는 것이 좋다.

## 5. 남은 것 / 주의할 것

- 이번 수리로 **관리자 화면이 한 글자도 안 바뀐 배포**에서는 다음 방문이 304 로
  가벼워진다. 다만 **admin.html 자체를 고친 배포**에서는(거의 매번 그렇다 — 이
  세션에서도 `?v=` 를 여러 번 올렸다) 여전히 그 화면 전체를 다시 받는다. 이건
  당연한 동작이고 버그가 아니다.
- 대화 중 제안했던 두 번째 아이디어(`admin.html` 안의 방대한 `<!-- v=N: ... -->`
  변경이력 주석(~197KB)을 외부 문서로 옮겨 파일 자체 무게를 줄이는 것)는
  **승인받지 않았다** — 사장님이 고른 선택지는 이번 ETag 수리 하나였다. 필요하면
  따로 요청해야 한다.
- `admin.html` 을 부르는 `js/adm-core.js` 가 1.15MB(340KB gzip) 단일 파일이라,
  거의 모든 관리자 기능 변경이 그 파일의 캐시를 깨뜨린다는 점은 이번에 손대지
  않았다 — 반경이 훨씬 큰 별도 리팩터링이라 이번 범위 밖으로 남겨 뒀다.
