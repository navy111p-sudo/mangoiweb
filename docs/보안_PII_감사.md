# 🔒 PII / IDOR 보안 감사 + 처리 계획

감사일: 2026-07-10 (Claude 전수 감사). 대상: `cloudflare-deploy/src` 비관리자 API 전체.

> **한 줄 요약(원본, 2026-07-10):** 인증 도구는 있으나 5개에만 적용, 수십 개가 IDOR 상태였음.
>
> **🔄 2026-07-19 재검증 업데이트:** 그 사이 IDOR 작업이 크게 진척돼 **§3 HIGH 항목이 사실상 전부 닫힘**(라이브 무인증 401 확인): parent/dashboard·report/monthly-view(공유토큰)·kakao-id·consents·eval/list·chat/messages·parent/link-child·voice/history·voice/stats·gifts/redemptions·diary/list 모두 인증됨. livekit/token은 미설정(503)·앱 미사용. **잔여로 발견·수정: `GET /api/exam/results?user_id=`(남의 시험점수 200 노출) → authUidFromRequest uid일치 요구 + idx-x4.js `?token=` 첨부. 데모학생 검증(무인증401·본인토큰200·타uid401), build 20260719112301.**
> **🔄 2026-07-19 2차:** `GET /api/chat/messages` 는 이미 방참여자 인증됨(2026-07-11, 라이브 401 재확인)이나 **`POST /api/chat/messages` 가 무인증이라 방ID 추측으로 가짜 발신자(role='teacher')·남의 수업에 메시지 주입 가능**한 무결성 구멍 발견 → GET과 동일한 이중 인증(관리자/교사 쿠키세션 OR 학생 mango_token+vc_roster 참여확인) + 학생 sender_uid 위조방지(인증 uid로 고정) 추가. 프론트(index.html vcSendChat)도 token 첨부. **실시간 채팅은 WebRTC(vcConn) 별도라 저장 거부돼도 수업 안 끊김.** 라이브 통제검증: 무인증 401 / 참여자(로스터+데모토큰) 200 / 저장 sender_uid=인증값 고정(spoof 무시) / 같은토큰·타방 401. build 20260719152411. 부수확인: **prod ROOM_JWT_SECRET 설정됨**(폴백상수 토큰 401·실토큰만 200 → 위조 불가). 남은 것은 §4 MEDIUM(포인트·퀴즈·출석 등 저민감, 게스트 지원)과 외부 pentest 권장(§6).

---

## 1. 근본 원인 (구조적)

- 코드에 이미 있는 안전장치: `api-mango.ts`의 `authUidFromRequest(body)` — 로그인 시 발급되는 `mango_token`(HMAC 서명)의 uid 와 요청 uid 가 **일치해야만** 통과.
- 그런데 이게 적용된 곳은 `/api/ai/chat-*`, `/api/ai/write-history` **딱 4~5개**뿐.
- 나머지 학생·학부모·강사 대상 개인정보 API 대부분은 클라이언트가 보낸 uid/phone/id 를 **그냥 믿음**. uid(`student_XXXX`)·방ID(`class-{id}-{날짜}`)·정수 id 는 추측/열거가 쉬워 **실제 악용 가능**.

## 2. ✅ 이미 조치 완료 (2026-07-09~10)

| 조치 | 내용 |
|---|---|
| 관리자 API default-deny | `/api/admin/*` 전부 인증 필요로 전환(수십 개 무인증 노출 차단) |
| write-history 토큰 인증 | 남의 첨삭이력 조회 차단 |
| 학원랭킹/기프트시드 | 전용 공개 엔드포인트로 대체(전 학생 상세 노출 제거) |
| **대량 덤프 5종 잠금(07-10)** | `kakao-id/teachers`(전강사 전화), `parent/digest/*`(전학부모 전화·메시지), `eval/ai-lesson-report/list`(전학생 리포트), `alumni/list`, `recordings/check` → 관리자 전용. **라이브 401 확인** |
| **돈/계정 도메인(07-10 2차)** | `gifts/redeem` → mango_token 소유자검증(남의 포인트로 기프티콘 탈취 차단, 정상 학생 회귀 없음 검증), `set-password`(계정탈취)·`subscription/create`(무단구독) → 관리자 전용. **라이브 401 + 정상통과 확인**. 표준도구 `auth-token.ts` 신설 |

