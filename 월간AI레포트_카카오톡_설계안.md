# 망고아이 월간 AI 레포트 → 카카오톡 발송 설계안

**버전** v1.0 · 2026-06-02 · 작성: 개발
**목표** 매월 1회, AI가 학생별 학습 레포트를 작성해 **학생 + 학부모** 카카오톡(알림톡)으로 발송하고, 버튼을 누르면 인터랙티브 웹 대시보드로 연결한다.
**핵심 결정** 알림톡은 고정 템플릿(검수 필요)만 보낼 수 있으므로, "짧은 알림톡 + [레포트 보기] 버튼 → 풍부한 웹 대시보드" 구조로 간다.

---

## 1. 요약 (한눈에)

매월 1일 새벽, Cloudflare Cron이 깨어나 지난달 수업이 있었던 학생을 모두 조회한다. 학생마다 출석·평가·발음점수·수업로그를 모아 Workers AI(Llama)가 학부모 친화적인 한국어 레포트를 작성하고, 보안 토큰이 박힌 대시보드 URL을 만든다. 그 URL을 담은 알림톡을 **학생 본인과 학부모 두 사람에게** SOLAPI로 발송한다. 수신자가 버튼을 누르면 로그인 없이 본인 레포트(점수 추이 그래프·강사 코멘트·다음 달 목표)를 본다. 발송 결과는 DB에 기록되어 관리자 화면에서 재발송·통계를 볼 수 있다.

**왜 이 구조인가:** 기존 경쟁사처럼 "로그인해서 PDF 찾아보기"는 방치된다. 알림톡은 학부모가 가장 자주 보는 채널이라 열람률이 압도적으로 높고, 무거운 시각화는 웹에 두어 알림톡 템플릿 제약을 우회한다.

---

## 2. 이미 있는 부품 (재사용)

| 부품 | 위치 | 비고 |
|---|---|---|
| 카카오 알림톡 발송기 | `src/solapi-client.ts` | ATA 전송 + SMS 폴백. 이미 수업시작/종료 알림톡 발송 중 |
| 자동 스케줄러 | `wrangler.toml` `crons`, `src/index.ts` `scheduled()` | 현재 일일 4회 트리거 |
| AI 요약 | `env.AI` (Workers AI · Llama) | "일일 브리핑"에서 이미 사용 |
| 학생·학부모 매핑 | `students_erp` (`parent_user_id`, `parent_name`, `parent_phone`) | |
| 카톡ID·수신동의 | `kakao_ids` (`kakao_id`, `phone`, `opted_in_at`, `role`) | 옵트인 존중 필수 |
| 학습 데이터 | `student_evaluations`, `attendance`, `voice_coaching`, `ai_lesson_reports`, `teacher_feedbacks`, `student_streaks` | 레포트 원천 데이터 |
| 발송 큐 | `notification_queue` | 재시도·로깅 |

**새로 만들 것은 4가지뿐:** ① 월간 Cron 분기, ② AI 레포트 생성기, ③ 웹 대시보드 페이지, ④ 알림톡 템플릿 연결.

---

## 3. 아키텍처 (데이터 흐름)

```
[매월 1일 03:30 KST]  Cloudflare Cron
        │
        ▼
 scheduled() → runMonthlyReports(period="2026-05")
        │  지난달 수업 있던 학생 목록 조회 (attendance/class_schedules)
        ▼
 for each 학생:
   1) gatherStudentMonthlyData()  ── 출석률·평가·발음추이·수업수·연속출석
   2) env.AI(Llama)  →  학부모용 한국어 레포트 텍스트 생성
   3) DB 저장:  monthly_reports (student_uid, period, ai_text, metrics_json, token)
   4) 토큰 URL 생성:  /report/monthly?id={uid}&period=2026-05&t={token}
   5) 알림톡 발송 (학생 + 학부모 각각):
        solapi ATA  템플릿:  MONTHLY_REPORT
        변수: {학생명, 기간, 출석률, 핵심코멘트, URL}
        수신동의(opted_in) 확인 → 미동의 시 건너뜀 / SMS 폴백 옵션
   6) 발송결과 notification_queue + monthly_reports.sent_log 기록
        │
        ▼
 [학부모가 버튼 클릭]
        ▼
 GET /report/monthly?id&period&t  →  토큰 검증 → 인터랙티브 대시보드 렌더
        (점수 추이 차트 · 강사 코멘트 · 출석 캘린더 · 다음달 목표 · 재수강 CTA)
```

---

## 4. DB 스키마 추가

```sql
CREATE TABLE IF NOT EXISTS monthly_reports (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  student_uid   TEXT NOT NULL,
  student_name  TEXT,
  period        TEXT NOT NULL,          -- 'YYYY-MM'
  ai_text       TEXT,                   -- AI가 쓴 학부모용 레포트
  metrics_json  TEXT,                   -- 출석률/평가/발음추이 등 원자료(차트용)
  access_token  TEXT NOT NULL,          -- 대시보드 무로그인 열람 토큰(랜덤)
  status        TEXT DEFAULT 'draft',   -- draft | approved | sent | failed
  sent_to_student INTEGER DEFAULT 0,
  sent_to_parent  INTEGER DEFAULT 0,
  sent_log      TEXT,                   -- 발송 결과 JSON
  created_at    INTEGER NOT NULL,
  sent_at       INTEGER,
  UNIQUE(student_uid, period)
);
CREATE INDEX IF NOT EXISTS idx_monthly_reports_period ON monthly_reports(period);
```

기존 `ensure...Table()` 패턴(api-mango.ts)과 동일하게 isolate-once 가드로 생성.

---

## 5. AI 레포트 생성 (프롬프트 설계)

