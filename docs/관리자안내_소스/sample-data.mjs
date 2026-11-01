/* ═══════════════════════════════════════════════════════════════════════════
 * sample-data.mjs — 안내서 그림을 찍을 때만 쓰는 «견본» 응답
 *
 *   ⛔ 실제 학생·강사가 아닙니다. 이름·금액은 전부 지어낸 견본입니다
 *      (안내서 그림에 진짜 개인정보가 찍히지 않게 — 그래서 일부러 가짜를 씁니다).
 *   capture.mjs 가 /api/* 를 가로채 이 값으로 답합니다. 화면은 배포되는 그 파일 그대로입니다.
 *   응답 «모양» 은 각 화면 코드(adm-q7.js·adm-q3.js·adm-r11.js·adm-core.js)가 읽는 칸에 맞췄습니다.
 * ═══════════════════════════════════════════════════════════════════════════ */

const D = (n) => { const t = new Date(Date.UTC(2026, 9, 9)); t.setUTCDate(t.getUTCDate() - n); return t.toISOString().slice(0, 10); };

const STU = [
  ['김하나', 'sample_hana', '샘플 강남점'], ['이서준', 'sample_seojun', '샘플 분당점'],
  ['박지우', 'sample_jiwoo', '샘플 강남점'], ['최민서', 'sample_minseo', '샘플 일산점'],
  ['정도윤', 'sample_doyun', '샘플 분당점'], ['한예린', 'sample_yerin', '샘플 강남점'],
  ['오시우', 'sample_siwoo', '샘플 일산점'], ['윤하은', 'sample_haeun', '샘플 분당점']
];

/* 💳 학생 카드결제 — /api/admin/payments/b2c */
const B2C = {
  ok: true, feeRate: 0.032, page: 1, pageSize: 50, total: 8, today: D(0),
  kpi: { today: { amount: 594000 }, month: { amount: 8316000 }, count: 42, fee: 266112,
         dayDelta: 0.12, monthDelta: 0.08, avgPerCase: 198000 },
  agencies: ['샘플 강남점', '샘플 분당점', '샘플 일산점'],
  unattributed: { count: 0, amount: 0 },
  daily: Array.from({ length: 30 }, (_, i) => ({ amount: 180000 + ((i * 53) % 9) * 70000 })),
  rows: STU.map(([n, id, ag], i) => ({
    date: D(i), student_name: n, user_id: id, agency: ag,
    method: i % 3 === 2 ? '카카오페이' : '신용카드', amount: [198000, 396000, 198000, 264000][i % 4]
  }))
};

/* 💼 강사 급여 자동 정산 — /api/admin/payroll/calculate */
const T = [['샘플 강사 A', 'Teacher Anna', 70], ['샘플 강사 B', 'Teacher Ben', 50],
           ['샘플 강사 C', 'Teacher Cara', 70], ['샘플 강사 D', 'Teacher Dan', 50],
           ['샘플 강사 E', 'Teacher Eve', 50]];
const PR_ROWS = T.map(([k, e, r20], i) => {
  const lessons = [86, 64, 72, 40, 55][i];
  const mins = lessons * 20, per10 = r20 / 2, calc = mins / 10 * per10;
  const ded = [0, 75, 25, 150, 0][i];
  return { teacher_id: 900 + i, korean_name: k, english_name: e, lesson_count: lessons,
    total_minutes: mins, fee_per_10min: per10, rate_per_20min: r20, level_code: r20 === 70 ? 'T2' : 'T1',
    calculated_amount: calc, deduction_total: ded, final_amount: calc - ded,
    absent_count: i === 3 ? 2 : 0, no_feedback_count: i === 1 ? 3 : 0,
    status: i < 2 ? 'paid' : 'pending', payroll_id: 5000 + i, paid_at: i < 2 ? Date.UTC(2026, 9, 5) : null };
});
const PAYROLL = {
  ok: true, rows: PR_ROWS,
  levels: [{ code: 'T1', label: 'Teacher 1', rate_per_20min: 50 }, { code: 'T2', label: 'Teacher 2', rate_per_20min: 70 }],
  summary: { teacher_count: 5, total_lessons: 317, total_deduction: 250, paid_count: 2,
    total_final: PR_ROWS.reduce((a, r) => a + r.final_amount, 0) }
};

/* 📅 수업 연기·변경 요청 — /api/admin/schedule-requests */
const SRQ = {
  ok: true, pending_count: 3,
  rows: [
    { id: 71, status: 'pending', request_type: 'change', request_scope: 'one', teacher_name: '샘플 강사 A', student_name: '김하나',
      orig_date: D(-1), orig_time: '19:00', new_date: D(-2), new_time: '20:00', reason: '학생 학교 행사', created_at: Date.UTC(2026, 9, 8, 2) },
    { id: 72, status: 'pending', request_type: 'postpone', request_scope: 'one', teacher_name: '샘플 강사 B', student_name: '이서준',
      orig_date: D(-3), orig_time: '17:20', reason: '가족 여행', fee_type: 'free', created_at: Date.UTC(2026, 9, 8, 5) },
    { id: 73, status: 'pending', request_type: 'change', request_scope: 'one', teacher_name: '샘플 강사 C', student_name: '박지우',
      orig_date: D(-2), orig_time: '18:00', new_date: D(-2), new_time: '18:40', reason: '학원 시간 변경', created_at: Date.UTC(2026, 9, 9, 1) }
  ]
};

/* 📚 수강신청 관리 — /api/admin/enrollments */
const ENR = {
  ok: true, direct: [],
  items: STU.slice(0, 6).map(([n, id], i) => ({
    id: 300 + i, created_at: Date.UTC(2026, 9, 8 - i), student_name: n, student_user_id: id,
    package: ['정규수업', '정규수업', '체험수업', '정규수업', '레벨테스트', '정규수업'][i],
    days_of_week: ['1,3', '2,4', '5', '1,3,5', '6', '2,4'][i], time: ['19:00', '17:20', '18:00', '20:00', '11:00', '16:40'][i],
    duration_months: [3, 6, 1, 3, 1, 12][i], started_at: D(-1 - i), monthly_fee_krw: [198000, 198000, 0, 264000, 0, 198000][i],
    status: ['pending', 'pending', 'confirmed', 'confirmed', 'pending', 'confirmed'][i],
    class_size: 1, assign_priority: i % 2 ? 'teacher' : 'time', teacher_name: i % 2 ? '샘플 강사 A' : ''
  }))
};

export const SAMPLE = {
  '/api/admin/payments/b2c': B2C,
  '/api/admin/payroll/calculate': PAYROLL,
  '/api/admin/schedule-requests': SRQ,
  '/api/admin/enrollments': ENR
};
