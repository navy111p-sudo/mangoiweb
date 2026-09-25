/**
 * enroll_ops_todo_harness.mjs — 수강 운영 «오늘 할 일» · 공휴일 한 곳 (2026-09-25)
 *
 * 왜 있나
 *   · 공휴일 표가 셋(enroll_holidays · calendar_events.holiday · holidays)인데 수업을 «미는» 것은
 *     enroll_holidays 하나뿐이다. 캘린더에만 적힌 한국 공휴일은 «아무것도 안 미는» 채로 남는다.
 *     calendarHolidaysMissing() 이 그 «빠진 날» 을 찾아 수강 운영 화면이 «옮기기» 로 보여 준다.
 *   · 그 판정은 문자열로는 못 본다(SQL 도 호출도 «있고» 틀린 것은 «무엇이 나오는가» 뿐).
 *     → 함수를 소스에서 오려 내 진짜 SQLite 에 실제로 돌린다.
 *   · 짝: 「빠진 KR 날은 나온다」 옆에 「이미 옮긴 날·PH·지난 날·휴가는 안 나온다」 ·
 *         「조회가 죽으면 ok:false (0건으로 위장하지 않는다)」.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..');
const SRC = readFileSync(join(ROOT, 'cloudflare-deploy/src/enroll-ops.ts'), 'utf8');
const HTML = readFileSync(join(ROOT, 'cloudflare-deploy/public/enroll-ops.html'), 'utf8');
const IA6 = readFileSync(join(ROOT, 'cloudflare-deploy/public/js/adm-ia6.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name); } };

let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); }
catch { console.log('⏭  node:sqlite 없음 — 이 검사는 SQL 을 실제로 돌려야 뜻이 있습니다.'); process.exit(0); }

/* 함수 몸통 자르기 — 선언 «줄» 의 마지막 { 가 몸통의 시작이다(반환 타입 Promise<{…}> 의 { } 는
   같은 줄 안에서 닫히므로 줄의 마지막 { 는 언제나 몸통). 거기서부터 중괄호 짝으로 자른다. */
function bodyOf(src, head) {
  const i = src.indexOf(head);
  if (i < 0) return '';
  const eol = src.indexOf('\n', i);
  const open = src.lastIndexOf('{', eol);
  if (open < i) return '';
  let d = 0;
  for (let k = open; k < src.length; k++) {
    if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(open + 1, k); }
  }
  return '';
}
const stripTs = (s) => s.replace(/\bas any\[\]/g, '').replace(/\bas any\b/g, '')
  .replace(/new Map<[^>]*>\(/g, 'new Map(').replace(/:\s*(?:any|string)(?:\[\])?(?=\s*[=;,)])/g, '');

console.log('\n[ ① calendarHolidaysMissing — 진짜 SQLite 로 실제 실행 ]');
const body = bodyOf(SRC, 'export async function calendarHolidaysMissing(');
ok('전제: 함수 몸통을 오려 냈다', body.length > 100);
let fn = null;
try { fn = new Function('env', 'today', 'return (async () => {' + stripTs(body) + '})();'); } catch (e) { console.log('   ', e.message); }
ok('전제: 오려 낸 몸통이 JS 로 돈다', typeof fn === 'function');

function makeEnv(db) {
  return { DB: { prepare(sql) { const st = db.prepare(sql); let args = [];
    const o = { bind(...a) { args = a; return o; }, async all() { return { results: st.all(...args) }; }, async first() { return st.get(...args) || null; } };
    return o; } } };
}
const db = new DatabaseSync(':memory:');
db.exec(`CREATE TABLE calendar_events (id INTEGER PRIMARY KEY, date TEXT, end_date TEXT, title TEXT, event_type TEXT, country TEXT, teacher_name TEXT);
         CREATE TABLE enroll_holidays (day TEXT PRIMARY KEY, name TEXT);
         CREATE TABLE holidays (country TEXT, date TEXT, name TEXT, source TEXT)`);
