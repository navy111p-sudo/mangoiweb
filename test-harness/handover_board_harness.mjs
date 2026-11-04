// 👀 매일보고 «팀 보고판» (2026-11-04 사장님 «모든 매니저·본사 임직원 일일보고를 한 번에»)
//   정본: cloudflare-deploy/src/handover-board.ts(모양, 순수 함수) + daily-handover.ts GET /board(자료 모으기)
//   화면: cloudflare-deploy/public/js/daily-handover-board.js (+ daily-handover.html #mh-board)
//
// 무엇을 «실제로 돌려» 보나 —
//   A. 순수 함수: 상태·정렬·요약·영업일지 묶기·기한 판정 — 짝으로(«잡는다» 옆에 «안 잡는다»)
//   B. 진짜 라우트를 메모리 SQLite 위에서: 경영진만 · 초안은 내용도 존재도 안 나감 · 영업일지 JOIN 이 실제로 돈다 ·
//      영업 표가 없어도 보고판은 산다(«모름») · 확인 의무자의 10초 읽기 흐름이 보고판 힌트대로 통한다
//   C. 배선: 화면 스크립트가 찾는 칸이 HTML 에 실제로 있다 · 요약 칸이 서버 요약 키를 읽는다 · 이웃 화면과 이벤트로 이어진다
// ⛔ 운영 D1 은 안 건드린다.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, loadTypescript, loadTsModule, makeHandoverEnv, seedBoardDay, DRAFT_SECRET, DRAFT_FILE, BOARD_SRC, HANDOVER_SRC } from './helpers/handover-env.mjs';

const ts = loadTypescript();
if (!ts) { console.log('⏭  typescript 없음 — 건너뜀'); process.exit(0); }
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { if (cond) pass++; else { fail++; console.log('❌ FAIL', name, extra); } };

// ── A. 순수 함수 ───────────────────────────────────────────────────────────
const B = loadTsModule(ts, BOARD_SRC);
const NOW = Date.parse('2026-11-04T10:00:00Z');
const rep = (username, status, payload = {}, extra = {}) => ({ id: username.length * 7, version: 2, username, recipient: 'mgr_jjw', status,
  payload: { work: username + ' 일', no_issue: true, no_open: true, priority: 'normal', attachments: [], ...payload }, ...extra });
