# ═══════════════════════════════════════════════════════════════════════════
# 수업평가 리포트 개편 0단계 — 데이터 확인 (SELECT 만, 아무것도 바꾸지 않음)
#
# 실행: 배포 권한 PC 에서   cd cloudflare-deploy ; .\scripts\eval-phase0-select.ps1
# 근거: docs/수업평가_리포트_개편_제안서_2026-08-24.html 의 «도입 순서 0단계»
#       (원격 컨테이너에는 Cloudflare 토큰이 없어 사람 PC 에서 돌려야 합니다)
#
# 쿼리 하나가 실패해도 계속 갑니다 — 테이블이 아직 없다는 것 자체가 «0건» 이라는 답입니다.
# ═══════════════════════════════════════════════════════════════════════════
$queries = [ordered]@{

  # ── ① 학년 데이터 — 밴드 자동 배정의 전제 ──────────────────────────────
  '학년 채움율' =
    "SELECT COUNT(*) AS total, SUM(CASE WHEN grade IS NOT NULL AND TRIM(grade)<>'' THEN 1 ELSE 0 END) AS has_grade FROM students_erp";
  '학년 값 분포 (상위 30)' =
    "SELECT grade, COUNT(*) AS n FROM students_erp WHERE grade IS NOT NULL AND TRIM(grade)<>'' GROUP BY grade ORDER BY n DESC LIMIT 30";

  # ── ② 별점 변별력 — «기본값 4 가 그대로 쌓인다» 가설 검증 ──────────────
  '평가 총괄 (둘다4 = 기본값 그대로)' =
    "SELECT COUNT(*) AS total,
            SUM(CASE WHEN score_participation=4 AND score_comprehension=4 THEN 1 ELSE 0 END) AS both_default_4,
            SUM(CASE WHEN score_speaking IS NOT NULL THEN 1 ELSE 0 END) AS has_speaking,
            SUM(CASE WHEN score_homework IS NOT NULL THEN 1 ELSE 0 END) AS has_homework,
            SUM(CASE WHEN score_attitude IS NOT NULL THEN 1 ELSE 0 END) AS has_attitude,
            SUM(CASE WHEN note_ko IS NOT NULL AND note_ko<>'' THEN 1 ELSE 0 END) AS has_note_ko
       FROM student_evaluations";
  '별점 조합 분포 (상위 15)' =
    "SELECT score_participation AS p, score_comprehension AS c, COUNT(*) AS n
       FROM student_evaluations GROUP BY p, c ORDER BY n DESC LIMIT 15";
  '월별 평가 건수 (최근 6개월)' =
    "SELECT substr(COALESCE(lesson_date,''),1,7) AS ym, COUNT(*) AS n
       FROM student_evaluations GROUP BY ym ORDER BY ym DESC LIMIT 6";

  # ── ③ AI 자동 평가의 원료 — 얼마나 쌓여 있나 (사장님 지시: AI 가 최대한 평가) ──
  '수업 채팅 (참여도 원료)' =
    "SELECT COUNT(*) AS msgs, COUNT(DISTINCT room_id) AS rooms FROM chat_messages";
  '수업 채팅 역할 분포' =
    "SELECT sender_role, COUNT(*) AS n FROM chat_messages GROUP BY sender_role";
  '수업 녹음 (말하기 분석 원료)' =
    "SELECT COUNT(*) AS n FROM recordings";
  'AI 초안 경로 사용량 (feedback_drafts)' =
    "SELECT status, COUNT(*) AS n FROM feedback_drafts GROUP BY status";
  '숙제 기록 (숙제 점수 자동화 원료)' =
    "SELECT COUNT(*) AS n FROM homework";
  '복습퀴즈 결과 (어휘 점수 자동화 원료)' =
    "SELECT COUNT(*) AS n FROM review_quiz_results";
  '레벨테스트 신청 (수준 원료)' =
    "SELECT COUNT(*) AS n FROM leveltest_applications";
}

foreach ($k in $queries.Keys) {
  Write-Host "`n══ $k ══" -ForegroundColor Yellow
  # SELECT 만 있는 스크립트입니다. 여기에 UPDATE/DELETE 를 추가하지 마세요 (CLAUDE.md 1-1).
  npx wrangler d1 execute mango-db --remote --command $queries[$k]
  if ($LASTEXITCODE -ne 0) { Write-Host "   (실패 — 테이블이 없다면 그 데이터는 0건이라는 뜻)" -ForegroundColor DarkGray }
}
Write-Host "`n결과를 복사해 클로드에게 붙여 주세요 — 1·2단계 판단 근거로 씁니다." -ForegroundColor Cyan
