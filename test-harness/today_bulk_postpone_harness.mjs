// -*- coding: utf-8 -*-
/* ═══════════════════════════════════════════════════════════════════════════
   🏫 「오늘 수업」 학원 한꺼번에 연기 (2026-09-23 매니저 Karl 제안 2단계)

   [무엇을] js/class-move-modal.js 의 bulkPlan·bulkEarly·bulkOne·bulkRun 을 **중괄호 짝으로 오려 내
            가짜 fetch·가짜 DOM 으로 실제로 돌린다.**
     ① 어느 줄을 옮기고 어느 줄을 빼는가 — «뺀다» 옆에 «옮긴다» 를 짝으로(짝이 없으면 «전부 빼기» 도 통과)
     ② 한 줄 = 단건 «완전히 연기» 와 같은 두 요청(postpone → decide). ⛔ 'cancel'·DELETE 는 절대 없다
     ③ 여러 줄은 «차례로» — 동시에 몰지 않고, 한 줄이 실패해도 나머지는 계속, 된 줄은 다시 안 보낸다
     ④ 배선 — 두 화면이 «학원을 골랐을 때만» 버튼을 주고 bulkOpen 을 부른다
   브라우저 검사는 test-harness/manual/today-class-pickers-browser.mjs 가 아니라 사람이 창을 열어 봐야 끝.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const MOD = readFileSync(process.env.MOVE_SRC || join(PUB, 'js', 'class-move-modal.js'), 'utf8');
const ADM = readFileSync(join(PUB, 'js', 'adm-today-classes.js'), 'utf8');
const MGR = readFileSync(join(PUB, 'manager.html'), 'utf8');

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra) => {
  if (cond) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; console.log('  ❌ FAIL ' + name + (extra ? '  → ' + extra : '')); }
};
function fnSrc(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) {
    const ch = src[k];
    if (ch === '{') d++;
    else if (ch === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}
const stripComments = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const NAMES = ['T', 'isEn', 'hhmm', 'mvReq', 'mvErrOf', 'mvMsgOf', 'mvMe',
  'bulkPlan', 'bulkWhy', 'bulkEarly', 'bulkChecked', 'bulkMark', 'bulkOne', 'bulkRun'];
const parts = NAMES.map(n => fnSrc(MOD, n));
ok('필요한 함수를 전부 오려 냈다 (전제)', parts.every(Boolean), NAMES.filter((n, i) => !parts[i]).join(','));

function make(env) {
  try {
    const f = new Function('fetch', '$', 'window', 'esc',
      'var _opt = { me: { name: "관리자A" } }, _bkChanged = false, _bkBusy = false;\n'
      + parts.join('\n')
      + '\nreturn { bulkPlan: bulkPlan, bulkEarly: bulkEarly, bulkOne: bulkOne, bulkRun: bulkRun,'
      + ' changed: function(){ return _bkChanged; }, busy: function(){ return _bkBusy; } };');
    return f(env.fetch, env.$, env.window, s => String(s));
  } catch (e) { ok('오려 낸 코드가 돈다', false, e.message); return null; }
}

/* ── ① 어느 줄을 옮기나 ─────────────────────────────────────────── */
console.log('\n① 어느 줄을 옮기나');
{
  const m = make({ fetch: () => {}, $: () => null, window: {} });
  if (m) {
    const R = [
      { schedule_id: 1, can_move: true, status: 'early', source: 'mangoi' },
      { schedule_id: 2, can_move: true, status: 'open', source: 'mangoi' },
      { schedule_id: 3, can_move: false, status: 'early', source: 'mangoi' },
      { schedule_id: 4, status: 'early', source: 'mangoi' },            // can_move 모름 → 안 옮김
      { schedule_id: null, can_move: true, status: 'early', source: 'cafe24' },
      { schedule_id: 6, can_move: true, status: 'early', source: 'cafe24' }, // 카페24 는 번호가 있어도 안 됨
      { schedule_id: 7, can_move: true, status: 'ended', source: 'mangoi' },
      { schedule_id: 8, can_move: true, status: 'live', source: 'mangoi' },
      { schedule_id: 0, can_move: true, status: 'early', source: 'mangoi' },
    ];
    const p = m.bulkPlan(R);
    const go = p.go.map(r => r.schedule_id).join(',');
    ok('예정·입장가능 날짜지정 수업은 옮긴다 (짝)', go === '1,2', go);
    const why = Object.fromEntries(p.skip.map(s => [String(s.r.schedule_id), s.why]));
    ok('매주 반복(can_move=false)은 뺀다', why['3'] === 'weekly');
    ok('can_move 를 모르면 뺀다 (막는 쪽으로)', why['4'] === 'weekly');
    ok('카페24 는 번호가 있어도 뺀다', why['6'] === 'cafe24' && why['null'] === 'cafe24');
    ok('끝난 수업은 뺀다', why['7'] === 'ended');
    ok('진행 중인 수업은 뺀다', why['8'] === 'live');
    ok('수업 번호가 없으면 뺀다', why['0'] === 'no_id');
    ok('빠진 줄도 사라지지 않고 전부 이유와 함께 남는다', p.go.length + p.skip.length === R.length);
    ok('빈 입력에도 안 죽는다', m.bulkPlan(null).go.length === 0);
    const now = 1_000_000_000_000;
    ok('시작 31분 전이면 «사전 연기» 로 센다', m.bulkEarly({ start_ts: now + 31 * 60000 }, now) === true);
    ok('시작 30분 전이면 아니다 (경계)', m.bulkEarly({ start_ts: now + 30 * 60000 }, now) === false);
    ok('시각을 모르면 사전 연기로 세지 않는다', m.bulkEarly({}, now) === false);
  }
}

