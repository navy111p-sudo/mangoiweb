-- migration-point-rules-cleanup-2026-07-30.sql
--
-- 배경: 장지웅 부장님 Q5 답변 — "포인트 7개(친구추천 300P·생일 200P·레벨업 100P·레벨테스트 80P·
--       연속출석 50P·숙제 20P·복습 15P)에 대해 학부모와 학생에게 안내한 적이 없습니다."
--       → 감사 보고서(교직원_제보_5건_진단_및_해결제안_2026-07-29.md §2 슬라이드5)의 결정 트리대로
--         "안내한 적 없으면 규칙을 정리하고 안내표를 4개로 만든다"를 적용한다.
--
-- ⚠️ mango-db 는 운영 DB입니다(개발/운영 분리 없음). 이 스크립트는 Claude 가 직접 실행하지 않고
--    여기 남겨둡니다 — 실행 전 반드시 담당자가 검토 후 실행해 주세요(CLAUDE.md §1-1).
--
-- 실행 방법 예:
--   npx wrangler d1 execute mango-db --remote --file=./migration-point-rules-cleanup-2026-07-30.sql
--   (wrangler 4는 d1 execute --file 에는 --remote 가 있습니다. r2 put/kv 와는 다름 — 헷갈리지 말 것)

-- ── 1) 코드가 실제로 부르는데 규칙 행이 없어서 404 나던 것 복구 ──
--    on_time: 과거엔 실제로 지급됐던 흔적이 있음(point_rule_log 에 6건, 마지막 2026-06-14 무렵)
--             → 어느 시점에 규칙 행이 사라진 회귀 버그. 기존 seed 값 그대로 복구.
--    monthly_top: 관리자가 수동으로 누르는 기능(js/adm-p4.js). 학부모에게 알린 적 없어도
--             "관리자 버튼이 실제로 동작하게" 만드는 것이라 새 약속이 아님.
INSERT INTO point_rules (code, label, amount, cooldown_sec, daily_cap, enabled, description, updated_at)
VALUES
  ('on_time',     '제시간 입장',   5,   3600, 1,    1, '수업 시작 5분 이내 입장',       strftime('%s','now') * 1000),
  ('monthly_top', '월간 우수학생', 500, 0,    NULL, 1, '월간 1위 학생 자동 지급',       strftime('%s','now') * 1000)
ON CONFLICT(code) DO NOTHING;

-- ── 2) 코드가 실제로 부르지만 아직 한 번도 안 불려서 행이 없는 것 미리 생성 ──
--    (코드 자체가 최초 호출 시 INSERT OR IGNORE 로 만드는 값과 완전히 동일 — src/api-points.ts:246,250)
--    미리 만들어 두는 이유: "포인트 모으는 법" 안내표에 처음부터 노출되게 하기 위함.
INSERT INTO point_rules (code, label, amount, cooldown_sec, daily_cap, enabled, description, updated_at)
VALUES
  ('ai_writing_rewrite', '영작 고쳐쓰기 완료', 5, 0, 5,  1, '첨삭받은 문장을 직접 따라 써서 익히면 지급',                     strftime('%s','now') * 1000),
  ('rescue_sentence',    '구조선 문장 완성',   5, 0, 30, 1, '망고 구조선 게임에서 단어를 순서대로 구조해 문장을 완성하면 지급(하루 30점까지)', strftime('%s','now') * 1000)
ON CONFLICT(code) DO NOTHING;

-- ── 3) 학부모·학생에게 안내한 적 없고 코드도 부르지 않는 7개 비활성화 ──
--    삭제(DELETE)가 아니라 enabled=0 으로 끔 — 나중에 실제로 만들면 enabled=1 로 되돌리기만 하면 됨.
--    지급 이력(point_rule_log)에도 이 7개는 0건으로 실측 확인됨(2026-07-30 기준).
UPDATE point_rules
   SET enabled = 0, updated_at = strftime('%s','now') * 1000
 WHERE code IN ('referral','birthday','level_up','test_pass','attendance_streak','homework','review')
   AND enabled = 1;

-- ── 확인용 (실행 후 결과를 확인하세요) ──
-- SELECT code,label,amount,enabled FROM point_rules ORDER BY enabled DESC, amount DESC;
