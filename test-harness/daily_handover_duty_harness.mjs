// 📌 매일보고 «반드시 작성» · «어제 미제출» 알림 — 2026-10-06 사장님 지시.
//   대상: 장지웅(KR, 18:00) · Maimai(20:00) · Melca(23:00) · Karl(22:00) — 외국인 3명은 PH 공휴일.
//   공휴일은 작성 안 함 · 지난 근무일 미제출은 본인 + 대표님(admin) 에게.
// 진짜 SQLite 위에서 정본(daily-handover.ts)을 «실제로 돌립니다» — 운영 D1 은 안 건드립니다.
// 짝으로 묻습니다: «안 쓴 사람은 알린다» 옆에 «쓴 사람·공휴일·주말·창 밖은 안 알린다».
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const tsPath = ['../cloudflare-deploy/node_modules/typescript', '/opt/node22/lib/node_modules/typescript']
  .find(p => { try { require.resolve(p); return true; } catch { return false; } });
if (!tsPath) { console.log('⏭  typescript 없음 — 건너뜀'); process.exit(0); }
const ts = require(tsPath);

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; } else { fail++; console.log('❌ FAIL', name, extra); } };

const SRC = process.env.HANDOVER_SRC || 'cloudflare-deploy/src/daily-handover.ts';
const code = ts.transpileModule(readFileSync(SRC, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

function setup({ withHolidays = true } = {}) {
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE admin_account(username TEXT PRIMARY KEY,name TEXT); CREATE TABLE admin_scope(username TEXT,scope_type TEXT);
  CREATE TABLE push_subscriptions(endpoint TEXT,user_id TEXT,enabled INTEGER);
  CREATE TABLE push_queue(endpoint TEXT,title TEXT,body TEXT,url TEXT,icon TEXT,badge TEXT,tag TEXT,queued_at INTEGER);
  INSERT INTO admin_account VALUES('admin','정우영'),('mgr_jjw','장지웅 (본사 매니저)'),('mgr_melca','Melca (본사 매니저)'),('mgr_karl','Karl (본사 매니저)'),('mgr_maimai','Maimai (본사 매니저)'),('nobody','Nobody');
  INSERT INTO admin_scope SELECT username,'hq' FROM admin_account;
  INSERT INTO push_subscriptions VALUES('ep-admin','admin',1),('ep-melca','mgr_melca',1),('ep-jjw','mgr_jjw',1);`);
  if (withHolidays) db.exec(`CREATE TABLE holidays(id INTEGER PRIMARY KEY AUTOINCREMENT,country TEXT,date TEXT,name TEXT,source TEXT,UNIQUE(country,date));`);
  function statement(sql) { let args = []; return { sql, bind(...a) { args = a; return this; },
    async first() { return db.prepare(sql).get(...args) || null; }, async all() { return { results: db.prepare(sql).all(...args) }; },
    runSync() { const r = db.prepare(sql).run(...args); return { meta: { changes: Number(r.changes) } }; }, async run() { return this.runSync(); } }; }
  const env = { DB: { prepare: statement, async batch(items) { db.exec('BEGIN'); try { const o = items.map(s => s.runSync()); db.exec('COMMIT'); return o; } catch (e) { db.exec('ROLLBACK'); throw e; } } } };
  const clock = { now: 0 };
  class TestDate extends Date { constructor(...a) { if (a.length) super(...a); else super(clock.now); } static now() { return clock.now; } }
  const pushes = [];
  const module = { exports: {} };
  vm.runInNewContext(code, { module, exports: module.exports, console: { ...console, warn() {} }, crypto, Date: TestDate, Request, Response, URL, setTimeout, clearTimeout,
    require: (name) => {
      if (name === './d1-chunk') return { selectInChunks: async () => [] };
      if (name === './approval-policy') return { isHqStaff: a => !!a.ok, isExec: a => ['admin', 'mgr_jjw'].includes(a.username) };
      if (name === './once-per-isolate') return { oncePerIsolate: f => f };
      if (name === './web-push') return { broadcastWebPush: async eps => ({ sent: eps.length }) };
      throw new Error(name);
    } });
  const m = module.exports;
  const at = (iso) => { clock.now = Date.parse(iso); };
  const queued = () => db.prepare(`SELECT endpoint,body,url,tag FROM push_queue ORDER BY rowid`).all();
  const notices = () => db.prepare(`SELECT notice_key,username,report_date,kind FROM daily_handover_notices ORDER BY notice_key`).all();
  const submit = (u, d) => db.prepare(`INSERT INTO daily_handovers(report_date,username,staff_name,recipient,payload,status,updated_at,submitted_at,request_key)
    VALUES(?,?,?,?,?,?,?,?,?)`).run(d, u, u, 'admin', '{}', 'submitted', 1, 1, 'k' + u + d);
  return { db, env, m, at, queued, notices, submit };
}
async function prime(t) {
  // 테이블을 만들기 위해 한 번 부른다(ensure). 08:00 KST 라 아무 알림도 안 나간다.
  t.at('2026-10-05T23:00:00Z');
  await t.m.runDailyHandoverSweep(t.env);
  t.db.exec(`INSERT INTO daily_handover_schedule(username,enabled,weekdays,due_time,exempt_date,updated_at,holiday_country) VALUES
    ('mgr_jjw',1,'1,2,3,4,5','18:00','',1,'KR'),('mgr_maimai',1,'1,2,3,4,5','20:00','',1,'PH'),
    ('mgr_melca',1,'1,2,3,4,5','23:00','',1,'PH'),('mgr_karl',1,'1,2,3,4,5','22:00','',1,'PH')`);
}

// ① 순수 함수 — 근무일·직전 근무일
{
  const t = setup(); const { isWorkday, previousWorkday, inMissedWindow } = t.m;
  const s = { enabled: 1, weekdays: '1,2,3,4,5', exempt_date: '', holiday_country: 'KR' };
  const none = () => false;
  ok('평일은 근무일', isWorkday(s, '2026-10-06', none));
  ok('토요일은 근무일 아님', !isWorkday(s, '2026-10-10', none));
  ok('명단 꺼지면 근무일 아님', !isWorkday({ ...s, enabled: 0 }, '2026-10-06', none));
  ok('쉬는 날 지정은 근무일 아님', !isWorkday({ ...s, exempt_date: '2026-10-06' }, '2026-10-06', none));
  const krHol = (c, d) => c === 'KR' && d === '2026-10-09';
  ok('그 나라 공휴일은 근무일 아님', !isWorkday(s, '2026-10-09', krHol));
  ok('다른 나라 공휴일은 근무일', isWorkday({ ...s, holiday_country: 'PH' }, '2026-10-09', krHol));
  ok('월요일의 직전 근무일 = 금요일', previousWorkday(s, '2026-10-05', none) === '2026-10-02');
  ok('공휴일 다음 날은 그 전 근무일', previousWorkday(s, '2026-10-12', krHol) === '2026-10-08');
  ok('나라 칸이 없으면 KR', !isWorkday({ ...s, holiday_country: undefined }, '2026-10-09', krHol));
  ok('09:00 KST 는 창 안', inMissedWindow(Date.parse('2026-10-06T00:00:00Z')));
  ok('12:00 KST 는 창 밖', !inMissedWindow(Date.parse('2026-10-06T03:00:00Z')));
  ok('08:59 KST 는 창 밖', !inMissedWindow(Date.parse('2026-10-05T23:59:00Z')));
}

// ② 아침 알림 — 안 쓴 사람만, 대표님께 한 번
{
  const t = setup(); await prime(t);
  t.submit('mgr_jjw', '2026-10-12'); t.submit('mgr_maimai', '2026-10-12');
  t.at('2026-10-13T00:15:00Z'); // 화 09:15 KST
  await t.m.runDailyHandoverSweep(t.env);
  const n = t.notices();
  const missed = n.filter(x => x.kind === 'missed').map(x => x.username).sort();
  ok('안 쓴 Melca·Karl 에게 미제출 알림', JSON.stringify(missed) === JSON.stringify(['mgr_karl', 'mgr_melca']), JSON.stringify(missed));
  ok('쓴 장지웅·Maimai 는 안 받음', !missed.includes('mgr_jjw') && !missed.includes('mgr_maimai'));
  const sum = n.filter(x => x.kind === 'missed_summary');
  ok('대표님(admin) 요약 1건', sum.length === 1 && sum[0].username === 'admin');
  const adminBody = t.queued().find(q => q.endpoint === 'ep-admin' && /missed_summary/.test(q.tag))?.body || '';
  ok('요약에 Melca·Karl 이름', /Melca/.test(adminBody) && /Karl/.test(adminBody), adminBody);
  ok('요약에 낸 사람 이름 없음', !/장지웅|Maimai/.test(adminBody), adminBody);
  ok('요약 이름에서 «(본사 매니저)» 를 뗀다', !/본사 매니저/.test(adminBody));
  const melcaQ = t.queued().find(q => q.endpoint === 'ep-melca');
  ok('본인 알림은 그 날짜 보고 쓰기로 연결', melcaQ && melcaQ.url === '/daily-handover.html?write=2026-10-12', JSON.stringify(melcaQ));
  const before = t.notices().length, qBefore = t.queued().length;
  t.at('2026-10-13T00:30:00Z'); await t.m.runDailyHandoverSweep(t.env);
  ok('15분 뒤 다시 돌아도 또 보내지 않음', t.notices().length === before && t.queued().length === qBefore);
}

// ③ 창 밖·주말에는 안 보냄
{
  const t = setup(); await prime(t);
  t.at('2026-10-13T04:00:00Z'); await t.m.runDailyHandoverSweep(t.env); // 13:00 KST
  ok('13:00 KST 에는 미제출 알림 없음', !t.notices().some(x => x.kind === 'missed'));
  t.at('2026-10-17T00:15:00Z'); await t.m.runDailyHandoverSweep(t.env); // 토 09:15
  ok('토요일 아침엔 안 보냄', !t.notices().some(x => x.kind === 'missed'));
  t.at('2026-10-19T00:15:00Z'); await t.m.runDailyHandoverSweep(t.env); // 월 09:15
  ok('월요일 아침엔 금요일을 묻는다', t.notices().some(x => x.kind === 'missed' && x.report_date === '2026-10-16'));
}

// ④ 공휴일 — 그 나라 공휴일은 작성 안 함
{
  const t = setup(); await prime(t);
  t.db.exec(`INSERT INTO holidays(country,date,name) VALUES('PH','2026-10-12','PH test holiday')`);
  ['mgr_melca', 'mgr_karl', 'mgr_maimai'].forEach(u => t.submit(u, '2026-10-09'));
  t.at('2026-10-13T00:15:00Z'); await t.m.runDailyHandoverSweep(t.env);
  const missed = t.notices().filter(x => x.kind === 'missed');
  ok('PH 공휴일(10/12)은 외국인 3명에게 미제출 아님', !missed.some(x => ['mgr_melca', 'mgr_karl', 'mgr_maimai'].includes(x.username)), JSON.stringify(missed));
  ok('같은 날 KR 장지웅은 미제출로 잡힘(짝)', missed.some(x => x.username === 'mgr_jjw' && x.report_date === '2026-10-12'));
  // 오늘이 공휴일이면 마감 알림도 없다
  t.db.exec(`INSERT INTO holidays(country,date,name) VALUES('KR','2026-10-14','KR test holiday')`);
  t.at('2026-10-14T09:00:00Z'); await t.m.runDailyHandoverSweep(t.env); // 18:00 KST = 장지웅 마감
  ok('KR 공휴일엔 장지웅 마감 알림 없음', !t.notices().some(x => x.username === 'mgr_jjw' && x.report_date === '2026-10-14'));
  t.at('2026-10-15T09:00:00Z'); await t.m.runDailyHandoverSweep(t.env);
  ok('다음 평일엔 마감 알림이 간다(짝)', t.notices().some(x => x.username === 'mgr_jjw' && x.report_date === '2026-10-15' && x.kind === 'due'));
}

// ⑤ 공휴일 표가 없어도 죽지 않고 «공휴일 아님» 으로 본다
{
  const t = setup({ withHolidays: false }); await prime(t);
  t.at('2026-10-13T00:15:00Z');
  let threw = false; try { await t.m.runDailyHandoverSweep(t.env); } catch { threw = true; }
  ok('holidays 표 없음 → 던지지 않음', !threw);
  ok('holidays 표 없음 → 알림은 그대로 감', t.notices().some(x => x.kind === 'missed'));
}

// ⑥ 화면용 API — 배너가 읽는 writer · missed_staff
{
  const t = setup(); await prime(t);
  t.submit('mgr_jjw', '2026-10-12');
  t.at('2026-10-13T05:00:00Z'); // 14:00 KST
  const call = async (u) => { const url = new URL('https://mangoi.ai/api/approval/handover/inbox'); const r = await t.m.handleDailyHandover(new Request(url), url, t.env, { ok: true, username: u, name: u, role: 'hq' }); return r.json(); };
  const melca = await call('mgr_melca');
  ok('Melca: 대상이다', melca.writer?.required === true, JSON.stringify(melca.writer));
  ok('Melca: 오늘 써야 함 · 마감 23:00', melca.writer.today_required === true && melca.writer.today_submitted === false && melca.writer.due_time === '23:00');
  ok('Melca: 지난 근무일(10/12) 미제출', melca.writer.prev_missed === true && melca.writer.prev_day === '2026-10-12');
  ok('Melca 화면엔 남의 미제출 명단 없음', melca.missed_staff === null);
  ok('writer 에 내부 칸(_s) 안 샘', !('_s' in melca.writer));
  const jjw = await call('mgr_jjw');
  ok('장지웅: 어제 냈으면 prev_missed 아님(짝)', jjw.writer.prev_missed === false);
  const admin = await call('admin');
  ok('대표님은 명단에 없음 → required:false', admin.writer?.required === false);
  const names = (admin.missed_staff || []).map(m => m.username).sort();
  ok('대표님 화면: 미제출 명단', JSON.stringify(names) === JSON.stringify(['mgr_karl', 'mgr_maimai', 'mgr_melca']), JSON.stringify(names));
  t.submit('mgr_melca', '2026-10-13');
  ok('오늘 제출하면 today_submitted', (await call('mgr_melca')).writer.today_submitted === true);
}

// ⑦ 배너가 그 값을 실제로 그리는가 — renderWriter 를 오려 내 가짜 DOM 으로 돌린다(글자 검사로는 if(false) 에 뚫림)
{
  const js = readFileSync(process.env.BANNER_SRC || 'cloudflare-deploy/public/js/handover-inbox-banner.js', 'utf8');
  const work = readFileSync('cloudflare-deploy/public/work.html', 'utf8');
  ok('결재함 복사본이 공유 스크립트와 같다', process.env.BANNER_SRC || work.includes(js.trim()));
  const cut = (name) => { const a = js.indexOf('function ' + name + '('); if (a < 0) return ''; let i = js.indexOf('{', a), d = 0; for (; i < js.length; i++) { if (js[i] === '{') d++; else if (js[i] === '}' && --d === 0) break; } return js.slice(a, i + 1); };
  const src = cut('line') + cut('kstNow') + cut('renderWriter');
  ok('전제: renderWriter 를 오려 냈다', /function renderWriter/.test(src));
  const el = (tag) => ({ tag, className: '', textContent: '', href: '', kids: [], append(...k) { this.kids.push(...k); } });
  const draw = (last, nowIso = '2026-10-13T05:00:00Z') => {
    const writer = { hidden: true, kids: [], replaceChildren(...k) { this.kids = k; } };
    class D extends Date { constructor(...a) { a.length ? super(...a) : super(Date.parse(nowIso)); } static now() { return Date.parse(nowIso); } }
    let n = 0; try { n = new Function('last', 'writer', 'document', 't', 'Date', src + '; return renderWriter();')(last, writer, { createElement: el }, (ko) => ko, D); } catch (e) { return { err: String(e), lines: [] }; }
    const txt = (x) => x.kids.map(k => k.textContent).join(' ');
    return { n, hidden: writer.hidden, lines: writer.kids.map(k => ({ cls: k.className, text: txt(k), href: (k.kids.find(c => c.tag === 'a') || {}).href })) };
  };
  const base = { required: true, due_time: '23:00', today_required: true, today_submitted: false, prev_day: '2026-10-12', prev_missed: true };
  let r = draw({ writer: base });
  ok('안 쓴 사람: 두 줄(지난 근무일·오늘)', r.n === 2 && !r.hidden, JSON.stringify(r));
  ok('지난 근무일 줄은 빨강 + 그 날짜 쓰기 링크', r.lines[0]?.cls.includes('bad') && r.lines[0]?.href === '/daily-handover.html?write=2026-10-12', JSON.stringify(r.lines[0]));
  ok('오늘 줄에 마감 시각', /23:00/.test(r.lines[1]?.text || '') && r.lines[1]?.href === '/daily-handover.html');
  ok('마감 전엔 오늘 줄이 빨강 아님', !r.lines[1]?.cls.includes('bad'));
  r = draw({ writer: base }, '2026-10-13T14:10:00Z'); // 23:10 KST
  ok('마감 지나면 오늘 줄 빨강', r.lines[1]?.cls.includes('bad') && /지남/.test(r.lines[1]?.text || ''), JSON.stringify(r.lines[1]));
  r = draw({ writer: { ...base, prev_missed: false, today_submitted: true } });
  ok('다 썼으면 줄 없음 · 숨김(짝)', r.n === 0 && r.hidden === true, JSON.stringify(r));
  r = draw({ writer: { ...base, today_required: false, prev_missed: false } });
  ok('공휴일·주말(오늘 안 씀)엔 오늘 줄 없음', r.n === 0);
  r = draw({ writer: { required: false } });
  ok('명단에 없는 사람은 줄 없음', r.n === 0);
  r = draw({ writer: { required: false }, missed_staff: [{ name: 'Melca', prev_day: '2026-10-12' }, { name: 'Karl', prev_day: '2026-10-12' }] });
  ok('대표님: 미제출 명단 한 줄', r.n === 1 && /Melca/.test(r.lines[0].text) && /Karl/.test(r.lines[0].text), JSON.stringify(r));
  r = draw(null);
  ok('응답 없으면 줄 없음(던지지 않음)', r.n === 0 && !r.err, JSON.stringify(r));
  ok('쓸 줄이 있으면 배너를 숨기지 않는다', /host\.hidden=!inbox&&!renderWriter\(\)/.test(js));
  ok('admin.html 이 새 번호로 부른다', /handover-inbox-banner\.js\?v=4/.test(readFileSync('cloudflare-deploy/public/admin.html', 'utf8')));
}

// ⑧ 매일보고 화면 — 명단 줄(연산자 우선순위)·?write= 로 지난 날짜 열기
{
  const js = readFileSync('cloudflare-deploy/public/js/daily-handover.js', 'utf8');
  const m = js.match(/\$\('required'\)\.textContent=(\(required\.length[\s\S]*?:''\));/);
  ok('전제: 명단 줄 식을 찾았다', !!m);
  const ev = (required, missing, j) => { try { return new Function('required', 'missing', 'j', 'return ' + (m ? m[1] : 'null'))(required, missing, j) || ''; } catch (e) { return 'ERR ' + e; } };
  const out = ev([{ name: 'A' }], [{ name: 'A' }], { missed_staff: [{ name: 'Karl', prev_day: '2026-10-12' }] });
  ok('대상이 있는 날에도 «지난 근무일 미제출» 이 붙는다', /보고 대상 1명/.test(out) && /Karl/.test(out), out);
  ok('미제출 명단이 없으면 덧붙이지 않는다(짝)', !/지난 근무일/.test(ev([{ name: 'A' }], [], {})));
  ok('?write= 를 읽어 그 날짜 보고를 연다', /wanted\.get\('write'\)/.test(js) && /\/home\?date='\+encodeURIComponent\(writeDay\)/.test(js) && /\$\('date'\)\.value=writeDay/.test(js));
}

// ⑨ 규칙 시작일 이전은 «미제출» 로 세지 않는다 · 대표님만 명단을 받는다
{
  const t = setup(); await prime(t);
  t.at('2026-10-06T05:00:00Z');
  const call = async (u) => { const url = new URL('https://mangoi.ai/api/approval/handover/inbox'); const r = await t.m.handleDailyHandover(new Request(url), url, t.env, { ok: true, username: u, name: u, role: 'hq' }); return r.json(); };
  const melca = await call('mgr_melca');
  ok('시작일(10/6) 전 날(10/5)은 미제출 아님', melca.writer.prev_day === '2026-10-05' && melca.writer.prev_missed === false, JSON.stringify(melca.writer));
  ok('시작일 당일 오늘 줄은 나온다(짝)', melca.writer.today_required === true);
  const jjw = await call('mgr_jjw');
  ok('장지웅(경영진이지만 대표님 아님)은 남의 명단을 안 받음', jjw.missed_staff === null);
}

console.log(`daily_handover_duty_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
