// Synthetic API data only. No real account, credential, database, or network client.
export const BASE = 'http://127.0.0.1:18765';
export const NOW = '2026-10-08T00:00:00.000Z';
export const SOURCE_COMMIT = '44cacf247e8a2828531a4f3977224f7dbe2f4ec1';
export const SOURCE_TREE = 'f340a08e6aaa3fe747aec202530d53ac5bf750e7';
export const SOURCE_PAGE_SHA256 = 'b77217cc28434bbb251d3938186fd88385e87a443dc37daac68d1f07c749a750';
export const PAGE_PATH = '/admin/student.html';
export const STUDENTS = ['fixture_A', 'fixture_B'];
export function seedRows() {
  const base = { user_id: 'fixture_A', student_name: 'Synthetic Student A', teacher_id: '5',
    teacher_name: 'Synthetic Teacher', class_type: 'regular', status: 'active', duration_min: 20,
    schedule_kind: 'dated', day_of_week: '', start_time: '19:00' };
  return [
    { ...base, id: 1, source: 'adm-enroll:order_A', scheduled_date: '2026-10-08' },
    { ...base, id: 2, source: 'adm-enroll:order_B', scheduled_date: '2026-10-16' },
    { ...base, id: 3, source: 'admin_ui', schedule_kind: 'recurring', day_of_week: 'Thu', scheduled_date: null },
    { ...base, id: 4, user_id: 'fixture_B', student_name: 'Synthetic Student B', source: 'adm-enroll:order_C', scheduled_date: '2026-10-17' },
    { ...base, id: 5, source: 'adm-enroll:order_A', scheduled_date: '2026-10-18', status: 'cancelled' },
  ];
}
export const json = (body, status = 200) => ({ status, contentType: 'application/json', body: JSON.stringify(body), headers: { 'cache-control': 'no-store' } });
export function nextSyntheticStatus(previous, method, status, body) {
  if (method === 'DELETE') return status >= 200 && status < 300 && body.ok === true ? 'cancelled' : previous;
  if (method === 'POST') {
    if ((status >= 200 && status < 300 && body.ok === true && body.restored === true) || body.status === 'active') return 'active';
    if (typeof body.status === 'string') return body.status;
  }
  return previous;
}
export function isPreviewRequest(url, method = 'GET') {
  return method === 'GET' && url.pathname === '/api/admin/class-schedules'
    && STUDENTS.includes(url.searchParams.get('user_id')) && url.searchParams.get('limit') === '500'
    && [...url.searchParams.keys()].sort().join(',') === 'limit,user_id';
}
export function auxiliaryRead(url) {
  const path = url.pathname;
  const full = path.match(/^\/api\/admin\/student\/(fixture_[AB])\/full$/);
  if (full) return { ok: true, erp: { user_id: full[1], username: 'Synthetic Student ' + full[1].slice(-1),
    student_id: full[1], end_date: '2026-12-31', status: '정상' }, profile: {}, summary: {},
    hidden_info: { hidden: false }, can_hide: false, enrollments: [], sessions: [], by_day: [] };
  if (/^\/api\/admin\/student\/fixture_[AB]\/extensions$/.test(path)) return { ok: true, items: [] };
  const reads = {
    '/api/admin/me': { ok: true, username: 'fixture_admin', role: 'hq_exec', user: { username: 'fixture_admin', role: 'hq_exec' } },
    '/api/admin/teachers': { ok: true, items: [{ id: 5, name: 'Synthetic Teacher', status: 'active', workplace: 'office' }] },
    '/api/judgment/growth': { ok: true, events_count: 0, radar: {}, trends: [], top_misconceptions: [] },
    '/api/admin/enrollments': { ok: true, items: [] },
    '/api/admin/reports/scene-homework': { ok: true, items: [], rows: [] },
    '/api/calendar/events': { ok: true, events: [], items: [] },
    '/api/admin/mod/holidays/list': { ok: true, items: [] },
  };
  return Object.hasOwn(reads, path) ? reads[path] : undefined;
}
export function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
