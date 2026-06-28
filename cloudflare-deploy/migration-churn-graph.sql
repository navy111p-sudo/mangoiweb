-- migration-churn-graph.sql
-- 이탈 위험 "행동 사슬(Path) 그래프" 엔진용 신규 테이블
-- (학부모)-[:IGNORED]->(알림톡) 엣지의 데이터 소스.
--
-- 기존 solapi-client.ts 는 알림톡을 "발송"만 하고 기록을 남기지 않는다.
-- 그래프 엔진이 "결석 → 알림톡 발송 → 미열람 → 또 결석" 사슬을 추적하려면
-- 발송/열람 타임라인이 남아야 하므로 로그 테이블을 추가한다.
--
-- 적용:  wrangler d1 execute <DB> --file=./migration-churn-graph.sql
-- 멱등(IF NOT EXISTS)이라 여러 번 실행해도 안전.

CREATE TABLE IF NOT EXISTS alimtalk_log (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL,            -- 대상 학생 uid (students_erp.user_id)
  parent_phone TEXT,                     -- 수신 학부모 번호 (마스킹 전 원본은 PII 정책 따름)
  template     TEXT,                     -- solapi templateCode (absence_alert 등)
  reason       TEXT,                     -- 발송 사유: 'absence' | 'low_engagement' | 'eval_drop' | 'manual'
  ref_room_id  TEXT,                     -- 연관 수업 room_id (TRIGGERED 엣지)
  ref_date     TEXT,                     -- 연관 수업 날짜 'YYYY-MM-DD'
  message_id   TEXT,                     -- solapi messageId (발송 결과)
  track_token  TEXT,                     -- 클릭추적 토큰(알림톡 버튼 링크 → /api/alimtalk/r?t=)
  send_status  TEXT DEFAULT 'sent',      -- 'sent' | 'failed' | 'skipped'
  sent_at      INTEGER NOT NULL,         -- 발송 시각(ms)
  read_at      INTEGER,                  -- 열람 시각(ms). NULL = 미열람. 버튼 클릭 시 기록
  responded_at INTEGER,                  -- 학부모 반응(재예약·문의 등) 시각(ms). NULL = 무반응
  created_at   INTEGER NOT NULL
);

-- 학생별 타임라인 조회(그래프 엔진의 핵심 접근 패턴)
CREATE INDEX IF NOT EXISTS idx_alimtalk_log_user_sent ON alimtalk_log(user_id, sent_at);
-- "미열람(IGNORED)" 스캔: read_at IS NULL 인 것 위주
CREATE INDEX IF NOT EXISTS idx_alimtalk_log_unread    ON alimtalk_log(read_at, sent_at);
CREATE INDEX IF NOT EXISTS idx_alimtalk_log_reason    ON alimtalk_log(reason, sent_at);
-- 클릭추적 토큰으로 열람 기록(read_at) 업데이트
CREATE INDEX IF NOT EXISTS idx_alimtalk_log_token     ON alimtalk_log(track_token);