const insO = db.prepare('INSERT INTO holidays (country,date,name) VALUES (?,?,?)');
insO.run('KR', '2026-10-03', 'National Foundation Day'); // 캘린더에도 있음 → both, 이름은 캘린더 것
insO.run('KR', '2026-12-25', 'Christmas Day');           // 공식에만 → official 로 나와야 함
insO.run('KR', '2026-10-09', 'Hangul Day');              // 이미 옮김 → 안 나옴
insO.run('PH', '2026-11-30', 'Bonifacio Day');           // 필리핀 → 안 나옴
insO.run('KR', '2025-12-25', 'Christmas 2025');          // 지난 날 → 안 나옴
const ins = db.prepare('INSERT INTO calendar_events (date,title,event_type,country) VALUES (?,?,?,?)');
ins.run('2026-10-03', '개천절', 'holiday', 'KR');          // 빠진 KR → 나와야 함
ins.run('2026-10-09', '한글날', 'holiday', 'KR');          // 이미 옮김 → 안 나옴
ins.run('2026-10-20', '(나라 미기재)', 'holiday', null);    // 나라 빈칸 → 나옴(한국으로 봄)
ins.run('2026-11-01', 'All Saints', 'holiday', 'PH');       // 필리핀 → 안 나옴
ins.run('2026-09-01', '지난 날', 'holiday', 'KR');          // 지난 날 → 안 나옴
ins.run('2026-10-05', '강사 휴가', 'vacation', 'KR');       // 휴가 → 안 나옴
ins.run('2026-10-03', '개천절(중복)', 'holiday', 'KR');     // 같은 날 두 줄 → 한 번만
db.prepare('INSERT INTO enroll_holidays (day,name) VALUES (?,?)').run('2026-10-09', '한글날');

let r = null;
try { r = fn ? await fn(makeEnv(db), '2026-09-25') : null; } catch (e) { console.log('   ', e.message); }
const days = (r?.items || []).map((x) => x.day);
ok('ok:true 로 돌아온다', r && r.ok === true);
ok('빠진 한국 공휴일(10/03)은 나온다', days.includes('2026-10-03'));
ok('나라 빈칸(10/20)도 한국으로 보고 나온다', days.includes('2026-10-20'));
ok('이미 수강 운영에 있는 날(10/09)은 안 나온다', !days.includes('2026-10-09'));
ok('필리핀 공휴일(11/01)은 안 나온다 — 수업은 한국 날짜 기준', !days.includes('2026-11-01'));
ok('지난 날(09/01)은 안 나온다', !days.includes('2026-09-01'));
ok('휴가(vacation)는 안 나온다', !days.includes('2026-10-05'));
ok('같은 날 두 줄이어도 한 번만', days.filter((d) => d === '2026-10-03').length === 1);
ok('공식 공휴일에만 있는 날(12/25)도 나온다', days.includes('2026-12-25'));
ok('공식 표의 필리핀·지난 날은 안 나온다', !days.includes('2026-11-30') && !days.includes('2025-12-25'));
ok('날짜 순서대로(두 원천 합쳐서)', days.join(',') === '2026-10-03,2026-10-20,2026-12-25');
const d1003 = (r?.items || []).find((x) => x.day === '2026-10-03');
const d1225 = (r?.items || []).find((x) => x.day === '2026-12-25');
const d1020 = (r?.items || []).find((x) => x.day === '2026-10-20');
ok('두 곳에 다 있는 날은 src=both · 이름은 캘린더(사람이 적은 말)', d1003 && d1003.src === 'both' && d1003.name === '개천절');
ok('공식에만 있는 날은 src=official · 나라 KR', d1225 && d1225.src === 'official' && d1225.country === 'KR');
ok('캘린더에만 있는 날은 src=calendar', d1020 && d1020.src === 'calendar');
ok('둘 다 읽혔으면 failed 칸이 없다', r && !r.failed);

/* 한쪽 표가 없는 환경 — 다른 쪽 결과는 그대로 + «일부만» 이라고 말한다 */
const db2 = new DatabaseSync(':memory:');
db2.exec(`CREATE TABLE calendar_events (id INTEGER PRIMARY KEY, date TEXT, end_date TEXT, title TEXT, event_type TEXT, country TEXT, teacher_name TEXT);
          CREATE TABLE enroll_holidays (day TEXT PRIMARY KEY, name TEXT);
          INSERT INTO calendar_events (date,title,event_type,country) VALUES ('2026-10-03','개천절','holiday','KR');`);
let r3 = null;
try { r3 = await fn(makeEnv(db2), '2026-09-25'); } catch (e) { r3 = { threw: String(e.message) }; }
ok('공식 표가 없어도 캘린더 결과는 나온다(ok:true)', r3 && r3.ok === true && (r3.items || []).some((x) => x.day === '2026-10-03'));
ok('…그리고 «공식 공휴일은 못 읽었다» 고 알린다(failed:[official])', r3 && Array.isArray(r3.failed) && r3.failed.join() === 'official');
const db3 = new DatabaseSync(':memory:');
db3.exec(`CREATE TABLE enroll_holidays (day TEXT PRIMARY KEY, name TEXT);
          CREATE TABLE holidays (country TEXT, date TEXT, name TEXT, source TEXT);
          INSERT INTO holidays VALUES ('KR','2026-12-25','Christmas Day','api');`);