const duty = (username, required = true, extra = {}) => ({ username, name: username.toUpperCase(), today_required: required, due_time: '19:00', ...extra });
{
  const out = B.buildHandoverBoard({ me: 'admin', alsoSees: ['mgr_jjw'], now: NOW, sales: null,
    members: [{ username: 'admin', name: '대표' }, { username: 'ghost', name: '유령 (본사)' }],
    duty: [duty('ack'), duty('ret'), duty('wait'), duty('iss'), duty('urg'), duty('miss'), duty('draft'), duty('off', false, { today_holiday: true })],
    reports: [rep('ack', 'acknowledged'), rep('ret', 'changes_requested'), rep('wait', 'submitted'),
      rep('iss', 'submitted', { no_issue: false, issue: '서버가 느림' }), rep('urg', 'submitted', { priority: 'urgent' }),
      rep('draft', 'draft', { work: DRAFT_SECRET }), rep('outsider', 'submitted', {}, { recipient: 'admin' })] });
  const by = Object.fromEntries(out.rows.map(r => [r.username, r]));
  ok('A1 문제 적힌 미확인 = issue', by.iss.state === 'issue' && by.iss.issue === true);
  ok('A2 긴급만 있어도 issue 칸(맨 위)이지만 «문제 있음» 으로는 안 센다', by.urg.state === 'issue' && by.urg.issue === false && by.urg.urgent === true);
  ok('A3 문제 없는 미확인 = awaiting', by.wait.state === 'awaiting' && by.wait.issue === false);
  ok('A4 확인·보완요청 상태', by.ack.state === 'acknowledged' && by.ret.state === 'returned');
  ok('A5 안 낸 사람 = missing', by.miss.state === 'missing' && by.miss.report === null);
  ok('A6 ⛔ 초안은 «미제출» 로만 — 보고·본문 없음', by.draft.state === 'missing' && by.draft.report === null && by.draft.headline === ''
    && !JSON.stringify(out).includes(DRAFT_SECRET));
  ok('A7 오늘 안 쓰는 사람 = off(휴무 표시)', by.off.state === 'off' && by.off.holiday === true);
  ok('A8 명단 밖인데 낸 사람도 줄에 나온다', by.outsider && by.outsider.on_roster === false && by.outsider.required === false && by.outsider.state === 'awaiting');
  const ranks = out.rows.map(r => B.BOARD_STATE_RANK[r.state]);
  ok('A9 정렬: 먼저 볼 것이 위(순위가 줄지 않는다)', ranks.every((x, i) => i === 0 || ranks[i - 1] <= x), ranks.join(','));
  ok('A10 맨 위는 issue, 맨 아래는 off', out.rows[0].state === 'issue' && out.rows[out.rows.length - 1].state === 'off');
  // 짝: 이름순으로는 'iss' 가 'urg' 보다 앞이라 이름만 봐도 통과한다 — 이름을 뒤집어 «문제 먼저» 를 따로 잰다.
  const tie = B.buildHandoverBoard({ me: 'admin', alsoSees: [], now: NOW, sales: null, members: [],
    duty: [duty('aaa'), duty('zzz')], reports: [rep('aaa', 'submitted', { priority: 'urgent' }), rep('zzz', 'submitted', { no_issue: false, issue: '문제' })] });
  ok('A10b 같은 issue 칸 안에서는 문제가 적힌 것이 긴급만 표시한 것보다 위', tie.rows.map(r => r.username).join() === 'zzz,aaa', tie.rows.map(r => r.username).join());
  const s = out.summary;
  ok('A11 요약 = 작성 대상 7 · 제출 5 · 미제출 2 · 문제 1 · 미확인 4 · 쉼 1',
    s.required === 7 && s.submitted === 5 && s.missing === 2 && s.issue === 1 && s.awaiting === 4 && s.off === 1, JSON.stringify(s));
  ok('A12 명단 밖 계정 목록에 보는 사람 본인은 없다', out.not_on_roster.length === 1 && out.not_on_roster[0].username === 'ghost'
    && out.not_on_roster[0].name === '유령');
  ok('A13 영업일지를 못 읽으면 null(«모름») — 0 으로 지어내지 않는다', out.sales_known === false && out.rows.every(r => r.sales === null));
  ok('A14 남의 미확인만 응답 버튼 힌트', by.wait.can_respond && !by.ack.can_respond && !by.ret.can_respond && !by.miss.can_respond);
  ok('A15 열람 표시는 받는 사람·공동 수신만(admin 은 mgr_jjw 앞 보고를 함께 받음)', by.wait.can_mark_opened && by.outsider.can_mark_opened);
  const own = B.buildHandoverBoard({ me: 'wait', alsoSees: [], now: NOW, sales: null, members: [], duty: [duty('wait')], reports: [rep('wait', 'submitted')] });
  ok('A16 내 보고에는 응답·열람 힌트가 없다', !own.rows[0].can_respond && !own.rows[0].can_mark_opened);
  const notMine = B.buildHandoverBoard({ me: 'mgr_x', alsoSees: [], now: NOW, sales: null, members: [], duty: [], reports: [rep('wait', 'submitted')] });
  ok('A17 받는 사람이 아니면 열람 힌트 없음(응답 힌트는 경영진이라 있음)', notMine.rows[0].can_respond && !notMine.rows[0].can_mark_opened);
}
{
  ok('A18 기한 지남/안 지남 짝', B.deadlinePassed('2026-11-04T18:00', NOW + 3600000) === true && B.deadlinePassed('2026-11-04T20:00', NOW) === false);
  ok('A19 기한 모양이 틀리면 «안 지남»(모르면 빨간불 안 켬)', !B.deadlinePassed('', NOW) && !B.deadlinePassed('내일', NOW) && !B.deadlinePassed(null, NOW));
  const g = B.groupSales({ reps: ['r1', 'r0'], items: [
    ...Array.from({ length: 14 }, (_, i) => ({ username: 'r1', kind: i % 2 ? 'visit' : 'call', lead: 'L' + i, outcome: '' })),
    { username: 'r1', kind: '이상한값', lead: '', outcome: '' }] });
  ok('A20 영업 담당자인데 오늘 0건이면 0(null 아님)', g.get('r0') && g.get('r0').total === 0);
  ok('A21 건수는 전부 세고, 화면 목록은 12줄까지', g.get('r1').total === 15 && g.get('r1').items.length === 12);
  ok('A22 모르는 종류는 «기타»로', g.get('r1').counts.other === 1 && g.get('r1').counts.visit === 7 && g.get('r1').counts.call === 7);
  ok('A23 영업 담당자가 아니면 줄 없음', !g.has('r9'));
  ok('A24 groupSales(null) = null', B.groupSales(null) === null);
}

