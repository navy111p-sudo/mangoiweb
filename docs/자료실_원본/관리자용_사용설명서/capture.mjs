// 📘 관리자용 사용설명서 — 화면 캡처 (2026-10-09)
//   사용법(리포 루트):
//     1) cd cloudflare-deploy/public && python3 -m http.server 8977   (다른 창)
//     2) node docs/자료실_원본/관리자용_사용설명서/capture.mjs <캡처폴더> [이름,이름…]
//   배포되는 그 파일(public/)을 그대로 띄우고 /api/* 만 «시험용 가짜 데이터» 로 대신한다.
//   ⚠️ 실제 학생 정보를 쓰지 말 것 — 이 자료는 /library/ 밑이라 누구나 받을 수 있다.
//   ⚠️ 표가 비거나 숫자가 예시인 것은 스텁이라서다 — 진짜 버그로 읽지 말 것.
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const req = createRequire('/opt/node22/lib/node_modules/playwright/package.json');
const { chromium } = req('playwright');
const BASE = process.env.BASE || 'http://127.0.0.1:8977';
const OUT = process.argv[2];
const ONLY = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
const LANGS = (process.env.LANGS || 'ko,en').split(',');
mkdirSync(OUT, { recursive: true });

const pad = n => String(n).padStart(2, '0');
const ymd = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = new Date(); const T0 = ymd(today);
const addD = n => { const d = new Date(today); d.setDate(d.getDate() + n); return ymd(d); };
const nextDow = (dow) => { const d = new Date(today); d.setDate(d.getDate() + ((dow - d.getDay() + 7) % 7 || 7)); return ymd(d); };
const monday = (() => { const d = new Date(today); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return ymd(d); })();

const UID = 'emma2026', NAME = 'Emma Kim';
const TEACHERS = [
  { id: 901, name: 'Teacher Anna', name_en: 'Teacher Anna', active: 1, workplace: 'home', category: 'home' },
  { id: 902, name: 'Teacher Ben', name_en: 'Teacher Ben', active: 1, workplace: 'office', category: 'office' },
  { id: 903, name: 'Teacher Clara', name_en: 'Teacher Clara', active: 1, workplace: 'home', category: 'home' },
];
const STUDENTS = [
  { user_id: UID, name: NAME, track: 'live_ai', payment_type: 'B2C', signup_date: addD(-30), end_date: addD(150), classes_per_week: 2, created_at: new Date(Date.now() - 30 * 864e5).toISOString(), points: 1200, enroll_package: '정규 6개월', student_phone: '010-0000-0001', parent_phone: '010-0000-0002', teacher_phone: '02-000-0000', shop_name: 'Sample Academy', hq_name: 'Mangoi', branch2_name: 'Sample Branch', status: '재원', sessions: 18, sched: { weekly: 2, upcoming: 1, past: 3, total: 6, label_ko: '주 2회 · 단건 1회', label_en: '2/wk · 1 one-off', teachers: ['Teacher Anna'] } },
  { user_id: 'leo2026', name: 'Leo Park', track: 'ai_only', payment_type: 'B2B', signup_date: addD(-60), end_date: addD(30), classes_per_week: 1, created_at: new Date(Date.now() - 60 * 864e5).toISOString(), points: 300, enroll_package: '정규 3개월', student_phone: '010-0000-0003', parent_phone: '010-0000-0004', teacher_phone: '02-000-0000', shop_name: 'Sample Academy', hq_name: 'Mangoi', branch2_name: 'Sample Branch', status: '재원', sessions: 9, sched: { weekly: 1, upcoming: 0, past: 0, total: 1, label_ko: '주 1회', label_en: '1/wk', teachers: ['Teacher Ben'] } },
  { user_id: 'mia2026', name: 'Mia Choi', track: 'none', payment_type: 'B2C', signup_date: addD(-2), end_date: '', classes_per_week: 0, created_at: new Date(Date.now() - 2 * 864e5).toISOString(), points: 0, enroll_package: '', student_phone: '', parent_phone: '010-0000-0006', shop_name: 'Sample Academy', hq_name: 'Mangoi', status: '재원', sessions: 0, sched: { label_ko: '—', label_en: '—' } },
];
const base = { user_id: UID, student_name: NAME, duration_min: 20, teacher_id: '901', teacher_name: 'Teacher Anna', status: 'active', source: 'admin_ui', notes: '', created_at: new Date(Date.now() - 20 * 864e5).toISOString(), skip_dates: null };
const SCHED = [
  Object.assign({}, base, { id: 5001, schedule_kind: 'recurring', class_type: 'regular', day_of_week: '1,3', scheduled_date: null, start_time: '19:30', starts_on: addD(-20) }),
  Object.assign({}, base, { id: 5003, schedule_kind: 'one_off', class_type: 'makeup', day_of_week: null, scheduled_date: addD(3), start_time: '20:10', teacher_id: '902', teacher_name: 'Teacher Ben' }),
];

