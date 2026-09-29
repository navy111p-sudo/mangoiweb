/* 📅 수강신청 목록 «직접 배정» 줄 + 목록 속도 (2026-09-29 사장님)
 *  ① groupDirectClasses 를 타입 제거로 실제로 돌린다(묶기·요일·기간)
 *  ② 서버 SQL 을 오려 내 진짜 SQLite 에 돌린다 — admin_ui 만 · 취소 제외 · 30일 전 일회성 제외 · 매주 수업은 남김
 *  ③ 게이트: 본사만·필터 요청엔 안 실음 / 스키마 보강은 인스턴스당 한 번
 *  ④ 화면: _enDirectRows 를 오려 내 돌린다 — 그린다 · 검색이 걸린다 · (짝) 비면 아무것도 안 그린다 ·
 *     일괄삭제·내보내기 목록(__enShown)에 섞이지 않는다
 */
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
let PASS = 0, FAIL = 0;
const ok = (c, n) => { if (c) { PASS++; console.log('  ✅ ' + n); } else { FAIL++; console.log('  ❌ ' + n); } };
const SRC = readFileSync('cloudflare-deploy/src/enroll-direct.ts', 'utf8');
const A = readFileSync('cloudflare-deploy/src/api-admin.ts', 'utf8');
const C = readFileSync('cloudflare-deploy/public/js/adm-core.js', 'utf8');

const js = SRC.replace(/^export /gm, '')
  .replace(/export interface[\s\S]*?\n}\n/, '').replace(/interface DirectGroup[\s\S]*?\n}\n/, '')
  .replace(/: Record<string, number>/g, '').replace(/\): (number\[\]|DirectGroup\[\])/g, ')')
  .replace(/\((v|rows): any(\[\])?\)/g, '($1)').replace(/: DirectGroup\b/g, '').replace(/: number\[\]/g, '')
  .replace(/: 'dated' \| 'recurring'/g, '').replace(/<string, DirectGroup>/g, '').replace(/: number \| undefined/g, '');
let M = null;
try { M = new Function(js + '\nreturn { groupDirectClasses, directDows };')(); } catch (e) { console.log('  ' + e.message); }
console.log('① 묶기');
ok(!!M, '전제: 정본을 실행할 수 있다');
if (M) {
  const g = M.groupDirectClasses([
    { user_id: 'jjy2323', student_name: '장지웅', teacher_id: '7', teacher_name: 'KARL', start_time: '16:40', duration_min: 20, scheduled_date: '2026-09-29', created_at: 10 },
    { user_id: 'jjy2323', student_name: '장지웅', teacher_id: '7', teacher_name: 'KARL', start_time: '16:40', duration_min: 20, scheduled_date: '2026-10-06', created_at: 20 },
    { user_id: 'jjy2323', student_name: '', teacher_id: '7', teacher_name: 'KARL', start_time: '16:40', duration_min: 20, scheduled_date: '2026-10-01', created_at: 5 },
    { user_id: 'jjy2323', teacher_id: '7', start_time: '17:00', duration_min: 20, scheduled_date: '2026-09-29', created_at: 1 },
    { user_id: 'kim', teacher_id: '3', start_time: '10:00', duration_min: 30, day_of_week: 'Mon,Wed', created_at: 30 },
  ]);
  const a = g.find(x => x.start_time === '16:40');
  ok(g.length === 3, '같은 학생·강사·시각·길이는 한 줄로(날짜마다 한 줄 아님)');
  ok(a && a.count === 3 && a.first_date === '2026-09-29' && a.last_date === '2026-10-06', '기간(첫날~끝날)과 횟수');
  ok(a && JSON.stringify(a.dows) === '[2,4]', '요일을 모은다(화·목, 월요일부터)');
  ok(a && a.student_name === '장지웅', '이름이 빈 행이 섞여도 이름을 채운다');
  const k = g.find(x => x.user_id === 'kim');
  ok(k && k.kind === 'recurring' && JSON.stringify(k.dows) === '[1,3]' && k.first_date === null, '매주 수업은 «매주» · 요일 표기(Mon,Wed)를 읽는다');
  ok(g[0].user_id === 'kim', '최근 만든 것이 먼저');
  ok(JSON.stringify(M.directDows('0')) === '[0]' && JSON.stringify(M.directDows('월, 목')) === '[1,4]' && M.directDows('xyz').length === 0, '요일 표기 셋(숫자·한글·모르는 값은 버림)');
}