// ── B. 진짜 라우트(메모리 SQLite) ─────────────────────────────────────────
{
  const t = makeHandoverEnv(ts);
  await seedBoardDay(t);
  const a = await t.api('/board?date=2026-11-04', null, 'admin');
  ok('B1 대표님(경영진) 200', a.status === 200 && a.ok === true, JSON.stringify(a).slice(0, 200));
  const lby = a.rows && a.rows.find(r => r.username === 'mgr_lby');
  ok('B2 정렬 맨 위 = 이병엽 이사(문제 적힌 미확인)', a.rows && a.rows[0].username === 'mgr_lby' && a.rows[0].state === 'issue');
  ok('B3 ⛔ 초안 본문이 응답 어디에도 없다', !JSON.stringify(a).includes(DRAFT_SECRET));
  ok('B4 초안 쓴 사람은 «미제출»', a.rows.find(r => r.username === 'staff_c').state === 'missing');
  ok('B4b 짝: 낸 보고의 첨부는 files 에 실린다', (a.files || []).some(f => f.name === '견적서.pdf'), JSON.stringify(a.files));
  // 순수 함수는 «본문» 만 한 번 더 거른다 — 첨부 목록(files)을 지키는 것은 SQL 의 status<>'draft' 하나뿐이다.
  ok('B4c ⛔ 초안의 첨부는 이름조차 안 나간다(SQL 초안 거르기가 지키는 자리)', !JSON.stringify(a).includes(DRAFT_FILE));
  ok('B5 요약(작성 대상 6 · 제출 4 · 미제출 2 · 문제 1 · 미확인 3)', a.summary.required === 6 && a.summary.submitted === 4 && a.summary.missing === 2
    && a.summary.issue === 1 && a.summary.awaiting === 3, JSON.stringify(a.summary));
  ok('B6 영업일지 JOIN 이 실제로 돈다 — 오늘 것만(방문1·시연1·전화1)', lby.sales && lby.sales.total === 3 && lby.sales.counts.visit === 1
    && lby.sales.counts.demo === 1 && lby.sales.counts.call === 1, JSON.stringify(lby.sales));
  ok('B7 학원 이름은 후보 학원 → 없으면 제목으로', !!lby.sales && lby.sales.items.some(i => i.lead === 'A학원') && lby.sales.items.some(i => i.lead === 'B학원'));
  ok('B8 영업 담당자이지만 0건이면 0, 담당자가 아니면 null', a.rows.find(r => r.username === 'mgr_jjw').sales?.total === 0
    && a.rows.find(r => r.username === 'mgr_melca').sales === null);
  ok('B9 남은 일 기한 지남 표시', lby.open && lby.open.overdue === true);
  ok('B10 명단 밖 계정 = 직원 X 만(보고 낸 Y·본인 제외)', a.not_on_roster.map(x => x.username).join() === 'staff_x', JSON.stringify(a.not_on_roster));
  ok('B11 대표님은 10초 규칙 없음(read_min_sec 0)', a.read_min_sec === 0);
  ok('B12 다른 날짜 = 그날 것만', (await t.api('/board?date=2026-11-03', null, 'admin')).rows.filter(r => r.report).map(r => r.username).join() === 'mgr_jjw');
  const lbyView = await t.api('/board?date=2026-11-04', null, 'mgr_lby');
  ok('B13 ⛔ 경영진이 아니면 403(이병엽 이사 본인도)', lbyView.status === 403 && !lbyView.rows);
  ok('B14 ⛔ 강사 계정 403', (await t.api('/board', null, { ok: true, username: 'mgr_jjw', role: 'hq', isTeacher: true })).status === 403);
  ok('B15 날짜 모양이 틀리면 400', (await t.api('/board?date=2026-13-40', null, 'admin')).status === 400);

  // 장지웅 부장(확인 의무자) — 보고판 힌트대로 열고 10초 뒤 확인이 통한다(짝: 바로 누르면 막힌다).
  const j = await t.api('/board?date=2026-11-04', null, 'mgr_jjw');
  const jl = j.rows.find(r => r.username === 'mgr_lby');
  ok('B16 장지웅 부장은 read_min_sec 10 · 이 보고 열람 힌트 있음', j.read_min_sec === 10 && jl.can_mark_opened && jl.can_respond);
  ok('B17 열람 기록', (await t.api('/opened', { id: jl.report.id, version: jl.report.version }, 'mgr_jjw')).ok === true);
  const early = await t.api('/ack', { id: jl.report.id, version: jl.report.version }, 'mgr_jjw');
  ok('B18 짝: 10초 전에 확인하면 409 read_first', early.status === 409 && early.error === 'read_first');
  t.clock.now += 11000;
  ok('B19 10초 뒤 확인 통과', (await t.api('/ack', { id: jl.report.id, version: jl.report.version }, 'mgr_jjw')).ok === true);
  const after = await t.api('/board?date=2026-11-04', null, 'admin');
  ok('B20 확인 뒤 보고판이 «확인됨» 으로 내려간다', after.rows.find(r => r.username === 'mgr_lby').state === 'acknowledged' && after.summary.awaiting === 2);

  t.db.exec('DROP TABLE sales_activities');
  const noSales = await t.api('/board?date=2026-11-04', null, 'admin');
  ok('B21 영업 표가 없어도 보고판은 산다 — sales_known=false, 줄은 그대로', noSales.ok === true && noSales.sales_known === false
    && noSales.rows.length === after.rows.length && noSales.rows.every(r => r.sales === null));
}