## 3. 🔴 남은 HIGH — 민감 PII (전화·결제·영상·계정탈취) — 우선 처리

| 경로 | 위험 | 처리방법 |
|---|---|---|
| `POST /api/student/set-password` | 계정 claim(학부모 잠그기 흐름에 사용) — 비번없으면 최초설정, 있으면 옛비번 검증 | 유지(claim) |
| ~~`GET /api/parent/dashboard`~~ ✅ | 자녀 전체정보+결제 | **비밀번호 로그인 토큰 인증 완료(07-10, 라이브 검증)**. 발견: parent_phone/name 전원 0개→전화인증 불가라 비번방식 채택 |
| ~~kakao-id/*, consents/*, parent/link-child, parent/my-children~~ ✅ | 전화·IP·자녀연결 | 관리자 전용 잠금 완료(07-10) |
| `GET /api/parent/dashboard?child_uid=` | 자녀 전체정보 + **학부모 전화 + 결제내역** | 학부모 토큰 인증 |
| `GET /api/report/monthly/{uid}/{ym}` | 월간 리포트 + **결제 총액** (uid가 URL에) | 토큰/공유토큰 인증 |
| `GET /api/kakao-id/{userId}` · `POST /api/kakao-id` | 임의 유저 전화·kakao_id 조회/덮어쓰기 | 토큰/관리자 인증 |
| `POST /api/gifts/redeem` ✅ · `GET /api/gifts/redemptions?uid=` | ~~기프티콘 탈취~~(redeem 완료 07-10) + 교환내역 전화(redemptions 남음) | redeem=토큰검증 완료 / redemptions=토큰 필요 |
| `GET /api/consents/{userId}` | **전화·IP·기기정보** | 토큰/관리자 인증 |
| `GET /api/eval/list` · `/api/eval/{id}` · `DELETE /api/eval/{id}` | 남의 평가 조회·삭제 | 토큰/관리자 인증 |
| `GET /api/eval/ai-lesson-report/{id}` | **수업 전사 전문** + 신원 (정수 id) | 토큰/관리자 인증 |
| ~~`GET /api/chat/messages?room_id=`~~ ✅ · ~~`POST /api/chat/messages`~~ ✅ | 수업 채팅 전문 조회·주입 | GET=방참여자 인증(07-11), POST=이중인증+발신자 위조방지(07-19 2차). 라이브 통제검증 완료 |
| `recordings/stream/{id}`✅ · `student/recordings`✅ · `blob/{key}`🟡 | **미성년자 수업 영상** | stream=관리자잠금, student/recordings=토큰인증 완료(07-10). blob은 설계상 공개나 열거벡터(list-recent) 잠금으로 키획득 어려워짐. 잔여=서명URL |
| ~~eval/ai-lesson-report/{id}, recordings/list-recent~~ ✅ | 전사·전체녹화덤프 | 관리자 잠금 완료(07-10) |
| `GET /api/voice/history?uid=` `GET /api/voice/stats?uid=` | 발화연습 전사·점수 | 토큰 인증 |
| `POST /api/parent/link-child` | 아무 학생을 공격자 학부모에 연결 | 토큰/관리자 인증 |
| `POST /api/livekit/token` · `POST /api/rooms/{id}/join`(allow_open) | 아무 방 실시간 A/V 접근 | 방 소유 검증 강화 |
| `POST /api/subscription/create` | 임의 유저 구독 생성 | 토큰/관리자 인증 |

## 4. 🟡 MEDIUM (요약)

포인트/점수/일기/출석/퀴즈/보상/평가작성/방입퇴장/가족정보 등 **약 40개**가 uid 기반 무인증 조회·쓰기(2026-07-10 기준). 대표: ~~`points/balance`·`earn-by-rule`·`award-praise`~~ ✅, `diary/*`(업로드·조회·수정 — 07-10 완료), ~~`voice/coach`~~ ✅, ~~`review-quiz/*`~~ ✅, ~~`streak/check-in`~~ ✅, `attendance/*`(join·checkin — 시그널링/QR 흐름, 확인 필요), `class/sessions/today`, `webhook/kakao-inbound`(phone→uid 오라클). 전체 목록·라인번호는 이 감사 원본(세션 기록) 참조.

> **✅ review-quiz 도메인 완료(2026-07-19 2차, build 20260719153524):** `list`=실계정 개인통계(최고점·시도수)는 본인 토큰만(불일치 시 401 대신 **통계만 익명화**→페이지 안 깨짐), `submit`=실계정 남 대신 제출(기록 오염+포인트 적립) 401 차단. **게스트(guest_*, 랜덤·추측불가)는 둘 다 토큰 없이 그대로**(게스트 흐름 무영향). 프론트 review-quiz.html·idx-x8.js token 전송+401 시 게스트 폴백(수업 흐름 안 끊김). 라이브 6케이스 검증(게스트404통과/실계정무토큰401/본인토큰404통과/타uid401/무토큰 list 통계0건/본인토큰 통계1건).
>
> **✅ 포인트 도메인은 이미 완료였음(2026-07-11 자, 07-19 재확인):** `earn-by-rule`·`award-praise`·`vc/roster` 모두 게스트 예외+토큰/관리자 인증이 이미 적용돼 있었음(§4 목록이 stale). `points/balance`·`streak/status`는 스모크의 IDOR 가드 테스트로 상시 검증 중.
>
> **✅ streak/check-in + voice/coach 완료(2026-07-19 3차, build 20260719161852):** 둘 다 무인증 쓰기였음 — check-in=임의 uid 스트릭·보석 조작, voice/coach=임의 uid 연습기록 오염(발화이력·학부모 화면 노출)+Workers AI 소모. 게스트 예외+토큰/관리자 패턴 적용, 프론트 streak.html(401=재로그인 안내—게스트로 몰래 기록하면 진짜 스트릭 안 쌓여 기만적이므로)·speech-coach.html(401=게스트 폴백 재채점—점수 표시 유지) token 전송. 라이브 7케이스 검증(게스트200/무토큰401/타uid401/본인토큰200 ×2엔드포인트)+테스트 행 정리.
>
> **✅ webhook/kakao-inbound 전화→uid 오라클 차단(2026-07-19 4차, build 20260719162730):** 무인증 webhook(외부 SOLAPI/카카오 호출)이 응답에 `mapped_user_id`(전화번호로 매칭된 학생 uid)를 그대로 돌려줘, 전화번호를 POST 하며 등록여부+uid 를 열거할 수 있는 오라클이었음. **응답에서 `mapped_user_id`·`room_id` 제거**(매핑은 서버 내부 저장·채팅삽입에만 사용, 외부 반환 안 함). 카카오 openbuilder 는 `reply` 만 쓰므로 무영향, 관리자 로그(`/api/admin/kakao/inbound`)는 인증돼 있어 별개. 라이브 확인(응답 키=ok·id·reply, mapped_user_id 미노출). ⚠️잔여: 무인증 injection(가짜 학부모 메시지 주입)은 SOLAPI/카카오 **webhook 서명검증 시크릿**을 오너가 설정해야 근본 차단(별도 후속).
>
> **✅ attendance/join·checkin — 제로회귀 소프트 인증 완료(2026-07-19 5차, build 20260719165208):** 조사 결과 교사는 mango_token 이 아니라 **관리자 세션 쿠키**(/admin/login.html→admin_sessions, checkAdminSession 은 role 무관 통과)로 인증되고, 출석 호출부(mango-attendance.js)가 `credentials:'include'` 라 쿠키 전송됨. 이를 활용해 **소프트 가드** 신설(`_attnSoftAuthOk`): ①관리자세션 쿠키 있으면 허용(교사) ②mango_token 있으면 본인 uid 일 때만 허용 ③**자격증명 아예 없으면 그대로 통과**(결석버그 방어 유지=회귀 0) ④토큰이 남의 uid 면 403(인증된 위조만 차단). 프론트는 학생만 token 전송(교사는 쿠키만—잔여토큰 오탐 방지). 라이브 5케이스 검증(무자격증명 checkin/join 200·본인토큰200·타uid 403 ×2). **한계(의도적)**: 자격증명 아예 안 보내는 익명 위조는 여전히 가능(저심각 무결성, 완전차단=결석버그 재발 위험이라 트레이드오프). 완전강제는 실수업 로그로 "무자격증명 legit 비율" 확인 후 별도 판단.
>
> 🔴 **정정(2026-09-04):** 위 「본인토큰 200」 검증은 **`user_id` 칸에 계정 아이디를 넣어 보낸** 검증이었던 것으로 보입니다[추론 — 이 문서에 그때의 payload 가 없고, 옛 코드에서 200 이 나오려면 그럴 수밖에 없습니다. 7/19 당시 클라이언트(`1a1024641`)도 `user_id: state.userId` 였음은 확인]. 실제 클라이언트(`mango-attendance.js`)는 `user_id` 에 **기기 식별자(`u_`+난수) 또는 DO 임시번호**를 싣고 계정은 `account_uid` 로 따로 실으므로, **토큰을 실은 로그인 학생은 7/19 부터 2026-09-03 까지 403 `uid_mismatch`** 였습니다(통과한 것은 토큰 없는 요청과 관리자 세션의 교사뿐). 운영 D1 실측(2026-09-03): `attendance.account_uid` 가 남은 계정이 전 기간 4개(관리자 `jeong` 외 셋은 «계정은 있는데 토큰은 없던» 로그인으로 보임 — 추론). 🛠 2026-09-04 **수리 배포(PR #795 → `23f6a2671` → 배포 run 33833395663 success, 2026-09-04 03:37 UTC)**: 출석 호출부의 비교 대상을 `account_uid` 로(계정 칸이 비면 통과 — ③의 회귀 0 원칙 유지, ④의 위조 차단은 «남의 계정을 `account_uid` 에 적으려는» 요청에 그대로). ⚠️ `user_id` 에 남의 계정을 넣는 익명·토큰 요청은 여전히 막지 않습니다 — 위 「한계(의도적)」와 같은 수준입니다. 동의(`consents`) 호출부는 그 파일이 `user_id` 에 계정을 싣기 때문에 원래대로 맞습니다. 감시: `test-harness/attendance_soft_auth_harness.mjs`. 기록: `docs/작업기록/260904_출석_소프트인증_기기식별자_비교_403수리.md`.

## 5. 처리 계획 (체계적 — 한 방에 하지 말 것)

> ⚠️ 이걸 **한꺼번에 고치면 학생·학부모 화면 전체가 깨진다** (각 수정마다 프론트가 `mango_token`을 보내야 함). 반드시 **도메인별로 묶어서, 프론트 연동+검증까지 한 세트로** 진행.

**표준 수정 패턴 (write-history에서 검증됨):**
1. 서버: 핸들러에서 `const authUid = await authUidFromRequest(body); if (!authUid || authUid !== 요청uid) return 401;`
2. 프론트: 그 API 호출에 `?token=`(또는 Authorization: Bearer) 로 `localStorage.mango_token` 전송
3. 배포 → 실제 화면(그 기능)이 정상 동작하는지 확인 → 다음 도메인

**권장 순서 (위험·영향 기준):**
1. 계정탈취/돈: `student/set-password`, `gifts/redeem`, `points/earn-by-rule`·`award-praise`, `subscription/create`, `livekit/token`, `rooms/join`
2. 학부모·전화·결제: `parent/dashboard`, `report/monthly`, `kakao-id/*`, `consents/*`, `parent/link-child`
3. 영상·전사: `recordings/stream|blob|student/recordings`, `chat/messages`, `eval/*`, `ai-lesson-report/*`
4. 나머지 per-user(포인트·일기·발화·퀴즈·출석·가족·동문)

**병행 필수(인프라):** [Neo4j 8880 포트 잠그기](보안_Neo4j_포트잠그기_런북.md) — 학생 29,288명 PII 평문 개방. 노출된 root·DB 비밀번호 교체.

## 5.5 🔓 내부 self-pentest (2026-07-19, build 20260719171742)

수업 없는 일요일에 배포된 라이브 API를 공격자 시점으로 전수 프로빙(scratchpad/pentest.mjs, 10개 카테고리: admin default-deny 214개·개인데이터 IDOR·토큰위조·CORS·주입·열거오라클·녹화노출·브루트포스·위험메서드·정보노출).

**✅ 방어 확인:** admin 214개 전부 차단(213 확인+1 무데이터)·개인데이터 IDOR 0·폴백시크릿 토큰위조 거부(ROOM_JWT_SECRET 설정됨)·CORS evil-origin 반사 없음·SQLi/경로주입 누출 없음·녹화 무인증목록 없음·admin 로그인 10회내 잠금·스택트레이스/소스맵 노출 없음.

**🔴 발견·수정한 실취약점 3건 (전부 무인증 파괴 DELETE — GET 은 인증됐으나 형제 DELETE 핸들러에 게이트 누락):**
| 경로 | 위험 | 수정 |
|---|---|---|
| `DELETE /api/eval/:id` | 무인증으로 임의 학생 평가서(교사코멘트·PII) 정수 id 열거 삭제 | 관리자 세션 필수(api-lessons.ts) |
| `DELETE /api/vocab/:id` | 무인증으로 남의 단어(user_id 소유물) 삭제 IDOR | 소유자 토큰 OR 관리자, 게스트 예외(api-games.ts)+vocab.html ?token= |
| `DELETE /api/recordings/:id` | 무인증으로 미성년자 녹화 soft-delete(은폐) | 관리자 세션 필수(api-mango.ts, 고아 엔드포인트) |

라이브 재검증: 3종 모두 무인증 401·vocab 통제테스트(무토큰 401+단어유지/본인토큰 200+삭제)·pentest 재실행 HIGH 0. 나머지 파괴적 쓰기(review-quizzes·calendar_events·chat/cleanup)는 전부 /api/admin/ default-deny 게이트 뒤라 안전 확인.

**🟡 수용된 LOW (미수정, 의도적):** `/api/student/login` 이 미존재 ID=404 `user_not_found` vs 존재=401 로 **사용자 열거 가능**. 그러나 ①이 메시지가 "학원 문의" 안내+비번설정(claim) UX에 쓰임 ②학원 내부 학생ID(카페24 회원번호)라 열거가치 낮음 ③브루트포스 잠금 존재 → 고치면 정상 UX 손상, 수용 판단. 외부 pentest 시 재평가 항목.

**교훈:** GET 핸들러에 IDOR 인증을 붙일 때 **같은 리소스의 DELETE/PATCH 형제 핸들러도 함께** 봐야 함(이번 3건 다 "GET은 인증, DELETE는 누락" 패턴). 향후 IDOR 수정 시 리소스별 전체 메서드 스윕.

## 6. 정직한 권고

- 이 규모(수십 개 IDOR + 인프라)는 **우리(오너+Claude)가 도메인별로 차근차근** 처리 가능하지만, 양이 많고 회귀 위험이 있어 **한 세션에 다 못 한다.** 세션마다 1~2개 도메인씩.
- 남의 개인정보 3만 건 + 결제를 다루므로, **완료 후 1회 외부 전문가 점검(pentest)** 으로 우리가 놓친 것을 확인하는 것을 강력 권장. 상주 아님, 주기적 점검.
- 개인정보보호법(PIPA) 관점의 법적 대응(유출 시 신고의무 등)은 별도 자문 영역.

관련: [MAINTENANCE.md](../MAINTENANCE.md) · [크몽 진단 검증](크몽_진단_검증.md) · [Neo4j 포트 런북](보안_Neo4j_포트잠그기_런북.md)
