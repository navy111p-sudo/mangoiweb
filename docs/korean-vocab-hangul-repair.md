# 한국어 단어 뜻 한자 혼입 교정

화면 제보: `풍부한风味의` → `풍미가 풍부한`.

단어퀴즈 `/api/vocab/gen-quiz`는 뜻의 빈 값과 인코딩 오류만 검사했다. 한자는 정상 Unicode이므로 통과했다. 이 경로는 복습퀴즈의 별도 언어 검사기를 거치지 않는다.

## 코드 변경

- 한자(확장·호환 문자 포함)와 일본어 가나가 섞인 한국어 뜻을 검사한다.
- 관측된 문구는 확정된 한국어로 교정한 후 보기 중복 제거와 정답 위치 계산을 한다.
- 새 단어 추가·파일 추출·일괄 추가·AI 자동 생성·동의어 생성에서는 혼입된 뜻을 영어 원어와 예문에 맞춰 한글로 재번역하고 다시 검사한다. 실패한 원문은 일부 글자만 삭제하여 저장하지 않는다.
- 퀴즈에서는 미교정 정답·오답 뜻을 사용하지 않는다. 쓸 수 있는 문제가 없으면 기존 안내 응답을 반환한다.
- 중국어 교재나 중국어 단어장을 대상으로 적용하지 않는다.

## 기존 운영 데이터 전체 교정

운영 DB는 코드 저장소와 별개다. 이 PR 작성 환경에는 Cloudflare DB/AI 인증이 없어 **아직 운영 데이터 조회·교정·배포를 하지 않았다**.

Node 24와 Cloudflare D1 읽기/쓰기 및 Workers AI 권한이 있는 토큰으로 실행한다. 계정·DB ID는 `cloudflare-deploy/wrangler.toml`에서 확인한다. 토큰은 환경변수로만 전달하며 채팅이나 저장소에 쓰지 않는다.

환경변수: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`.

1. `node cloudflare-deploy/scripts/repair-korean-vocab.mjs --translate --plan /secure/gloss-plan.json`
   - `vocabulary.korean`, `en_vocab.ko`, `vocab_synonyms.meaning_ko` 전체를 ID 순으로 페이지 처리한다.
   - 기본은 조회와 계획 저장만 수행한다. 자동 번역 제안은 원어·원래 뜻과 함께 검토한다.
   - 계획 파일에는 원문이 포함되므로 비공개 경로에 보관하고 커밋하지 않는다. `after: null`은 수동 검토 후 한글 뜻을 채운다.
2. `node cloudflare-deploy/scripts/repair-korean-vocab.mjs --apply /secure/gloss-plan.json`
   - 같은 ID와 원문이 여전히 일치할 때만 교정한다. 다른 사람이 수정한 값은 덮어쓰지 않는다.
   - 통계의 `conflicts`·`unresolved`가 있으면 완료로 보고하지 않는다.
3. 새 경로로 다시 전체 검사하여 `mixed: 0`인지 확인한다. 재검사 결과가 전체 교정 완료의 근거다.

기존 완료 퀴즈의 응시 기록과 정답 인덱스는 수정하지 않는다. 새로 시작하는 퀴즈는 수정된 단어 원본에서 생성한다.

## 검증

- 저장소 `cloudflare-deploy/public/data`의 JSON 87개, 문자열 값 221,330개 검사: 한자 0건.
- `node test-harness/korean_vocab_hangul_harness.mjs`: 언어 판별·교정·AI 실패·응답 순서·20개 배치 및 실제 출제 코드의 두 출처를 검증한다.
- 기존 `vocab_encoding_guard_harness.mjs` 15개, `vocab_empty_meaning_guard_harness.mjs` 28개 통과.

전체 운영 데이터 검사 횟수나 수정 건수는 실제 실행 후 기록한다.
