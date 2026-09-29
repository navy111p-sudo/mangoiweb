// 🩺 녹화 진단 하니스 (2026-09-29)
//   정본 src/recording-diagnosis.ts 를 «실제로 돌려» 판정을 본다(문자열 검사 아님).
//   짝으로 둔다: «문제를 잡는다» 옆에 «멀쩡하면 정상이라 한다» · «기록이 없으면 정상이라 하지 않는다».
//   서버 배선(api-mango.ts)과 화면 배선(adm-core.js)은 위치·모양으로 확인한다.
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const CF = resolve(ROOT, 'cloudflare-deploy');
const SRC = process.env.DIAG_SRC || resolve(CF, 'src/recording-diagnosis.ts');
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) { pass++; console.log('  ✅', name); } else { fail++; console.log('  ❌ FAIL', name, extra); } };

let M;
try {
  const js = stripTypeScriptTypes(readFileSync(SRC, 'utf8'));
  M = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
} catch (e) { console.log('  ❌ FAIL 정본을 불러오지 못함', e.message); process.exit(1); }
const { diagnoseRecording, clockLabel, DIAG } = M;
const run = (...a) => { try { return diagnoseRecording(...a); } catch (e) { return { verdict: 'CRASH:' + e.message, events: [], notes_ko: [] }; } };

const T0 = Date.UTC(2026, 8, 28, 5, 0, 0);
const min = m => T0 + m * 60000;
const rec = (o = {}) => ({ room_id: 'class-3140-20260928', started_at: T0, ended_at: min(20), duration_ms: 20 * 60000, status: 'completed', storage: 'r2', participant_names: '["교사 FAR","lby01"]', ...o });
const tj = (o = {}) => ({ username: '교사 FAR', role: 'teacher', joined_at: T0 - 20000, left_at: min(20), ...o });
const sj = (o = {}) => ({ username: 'lby01', account_uid: 'lby01', role: 'student', joined_at: T0 + 5000, left_at: min(20), total_active_ms: 8 * 60000, total_session_ms: 19 * 60000, ...o });
const q = (m, o = {}) => ({ ts: min(m + 1), uid: 'lby01', name: 'lby01', role: 'student', avg_rtt: 120, aao: 0, rx_conceal: 0, rx_freeze: 0, ...o });
const cleanQ = Array.from({ length: 20 }, (_, i) => q(i));

console.log('\n① 판정의 짝');
{
  const d = run(rec(), [tj(), sj()], cleanQ);
  ok('멀쩡한 수업은 정상', d.verdict === 'ok', d.verdict);
  ok('정상이면 사건 0건', d.events.length === 0, JSON.stringify(d.events));
}
{
  const d = run(rec(), [], []);
  ok('기록이 하나도 없으면 «정상» 이 아니라 unknown', d.verdict === 'unknown', d.verdict);
}
{
  const d = run(rec(), null, null);
  ok('못 읽음(null)도 정상이 아님', d.verdict !== 'ok', d.verdict);
}

console.log('\n② 재입장 — 초 단위');
{
  const d = run(rec(), [tj(), sj({ left_at: min(8) + 11000 }), sj({ joined_at: min(8) + 31000 })], cleanQ);
  const e = d.events.find(x => x.kind === 'rejoin');
  ok('재입장을 잡는다', !!e);
  ok('시각은 초 단위(08:31)', e && e.label === '08:31', e && e.label);
  ok('끊긴 길이(약 20초)', e && /약 20초/.test(e.text_ko), e && e.text_ko);
  ok('판정은 주의 이상', d.verdict === 'warn' || d.verdict === 'bad', d.verdict);
  ok('누구인지 말한다(학생)', e && /학생/.test(e.text_ko));
}
{
  // 같은 사람을 대소문자·계정/이름으로 흩어 두어도 한 사람으로 센다
  const d = run(rec(), [tj(), tj({ joined_at: T0 + 1000 })], cleanQ);
  ok('교사 재입장도 잡는다', d.events.some(x => x.kind === 'rejoin' && /교사/.test(x.text_ko)));
}