let r4 = null;
try { r4 = await fn(makeEnv(db3), '2026-09-25'); } catch (e) { r4 = { threw: String(e.message) }; }
ok('캘린더 표가 없어도 공식 결과는 나온다 + failed:[calendar]', r4 && r4.ok === true && (r4.items || []).some((x) => x.day === '2026-12-25') && (r4.failed || []).join() === 'calendar');

let r2 = null;
try { r2 = fn ? await fn({ DB: { prepare() { throw new Error('D1 down'); } } }, '2026-09-25') : null; } catch (e) { r2 = { threw: true }; }
ok('두 원천 다 죽으면 던지지 않고 ok:false (0건으로 위장하지 않음)', r2 && r2.ok === false && !r2.threw);

console.log('\n[ ② 오늘 할 일 요약 — 실패 칸을 0 으로 채우지 않는다 ]');
const todo = bodyOf(SRC, 'async function enrollTodoSummary(');
ok('전제: enrollTodoSummary 몸통을 오려 냈다', todo.length > 200);
ok('각 칸이 실패하면 { error } 로 돌려준다(5칸)', (todo.match(/=\s*\{\s*error:/g) || []).length >= 4 && /calendar_missing = miss\.ok \?/.test(todo));
ok('공휴일 이동 미리보기(무거운 sweep)를 첫 화면에서 부르지 않는다', !/runHolidayShiftSweep\s*\(/.test(todo));
ok('바인드는 자리표시자를 늘리지 않는다(instr 콤마 문자열)', /instr\(\?,/.test(todo));
ok('GET /todo 라우트가 있다', /\/api\/pay\/enroll\/admin\/todo/.test(SRC) && /enrollTodoSummary\(env\)/.test(SRC));

console.log('\n[ ③ 화면 — 환불 탭 중복 제거 · 탭과 사이드바가 같은 말 ]');
const tabs = [...HTML.matchAll(/data-t="([a-z]+)"/g)].map((m) => m[1]);
const uniq = [...new Set(tabs)];
ok('첫 탭은 «오늘 할 일»', uniq[0] === 'todo');
ok('환불 계산기 탭이 없다(환불 관리 화면과 중복)', !uniq.includes('refund'));
ok('옛 #refund 주소는 환불 관리로 보낸다', /refund[^\n]{0,80}\/admin\/refunds\.html/.test(HTML));
const ki = IA6.indexOf("ko: '수강 운영'");
const si = IA6.indexOf('secs:', ki);
const item = si > 0 ? IA6.slice(si, IA6.indexOf(']', si)) : '';
const secs = [...item.matchAll(/\bid:\s*'([a-z]+)'/g)].map((m) => m[1]);
console.log('   (사이드바 손자 탭:', secs.join(','), ')');
ok('사이드바 손자가 가리키는 탭이 화면에 전부 있다', secs.length >= 5 && secs.every((s) => uniq.includes(s)));
ok('사이드바에서 «수강 운영» 이 학생 그룹(수강신청 뒤)에 있다',
  IA6.indexOf("ko: '수강신청'") > 0 && IA6.indexOf("ko: '수강 운영'") > IA6.indexOf("ko: '수강신청'")
  && IA6.indexOf("ko: '수강 운영'") > IA6.indexOf("key: 'student'"));
ok('옛 자리(teacher:수강 운영)를 새 자리로 잇는다', /'teacher:수강 운영':\s*'student:수강 운영'/.test(IA6));

console.log('\n[ ④ 화면 — 원천을 말하고, 일부만 읽혔으면 그렇게 말한다 ]');
ok('후보 줄에 원천 표시(srcPill)가 붙는다', /srcPill\(h\.src\)/.test(HTML) && /function srcPill\(/.test(HTML));
ok('보기 화면이 calendar_failed 를 읽어 «일부» 라고 말한다', /j\.calendar_failed/.test(HTML) && /partial/.test(HTML));
ok('오늘 할 일이 failed 를 «확인 못 함» 으로 올린다', /m\.failed && m\.failed\.length\) fail\(/.test(HTML));
ok('서버가 failed 를 내려준다(요약·보기 둘 다)', /failed: miss\.failed \|\| \[\]/.test(SRC) && /calendar_failed: miss\.failed/.test(SRC));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