function sessionsToday() {
  const mk = (o) => Object.assign({ source: 'mangoi', observable: true, academy: 'Sample Academy', contact_phone: '010-0000-0002', level: 'L3', textbook: 'Smart Phonics 3', textbook_assigned: true, substituted: false, duration_min: 20, postponed: false, can_move: true, can_split: false, is_level_test: false, class_date: T0, pay_type: 'B2C', sched_label_ko: '주 2회', sched_label_en: '2/wk', last_eval: null, today_eval: null, eval_hidden: false }, o);
  const ts = (hm) => { const [h, m] = hm.split(':').map(Number); const [Y, M, D] = T0.split('-').map(Number); return Date.UTC(Y, M - 1, D, h - 9, m); };
  return [
    mk({ schedule_id: 6001, room_id: 'class-6001', student_uid: 'leo2026', student_name: 'Leo Park', teacher_id: '902', teacher_name: 'Teacher Ben', start_time: '16:00', start_ts: ts('16:00'), end_ts: ts('16:20'), status: 'ended', join_open: false, schedule_kind: 'one_off', teacher_entry: { state: 'on_time', at: ts('15:58'), late_min: 0 }, attendance: { state: 'attended', at: ts('15:59'), late_min: 0 } }),
    mk({ schedule_id: 6002, room_id: 'class-6002', student_uid: UID, student_name: NAME, teacher_id: '901', teacher_name: 'Teacher Anna', start_time: '19:30', start_ts: ts('19:30'), end_ts: ts('19:50'), status: 'open', join_open: true, schedule_kind: 'recurring', can_move: false, can_split: true, teacher_entry: { state: 'pending' }, attendance: { state: 'not_yet' } }),
    mk({ schedule_id: 6003, room_id: 'class-6003', student_uid: 'mia2026', student_name: 'Mia Choi', teacher_id: '903', teacher_name: 'Teacher Clara', start_time: '20:30', start_ts: ts('20:30'), end_ts: ts('20:50'), status: 'postponed', postponed: true, join_open: false, schedule_kind: 'one_off', teacher_entry: { state: 'postponed' }, attendance: { state: 'postponed' } }),
  ];
}

function weekItems() {
  const items = []; let id = 7000;
  const days = [0, 1, 2, 3, 4];
  const names = [['Emma Kim', UID], ['Leo Park', 'leo2026'], ['Mia Choi', 'mia2026'], ['Noah Lee', 'noah01'], ['Olivia Han', 'olivia01']];
  for (const d of days) for (const [ti, t] of TEACHERS.entries()) for (const h of [16, 18, 19, 20]) {
    if ((d + ti + h) % 3 === 0) continue;
    const date = (() => { const x = new Date(monday); x.setDate(x.getDate() + d); return ymd(x); })();
    const nm = names[(d + ti + h) % names.length];
    items.push({ id: ++id, move_version: 'v1', teacher_id: t.id, hour: h, start_time: pad(h) + ':' + (h % 2 ? '30' : '00'), type: (h === 20 && ti === 2) ? 'trial' : (h === 16 && ti === 1 ? 'makeup' : '1on1'), origin: 'class', students: [{ name: nm[0], uid: nm[1] }], duration_min: 20, note: '', move_field: 'day_of_week', date, start_date: monday, end_date: addD(7) });
  }
  return items;
}

const PAY_ROWS = [
  { teacher_id: 901, korean_name: '애나', english_name: 'Teacher Anna', fee_per_10min: 25, level_code: 'T1', level_label_ko: 'Teacher 1', level_label_en: 'Teacher 1', rate_per_20min: 50, rate_missing: false, lesson_count: 42, total_minutes: 840, calculated_amount: 2100, deduction_total: 50, final_amount: 2050, amount_source: 'd1', finish_count: 40, absent_count: 2, teacher_no_show_count: 0, no_feedback_count: 2, upcoming_count: 6, adjusted_amount: null, paid_amount: null, status: 'pending', paid_at: null, memo: null, payroll_id: null },
  { teacher_id: 902, korean_name: '벤', english_name: 'Teacher Ben', fee_per_10min: 35, level_code: 'T2', level_label_ko: 'Teacher 2', level_label_en: 'Teacher 2', rate_per_20min: 70, rate_missing: false, lesson_count: 36, total_minutes: 720, calculated_amount: 2520, deduction_total: 0, final_amount: 2520, amount_source: 'd1', finish_count: 36, absent_count: 0, teacher_no_show_count: 0, no_feedback_count: 0, upcoming_count: 4, adjusted_amount: null, paid_amount: 2520, status: 'paid', paid_at: new Date().toISOString(), memo: null, payroll_id: 11 },
  { teacher_id: 903, korean_name: '클라라', english_name: 'Teacher Clara', fee_per_10min: 25, level_code: 'T1', level_label_ko: 'Teacher 1', level_label_en: 'Teacher 1', rate_per_20min: 50, rate_missing: false, lesson_count: 28, total_minutes: 560, calculated_amount: 1400, deduction_total: 10, final_amount: 1390, amount_source: 'd1', finish_count: 27, absent_count: 1, teacher_no_show_count: 0, no_feedback_count: 0, upcoming_count: 3, adjusted_amount: null, paid_amount: null, status: 'pending', paid_at: null, memo: null, payroll_id: null },
];
const LEVELS = [{ code: 'T1', label_ko: 'Teacher 1', label_en: 'Teacher 1', rate_per_20min: 50 }, { code: 'T2', label_ko: 'Teacher 2', label_en: 'Teacher 2', rate_per_20min: 70 }];
const RULES = [
  { code: 'no_feedback_day', label_ko: '당일 피드백 미작성', label_en: 'No same-day feedback', rule_type: 'per_lesson', amount: 25, enabled: 1 },
  { code: 'late_no_extend', label_ko: '지각 연장실패(분당)', label_en: 'Late, not extended (per min)', rule_type: 'per_minute', amount: 10, enabled: 1 },
  { code: 'teacher_no_show', label_ko: '강사 미입장', label_en: 'Teacher no-show', rule_type: 'per_lesson', amount: 0, enabled: 1 },
  { code: 'absent_pay_percent', label_ko: '학생 결석 지급률', label_en: 'Student absent pay %', rule_type: 'policy_percent', amount: 0, enabled: 1 },
  { code: 'postponed_pay_percent', label_ko: '연기 수업 지급률', label_en: 'Postponed class pay %', rule_type: 'policy_percent', amount: 100, enabled: 1 },
  { code: 'postponed_early_pay_percent', label_ko: '사전 연기(시작 30분보다 이전) 지급률', label_en: 'Early postpone (30+ min before) pay %', rule_type: 'policy_percent', amount: 0, enabled: 1 },
];