/* ── ② 한 줄 = 두 요청 ─────────────────────────────────────────── */
console.log('\n② 한 줄 = 단건 «완전히 연기» 와 같은 두 요청');
function fakeFetch(plan) {
  const log = [];
  let inflight = 0, maxIn = 0;
  const f = (url, o) => {
    const body = JSON.parse(o.body || '{}');
    log.push({ url, method: o.method, body });
    inflight++; maxIn = Math.max(maxIn, inflight);
    const r = plan(url, body, log.length);
    return new Promise(res => setTimeout(() => { inflight--; res({ status: r.st, json: () => Promise.resolve(r.j) }); }, 2));
  };
  f.log = log; f.max = () => maxIn;
  return f;
}
let idSeq = 100;
const okPlan = (url, body) => url.endsWith('/decide')
  ? { st: 200, j: { ok: true, applied: 'postponed' } }
  : { st: 200, j: { ok: true, id: ++idSeq } };
{
  const f = fakeFetch(okPlan);
  const m = make({ fetch: f, $: () => null, window: {} });
  if (m) {
    const res = await m.bulkOne({ schedule_id: 55, teacher_name: 'FAR', student_name: '김하나', student_uid: 'kim1' }, '관리자A', '학원 휴원');
    ok('성공이면 ok', res.ok === true, JSON.stringify(res));
    ok('요청은 정확히 두 번', f.log.length === 2, f.log.length);
    ok('첫 요청은 schedule-requests', f.log[0] && f.log[0].url === '/api/admin/schedule-requests' && f.log[0].method === 'POST');
    ok('⛔ request_type 은 postpone (cancel 이 아니다 — 급여)', f.log[0] && f.log[0].body.request_type === 'postpone');
    ok('날짜·시각을 싣지 않는다 (날짜 미정 연기)', f.log[0] && !('new_date' in f.log[0].body) && !('new_time' in f.log[0].body));
    ok('수업 번호·사유·학생이 실린다', f.log[0] && f.log[0].body.schedule_id === 55 && f.log[0].body.reason === '학원 휴원' && f.log[0].body.student_uid === 'kim1');
    ok('둘째는 decide approve — 첫 응답의 id 로', f.log[1] && f.log[1].url.endsWith('/decide') && f.log[1].body.action === 'approve' && f.log[1].body.id === idSeq);
    ok('처리한 사람 이름이 남는다', f.log[1] && f.log[1].body.decided_by === '관리자A');
    ok('바뀌었다고 표시한다 (닫으면 목록을 다시 받게)', m.changed() === true);
  }
}
{
  const f = fakeFetch(() => ({ st: 403, j: { ok: false, error: 'forbidden_scope' } }));
  const m = make({ fetch: f, $: () => null, window: {} });
  if (m) {
    const res = await m.bulkOne({ schedule_id: 9 }, 'x', '');
    ok('접수가 막히면 승인 요청을 보내지 않는다', f.log.length === 1);
    ok('실패로 말한다', res.ok === false && /권한/.test(res.text), res.text);
    ok('아무것도 안 바뀌었으면 «바뀜» 표시를 안 한다', m.changed() === false);
  }
}
{
  const f = fakeFetch((url) => url.endsWith('/decide') ? { st: 200, j: { ok: true, applied: 'recorded' } } : { st: 200, j: { ok: true, id: 7 } });
  const m = make({ fetch: f, $: () => null, window: {} });
  if (m) {
    const res = await m.bulkOne({ schedule_id: 9 }, 'x', '');
    ok('서버가 «연기» 로 적지 않았으면 성공으로 세지 않는다', res.ok === false, JSON.stringify(res));
  }
}
{
  const m = make({ fetch: () => Promise.reject(new Error('net')), $: () => null, window: {} });
  if (m) {
    let res = null;
    try { res = await m.bulkOne({ schedule_id: 9 }, 'x', ''); } catch (e) { res = { thrown: true }; }
    ok('연결이 끊겨도 던지지 않고 실패로 돌려준다 (다음 줄이 계속되게)', res && res.ok === false && !res.thrown, JSON.stringify(res));
  }
}

