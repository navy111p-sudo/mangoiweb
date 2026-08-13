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
-- 실제로 채워지는 건 아래 4건입니다: Teacher Cindy · Teacher JP · Melca · Karl

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
UPDATE teacher_profiles SET kakao_id='Melca08',                updated_at=strftime('%s','now')*1000 WHERE korean_name='Melca'           AND (kakao_id IS NULL OR kakao_id='');
UPDATE teacher_profiles SET kakao_id='karlito',                updated_at=strftime('%s','now')*1000 WHERE korean_name='Karl'            AND (kakao_id IS NULL OR kakao_id='');

-- ❓ 주인을 모르는 카카오ID 2건 — 추측으로 강사에게 붙이면 엉뚱한 사람에게 급여·수업
--    안내가 나갑니다. 그래서 «미배정함» 에만 넣어 두고, 관리자가 화면에서 고르게 합니다.
--    (강사관리 → 강사 명부 → [📇 카카오ID 일괄 반영] 에 목록이 뜹니다)
CREATE TABLE IF NOT EXISTS teacher_kakao_unassigned (
  kakao_id   TEXT PRIMARY KEY,
  note       TEXT,
  created_at INTEGER NOT NULL
);
INSERT INTO teacher_kakao_unassigned (kakao_id, note, created_at) VALUES
  ('@teacher_belle', '카카오 채널(@) 형식 — Teacher Belle 의 채널인지 확인 필요', strftime('%s','now')*1000),
  ('welm',           '이름 단서 없음 — 어느 강사인지 확인 필요',                  strftime('%s','now')*1000)
ON CONFLICT(kakao_id) DO UPDATE SET note = excluded.note;

-- ── 확인 ────────────────────────────────────────────────────────────────
-- 반영 결과 (카카오ID 가 들어간 강사)
SELECT id, korean_name, kakao_id, phone FROM teacher_profiles
 WHERE kakao_id IS NOT NULL AND kakao_id <> '' ORDER BY korean_name;

-- 아직 카카오ID 가 비어 있는 활동중 강사 — 여기 남은 이름은 사람이 확인해야 합니다
SELECT id, korean_name, phone FROM teacher_profiles
 WHERE (kakao_id IS NULL OR kakao_id = '') AND (status = '활동중' OR status IS NULL)
 ORDER BY korean_name;
