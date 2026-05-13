-- D1 마이그레이션: attendance 테이블에 대시보드 집계용 컬럼 추가
-- ────────────────────────────────────────────────────────────
-- 이유: src/api-mango.ts 의 /api/dashboard 쿼리가 다음 컬럼을 참조하지만
--       schema.sql 최초 정의에는 포함되어 있지 않아 D1 에러 → 500 → 대시보드
--       프런트에서 "데이터 로드 실패" 메시지가 뜸.
--
-- 실행 방법 (프로젝트 루트 cloudflare-deploy 폴더에서):
--   npx wrangler d1 execute mango-db --remote --file=migration-attendance-fields.sql
--
-- 이미 컬럼이 존재하면 "duplicate column" 에러가 나는데, 그건 성공 신호이니
-- 무시해도 됩니다(SQLite는 IF NOT EXISTS 를 ALTER 에서 지원하지 않음).

ALTER TABLE attendance ADD COLUMN total_active_ms INTEGER DEFAULT 0;
ALTER TABLE attendance ADD COLUMN disconnect_count INTEGER DEFAULT 0;

-- 기존 행에 대해 기본값 채우기(NULL → 0)
UPDATE attendance SET total_active_ms = 0 WHERE total_active_ms IS NULL;
UPDATE attendance SET disconnect_count = 0 WHERE disconnect_count IS NULL;

-- 대시보드 조회 성능 인덱스
CREATE INDEX IF NOT EXISTS idx_attendance_joined_at ON attendance(joined_at);