/* ── ③ 여러 줄 — 차례로, 실패해도 계속 ──────────────────────────── */
console.log('\n③ 여러 줄 — 차례로');
function fakeDom(sids) {
  const cbs = sids.map(s => ({ sid: String(s), checked: true, disabled: false, getAttribute() { return this.sid; } }));
  const res = {};
  const box = {
    querySelectorAll: () => cbs,
    querySelector: sel => {
      const m = sel.match(/data-bk-(res|sid)="([^"]+)"/);
      if (!m) return null;
      if (m[1] === 'sid') return cbs.find(c => c.sid === m[2]) || null;
      return (res[m[2]] = res[m[2]] || { style: {}, textContent: '' });
    },
  };
  const els = { 'tc-bulk-modal': box, 'tc-bk-msg': { style: {}, textContent: '' }, 'tc-bk-go': { disabled: false }, 'tc-bk-reason': { value: ' 휴원 ' } };
  return { $: id => els[id] || null, cbs, res, els };
}
{
  const rows = [11, 12, 13, 14].map(i => ({ schedule_id: i, start_ts: 0, teacher_name: 'T' + i }));
  const dom = fakeDom([11, 12, 13, 14]);
  dom.cbs[3].checked = false;   // 14 는 사람이 체크를 풀었다
  let asked = '';
  const f = fakeFetch((url, body) => {
    if (!url.endsWith('/decide') && body.schedule_id === 12) return { st: 500, j: { ok: false } };
    return okPlan(url, body);
  });
  const m = make({ fetch: f, $: dom.$, window: { confirm: q => { asked = q; return true; } } });
  if (m) {
    m.bulkRun(rows, '2026-09-23');
    for (let k = 0; k < 200 && m.busy(); k++) await new Promise(r => setTimeout(r, 5));
    ok('끝났다 (전제)', m.busy() === false);
    ok('확인창이 건수를 말한다', /3건|3 class/.test(asked), asked.slice(0, 60));
    ok('체크를 푼 줄은 안 보낸다', !f.log.some(l => l.body.schedule_id === 14));
    ok('한 번에 한 요청만 보낸다 (동시에 몰지 않음)', f.max() === 1, f.max());
    const sent = f.log.filter(l => !l.url.endsWith('/decide')).map(l => l.body.schedule_id).join(',');
    ok('실패한 줄 뒤에도 계속한다', sent === '11,12,13', sent);
    ok('사유는 모든 줄에 같이 (앞뒤 공백 없이)', f.log.filter(l => !l.url.endsWith('/decide')).every(l => l.body.reason === '휴원'));
    ok('성공한 줄은 체크가 풀리고 잠긴다 (다시 안 보냄)', dom.cbs[0].disabled === true && dom.cbs[2].disabled === true);
    ok('실패한 줄은 다시 누를 수 있게 남는다 (짝)', dom.cbs[1].disabled === false && dom.cbs[1].checked === true);
    ok('줄마다 결과가 적힌다', /연기/.test(dom.res['11'].textContent) && dom.res['12'].textContent !== '', JSON.stringify(dom.res['12']));
    ok('합계를 말한다 (성공 2 · 실패 1)', /2건/.test(dom.els['tc-bk-msg'].textContent) && /1건/.test(dom.els['tc-bk-msg'].textContent), dom.els['tc-bk-msg'].textContent);
    ok('실행 버튼이 다시 풀린다', dom.els['tc-bk-go'].disabled === false);
  }
}
{
  const dom = fakeDom([21]);
  const f = fakeFetch(okPlan);
  const m = make({ fetch: f, $: dom.$, window: { confirm: () => false } });
  if (m) {
    m.bulkRun([{ schedule_id: 21 }], '2026-09-23');
    await new Promise(r => setTimeout(r, 20));
    ok('확인창에서 «취소» 하면 아무것도 안 보낸다', f.log.length === 0);
  }
}
{
  const dom = fakeDom([31]);
  dom.cbs[0].checked = false;
  let asked = false;
  const m = make({ fetch: fakeFetch(okPlan), $: dom.$, window: { confirm: () => { asked = true; return true; } } });
  if (m) {
    m.bulkRun([{ schedule_id: 31 }], '2026-09-23');
    ok('체크한 줄이 없으면 묻지도 않고 말한다', asked === false && /체크/.test(dom.els['tc-bk-msg'].textContent));
  }
}
{
  const dom = fakeDom([41, 42]);
  let asked = '';
  const now = Date.now();
  const m = make({ fetch: fakeFetch(okPlan), $: dom.$, window: { confirm: q => { asked = q; return false; } } });
  if (m) {
    m.bulkRun([{ schedule_id: 41, start_ts: now + 3 * 3600000 }, { schedule_id: 42, start_ts: now + 10 * 60000 }], '2026-09-23');
    ok('사전 연기(급여) 경고가 «몇 건» 인지 말한다', /1건은 시작 30분보다/.test(asked), asked);
  }
}

