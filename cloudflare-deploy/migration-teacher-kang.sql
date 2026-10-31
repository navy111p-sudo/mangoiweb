-- 중국어 교사 강선생님 로그인 계정 생성 (2026-07-22)
-- 아이디: hq_t_kang
-- 비밀번호 해시 = SHA-256(salt + ':' + 비밀번호), 저장형식 salt$hash  (auth-admin.ts 와 동일)
-- ⚠ 이 파일은 1회성 마이그레이션입니다. 실행 후 삭제해도 됩니다.

-- 1) 로그인 계정 (admin_account)
--    username 이 'hq_t' 로 시작해야 resolveRole() 이 '교사'로 판정합니다.
INSERT OR IGNORE INTO admin_account (username, password_hash, name, email, phone, created_at, updated_at)
VALUES (
  'hq_t_kang',
  'a142b253822be590a5dccb330a1588a7$7f9da521e3fe98efab729fb472a1148c7041c0c09e9456ff319fdcaac7af682a',
  '강선생님',
  NULL, NULL,
  CAST(strftime('%s','now') AS INTEGER) * 1000,
  CAST(strftime('%s','now') AS INTEGER) * 1000
);

-- 2) 강사 프로필 (teacher_profiles)
--    korean_name 이 위 admin_account.name 과 글자까지 똑같아야
--    마이페이지의 수업목록·수업료정산·내평가가 실데이터로 매칭됩니다.
INSERT INTO teacher_profiles (korean_name, english_name, group_name, status, created_at, updated_at)
SELECT '강선생님', 'Teacher Kang', '중국어', '활동중',
       CAST(strftime('%s','now') AS INTEGER) * 1000,
       CAST(strftime('%s','now') AS INTEGER) * 1000
WHERE NOT EXISTS (SELECT 1 FROM teacher_profiles WHERE korean_name = '강선생님');

-- 3) 확인
SELECT username, name FROM admin_account WHERE username = 'hq_t_kang';