function stub(state) {
  return async r => {
    const url = new URL(r.request().url()); const p = url.pathname; const m = r.request().method();
    const J = (o, s) => r.fulfill({ status: s || 200, contentType: 'application/json', body: JSON.stringify(o) });
    if (p === '/api/admin/me') return J({ ok: true, role: 'admin', roleLabel: '본사', user: { username: 'admin', name: 'Admin' }, scope: { label: '본사', type: 'hq' } });
    if (p === '/api/admin/students/create') return J({ ok: true, user_id: 'mia2026', temp_password: 'mango4821' });
    if (p === '/api/admin/students/unified' || p === '/api/admin/students/erp-list') return J({ ok: true, count: STUDENTS.length, can_view_pii: true, hidden_only: false, track_ok: true, students: STUDENTS, items: STUDENTS });
    if (p.startsWith('/api/admin/teachers')) return J({ ok: true, items: TEACHERS, teachers: TEACHERS });
    if (/\/api\/admin\/student\/[^/]+\/full/.test(p)) {
      const uid = decodeURIComponent(p.split('/')[4]); const s = STUDENTS.find(x => x.user_id === uid) || STUDENTS[0];
      return J({ ok: true, erp: { user_id: s.user_id, student_id: s.user_id, login_id: s.user_id, username: s.name, korean_name: s.name, status: '정상', shop_name: s.shop_name, created_at: s.created_at, signup_date: s.signup_date, end_date: s.end_date, parent_phone: s.parent_phone, student_phone: s.student_phone }, profile: {}, summary: {}, sessions: [], payments: [], enrollments: [], cafe: {}, by_day: [], evaluations: [], feedbacks: [], consultations: [], consent: {}, textbooks: [], rewards: [], recordings: [], hidden_info: null });
    }
    if (p === '/api/admin/class-schedules' && m === 'POST') return J({ ok: true, created: [{ id: 5001 }, { id: 5002 }] });
    if (/^\/api\/admin\/class-schedules\/\d+$/.test(p) && m === 'POST') return J({ ok: true, plan: { dates: [nextDow(1), nextDow(3)], from: T0, until: addD(150), until_source: 'enrollment' }, existing: [], made: 40, skipped: [], focus_id: 5101 });
    if (p === '/api/admin/class-schedules') {
      const items = state.noSched ? [] : SCHED.filter(x => !url.searchParams.get('user_id') || x.user_id === url.searchParams.get('user_id'));
      return J({ ok: true, count: items.length, items, merge_info: null });
    }
    if (p === '/api/pay/enroll/admin/move-candidates') return J({ ok: true, date: url.searchParams.get('date') || addD(3), time: url.searchParams.get('time') || '20:00', current: { id: 901, name: 'Anna', display_name: 'Teacher Anna', photo: null, free: true }, candidates: [{ id: 902, display_name: 'Teacher Ben', free: true }, { id: 903, display_name: 'Teacher Clara', free: false, why: 'busy' }], teacher_change_ok: true, busy_count: 1, student_conflict: false });
    if (p === '/api/admin/enrollments' && url.searchParams.get('user_id')) return J({ ok: true, items: [], direct: [] });
    if (p === '/api/admin/enrollments') return J({ ok: true, items: [
      { id: 301, student_name: NAME, student_user_id: UID, package: '정규 6개월', monthly_fee_krw: 160000, status: 'confirmed', days_of_week: '월,수', time: '19:30', class_size: '1:1', assign_priority: 'teacher', duration_months: 6, end_date: addD(150), teacher_name: 'Teacher Anna', created_at: Date.now() - 20 * 864e5 },
      { id: 302, student_name: 'Mia Choi', student_user_id: 'mia2026', package: '체험수업', monthly_fee_krw: 0, status: 'pending', days_of_week: '금', time: '20:30', class_size: '1:1', assign_priority: 'time', duration_months: 1, end_date: addD(7), teacher_name: '', created_at: Date.now() },
      { id: 303, student_name: 'Leo Park', student_user_id: 'leo2026', package: '정규 3개월', monthly_fee_krw: 90000, status: 'cancelled', days_of_week: '화', time: '16:00', class_size: '1:1', assign_priority: 'teacher', duration_months: 3, end_date: addD(30), teacher_name: 'Teacher Ben', created_at: Date.now() - 60 * 864e5 },
    ], direct: [] });
    if (p === '/api/admin/classes/today') { const s = sessionsToday(); return J({ ok: true, today: T0, date: T0, is_today: true, now: Date.now(), count: s.length, contact_source: 'retention', contact_missing: 0, counts: { mangoi: 3, cafe24: 0, joinable: 1 }, level_test_count: 0, sessions: s }); }
    if (p === '/api/admin/schedules') { const it = weekItems(); return J({ ok: true, week: monday, count: it.length, items: it, schedules: it }); }
    if (p === '/api/admin/schedule-requests' && m === 'POST') return J({ ok: true, id: 78, new_date: addD(45), new_time: '20:10', end_makeup: addD(42), last_date: addD(38), label: '연기보강' });
    if (p === '/api/pay/enroll/admin/series-move') { const its = []; for (let i = 0; i < 6; i++) its.push({ from_date: addD(3 + i * 7), from_time: '20:10', to_date: addD(4 + i * 7), to_time: '19:00' }); return J({ ok: true, items: its, teacher: { changed: false } }); }
    if (p === '/api/admin/schedule-requests' && m === 'GET') return J({ ok: true, pending_count: 1, rows: [
      { id: 77, request_type: 'postpone', status: 'pending', student_name: 'Leo Park', teacher_name: 'Teacher Ben', orig_date: addD(2), orig_time: '16:00', new_date: addD(9), new_time: '16:00', reason: '학교 행사', fee_type: 'free', created_at: Date.now() - 3600e3 },
      { id: 76, request_type: 'change', status: 'approved', student_name: NAME, teacher_name: 'Teacher Anna', orig_date: addD(-1), orig_time: '19:30', new_date: addD(1), new_time: '20:00', reason: '가족 일정', fee_type: 'free', decided_by: 'admin', decided_at: Date.now() - 1800e3, created_at: Date.now() - 864e5 } ] });
    if (p === '/api/admin/payroll/calculate') return J({ ok: true, year: today.getFullYear(), month: today.getMonth() + 1, summary: { teacher_count: 3, total_lessons: 106, total_amount: 6020, total_deduction: 60, total_final: 5960, paid_count: 1, unpaid_count: 2 }, levels: LEVELS, c24_unmatched: [], rows: PAY_ROWS });
    if (p === '/api/admin/payroll/lessons') { const tid = url.searchParams.get('teacher_id'); const row = PAY_ROWS.find(x => String(x.teacher_id) === tid) || PAY_ROWS[0];
      const ls = []; for (let i = 0; i < 8; i++) ls.push({ date: addD(-i * 2 - 1), start_time: '19:30', end_time: '19:50', schedule_id: 5001, student_name: i % 3 ? NAME : 'Leo Park', user_id: UID, lesson_type: 'regular', status: i === 2 ? 'absent' : (i === 5 ? 'postponed' : 'finish'), duration_minutes: 20, fee_per_10min: 25, rate_per_20min: 50, amount: i === 2 ? 0 : 50, deduction_total: i === 4 ? 25 : 0, net_amount: i === 2 ? 0 : (i === 4 ? 25 : 50), late_minutes: 0, feedback_ok: i !== 4 });
      return J({ ok: true, teacher: { teacher_id: row.teacher_id, name: row.english_name }, summary: row, rules: RULES, levels: LEVELS, absent_pay_percent: 0, postponed_pay_percent: 100, lessons: ls }); }
    if (p === '/api/admin/payroll/deduction-rules') return J({ ok: true, rules: RULES });
    if (p === '/api/admin/payroll/levels') return J({ ok: true, levels: LEVELS });
    if (p === '/api/admin/reports/fx-rate') return J({ ok: true, php_krw: 24.1, rate: 24.1, source: 'sample', date: T0 });
    if (p === '/api/admin/payroll/all') return J({ ok: true, year: today.getFullYear(), month: today.getMonth() + 1, items: TEACHERS.map((t, i) => ({ teacher_id: t.id, teacher_name: t.name, status: '재직', years: 1 + i, evaluation: { score_instruction: 85 + i, score_retention: 80 + i * 2, score_punctuality: 90, score_admin: 88, score_contribution: 75 }, weighted_total: 84 + i, grade: ['A', 'A', 'B'][i], rate_per_10min_php: [25, 35, 25][i], class_count: [42, 36, 28][i], monthly_salary_php: [2050, 2520, 1390][i], monthly_salary_krw: [49405, 60732, 33499][i] })) });
    if (p === '/api/admin/payroll/rates') return J({ ok: true, items: [], rates: [] });
    if (p === '/api/admin/mod/holidays/list') return J({ ok: true, rows: [] });
    if (p === '/api/approval/home') return J({ ok: true, me: { username: 'admin', is_exec: true, is_teacher: false, is_ph_manager: false }, inbox: [
      { id: 501, title: 'Printer ink purchase', amount: 2800, currency: 'PHP', status: 'pending', category: 'supplies', req_type: 'expense', steps: [{ stage: 1, role: 'mgr', status: 'approved', decided_by: 'mgr_jjw' }, { stage: 2, role: 'exec', status: 'pending' }], stage: 2, stage_total: 2, requester_username: 'mgr_karl', requester_name: 'Karl', stage_seq: 2, created_at: Date.now() - 3600e3 },
      { id: 502, title: 'Teacher leave (Oct 20)', amount: null, status: 'pending', category: 'leave', req_type: 'leave', steps: [{ stage: 1, role: 'any', status: 'pending' }], stage: 1, stage_total: 1, requester_username: 'mgr_karl', requester_name: 'Karl', stage_seq: 1, created_at: Date.now() - 7200e3 } ],
      mine: [], urgent: [], types: [], categories: [], statuses: [], summary: { ack_pending: 0 }, ack_pending: [], can_approve: true, colleagues: [] });
    if (p.startsWith('/api/approval/handover/home')) return J({ ok: true, reports: [{ id: 91, username: 'mgr_karl', name: 'Karl', date: T0, work: 'Checked 24 classes. Two teachers late.', issue: 'Room 3 PC slow', follow: 'Ask IT', created_at: new Date().toISOString(), status: 'submitted' }], files: [], required: [{ name: 'Karl', username: 'mgr_karl', weekdays: '1,2,3,4,5', required_today: true, submitted_at: new Date().toISOString() }, { name: 'Melca', username: 'mgr_melca', weekdays: '1,2,3,4,5', required_today: true, submitted_at: null }], missed_staff: [], own: null, schedule: { weekdays: '1,2,3,4,5', due_time: '18:00' }, read_schedule: {} });
    return J({ ok: true, items: [], rows: [], list: [], data: [], results: [], total: 0, count: 0 });
  };
}

