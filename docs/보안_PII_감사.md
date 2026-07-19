# 🔒 PII / IDOR 보안 감사 + 처리 계획

감사일: 2026-07-10 (Claude 전수 감사). 대상: `cloudflare-deploy/src` 비관리자 API 전체.

> **한 줄 요약(원본, 2026-07-10):** 인증 도구는 있으나 5개에만 적용, 수십 개가 IDOR 상태였음.
>
> **🔄 2026-07-19 재검증 업데이트:** 그 사이 IDOR 작업이 크게 진척돼 **§3 HIGH 항목이 사실상 전부 닫힘**(라이브 무인증 401 확인): parent/dashboard·report/monthly-view(공유토큰)·kakao-id·consents·eval/list·chat/messages·parent/link-child·voice/history·voice/stats·gifts/redemptions·diary/list 모두 인증됨. livekit/token은 미설정(503)·앱 미사용. **잔여로 발견·수정: `GET /api/exam/results?user_id=`(남의 시험점수 200 노출) → authUidFromRequest uid일치 요구 + idx-x4.js `?token=` 첨부. 데모학생 검증(무인증401·본인토큰200·타uid401), build 20260719112301.** 남은 것은 §4 MEDIUM(포인트·퀴즈·출석 등 저민감, 게스트 지원)과 외부 pentest 권장(§6).

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
| `GET /api/chat/messages?room_id=` 🟡 | 수업 채팅 전문 | **남음**(방 참여자 검증 필요, index.html 수업중 사용) |
| `recordings/stream/{id}`✅ · `student/recordings`✅ · `blob/{key}`🟡 | **미성년자 수업 영상** | stream=관리자잠금, student/recordings=토큰인증 완료(07-10). blob은 설계상 공개나 열거벡터(list-recent) 잠금으로 키획득 어려워짐. 잔여=서명URL |
| ~~eval/ai-lesson-report/{id}, recordings/list-recent~~ ✅ | 전사·전체녹화덤프 | 관리자 잠금 완료(07-10) |
| `GET /api/voice/history?uid=` `GET /api/voice/stats?uid=` | 발화연습 전사·점수 | 토큰 인증 |
| `POST /api/parent/link-child` | 아무 학생을 공격자 학부모에 연결 | 토큰/관리자 인증 |
| `POST /api/livekit/token` · `POST /api/rooms/{id}/join`(allow_open) | 아무 방 실시간 A/V 접근 | 방 소유 검증 강화 |
| `POST /api/subscription/create` | 임의 유저 구독 생성 | 토큰/관리자 인증 |

## 4. 🟡 MEDIUM (요약)

포인트/점수/일기/출석/퀴즈/보상/평가작성/방입퇴장/가족정보 등 **약 40개**가 uid 기반 무인증 조회·쓰기. 대표: `points/balance`·`earn-by-rule`·`award-praise`, `diary/*`(업로드·조회·수정), `voice/coach`, `review-quiz/*`, `attendance/*`, `family/my-children`, `alumni/profile`, `rewards/student/{id}`, `class/sessions/today`, `webhook/kakao-inbound`(phone→uid 오라클). 전체 목록·라인번호는 이 감사 원본(세션 기록) 참조.

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

## 6. 정직한 권고

- 이 규모(수십 개 IDOR + 인프라)는 **우리(오너+Claude)가 도메인별로 차근차근** 처리 가능하지만, 양이 많고 회귀 위험이 있어 **한 세션에 다 못 한다.** 세션마다 1~2개 도메인씩.
- 남의 개인정보 3만 건 + 결제를 다루므로, **완료 후 1회 외부 전문가 점검(pentest)** 으로 우리가 놓친 것을 확인하는 것을 강력 권장. 상주 아님, 주기적 점검.
- 개인정보보호법(PIPA) 관점의 법적 대응(유출 시 신고의무 등)은 별도 자문 영역.

관련: [MAINTENANCE.md](../MAINTENANCE.md) · [크몽 진단 검증](크몽_진단_검증.md) · [Neo4j 포트 런북](보안_Neo4j_포트잠그기_런북.md)