console.log('\n③ 1분 요약 — 멈춤·소리·음성만');
{
  const Qs = cleanQ.map((x, i) => i === 8 ? q(8, { rx_freeze: 3 }) : i === 9 ? q(9, { rx_freeze: 1 }) : i === 12 ? q(12, { rx_conceal: 20 }) : i === 15 ? q(15, { aao: 1 }) : x);
  const d = run(rec(), [tj(), sj()], Qs);
  const fr = d.events.filter(x => x.kind === 'freeze');
  ok('이어진 멈춤은 한 구간으로 합친다', fr.length === 1, JSON.stringify(fr));
  ok('구간 표기(08~09분대)', fr[0] && fr[0].label === '08~09분대', fr[0] && fr[0].label);
  ok('횟수를 더한다(4회)', fr[0] && /4회/.test(fr[0].text_ko), fr[0] && fr[0].text_ko);
  const cc = d.events.find(x => x.kind === 'conceal');
  ok('소리 끊김 15% 이상은 문제(bad)', cc && cc.sev === 'bad' && d.verdict === 'bad', cc && cc.sev);
  ok('음성만 전송을 잡는다', d.events.some(x => x.kind === 'aao' && x.label === '15분대'));
  ok('사건은 시각 순', d.events.every((e, i, a) => !i || a[i - 1].at_ms <= e.at_ms));
}
{
  // rx_* 의 «모름» 은 -1 — 문제로도 정상으로도 세지 않는다
  const d = run(rec(), [tj(), sj()], cleanQ.map(x => ({ ...x, rx_conceal: -1 })));
  ok('rx_conceal -1(모름)은 소리 끊김이 아니다', !d.events.some(x => x.kind === 'conceal'));
  const lo = run(rec(), [tj(), sj()], cleanQ.map((x, i) => i === 4 ? { ...x, rx_conceal: DIAG.CONCEAL_PCT - 0.1 } : x));
  ok('문턱 아래는 안 잡는다', !lo.events.some(x => x.kind === 'conceal'));
  const at = run(rec(), [tj(), sj()], cleanQ.map((x, i) => i === 4 ? { ...x, rx_conceal: DIAG.CONCEAL_PCT } : x));
  ok('문턱 값은 잡는다', at.events.some(x => x.kind === 'conceal'));
}

console.log('\n④ 녹화 전체');
{
  const d = run(rec({ participant_names: '["cys01"]' }), [sj({ username: 'cys01', account_uid: 'cys01' })], cleanQ);
  ok('혼자면 문제', d.verdict === 'bad' && /상대 미입장/.test(d.headline_ko), d.headline_ko);
  const d2 = run(rec({ storage: 'r2_snapshot', duration_ms: 60000 }), [tj(), sj()], cleanQ);
  ok('임시본·짧은 녹화는 주의', d2.verdict === 'warn' && d2.notes_ko.some(n => /임시/.test(n)) && d2.notes_ko.some(n => /짧/.test(n)));
  const d3 = run(rec(), [tj(), sj({ total_active_ms: 60000, total_session_ms: 19 * 60000 })], cleanQ);
  ok('학생 발화가 적으면 주의', d3.verdict === 'warn' && d3.notes_ko.some(n => /말한 시간/.test(n)));
  const d4 = run(rec(), [tj(), sj({ total_active_ms: null, total_session_ms: null })], cleanQ);
  ok('발화 표본이 없으면 말하지 않는다(모름 ≠ 0%)', !d4.notes_ko.some(n => /말한 시간/.test(n)) && d4.verdict === 'ok');
  const d4b = run(rec(), [tj(), sj({ total_active_ms: 0, total_session_ms: 30000 })], cleanQ);
  ok('발화 표본이 1분 미만이면 판정하지 않는다', !d4b.notes_ko.some(n => /말한 시간/.test(n)));
  const d5 = run(rec(), [tj(), sj({ joined_at: min(6) })], cleanQ);
  ok('늦은 입장을 잡는다', d5.events.some(x => x.kind === 'join_late' && x.label === '06:00'));
  ok('clockLabel 음수는 «녹화 전»', clockLabel(-5000) === '녹화 전');
}

