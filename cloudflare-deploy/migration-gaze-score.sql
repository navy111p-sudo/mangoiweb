-- D1 마이그레이션: attendance 테이블에 시선 점수 컬럼 추가
-- ────────────────────────────────────────────────────────────
-- 이유: admin.html 의 "시선 점수" 컬럼이 /api/recordings 응답의 gaze_score
--       필드를 그대로 표시하는데, 지금까지는 저장 경로가 없어 NULL 고정이었음.
--       MediaPipe 기반 프런트엔드 분석기(public/js/mango-gaze.js)가 10초마다
--       attendance.gaze_score 를 갱신하도록 경로를 열기 위해 컬럼 추가.
--
-- 실행 방법 (cloudflare-deploy 폴더에서):
--   npx wrangler d1 execute mango-db --remote --file=migration-gaze-score.sql
--
-- 이미 컬럼이 존재하면 "duplicate column" 에러가 나는데, 그건 성공 신호.
-- SQLite 는 ALTER TABLE ADD COLUMN 에 IF NOT EXISTS 를 지원하지 않으므로 무시.

ALTER TABLE attendance ADD COLUMN gaze_score REAL;
ALTER TABLE attendance ADD COLUMN gaze_samples INTEGER DEFAULT 0;
ALTER TABLE attendance ADD COLUMN gaze_forward_samples INTEGER DEFAULT 0;

-- 기존 행 기본값(NULL 방지)
UPDATE attendance SET gaze_samples = 0 WHERE gaze_samples IS NULL;
UPDATE attendance SET gaze_forward_samples = 0 WHERE gaze_forward_samples IS NULL;