console.log('② 서버 SQL (진짜 SQLite)');
{
  const m = A.match(/const ds = await env\.DB\.prepare\(\s*`([\s\S]*?)`\s*\)\.all/);
  ok(!!m, '전제: 직접 배정 SQL 을 오려 냈다');
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE class_schedules (id INTEGER PRIMARY KEY, user_id TEXT, student_name TEXT, teacher_id TEXT, start_time TEXT, duration_min INTEGER, schedule_kind TEXT, day_of_week TEXT, scheduled_date TEXT, class_type TEXT, created_at INTEGER, status TEXT, source TEXT);
           CREATE TABLE teachers (id INTEGER PRIMARY KEY, name TEXT, status TEXT, user_id TEXT);`);
  db.prepare(`INSERT INTO teachers VALUES (7,'KARL','active','x')`).run();
  const ins = db.prepare(`INSERT INTO class_schedules (id,user_id,teacher_id,start_time,duration_min,scheduled_date,day_of_week,status,source,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)`);
  const today = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
  const old = new Date(Date.now() + 9 * 3600e3 - 60 * 86400e3).toISOString().slice(0, 10);
  ins.run(1, 'jjy2323', '7', '16:40', 20, today, null, 'active', 'admin_ui', 1);
  ins.run(2, 'jjy2323', '7', '16:40', 20, today, null, 'cancelled', 'admin_ui', 2);
  ins.run(3, 'x', '7', '16:40', 20, today, null, 'active', 'adm-enroll:5', 3);
  ins.run(4, 'y', '7', '16:40', 20, old, null, 'active', 'admin_ui', 4);
  ins.run(5, 'z', '7', '10:00', 20, null, '1', 'active', 'admin_ui', 5);
  let rows = [];
  try { rows = db.prepare(m ? m[1] : 'SELECT 1').all(); } catch (e) { console.log('  ' + e.message); }
  const ids = rows.map(r => r.id).sort().join(',');
  ok(ids === '1,5', `admin_ui 만 · 취소 제외 · 신청서가 만든 수업 제외 · 30일 전 일회성 제외 · 매주 수업은 남김 (${ids})`);
  ok(rows.find(r => r.id === 1)?.teacher_name === 'KARL', '강사 이름을 붙인다(teacher_id 문자열 ↔ 숫자 id)');
}

console.log('③ 게이트·속도');
{
  const i = A.indexOf('let direct: any[] | undefined;');
  const seg = A.slice(i, i + 400);
  ok(/!statusF && !userIdF/.test(seg) && /!_enActor\.isTeacher/.test(seg) && /!isOrgScopedRole\(_enActor\.role\)/.test(seg), '본사만 · 상태/학생 필터 요청엔 안 싣는다');
  ok(/\.\.\.\(direct \? \{ direct \} : \{\}\)/.test(A), '응답에 direct 를 싣는다(못 구하면 칸 자체를 안 실음)');
  const j = A.indexOf("path === '/api/admin/enrollments') {");
  const head = A.slice(j, j + 900);
  ok(/if \(!_enrSchemaReady\) \{/.test(head) && head.indexOf('if (!_enrSchemaReady)') < head.indexOf('CREATE TABLE IF NOT EXISTS enrollments'), '스키마 보강(CREATE+ALTER)은 플래그 안 — 매 요청마다 안 돈다');
  ok(/_enrSchemaReady = true;/.test(A) && /^let _enrSchemaReady = false;/m.test(A), '(짝) 한 번 돈 뒤 플래그를 세운다');
  const gCnt = (A.slice(j, j + 12000).match(/await getAdminActor\(request, env as any\)/g) || []).length;
  ok(gCnt === 1, `역할 조회는 GET 안에서 한 번(${gCnt})`);
}

console.log('④ 화면');
{
  const i0 = C.indexOf('function _enDirectRows(q) {');
  let d = 0, i1 = -1;
  for (let i = C.indexOf('{', i0); i0 > 0 && i < C.length; i++) { if (C[i] === '{') d++; else if (C[i] === '}') { d--; if (!d) { i1 = i; break; } } }
  ok(i1 > 0, '전제: _enDirectRows 를 오려 냈다');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  let f = null;
  try { f = new Function('adminLang', '_enDirect', '_esc', '_fmtDate', C.slice(i0, i1 + 1) + '\nreturn _enDirectRows;'); } catch (e) { console.log('  ' + e.message); }
  const G = [{ user_id: 'jjy2323', student_name: '장지웅', teacher_name: 'KARL', start_time: '16:40', duration_min: 20, kind: 'dated', dows: [2], first_date: '2026-09-29', last_date: '2026-09-29', count: 1, created_at: 1 }];
  const run = (L, list, q) => { try { return f(L, list, esc, () => '2026. 9. 29.')(q); } catch (e) { return 'ERR ' + e.message; } };
  const h = run('ko', G, '');
  ok(/장지웅/.test(h) && /jjy2323/.test(h) && /KARL/.test(h) && /16:40/.test(h) && /직접 배정/.test(h), '직접 배정 줄을 그린다(이름·아이디·강사·시각)');
  ok(/weekly-schedule\.html/.test(h), '관리는 주간 스케줄로 보낸다');
  ok(!/onclick=/.test(h) && !/en-sel/.test(h), '신청서 버튼(취소·삭제·체크박스)이 없다 — 신청서 id 로 엉뚱한 행을 건드리지 않게');
  ok(run('ko', G, 'jjy') !== '' && run('ko', G, 'nomatch') === '', '검색이 걸린다(짝: 안 맞으면 안 그림)');
  ok(run('ko', [], '') === '', '(짝) 직접 배정이 없으면 아무것도 안 그린다');
  ok(/Direct assignment/.test(run('en', G, '')), 'EN 화면');
  const r0 = C.indexOf('function _renderEnrollments()');
  const body = C.slice(r0, C.indexOf('\nfunction ', r0 + 10));
  ok(/__enShown = rows;/.test(body) && !/__enShown = [^;]*_enDirect/.test(body), '일괄 삭제·내보내기 목록(__enShown)에 섞이지 않는다');
  ok(/\}\)\.join\(''\) \+ directHtml;/.test(body) && /if \(directHtml\) \{ tb\.innerHTML = directHtml; return; \}/.test(body), '신청서 뒤에 붙이고, 신청서가 0건이어도 그린다');
  ok(/_enDirect = \(d && Array\.isArray\(d\.direct\)\) \? d\.direct : \[\];/.test(C), '응답의 direct 를 받는다(없으면 빈 목록)');
}
console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