console.log('\n④-2 함정 대조 수리(2026-09-29)');
{
  const one = rec({ participant_names: '["cys01"]' });
  const dn = run(one, null, cleanQ);
  ok('입장 기록을 못 읽으면(null) «상대 미입장» 으로 몰지 않는다', dn.verdict !== 'bad' && !/미입장/.test(dn.headline_ko), dn.headline_ko);
  ok('못 읽음은 «읽지 못했습니다» 로 말한다', dn.notes_ko.some(n => /읽지 못했/.test(n)));
  const de = run(one, [], cleanQ);
  ok('입장 기록 0건도 «혼자» 가 아니다', !/미입장/.test(de.headline_ko), de.headline_ko);
  ok('0건은 «없습니다» 로 말한다(못 읽음과 다른 글자)', de.notes_ko.some(n => /입장 기록이 없습니다/.test(n)) && !de.notes_ko.some(n => /읽지 못했/.test(n)));
  const dq = run(rec(), [tj(), sj()], null);
  ok('회선 기록 못 읽음 ≠ «30일 보관» 사유', dq.notes_ko.some(n => /회선 기록을 읽지 못했/.test(n)) && !dq.notes_ko.some(n => /30일/.test(n)));
  const meet = run(rec({ room_id: 'meet-1234', participant_names: '["jeong"]' }), [sj({ username: 'jeong', account_uid: 'jeong' })], cleanQ);
  ok('회의방에 혼자면 ❌ 가 아니다', meet.verdict !== 'bad', meet.verdict);
  const cls = run(rec({ participant_names: '["cys01"]' }), [sj({ username: 'cys01', account_uid: 'cys01' })], cleanQ);
  ok('(짝) 수업방에 혼자면 ❌', cls.verdict === 'bad');
  const anon = run(rec(), [tj(), sj(), { user_id: 'u_a1', joined_at: min(3) }, { user_id: 'u_b2', joined_at: min(9) }], cleanQ);
  ok('기기번호만 있는 행은 사람으로 세지 않는다(늦은 입장·재입장 없음)', !anon.events.some(e => e.kind === 'join_late' || e.kind === 'rejoin'), JSON.stringify(anon.events));
  ok('뺀 사실을 말한다', anon.notes_ko.some(n => /2건/.test(n)));
  const mix = run(rec(), [tj(), sj({ account_uid: null, username: 'lby01', joined_at: T0 + 5000, left_at: min(7) }), sj({ joined_at: min(7) + 10000 })], cleanQ);
  ok('이름만 있는 행과 계정 행을 한 사람으로 잇는다(재입장 1건)', mix.events.filter(e => e.kind === 'rejoin').length === 1 && !mix.events.some(e => e.kind === 'join_late'), JSON.stringify(mix.events));
  const kk = run(rec(), [tj(), sj({ account_uid: 'Kim', username: 'Kim' }), sj({ account_uid: 'kim', username: 'kim', joined_at: min(2) })], cleanQ);
  ok('대소문자만 다른 계정은 다른 사람(재입장 아님)', !kk.events.some(e => e.kind === 'rejoin'));
  const pq = run(rec(), [tj(), sj()], []);
  ok('회선 기록 없이 «정상» 이면 «확인 못 함» 을 함께 말한다', pq.verdict === 'ok' && /확인 못 함/.test(pq.headline_ko), pq.headline_ko);
  ok('(짝) 둘 다 있으면 그냥 정상', /^✅ 정상/.test(run(rec(), [tj(), sj()], cleanQ).headline_ko));
  const pre = run(rec(), [tj(), sj()], [q(-1, { rx_freeze: 2 })]);
  ok('녹화 전 1분은 «00분대» 가 아니라 «녹화 전»', pre.events.some(e => e.kind === 'freeze' && e.label === '녹화 전'), JSON.stringify(pre.events.map(e => e.label)));
  const ns = run(rec({ started_at: null }), [tj()], cleanQ);
  ok('시작 시각이 없으면 unknown', ns.verdict === 'unknown');
}

console.log('\n⑤ 배선');
const strip = t => t.replace(/^[ \t]*\/\/.*$/gm, '');
const api = readFileSync(resolve(CF, 'src/api-mango.ts'), 'utf8');
const ai = api.indexOf("if (path === '/api/recordings' && method === 'GET') {");
const di = api.indexOf("url.searchParams.get('diagnose')", ai);
ok('진단 갈래가 로그인 게이트를 지나는 목록 경로 «안» 에 있다', ai > 0 && di > ai && di - ai < 1500);
ok('서버가 정본을 부른다', /diagnoseRecording\(rec, joins, quality\)/.test(api));

