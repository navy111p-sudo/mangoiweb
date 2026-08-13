-- ═══════════════════════════════════════════════════════════════════════
-- 💬 필리핀 강사 카카오ID → teacher_profiles.kakao_id  (2026-08-13)
--
-- 관리자 화면의 [📇 카카오ID 일괄 반영] 버튼과 «같은 일» 을 하는 SQL 입니다.
-- 화면에서 누르는 쪽을 권합니다(미리보기 → 반영, 미배정 ID 도 같이 처리됨).
-- 이 파일은 화면을 못 쓸 때를 위한 대안입니다.
--
-- 안전장치 — WHERE 절에 `(kakao_id IS NULL OR kakao_id = '')` 가 붙어 있어
--   ① 이미 값이 있는 강사는 절대 덮어쓰지 않고
--   ② 여러 번 실행해도 결과가 같습니다(멱등).
-- 이름이 명부와 안 맞으면 그 줄은 0행 갱신으로 조용히 넘어갑니다 — 실행 후
-- 맨 아래 확인 SELECT 로 «누가 아직 비었는지» 반드시 보세요.
--
-- 실행:
--   wrangler d1 execute mango-db --file=migration-teacher-kakao-2026-08-13.sql --remote
--
-- ⚠️ mango-db 는 개발/운영이 같은 DB 입니다(CLAUDE.md 1-1). 실제 강사 데이터입니다.
-- ═══════════════════════════════════════════════════════════════════════

-- 이미 명부에 들어 있던 20건은 건드리지 않습니다(위 WHERE 절이 알아서 걸러냄).
-- 실제로 채워지는 건 아래 5건입니다:
--   Teacher Cindy · Teacher JP · Teacher Maimai · Melca · Karl
--
-- 🚫 «@teacher_belle» 은 넣지 않습니다 — 운영진 시트 맨 윗줄(EX 행)의 **채워진 예시**라
--    실제 데이터가 아닙니다. 시트가 직접 "Row 4 is a filled EXAMPLE — do not edit it" 이라고
--    적어 두었고, 그 행의 전화(0917-123-4567)·메일(belle@mangoi.co.kr)도 전부 견본입니다.
--    진짜 Teacher Belle 은 18행이고 카카오ID 는 «Teacher.Belle» 입니다(아래에 있음).
--
-- ℹ️ 시트 이름 ≠ 명부 이름인 세 건은 «명부 쪽» 이름으로 UPDATE 합니다(직함만 다름):
--      시트 Manager Maimai → 명부 Teacher Maimai / Manager Melca → Melca / IT Karl → Karl

UPDATE teacher_profiles SET kakao_id='Elle2586',               updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Far'     AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='ussiejag',               updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Janice'  AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='TeacherCindy',           updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Cindy'   AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='kes2729',                updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Kes'     AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='95_98cmd',               updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Jane'    AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='jpsimbajon86@gmail.com', updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher JP'      AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='TeacherAna18',           updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Ana'     AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='Xianne1',                updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Kaye'    AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='Shasil',                 updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Shas'    AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='Teacher Len',            updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Len'     AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='nessy_me',               updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Ness'    AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='TeacherJenny',           updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Jenny'   AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='jinseol19',              updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Jinette' AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='teacherhannah_0424',     updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Hannah'  AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='iamchaineteacher',       updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Chaine'  AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='Mariane23',              updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Mariane' AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='TeacherKrystel',         updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Krystel' AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='Teacher.Belle',          updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Belle'   AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='Teacher.Sid_29',         updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Sid'     AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='Teacher_Zee',            updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Zee'     AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='TEACHERWIN',             updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Win'     AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='eslteacher_juanie',      updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Wan'     AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='welm',                   updated_at=strftime('%s','now')*1000 WHERE korean_name='Teacher Maimai' AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='Melca08',                updated_at=strftime('%s','now')*1000 WHERE korean_name='Melca'           AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='karlito',                updated_at=strftime('%s','now')*1000 WHERE korean_name='Karl'            AND (kakao_id IS NULL OR kakao_id='');

-- 미배정함 — 지금은 넣을 것이 없습니다(25건 전부 주인이 확정됐습니다).
--   테이블 자체는 앞으로 «주인 모를 ID» 가 생겼을 때를 위해 만들어 둡니다.
--   관리자 화면(강사관리 → 강사 명부 → [📇 카카오ID 일괄 반영])이 이 표를 읽습니다.
CREATE TABLE IF NOT EXISTS teacher_kakao_unassigned (
  kakao_id   TEXT PRIMARY KEY,
  note       TEXT,
  created_at INTEGER NOT NULL
);
-- 이전 판(2026-08-13 오전)을 이미 실행했다면 그때 넣은 2건을 걷어냅니다 —
--   둘 다 주인이 확정됐고, «@teacher_belle» 은 애초에 시트의 예시라 실제 데이터가 아닙니다.
DELETE FROM teacher_kakao_unassigned WHERE kakao_id IN ('@teacher_belle', 'welm');

-- ── 확인 ────────────────────────────────────────────────────────────────
-- 반영 결과 (카카오ID 가 들어간 강사)
SELECT id, korean_name, kakao_id, phone FROM teacher_profiles
 WHERE kakao_id IS NOT NULL AND kakao_id <> '' ORDER BY korean_name;

-- 아직 카카오ID 가 비어 있는 활동중 강사 — 여기 남은 이름은 사람이 확인해야 합니다
SELECT id, korean_name, phone FROM teacher_profiles
 WHERE (kakao_id IS NULL OR kakao_id = '') AND (status = '활동중' OR status IS NULL)
 ORDER BY korean_name;