/* ── ④ 배선 ──────────────────────────────────────────────────── */
console.log('\n④ 배선');
{
  const body = stripComments(fnSrc(MOD, 'bulkOne') + fnSrc(MOD, 'bulkRun') + fnSrc(MOD, 'bulkOpen'));
  ok('⛔ 일괄 경로에 DELETE(취소)가 없다', !/DELETE/.test(body));
  ok('⛔ 일괄 경로에 cancel 요청이 없다', !/request_type\s*:\s*'cancel'/.test(body));
  ok('밖으로 bulkOpen 을 내보낸다', /mangoiMoveModal\s*=\s*\{[^}]*bulkOpen\s*:\s*bulkOpen/.test(MOD));

  const sum = fnSrc(ADM, 'academySummary');
  ok('[admin] 학원 요약 줄에 «한꺼번에 연기» 버튼이 있다', /id="tc-bulk-postpone"/.test(sum));
  const r = stripComments(fnSrc(ADM, 'render'));
  ok('[admin] 학원을 골랐을 때만 그 요약을 그린다', /acSel\s*\?\s*academySummary\(/.test(r));
  ok('[admin] 버튼이 눈앞의 줄(rows)과 고른 학원으로 창을 연다', /tcOpenBulkPostpone\(rows,\s*acSel\)/.test(r));
  ok('[admin] 키보드로도 연다', /tc-bulk-postpone[\s\S]{0,400}keydown/.test(r));
  ok('[admin] 창 함수가 bulkOpen 을 부른다', /mangoiMoveModal\.bulkOpen\(rows/.test(fnSrc(ADM, 'tcOpenBulkPostpone')));

  const p = stripComments(fnSrc(MGR, 'paintTodayAll'));
  ok('[manager] 학원을 골랐을 때만 버튼(data-bulk)을 그린다', /acSel\s*&&\s*rows\.length\s*\?\s*'<br><span data-bulk=/.test(p));
  ok('[manager] 눈앞의 줄을 남긴다', /j\._shown\s*=\s*rows/.test(p));
  ok('[manager] 버튼을 누르면 taBulk', /closest\('\[data-bulk\]'\)[\s\S]{0,80}taBulk\(\)/.test(MGR));
  ok('[manager] 키보드로도 연다', /closest\('\[data-ta\],\[data-calpin\],\[data-bulk\]'\)/.test(MGR));
  ok('[manager] taBulk 가 bulkOpen 을 부른다', /mangoiMoveModal\.bulkOpen\(rows/.test(fnSrc(MGR, 'taBulk')));
  const vA = (readFileSync(join(PUB, 'admin.html'), 'utf8').match(/class-move-modal\.js\?v=(\d+)/) || [])[1];
  const vM = (MGR.match(/class-move-modal\.js\?v=(\d+)/) || [])[1];
  ok('두 화면이 같은 번호의 창 파일을 받는다', !!vA && vA === vM, vA + ' vs ' + vM);
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) process.exit(1);