// ⑤-2 조회 SQL 을 오려 내 «진짜 SQLite» 에 돌린다(2026-09-29 Codex 리뷰 P1·P2).
//   묻는 것: 녹화 전 입장자는 들어오나 · leave 못 보낸 «옛» 행은 빠지나 · 녹화 뒤 품질 보고는 빠지나.
{
  const body = api.slice(di, api.indexOf('diagnoseRecording(rec, joins, quality)', di));
  const cut = (anchor) => {
    const i = body.indexOf(anchor); if (i < 0) return null;
    const a = body.lastIndexOf('`', i), b = body.indexOf('`', i);
    const bi = body.indexOf('.bind(', b); if (bi < 0) return null;
    let d = 0, j = bi + 5;
    for (; j < body.length; j++) { const c = body[j]; if (c === '(') d++; else if (c === ')') { d--; if (!d) break; } }
    return { sql: body.slice(a + 1, b), args: body.slice(bi + 6, j) };
  };
  const qa = cut('FROM attendance'), qq = cut('FROM vc_quality');
  ok('전제: 두 조회를 오려 냈다', !!(qa && qq));
  let DB = null;
  try { const { DatabaseSync } = await import('node:sqlite'); DB = new DatabaseSync(':memory:'); } catch (e) { console.log('  ⏭ node:sqlite 없음 —', e.message); }
  if (DB && qa && qq) {
    DB.exec(`CREATE TABLE attendance (id INTEGER PRIMARY KEY, room_id TEXT, user_id TEXT, account_uid TEXT, username TEXT, role TEXT, joined_at INTEGER, left_at INTEGER, total_active_ms INTEGER, total_session_ms INTEGER, last_seen_at INTEGER);
             CREATE TABLE vc_quality (id INTEGER PRIMARY KEY, room TEXT, ts INTEGER, uid TEXT);`);
    const R = 'mangoi-class', st = T0, endMs = min(20), wFrom = st - 60000, wTo = endMs + 60000;
    const ins = DB.prepare('INSERT INTO attendance (room_id,username,joined_at,left_at,last_seen_at) VALUES (?,?,?,?,?)');
    ins.run(R, 'teacher-before', T0 - 5 * 60000, min(21), min(20));        // 녹화 전 입장 · 정상 퇴장
    ins.run(R, 'open-live', T0 - 2 * 60000, null, min(15));                  // 녹화 전 입장 · leave 못 보냄 · 하트비트 있음
    ins.run(R, 'stale-open', T0 - 3 * 3600000, null, T0 - 3 * 3600000 + 600000); // 3시간 전 남의 수업 · 끊김
    ins.run(R, 'stale-null-seen', T0 - 2 * 3600000, null, null);             // 옛 행 · 하트비트 없음
    ins.run(R, 'join-in-window', min(5), null, null);                        // 창 안 입장(하트비트 전)
    ins.run(R, 'left-before', T0 - 30 * 60000, T0 - 20 * 60000, T0 - 20 * 60000); // 녹화 전에 나감
    const qi = DB.prepare('INSERT INTO vc_quality (room,ts) VALUES (?,?)');
    for (const t of [T0 + 30000, min(10), endMs + 30000, endMs + 60000, endMs + 90000, endMs + 119000]) qi.run(R, t);
    const argsOf = (a) => new Function('rec', 'wFrom', 'wTo', 'return [' + a + ']')({ room_id: R }, wFrom, wTo);
    let names = [], ts = [];
    try { names = DB.prepare(qa.sql).all(...argsOf(qa.args)).map(r => r.username); } catch (e) { console.log('  ❌ FAIL attendance SQL 실행', e.message); fail++; }
    try { ts = DB.prepare(qq.sql).all(...argsOf(qq.args)).map(r => r.ts); } catch (e) { console.log('  ❌ FAIL vc_quality SQL 실행', e.message); fail++; }
    ok('녹화 전 입장자(정상 퇴장)는 들어온다', names.includes('teacher-before'), names.join(','));
    ok('leave 를 못 보냈어도 창 안 하트비트가 있으면 들어온다', names.includes('open-live'));
    ok('창 안에서 들어온 사람은 하트비트 전이어도 들어온다', names.includes('join-in-window'));
    ok('«옛» 열린 행(하트비트가 창 밖)은 빠진다', !names.includes('stale-open'));
    ok('«옛» 열린 행(하트비트 없음)은 빠진다', !names.includes('stale-null-seen'));
    ok('녹화 전에 나간 사람은 빠진다', !names.includes('left-before'));
    ok('녹화와 겹치는 품질 보고는 들어온다(끝+1분까지)', ts.includes(min(10)) && ts.includes(endMs + 60000));
    ok('녹화가 끝나고 1분을 넘긴 품질 보고는 빠진다', !ts.includes(endMs + 90000) && !ts.includes(endMs + 119000), ts.join(','));
  }
}
ok('못 읽으면 null 로 넘긴다(빈 배열로 안 떨어뜨림)', /let joins: any\[\] \| null = null, quality: any\[\] \| null = null/.test(api));
const core = strip(readFileSync(resolve(CF, 'public/js/adm-core.js'), 'utf8'));
ok('목록 줄에 진단 버튼', /recDiagnose\(' \+ r\.id/.test(core));
ok('화면은 «성공이라고 말했는가» 로 판정', /d\.ok !== true/.test(core));
ok('화면이 판정 문턱을 복제하지 않는다', !/CONCEAL_PCT|rx_conceal\s*>=/.test(core));
const html = readFileSync(resolve(CF, 'public/admin.html'), 'utf8');
// 번호를 글자로 못 박지 않는다 — 다른 작업이 adm-core 를 또 올리면 거짓 FAIL 이 된다(2026-09-29 «보기» 칸에서 실제로 밟음).
// 물을 것은 «번호가 있고, 그 번호가 원장에 기록돼 있는가»(내용 변경 없이 번호만 남은 사고는 asset_version 이 잡는다).
{
  const m = html.match(/\/js\/adm-core\.js\?v=([^"'&\s]+)/);
  const ledger = readFileSync(resolve(CF, '..', 'test-harness/asset-versions.json'), 'utf8');
  ok('admin.html 이 adm-core 를 ?v= 번호와 함께 부르고 그 번호가 원장에 있다', !!m && ledger.includes('/js/adm-core.js?v=' + m[1]));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