**입력(시스템이 모음):** 학생명, 기간, 총 수업수/출석률, 평가 점수 평균과 추이, 발음(voice_coaching) 점수 변화, 강사 코멘트 발췌, 연속출석.

**프롬프트 골자(Llama):**
> 당신은 영어학원 담임입니다. 아래 데이터로 **학부모님께 보내는 따뜻하고 구체적인 한국어 월간 레포트**를 5~7문장으로 작성하세요. 과장 금지, 칭찬 1가지·성장영역 1가지·다음달 목표 1가지를 반드시 포함. 숫자는 데이터에 있는 것만 사용.

**출력 안전장치:** 길이 제한, 금지어 필터(forbidden_words 재사용), 데이터 없으면 "이번 달 수업이 적어 요약을 생략" 분기.

---

## 6. 인터랙티브 웹 대시보드 (`/report/monthly`)

- **무로그인 접근:** `?id&period&t(token)` 3개가 모두 맞아야 열림. 토큰은 레포트별 랜덤(추측 불가). 30일 만료.
- **구성:** 상단 인사말(AI 텍스트) → 점수 추이 라인차트 → 출석 캘린더(히트맵) → 발음 변화 → 강사 코멘트 카드 → "다음 달 목표" → **재수강/상담 CTA 버튼**(장기 재등록 유도).
- **기술:** 기존 사이트 톤 재사용, 모바일 우선 반응형(이미 프로젝트 표준), 차트는 경량 라이브러리. 한/영 토글 지원.
- **공유:** 같은 URL을 학생·학부모가 공유 가능(토큰 동일). 캡처/저장도 자연스럽게 유도.

---

## 7. 카카오 알림톡 (현실 제약 + 발송)

**알림톡은 자유문구 불가** — 사전 검수된 템플릿만 발송됩니다.

**사업 준비물(코드 아님):**
1. 카카오 비즈니스 **채널** 개설 (망고아이 법인 채널)
2. **SOLAPI** 계정 + API 키 + 발신프로필(pfId) — `env.SOLAPI_PFID`, API 키 secret 등록
3. **알림톡 템플릿 검수**(보통 1~2일): 예) `MONTHLY_REPORT`
   > #{학생명} 학생의 #{기간} 학습 레포트가 도착했어요. 출석률 #{출석률}, #{핵심코멘트}
   > [버튼] 레포트 자세히 보기 → #{URL}

**발송 로직(이미 있는 solapi-client 재사용):**
- 학생·학부모 각각의 수신동의(`kakao_ids.opted_in_at`) 확인 → 동의자만 발송
- 미동의/실패 시: ① 건너뛰기 ② SMS 폴백(`fallbackSmsText`) 중 정책 선택
- 검수 전/키 없을 때는 **MOCK 모드**(콘솔 로그)로 전 흐름 테스트 가능 — solapi-client에 이미 MOCK 분기 존재

---

## 8. 발송 대상 정책 (학생 + 학부모)

| 수신자 | 연락처 소스 | 동의 확인 | 비고 |
|---|---|---|---|
| 학생 본인 | `kakao_ids`(role=student) 또는 `students_erp.phone` | `opted_in_at` | 청소년이면 학부모 우선 권장 |
| 학부모 | `students_erp.parent_phone` / parent_user_id의 `kakao_ids` | `opted_in_at` | 재등록 의사결정자 |

같은 레포트 URL을 두 사람에게 보내되, 발송 성공/실패를 각각 `sent_to_student`, `sent_to_parent`에 기록.

---

## 9. 스케줄 & 관리자 운영

- **Cron 추가:** 매월 1일 03:30 KST. (`wrangler.toml` crons에 `"30 18 1 * *"`(UTC) 형태 추가 — UTC/KST 변환 주의.)
- **관리자 화면:** admin에 "월간 레포트" 메뉴 — 생성 현황·미리보기·수정·[발송]·[재발송]·발송통계(열람률). "관리자 검토 후 발송" 옵션 시 status=draft→approved 단계 추가.

---

## 10. 단계별 구현 로드맵 (권장)

1. **Phase 1 (코드만, 채널 없이도 동작):** DB 테이블 + AI 생성기 + 웹 대시보드 + 관리자 미리보기. 알림톡은 MOCK. → 내부에서 레포트 품질 검증.
2. **Phase 2:** SOLAPI 키·템플릿 검수 완료 후 실제 알림톡 연결(학생+학부모) + 수신동의 게이트 + SMS 폴백.
3. **Phase 3:** 월간 Cron 자동화 + 관리자 통계(열람률·재등록 전환) + A/B 문구 최적화.

---

## 11. 리스크 / 주의

- **개인정보·수신동의:** 마케팅이 아닌 "정보성" 알림톡이라도 수신동의·야간발송(21~08시) 규정 준수. 동의 없는 발송 금지.
- **AI 환각:** 데이터에 없는 점수·사실 생성 금지(프롬프트로 강제 + 숫자는 시스템이 주입).
- **토큰 보안:** 추측 불가 랜덤 + 만료. URL에 개인정보 직접 노출 금지(이름은 알림톡 본문, 상세는 토큰 뒤).
- **검수 리드타임:** 템플릿 승인 1~2일 → 일정에 반영.

---

## 12. 결론

기술적으로 **전부 구현 가능**하며, 망고아이는 발송기·스케줄러·AI·데이터를 이미 보유해 "연결 작업" 중심입니다. 코드는 Phase 1(대시보드+AI+모의발송)부터 바로 착수 가능하고, 사업 쪽에서 **카카오 채널·SOLAPI 키·템플릿 검수**만 준비되면 실발송으로 전환됩니다. 다음 단계로 Phase 1 구현을 진행할지 결정해 주세요.