const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome' });
async function ctxFor(lang, state = {}, vp = { width: 1440, height: 900 }) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
  await ctx.addInitScript((lang) => { try {
    localStorage.setItem('mangoi_admin_welcome_v1_done', '1');
    localStorage.setItem('mangoi_admin_session', JSON.stringify({ uid: 'admin', username: 'admin', role: 'admin', nationality: '' }));
    localStorage.setItem('mangoi_lang', lang); localStorage.setItem('mangoi_lang_by', 'user'); localStorage.setItem('mangoi_lang_uid', 'admin');
    localStorage.setItem('mangoi_admin_lang', lang);
    localStorage.setItem('mangoi_admin_manual_closed_v1:admin', new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10));
  } catch (e) {} }, lang);
  await ctx.route('**/api/**', stub(state));
  return ctx;
}
const NOISE = '#adm-identity-status,.adm-identity-banner,[id*="identity-status"],#mangoi-widget,#mangoi-toggle,#handover-inbox-banner,.adm-acct-changed,#ai-concierge-fab,#aiops-fab,#mi-ops-fab{display:none!important}';
async function quiet(page) {
  await page.addStyleTag({ content: NOISE }).catch(() => {});
  await page.evaluate(() => { document.querySelectorAll('div,section').forEach(el => { const t = (el.textContent || '').trim(); if (t.length < 80 && /로그인 계정이 변경|signed-in account changed/i.test(t) && getComputedStyle(el).position === 'fixed') el.style.display = 'none'; }); }).catch(() => {});
}
async function mark(page, sel, padPx = 6) {
  return page.evaluate(([sel, pad]) => {
    const el = typeof sel === 'string' ? document.querySelector(sel) : null; if (!el) return false;
    const r = el.getBoundingClientRect(); if (!r.width) return false;
    const b = document.createElement('div'); b.className = '__mark';
    b.style.cssText = `position:fixed;left:${r.left - pad}px;top:${r.top - pad}px;width:${r.width + pad * 2}px;height:${r.height + pad * 2}px;border:4px solid #e11d48;border-radius:12px;z-index:2147483647;pointer-events:none;box-shadow:0 0 0 4px rgba(225,29,72,.18)`;
    document.documentElement.appendChild(b); return true;
  }, [sel, padPx]);
}
const unmark = page => page.evaluate(() => document.querySelectorAll('.__mark').forEach(e => e.remove()));
const W = ms => new Promise(r => setTimeout(r, ms));
let LANG = 'ko';
async function shot(page, name, opts = {}) {
  if (ONLY && !ONLY.has(name)) return;
  await page.screenshot(Object.assign({ path: `${OUT}/${LANG}-${name}.jpg`, type: 'jpeg', quality: 82 }, opts));
  console.log('shot', LANG, name);
}
async function adminPage(state = {}) {
  const ctx = await ctxFor(LANG, state); const page = await ctx.newPage();
  page.on('dialog', d => d.dismiss().catch(() => {}));
  await page.goto(BASE + '/admin.html?_nc=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => typeof window.jumpToMenu === 'function', null, { timeout: 30000 });
  await W(2800); await quiet(page);
  return { ctx, page };
}
async function openCard(page, id, sub) {
  await page.evaluate(([id, sub]) => { window.jumpToMenu(id); const d = document.getElementById(id); if (d) d.open = true;
    if (sub) { const s = document.getElementById(sub); let x = s; while (x) { if (x.tagName === 'DETAILS') x.open = true; x = x.parentElement; } s && s.scrollIntoView({ block: 'start' }); window.scrollBy(0, -70); } }, [id, sub]);
  await W(1800); await quiet(page);
}
async function scrollTo(page, sel, block = 'start', dy = -80) { await page.evaluate(([s, b, dy]) => { const el = document.querySelector(s); if (el) { el.scrollIntoView({ block: b }); window.scrollBy(0, dy); } }, [sel, block, dy]); await W(500); }

for (const lang of LANGS) {
  LANG = lang;
  // ── 1. 로그인 · 첫 화면 · 메뉴 ──────────────────────────────
  { const ctx = await ctxFor(lang); const pg = await ctx.newPage(); await pg.goto(BASE + '/admin/login.html?_nc=' + Date.now()); await W(2000); await quiet(pg);
    await pg.addStyleTag({ content: 'video,.greet-video,[class*="greet"] video{display:none!important}' }).catch(() => {});
    await shot(pg, 'c1-login'); await ctx.close(); }
  { const { ctx, page } = await adminPage();
    await page.evaluate(() => window.scrollTo(0, 0)); await W(400);
    await page.addStyleTag({ content: '#mi-ops-fab{display:block!important}' }); await shot(page, 'c1-home');
    await page.addStyleTag({ content: '#mi-ops-fab{display:none!important}' });
    const s = await page.$('#ph85-search');
    if (s) { await s.fill(lang === 'en' ? 'payroll' : '급여'); await W(1200); await shot(page, 'c1-search'); await s.fill(''); }
    // ── 2. 학생 명부 · 등록 ────────────────────────────────
    await openCard(page, 'card-students-mgmt', 'sm-student-list');
    await page.evaluate(() => { const b = document.getElementById('sm-load-students'); b && b.click(); }); await W(2000);
    await scrollTo(page, '#sm-student-list', 'start', -70);
    await shot(page, 'c2-list');
    await page.evaluate(() => { const t = document.getElementById('sm-students-wrap'); if (t) t.scrollLeft = 520; }); await W(300);
    await scrollTo(page, '#sm-students-table', 'start', -160);
    await mark(page, '.sm-move-go', 4); await shot(page, 'c2-list-actions'); await unmark(page);
    await page.evaluate(() => { const t = document.getElementById('sm-students-wrap'); if (t) t.scrollLeft = 0; });
    await page.evaluate(() => { const b = document.getElementById('sm-add-student'); b && b.scrollIntoView({ block: 'center' }); }); await W(400);
    await mark(page, '#sm-add-student'); await shot(page, 'c2-add-button'); await unmark(page);
    await page.evaluate(() => window.smOpenRegisterModal()); await W(500);
    await page.fill('#sm-reg-uid', 'mia2026').catch(() => {}); await page.fill('#sm-reg-name', 'Mia Choi').catch(() => {});
    await page.fill('#sm-reg-parent-phone', '010-0000-0006').catch(() => {}); await page.fill('#sm-reg-shop', 'Sample Academy').catch(() => {});
    await page.fill('#sm-reg-notes', lang === 'en' ? 'Trial class' : '체험 수업').catch(() => {});
    await mark(page, '#sm-reg-submit', 4); await shot(page, 'c2-register-form'); await unmark(page);
    await page.click('#sm-reg-submit').catch(() => {}); await W(1000);
    await mark(page, '#sm-reg-msg', 4); await shot(page, 'c2-register-done'); await unmark(page);
    await page.evaluate(() => window.smCloseRegisterModal && window.smCloseRegisterModal()); await W(800);
    // ── 6. «⏸ 연기·변경» 고르기 창 (학생 목록에서) ─────────────
    await page.evaluate(() => { const b = document.querySelector('.sm-move-go'); b && b.click(); }); await W(2500);
    await shot(page, 'c5-pick-window');
    await page.evaluate(() => { const c = document.getElementById('tc-pick-close'); c && c.click(); const m = document.getElementById('tc-pick-modal'); if (m) m.remove(); }); await W(400);
    // ── 오늘 수업 ───────────────────────────────────────────
    await openCard(page, 'card-students-mgmt', 'sm-today-classes');
    await page.evaluate(() => { const b = document.getElementById('tc-load'); b ? b.click() : (window.tcLoadToday && window.tcLoadToday()); }); await W(2500);
    await scrollTo(page, '#sm-today-classes', 'start', -70);
    await shot(page, 'c3-today');
    await mark(page, '.tc-move-pin', 4); await page.evaluate(() => { const b = document.querySelector('.tc-move-pin'); b && b.scrollIntoView({ block: 'center', inline: 'center' }); }); await unmark(page); await mark(page, '.tc-move-pin', 4);
    await shot(page, 'c3-today-move'); await unmark(page);
    // ── 연기·변경 요청함 ─────────────────────────────────────
    await openCard(page, 'card-schedule-requests'); await scrollTo(page, '#card-schedule-requests', 'start', -70); await W(1200);
    await shot(page, 'c5-requests');
    // ── 수강신청 ───────────────────────────────────────────
    await openCard(page, 'card-enrollments'); await W(1500);
    await page.evaluate(() => { const t = document.getElementById('en-multi-table'); let x = t; while (x) { if (x.tagName === 'DETAILS') x.open = true; x = x.parentElement; } }); await W(500);
    await scrollTo(page, '#card-enrollments', 'start', -70);
    await shot(page, 'c4-enroll-form');
    await scrollTo(page, '#enrollments-table', 'start', -140); await W(500);
    await shot(page, 'c4-enroll-list');
    // ── 급여 ────────────────────────────────────────────────
    await openCard(page, 'card-payroll-auto'); await scrollTo(page, '#card-payroll-auto', 'start', -70);
    await page.evaluate(() => window.prCalculate && window.prCalculate()); await W(2500);
    await shot(page, 'c8-payroll');
    await scrollTo(page, '#pr-table', 'start', -120); await shot(page, 'c8-payroll-table');
    await page.evaluate(() => window.prToggleRules && window.prToggleRules()); await W(1500);
    await scrollTo(page, '#pr-rules', 'start', -100); await shot(page, 'c8-payroll-rules');
    await page.evaluate(() => window.prToggleRules && window.prToggleRules()); await W(400);
    await page.evaluate(() => window.prShowDetail && window.prShowDetail(901)); await W(2200);
    await scrollTo(page, '#pr-detail', 'start', -100); await shot(page, 'c8-payroll-detail');
    await openCard(page, 'card-payroll'); await scrollTo(page, '#card-payroll', 'start', -70);
    await page.evaluate(() => window.calcPayrollAll && window.calcPayrollAll()); await W(2200);
    await shot(page, 'c8-payroll-dash');
    await ctx.close(); }

  // ── 학생 상세 · 수업 입력 · 연기·변경·취소 ──────────────────
  { const ctx = await ctxFor(lang); const pg = await ctx.newPage(); pg.on('dialog', d => d.accept().catch(() => {}));
    await pg.goto(BASE + `/admin/student.html?uid=${UID}&lang=${lang}&_nc=` + Date.now(), { waitUntil: 'domcontentloaded' }); await W(2800); await quiet(pg);
    await mark(pg, '.tab[data-tab="schedule"]', 4); await shot(pg, 'c2-detail'); await unmark(pg);
    await pg.click('.tab[data-tab="schedule"]'); await W(2200); await quiet(pg);
    await scrollTo(pg, '#aiSchedulesSection', 'start', -90); await shot(pg, 'c4-sched-top');
    // 수업 예약 등록 (정규)
    await scrollTo(pg, '#ns-add', 'center', 0);
    await pg.selectOption('#ns-kind', 'regular').catch(() => {});
    await pg.evaluate(() => { document.querySelectorAll('.ns-day').forEach(c => { c.checked = (c.value === '1' || c.value === '3'); c.dispatchEvent(new Event('change', { bubbles: true })); }); });
    await pg.fill('#ns-start', nextDow(1)).catch(() => {}); await pg.fill('#ns-time', '19:30').catch(() => {}); await pg.fill('#ns-dur', '20').catch(() => {});
    await W(400); await pg.selectOption('#ns-teacher-sel', '901').catch(() => {});
    await pg.evaluate(() => { const el = document.getElementById('ns-kind'); const box = el && el.closest('div[style*="border-top"]'); if (box) box.id = '__nsbox'; });
    await mark(pg, '#__nsbox', 6); await shot(pg, 'c4-add-regular'); await unmark(pg);
    // 하루짜리(보강)
    await pg.selectOption('#ns-kind', 'makeup').catch(() => {}); await W(400);
    await pg.fill('#ns-date', addD(3)).catch(() => {}); await pg.fill('#ns-time', '20:10').catch(() => {});
    await pg.selectOption('#ns-teacher-sel', '902').catch(() => {});
    await mark(pg, '#__nsbox', 6); await shot(pg, 'c4-add-oneoff'); await unmark(pg);
    await pg.selectOption('#ns-kind', 'regular').catch(() => {});
    // 날짜 칩 → 할 일
    await scrollTo(pg, '#aiSchedulesSection', 'start', -90);
    await pg.evaluate(() => { const c = document.querySelector('.mgsu-chip[data-mgsu-occ]'); c && c.click(); }); await W(900);
    await mark(pg, '#mgsuAct', 4); await shot(pg, 'c5-chip-act'); await unmark(pg);
    // 요일별 보기
    await pg.evaluate(() => { const f = document.getElementById('mgsuFold'); if (f) { f.open = true; f.scrollIntoView({ block: 'start' }); window.scrollBy(0, -90); } }); await W(700);
    await shot(pg, 'c5-weekly-rows');
    // 이동 창 열기 (날짜 칩 → 연기·변경·취소)
    await scrollTo(pg, '#aiSchedulesSection', 'start', -90);
    // 하루짜리(보강) 칩을 고른다 — 나누기 없이 바로 열린다
    await pg.evaluate((d) => { const c = [...document.querySelectorAll('.mgsu-chip[data-mgsu-occ]')].find(x => /\|5003$/.test(x.getAttribute('data-mgsu-occ'))); c && c.click(); }, addD(3)); await W(800);
    await pg.evaluate(() => { const b = document.querySelector('[data-mgsu-move]'); b && b.click(); }); await W(2500);
    await shot(pg, 'c5-move-open');
    const mode = async (m) => { await pg.evaluate((m) => { const b = document.querySelector(`[data-mv-mode="${m}"]`); b && b.click(); }, m); await W(1200); };
    await mode('postpone');
    await pg.evaluate(() => { const b = document.querySelector('[data-mv-sub="date"]'); b && b.click(); }); await W(1200);
    await pg.evaluate(() => { const d = document.querySelectorAll('[data-mv-day]'); d[3] && d[3].click(); }); await W(500);
    await pg.evaluate(() => { const h = document.querySelectorAll('[data-mv-hm]'); h[2] && h[2].click(); }); await W(1500);
    await shot(pg, 'c5-move-postpone-date');
    await pg.evaluate(() => { const b = document.querySelector('[data-mv-sub="hold"]'); b && b.click(); }); await W(800); await shot(pg, 'c5-move-postpone-hold');
    await pg.evaluate(() => { const b = document.querySelector('[data-mv-sub="end"]'); b && b.click(); }); await W(1500); await shot(pg, 'c5-move-postpone-end');
    await mode('series');
    await pg.evaluate(() => { const d = document.querySelectorAll('[data-mv-day]'); d[4] && d[4].click(); }); await W(500);
    await pg.evaluate(() => { const h = document.querySelectorAll('[data-mv-hm]'); h[1] && h[1].click(); }); await W(1500);
    await shot(pg, 'c5-move-change');
    const hasCancel = await pg.evaluate(() => !!document.querySelector('[data-mv-mode="cancel"]'));
    if (hasCancel) { await mode('cancel'); await shot(pg, 'c6-move-cancel'); }
    await pg.evaluate(() => { const c = document.getElementById('tc-mv-close'); c && c.click(); }); await W(600);
    // 캘린더
    await scrollTo(pg, '#d-sched-calendar', 'start', -150); await pg.evaluate(() => { const c = document.getElementById('d-sched-calendar'); if (!c) return; [c, ...c.querySelectorAll('*')].forEach(e => { if (e.scrollHeight > e.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(e).overflowY)) e.scrollTop = e.scrollHeight; }); }); await W(800); await shot(pg, 'c5-calendar-week');
    await pg.evaluate(() => { const b = document.getElementById('d-sched-view-month'); b && b.click(); }); await W(1200);
    await scrollTo(pg, '#d-sched-calendar', 'start', -150); await shot(pg, 'c5-calendar-month');
    await ctx.close(); }

  // ── 주간 시간표 ─────────────────────────────────────────────
  { const ctx = await ctxFor(lang, {}, { width: 1600, height: 950 }); const pg = await ctx.newPage(); pg.on('dialog', d => d.dismiss().catch(() => {}));
    await pg.goto(BASE + `/admin/weekly-schedule.html?lang=${lang}&_nc=` + Date.now(), { waitUntil: 'domcontentloaded' }); await W(3500); await quiet(pg);
    await mark(pg, '#ws-lock-btn', 4); await shot(pg, 'c7-weekly'); await unmark(pg);
    await pg.evaluate(() => { const b = document.getElementById('ws-lock-btn'); b && b.click(); }); await W(800);
    await mark(pg, '#ws-lock-btn', 4); await shot(pg, 'c7-weekly-edit'); await unmark(pg);
    await pg.goto(BASE + `/admin/weekly-schedule.html?preset=today&lang=${lang}&_nc=` + Date.now(), { waitUntil: 'domcontentloaded' }); await W(3500); await quiet(pg);
    await pg.evaluate(() => { const b = document.getElementById('ws-lock-btn'); b && !b.classList.contains('on') && b.click(); }); await W(600);
    await pg.evaluate(() => { document.querySelectorAll('button,span').forEach(b => { if (b.textContent.trim() === '✕' && b.closest('[class*=guide],[id*=guide]')) b.click(); }); document.querySelectorAll('[id*=guide],[class*=guide-pop]').forEach(e => { if (getComputedStyle(e).position === 'fixed') e.style.display = 'none'; }); }); await W(300);
    await shot(pg, 'c7-daily');
    const slot = await pg.$('td.slot.slot-1on1, .slot-1on1'); if (slot) { const bb = await slot.boundingBox(); await pg.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, { button: 'right' }); await W(900); await shot(pg, 'c7-weekly-ctx'); await pg.keyboard.press('Escape'); }
    await ctx.close(); }

  // ── 결재 · 매일보고 ───────────────────────────────────────
  { const ctx = await ctxFor(lang); const pg = await ctx.newPage();
    await pg.goto(BASE + `/work.html?lang=${lang}&_nc=` + Date.now(), { waitUntil: 'domcontentloaded' }); await W(3000); await quiet(pg); await shot(pg, 'c9-approval');
    await pg.goto(BASE + `/daily-handover.html?lang=${lang}&_nc=` + Date.now(), { waitUntil: 'domcontentloaded' }); await W(3000); await quiet(pg); await shot(pg, 'c9-handover');
    await ctx.close(); }
  console.log('done', lang);
}
await browser.close();