// ── C. 배선 ────────────────────────────────────────────────────────────────
{
  const html = readFileSync(join(ROOT, 'cloudflare-deploy/public/daily-handover.html'), 'utf8');
  const js = readFileSync(join(ROOT, 'cloudflare-deploy/public/js/daily-handover-board.js'), 'utf8');
  const main = readFileSync(join(ROOT, 'cloudflare-deploy/public/js/daily-handover.js'), 'utf8');
  const boardTag = html.match(/<section id="mh-board"[^>]*>/);
  ok('C1 보고판 칸은 기본 숨김(경영진 확인 뒤에만 보임)', !!boardTag && /\shidden(\s|>)/.test(boardTag[0]));
  ok('C2 보고판이 «받은 보고 확인» 위에 있다', html.indexOf('id="mh-board"') > 0 && html.indexOf('id="mh-board"') < html.indexOf('id="mh-reading"'));
  const ids = [...new Set([...js.matchAll(/\$\('([a-z-]+)'\)/g)].map(m => m[1]))];
  const missing = ids.filter(id => !html.includes(`id="mhb-${id}"`));
  ok('C3 스크립트가 찾는 칸이 HTML 에 전부 있다', ids.length >= 10 && !missing.length, missing.join(','));
  ok('C4 스크립트는 defer 로 매일보고 스크립트 뒤에 실린다', /<script src="\/js\/daily-handover\.js\?v=\d+" defer><\/script>\s*<script src="\/js\/daily-handover-board\.js\?v=\d+" defer><\/script>/.test(html));
  ok('C5 사람이 쓴 글은 textContent 로만(innerHTML 0)', !/innerHTML|insertAdjacentHTML|outerHTML/.test(js));
  const keys = [...js.matchAll(/count:\s*'([a-z]+)'/g)].map(m => m[1]);
  const summaryKeys = Object.keys(B.buildHandoverBoard({ me: '', alsoSees: [], now: NOW, sales: null, members: [], duty: [], reports: [] }).summary);
  ok('C6 요약 칸 5개가 전부 서버 요약 키를 읽는다', keys.length === 5 && keys.every(k => summaryKeys.includes(k)), keys.join(','));
  // C7~C11 은 «글자» 가 아니라 함수를 오려 내 «실제로 실행» 한다 — 글자 검사는 `if (0)`·`&& false`·주석에 걸려 헛돌았다(함정 대조 실측).
  const cut = (src, anchor) => { const s = src.indexOf(anchor); if (s < 0) return ''; let d = 0;
    for (let i = src.indexOf('{', s); i < src.length; i++) { if (src[i] === '{') d++; else if (src[i] === '}' && --d === 0) return src.slice(s, i + 1); } return ''; };
  const code = js.split('\n').map(l => l.replace(/\s\/\/.*$/, '')).join('\n'); // 줄 주석을 벗긴 사본(주석에 걸리는 검사 방지)
  class FakeEvent { constructor(type, init) { this.type = type; this.detail = init && init.detail; } }
  const loadSrc = cut(code, 'async function load(');
  const runLoad = async (callImpl, S0, hidden = true) => {
    const box = { hidden }, said = [], painted = [];
    const S = Object.assign({ today: '', day: '', data: null, seq: 0, loading: false }, S0 || {});
    await new Function('S', 'call', 'box', 'paint', 'say', loadSrc + '\nreturn load;')(S, callImpl, box, () => painted.push(1), (m, bad) => said.push(bad))('');
    return { box, said, painted, S };
  };
  const failWith = s => async () => { const e = new Error('x'); e.status = s; throw e; };
  const r403 = await runLoad(failWith(403)), r200 = await runLoad(async () => ({ ok: true, day: '2026-11-04', rows: [] }));
  ok('C7 403(경영진 아님)이면 칸을 숨긴다 · 짝: 성공이면 보이고 그린다·오늘을 서버에서 받는다', loadSrc && r403.box.hidden === true
    && r200.box.hidden === false && r200.painted.length === 1 && r200.S.today === '2026-11-04');
  const blip = await runLoad(failWith(500), { data: { rows: [] }, day: '2026-11-04', today: '2026-11-04' }, false);
  ok('C7b 보이던 보고판이 잠깐 실패하면 숨기지 않고 «못 읽었다» 고 말한다', blip.box.hidden === false && blip.said.includes(true));
  // 첫 조회의 403 은 «원래 숨어 있던» 칸이라 숨기는 줄을 지워도 통과한다(함정 대조 변이로 실측) — «보이던 칸이 403» 을 따로 잰다.
  const revoked = await runLoad(failWith(403), { data: { rows: [] }, day: '2026-11-04', today: '2026-11-04' }, false);
  ok('C7c 보이던 보고판도 403(권한이 빠짐)이면 숨긴다', revoked.box.hidden === true);

  const callSrc = cut(code, 'async function call(') + '\n' + cut(code, 'function errorText(');
  const runCall = async (status, body) => {
    const fetch = async () => ({ status, ok: status >= 200 && status < 300, json: async () => body });
    try { return { ok: true, v: await new Function('fetch', 'API', 'location', callSrc + '\nreturn call;')(fetch, '/api', {})('/board') }; }
    catch (e) { return { ok: false, status: e.status }; }
  };
  const c200 = await runCall(200, { ok: true, rows: [] }), cFalse = await runCall(200, { ok: false, error: 'x' }), c404 = await runCall(404, { error: 'Not Found' });
  ok('C8 성공은 «200 이고 ok === true» 일 때만 — 200+ok:false 도, ok 칸 없는 404 도 실패', c200.ok && !cFalse.ok && !c404.ok && c404.status === 404);

  const respondSrc = cut(code, 'async function respond(');
  const runRespond = async (callImpl, kind = 'ack', answer = '') => {
    const events = [], calls = [], loads = [], btn = { disabled: false };
    const doc = { dispatchEvent: e => events.push(e) };
    await new Function('prompt', 'call', 'say', 'document', 'CustomEvent', 'load', 'current', respondSrc + '\nreturn respond;')(
      () => answer, async (p, b) => { calls.push([p, b]); return callImpl(p, b); }, () => {}, doc, FakeEvent, async d => loads.push(d), () => '')(
      { name: 'X', report: { id: 7, version: 3 } }, kind, btn);
    return { events, calls, loads, btn };
  };
  const good = await runRespond(async () => ({ ok: true })), bad = await runRespond(failWith(409));
  ok('C9 보고판 확인 성공 → «board» 이벤트를 쏘고 다시 읽는다 · 짝: 실패면 안 쏘고 버튼을 되살린다',
    good.events.length === 1 && good.events[0].type === 'mh:handover-changed' && good.events[0].detail.from === 'board' && good.loads.length === 1
    && bad.events.length === 0 && bad.btn.disabled === false);
  ok('C11 확인은 기존 /ack 를 그대로 부른다(id·version·feedback — 새 판정 없음)', good.calls.length === 1 && good.calls[0][0] === '/ack'
    && good.calls[0][1].id === 7 && good.calls[0][1].version === 3 && good.calls[0][1].feedback === '');
  const noReason = await runRespond(async () => ({ ok: true }), 'return', '  ');
  const withReason = await runRespond(async () => ({ ok: true }), 'return', '송장 번호 적어 주세요');
  ok('C11b 보완 요청은 사유가 없으면 안 보내고, 있으면 /return 으로', noReason.calls.length === 0 && withReason.calls[0][0] === '/return'
    && withReason.calls[0][1].feedback === '송장 번호 적어 주세요');

  // 이웃 화면과의 배선 — 양쪽 듣는 쪽·쏘는 쪽을 실제로 돌린다(자기 이벤트는 무시해야 끝없이 돌지 않는다).
  const listen = (src, anchor, names, values) => { const handlers = []; const body = cut(src, anchor);
    new Function('document', ...names, body + ');')({ addEventListener: (t, f) => handlers.push([t, f]) }, ...values); return body ? handlers : []; };
  const boardLoads = [];
  const bh = listen(code, "document.addEventListener('mh:handover-changed'", ['S', 'load', 'current'], [{ data: {} }, d => boardLoads.push(d), () => '']);
  bh.forEach(([, f]) => { f({ detail: { from: 'inbox' } }); f({ detail: { from: 'board' } }); });
  ok('C10 받은 보고에서 바뀌면 보고판이 다시 읽고, 자기 이벤트는 무시한다', bh.length === 1 && bh[0][0] === 'mh:handover-changed' && boardLoads.length === 1);
  const inboxLoads = [];
  const mh = listen(main, "document.addEventListener('mh:handover-changed',function(e){", ['me', 'loadList'],
    [{ username: 'admin' }, () => { inboxLoads.push(1); return Promise.resolve(); }]);
  mh.forEach(([, f]) => { f({ detail: { from: 'board' } }); f({ detail: { from: 'inbox' } }); });
  ok('C10b 보고판에서 바뀌면 받은 보고가 다시 읽고, 자기 이벤트는 무시한다', mh.length === 1 && inboxLoads.length === 1);
  const actSrc = cut(main, 'async function act(r,kind,button){');
  const runAct = async callImpl => { const events = [], lists = [];
    await new Function('prompt', 'call', 'document', 'CustomEvent', 'loadList', 'networkError', actSrc + '\nreturn act;')(
      () => '', callImpl, { dispatchEvent: e => events.push(e) }, FakeEvent, async () => lists.push(1), () => {})({ id: 1, version: 2 }, 'ack', { disabled: false });
    return { events, lists }; };
  const aGood = await runAct(async () => ({ ok: true })), aBad = await runAct(failWith(409));
  ok('C10c 받은 보고에서 확인 성공 → «inbox» 이벤트 · 짝: 실패면 안 쏜다', aGood.events.length === 1 && aGood.events[0].detail.from === 'inbox'
    && aBad.events.length === 0);

  // C13 /board 의 영업일지 SQL 이 읽는 칸이 «정본 CREATE»(api-sales-hr.ts)에 실제로 있다 — 하니스 표는 손으로 적었으므로 정본과 대조한다.
  const hr = readFileSync(join(ROOT, 'cloudflare-deploy/src/api-sales-hr.ts'), 'utf8');
  const colsOf = tbl => { const s = hr.indexOf('CREATE TABLE IF NOT EXISTS ' + tbl + ' ('); return s < 0 ? new Set()
    : new Set([...hr.slice(s, hr.indexOf('].join', s)).matchAll(/`\s+([a-z_]+)\s+[A-Z]/g)].map(m => m[1])); };
  const canon = { r: colsOf('sales_reps'), a: colsOf('sales_activities'), l: colsOf('sales_leads') };
  const routeSrc = readFileSync(HANDOVER_SRC.startsWith('/') ? HANDOVER_SRC : join(ROOT, HANDOVER_SRC), 'utf8'); // 변이시험은 절대 경로로 넘긴다
  const blk = routeSrc.slice(routeSrc.indexOf("route === '/board'"), routeSrc.indexOf("route === '/closed-days'"));
  const refs = [...blk.matchAll(/\b([ral])\.([a-z_]+)\b/g)].map(m => [m[1], m[2]]);
  const repsQ = (blk.match(/FROM sales_reps\s+WHERE([^`]*)`/) || [, ''])[1];
  const repsCols = [...repsQ.matchAll(/\b([a-z_]+)\s*(?:=|<>|IS\b)/g)].map(m => m[1]);
  const bad13 = [...refs.filter(([t, c]) => !canon[t].has(c)).map(x => x.join('.')), ...repsCols.filter(c => !canon.r.has(c)).map(c => 'sales_reps.' + c)];
  ok('C13 영업일지 SQL 의 칸이 전부 정본 CREATE 에 있다', canon.r.size > 5 && canon.a.size > 5 && refs.length >= 8 && repsCols.length >= 2 && !bad13.length,
    bad13.join(',') + ` refs=${refs.length} reps=${repsCols.join('/')}`);

  // C12 10초 읽기 잠금을 «실제로 실행» — 버튼은 화면에 붙기 «전» 에 잠금이 걸린다(브라우저 검사가 잡은 사고).
  const start = js.indexOf('function armReadGate(');
  let depth = 0, end = -1;
  for (let i = js.indexOf('{', start); i < js.length; i++) { if (js[i] === '{') depth++; else if (js[i] === '}' && --depth === 0) { end = i + 1; break; } }
  ok('C12-0 armReadGate 를 잘라 냈다', start > 0 && end > start);
  const gate = (readMin, connected) => {
    const timers = [], calls = [], btn = { isConnected: connected, disabled: false, textContent: '확인' };
    const fn = new Function('S', 'openedAt', 'call', 'setTimeout', js.slice(start, end) + '\nreturn armReadGate;')(
      { data: { read_min_sec: readMin } }, {}, (p) => { calls.push(p); return Promise.resolve({ ok: true }); }, (f) => { timers.push(f); });
    fn({ can_mark_opened: true, report: { id: 1, version: 2 } }, btn);
    return { btn, timers, calls };
  };
  const off = gate(10, false);
  ok('C12-1 아직 안 붙은 버튼도 10초 동안 잠긴다', off.btn.disabled === true && /초 뒤/.test(off.btn.textContent) && off.timers.length === 1);
  ok('C12-2 연 순간을 서버에 남긴다(/opened)', off.calls.join() === '/opened');
  const free = gate(0, false);
  ok('C12-3 짝: 10초 규칙이 없는 사람(대표님)은 잠그지 않는다', free.btn.disabled === false && free.calls.length === 0);
  const gone = gate(10, true); gone.btn.isConnected = false; gone.timers[0]();
  ok('C12-4 붙었다가 떨어진(다시 그려진) 버튼은 더 돌지 않는다', gone.timers.length === 1);
}

console.log(`handover_board_harness — PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
