-- 강사 근무/휴식시간 관리 — 강사 피드백(2026-07-24): "강사 스케줄/휴식시간 관리를 찾을 수 없다.
-- 강사가 휴가일 때 그 시간에 학생이 예약 못 하게 막아야 한다."
--
-- 이 파일은 1회성 마이그레이션입니다. 적용 후 삭제해도 됩니다.
-- 적용: npx wrangler d1 execute mango-db --file=migration-teacher-unavailability.sql
--       npx wrangler d1 execute mango-db --env production --file=migration-teacher-unavailability.sql
-- (api-admin.ts 가 최초 요청 시 CREATE TABLE IF NOT EXISTS 로도 자동 생성하므로, 이 파일은
--  배포 전에 미리 만들어두고 싶을 때만 수동 실행하면 됩니다 — 안 돌려도 기능은 동작합니다.)

CREATE TABLE IF NOT EXISTS teacher_unavailability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id TEXT NOT NULL,
  teacher_name TEXT,
  kind TEXT NOT NULL DEFAULT 'date_range',   -- 'date_range'(특정 기간 휴가) | 'weekly'(매주 반복 휴식시간)
  start_date TEXT,                           -- date_range: YYYY-MM-DD
  end_date TEXT,                             -- date_range: YYYY-MM-DD (하루면 start_date 와 동일)
  day_of_week INTEGER,                       -- weekly: 0(일)~6(토)
  start_time TEXT,                           -- HH:MM, NULL = 하루 종일 차단
  end_time TEXT,                             -- HH:MM, NULL = 하루 종일 차단
  reason TEXT,
  created_by TEXT,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_teacher_unavailability_teacher ON teacher_unavailability(teacher_id);
