-- D1 마이그레이션: attendance 테이블에 출결 체크인용 attended_at 컬럼 추가
-- ────────────────────────────────────────────────────────────
-- 이유: /api/attendance/checkin 핸들러가 "실제 입장 시각"을 attended_at 에 기록하는데
--       기존 schema.sql 에는 이 컬럼이 없어 운영 D1 에서 참조 시 에러가 날 수 있음.
--       (핸들러 안에도 자가치유 ALTER 가 있지만, 배포 직후 명시 실행을 권장)
--
-- 실행 방법 (cloudflare-deploy 폴더에서):
--   로컬:   npx wrangler d1 execute mango-db --local  --file=migration-attendance-checkin.sql
--   원격:   npx wrangler d1 execute mango-db --remote --file=migration-attendance-checkin.sql
--
-- 이미 컬럼이 존재하면 "duplicate column" 에러가 나는데, 그건 성공 신호이니 무시해도 됩니다
-- (SQLite 는 ALTER 에서 IF NOT EXISTS 를 지원하지 않음).

ALTER TABLE attendance ADD COLUMN attended_at INTEGER;

-- 조회 성능: 대시보드는 (date) 로, 체크인 upsert 는 (user_id, date) 로 조회
CREATE INDEX IF NOT EXISTS idx_attendance_user_date ON attendance(user_id, date);
