# 단원 노래 146장 교체 기록 (2026-09-29 04:17 KST, run 36469801100)

- 과마다 `oldIds`(교체 전, 이제 active=0) · `newIds`(지금 active=1)
- 옛 행·옛 R2 파일은 지우지 않았습니다.
- 한 과를 되돌리려면(사람 승인 뒤) 그 과의 newIds → active=0, oldIds → active=1.
  한 문장으로 하려면: `UPDATE textbook_files SET active = CASE WHEN description = 'BTS 새 교재 (2026-09 단원 노래 추가)' THEN 0 ELSE 1 END
  WHERE uploaded_by='NEW BTS 2026-09' AND substr(name,1,<len>)='[<책>]' AND (active=1 OR description='BTS 새 교재 (2026-09 재디자인)')`
- 확인: 교체 뒤 swapdry 에서 238개 과 전부 same.
