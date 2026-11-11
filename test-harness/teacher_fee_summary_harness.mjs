/**
 * teacher_fee_summary_harness.mjs
 * ── 강사 화면 「기간별 수업료 조회」(Class fee summary by date) 회귀 감시 (2026-11-11) ──
 *
 * 사장님 요청: 강사가 시작일~종료일을 골라 수업 시간·학생·학생 ID·인센티브·수업료·합계를 본다.
 * 서버는 손대지 않았다 — 월 단위 /api/admin/payroll/lessons 를 걸친 달만큼 불러 날짜로 거른다.
 *
 * 검사 방식: teacher.html 에서 그 블록(FEE_MAX_MONTHS ~ paintPay 직전)을 «오려 내»
 *   가짜 DOM·가짜 myGet 으로 실제로 돌린다. 글자 검사가 아니라 답을 본다.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(join(__dirname, '..', 'cloudflare-deploy', 'public', 'teacher.html'), 'utf8').replace(/\r\n/g, '\n');

let pass = 0; const fails = [];
const check = (m, c) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fails.push(m); console.log('  ❌ ' + m); } };

console.log('\n════════ 강사 기간별 수업료 조회 ════════');

// ⓪ 블록을 오려 낸다 — 못 자르면 아래 검사가 빈 문자열을 보고 헛돈다
const a = html.indexOf('  function payStatusPill(l){');
const b = html.indexOf('  function paintPay(){');
const block = a > 0 && b > a ? html.slice(a, b) : '';
check('⓪ payStatusPill ~ paintPay 직전 블록을 오려 냈다', block.length > 2000 && block.includes('function searchFeeSum'));

// 가짜 환경 — 진짜 DOM 처럼 «그려진 id 만» 찾힌다. innerHTML 을 넣으면 그 안의 id 가 새 요소로 바뀌고
//   <input value="…"> 는 value 를, addEventListener('click') 는 _click 을 갖는다(테스트가 직접 누른다).
function makeEnv(monthData, lang = 'en', today = '2026-11-11') {
  const els = {};
  const mkEl = (id, value = '') => {
    let h = '';
    return { id, value, _click: null, removeAttribute() {},
      addEventListener(t, f) { if (t === 'click') this._click = f; },
      get innerHTML() { return h; },
      set innerHTML(v) { h = v; for (const m of v.matchAll(/<\w+[^>]*\bid="([^"]+)"[^>]*>/g)) {
        const val = /\bvalue="([^"]*)"/.exec(m[0]); els[m[1]] = mkEl(m[1], val ? val[1] : ''); } } };
  };
  els.feeSumBody = mkEl('feeSumBody');
  const el = (id) => els[id];
  const calls = [];
  const env = {
    MY: { pay: null }, DATA: today ? { today, me: { name: 'Teacher Test' } } : null,
    LANG: lang,
    document: { getElementById: (id) => els[id] || null },
    myGet: (key, url) => { calls.push(url); const m = /year=(\d+)&month=(\d+)/.exec(url);
      const d = monthData[m[1] + '-' + m[2]]; return d instanceof Error ? Promise.reject(d) : Promise.resolve(d || { ok: true, lessons: [] }); },
  };
  const fn = new Function('env', `
    var MY = env.MY, DATA = env.DATA, document = env.document, myGet = env.myGet;
    function todayKST(){ return env.TODAY_KST; }
    function EN(){ return env.LANG !== 'ko'; }
    function T(en, ko){ return EN() ? en : ko; }
    function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, function(c){ return '&#' + c.charCodeAt(0) + ';'; }); }
    function peso(v){ return '₱' + (Number(v) || 0).toLocaleString('en-US'); }
    function myName(){ return (DATA && DATA.me && DATA.me.name) || ''; }
    function fill(id, h){ var e = document.getElementById(id); e.removeAttribute('data-en'); e.innerHTML = h; }
    var window = {};
    ${block}
    return { window: window, feeMonths: feeMonths, feeRangeError: feeRangeError, search: searchFeeSum, paint: paintFeeSum };`);
  const api = fn(env);
  return { env, els, el, calls, api };
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const L = (date, time, extra = {}) => ({ date, start_time: time, end_time: '', student_name: 'Stu ' + date, user_id: 'uid_' + date.slice(5).replace('-', ''),
  status: 'finish', amount: 50, deduction_total: 0, net_amount: 50, ...extra });

// ① 달 나누기 — 해를 넘는 기간 · 상한
{
  const { api } = makeEnv({});
  check('① 11-20 ~ 01-05 는 11·12·1월 세 달', JSON.stringify(api.feeMonths('2026-11-20', '2027-01-05')) === '[[2026,11],[2026,12],[2027,1]]');
  check('① 같은 달이면 한 달', JSON.stringify(api.feeMonths('2026-11-01', '2026-11-30')) === '[[2026,11]]');
  check('① 아주 긴 기간도 루프가 상한에서 멈춘다(4개 이하)', api.feeMonths('2000-01-01', '2099-12-31').length <= 4);
  check('① 날짜 빠짐 → dates', api.feeRangeError({ from: '', to: '2026-11-11' }) === 'dates');
  check('① 시작 > 종료 → order', api.feeRangeError({ from: '2026-11-12', to: '2026-11-11' }) === 'order');
  check('① 4개월 걸침 → span', api.feeRangeError({ from: '2026-08-31', to: '2026-11-01' }) === 'span');
  check('① 3개월 걸침 → 통과(짝)', api.feeRangeError({ from: '2026-09-01', to: '2026-11-30' }) === '');
}

// ② 기간 필터 · 예정 제외 · 정렬 · 합계 · 열 — 실제로 조회를 돌린다
{
  const oct = { ok: true, teacher: { english_name: 'Old', level_label_en: 'L-old' }, lessons: [
    L('2026-10-15', '10:00'),                                   // 기간 밖(시작 전)
    L('2026-10-16', '10:00', { amount: 66, net_amount: 66 }),   // 첫날 포함
    L('2026-10-31', '21:00', { status: 'student_absent', amount: 25, net_amount: 25 }),
  ] };
  const nov = { ok: true, teacher: { english_name: 'Gwenalyn', level_label_en: 'Senior Teacher B' }, lessons: [
    L('2026-11-02', '19:00', { amount: 61, deduction_total: 25, net_amount: 36, deductions: [{ code: 'no_feedback_day', amount: 25 }] }),
    L('2026-11-01', '18:00', { end_time: '18:30' }),
    L('2026-11-10', '09:00', { status: 'upcoming' }),           // 예정 → 제외
    L('2026-11-11', '09:00'),                                   // 끝날 포함
    L('2026-11-12', '09:00'),                                   // 기간 밖(끝 뒤)
  ] };
  const { env, el, calls, api } = makeEnv({ '2026-10': oct, '2026-11': nov });
  env.MY.feeRange = { from: '2026-10-16', to: '2026-11-11' };
  api.paint(); api.search(); await tick(); await tick();
  const f = env.MY.fee && env.MY.fee.lessons ? env.MY.fee : { lessons: [] };   // 실패해도 크래시 말고 FAIL 로
  check('② 걸친 두 달만 불렀다', calls.length === 2 && calls[0].includes('month=10') && calls[1].includes('month=11'));
  check('② 기간 안 · 예정 아닌 수업만 5건', f.lessons.length === 5);
  check('② 날짜·시각 오름차순', f.lessons.map((l) => l.date + ' ' + l.start_time).join('|') === '2026-10-16 10:00|2026-10-31 21:00|2026-11-01 18:00|2026-11-02 19:00|2026-11-11 09:00');
  const out = el('fs-out').innerHTML;
  check('② 머리글: 기간 · 강사 이름 · 등급(마지막 달 응답)', out.includes('2026-10-16 ~ 2026-11-11') && out.includes('Gwenalyn') && out.includes('Senior Teacher B'));
  check('② 열 머리: Lesson time · Student · Student ID · Fee · Incentive · Total', ['Lesson time', 'Student', 'Student ID', 'Fee', 'Incentive', 'Total'].every((h) => out.includes('>' + h + '<')));
  check('② 학생 ID 칸에 user_id 가 나온다', out.includes('>uid_1102<'));
  check('② 시작-끝 시각 표기', out.includes('2026-11-01 18:00-18:30'));
  // 수업료 합 50+66+25+61+50=252 · 공제 25 · 합계 50+66+25+36+50=227
  check('② 수업료 합 ₱252', out.includes('<td class="n">₱252</td>'));
  check('② 공제 합 −₱25', out.includes('&minus;₱25</td><td class="n">₱227</td>'));
  check('② 합계 ₱227 (머리글에도)', out.includes('Total ₱227'));
  check('② 인센티브: 없는 값을 지어내지 않는다(행마다 — + 안내)',
    (out.match(/<td class="n">&mdash;<\/td>/g) || []).length === 5 + 1 && out.includes('Incentive: none recorded'));
  check('② 상태 알약(학생 결석)', out.includes('Student absent'));
}

// ③ 늦게 도착한 옛 조회(9월)가 나중에 누른 조회(11월)를 덮지 않는다
{
  let releaseSep;
  const slowSep = new Promise((r) => { releaseSep = r; });
  const { env, api } = makeEnv({ '2026-9': slowSep, '2026-11': { ok: true, lessons: [L('2026-11-05', '10:00')] } });
  env.MY.feeRange = { from: '2026-09-01', to: '2026-09-30' }; api.search();
  env.MY.feeRange = { from: '2026-11-01', to: '2026-11-30' }; api.search();
  await tick(); await tick();
  releaseSep({ ok: true, lessons: [L('2026-09-03', '10:00')] }); await tick(); await tick();
  const ls = env.MY.fee && env.MY.fee.lessons;
  check('③ 나중에 누른 조회(11월)가 남는다', !!ls && ls.length === 1 && ls[0].date === '2026-11-05');
}

// ④ 실패·잘못된 기간은 «화면 글자» 로 말한다(조용히 비지 않는다)
{
  const { env, el, api } = makeEnv({ '2026-11': new Error('boom') });
  env.MY.feeRange = { from: '2026-11-01', to: '2026-11-11' };
  api.paint(); api.search(); await tick(); await tick();
  check('④ 불러오기 실패 → 안내 문구', el('fs-out').innerHTML.includes('Could not load'));
  env.MY.feeRange = { from: '2026-11-12', to: '2026-11-01' }; api.search();
  check('④ 시작 > 종료 → 안내 문구', el('fs-out').innerHTML.includes('start date is after'));
  const ko = makeEnv({}, 'ko'); ko.env.MY.feeRange = { from: '', to: '' }; ko.api.paint(); ko.api.search();
  check('④ 한국어 화면은 한국어 안내(EN/KO)', ko.el('fs-out').innerHTML.includes('시작일과 종료일을 모두'));
}

// ⑤ 배선 — 카드가 «펼칠 때만» 부르고(첫 화면 API 1회 계약) 언어 전환 때 다시 그린다
check('⑤ 카드는 펼칠 때만 loadFeeSum 을 부른다',
  /<details class="card mycard" id="c-feesum" ontoggle="if\(this\.open\)loadFeeSum\(\)">/.test(html));
check('⑤ 카드 제목 EN/KO', /data-en="Class fee summary \(by date\)" data-ko="기간별 수업료 조회"/.test(html));
{
  const s = html.indexOf('  function repaintMy(){'), e = html.indexOf('\n  }', s);
  check('⑤ 언어 전환 repaintMy «본문 안» 에서 paintFeeSum 을 부른다', s > 0 && html.slice(s, e).includes('if (MY.feeRange) paintFeeSum();'));
}
check('⑤ 건별 명세도 같은 상태 알약을 쓴다(복제 없음)', html.includes('var stL = payStatusPill;') && (html.match(/function payStatusPill/g) || []).length === 1);

// ⑥ 강사가 실제로 쓰는 길 — 펼치기(loadFeeSum) → 날짜 입력 → [조회] 클릭
{
  const nov = { ok: true, teacher: {}, lessons: [L('2026-11-03', '10:00'), L('2026-11-09', '10:00')] };
  const { env, el, calls, api } = makeEnv({ '2026-11': nov });
  api.window.loadFeeSum(); await tick(); await tick();
  check('⑥ 펼치면 기본 기간 = 이번 달 1일 ~ 오늘(DATA.today)', env.MY.feeRange.from === '2026-11-01' && env.MY.feeRange.to === '2026-11-11'
    && el('fs-from').value === '2026-11-01' && el('fs-to').value === '2026-11-11');
  check('⑥ 펼치면 한 번 조회한다', calls.length === 1 && env.MY.fee && env.MY.fee.lessons.length === 2);
  api.window.loadFeeSum(); await tick();
  check('⑥ 다시 펼쳐도 다시 조회하지 않는다(받은 것으로 그림)', calls.length === 1);
  check('⑥ 나간 URL 은 월 API 그대로 — teacher_name 을 안 보낸다(본인 제한은 서버가 세션으로 건다)',
    calls[0] === '/api/admin/payroll/lessons?year=2026&month=11');
  el('fs-from').value = '2026-11-05'; el('fs-to').value = '2026-11-30';
  check('⑥ [조회] 버튼에 클릭이 연결돼 있다', typeof el('fs-go')._click === 'function');
  el('fs-go')._click(); await tick(); await tick();
  check('⑥ 클릭하면 입력한 기간 그대로(시작·종료 안 뒤바뀜) 조회', env.MY.feeRange.from === '2026-11-05' && env.MY.feeRange.to === '2026-11-30'
    && env.MY.fee.lessons.length === 1 && env.MY.fee.lessons[0].date === '2026-11-09');
  el('fs-from').value = '2026-11-07';   // 고르고 아직 [조회] 안 누름
  api.paint();                           // = 언어 전환 repaintMy
  check('⑥ 다시 그려도 조회 안 한 입력값이 남는다', el('fs-from').value === '2026-11-07' && el('fs-to').value === '2026-11-30');
  const early = makeEnv({}, 'en', null); early.env.TODAY_KST = '2026-12-01';
  early.api.window.loadFeeSum();
  check('⑥ portal 응답 전(DATA 없음)에 펼치면 KST 오늘로(todayKST)', early.env.MY.feeRange.from === '2026-12-01' && early.env.MY.feeRange.to === '2026-12-01');
}

// ⑦ 공제가 수업료보다 큰 수업(노쇼 ₱0 − ₱100) — 급여와 같은 규칙: 줄은 음수 그대로, 기간 합계만 0 하한
{
  const run = async (lessons) => {
    const { env, el, api } = makeEnv({ '2026-11': { ok: true, teacher: {}, lessons } });
    env.MY.feeRange = { from: '2026-11-01', to: '2026-11-30' }; api.paint(); api.search(); await tick(); await tick();
    return el('fs-out').innerHTML;
  };
  const noshow = L('2026-11-04', '10:00', { status: 'teacher_no_show', amount: 0, deduction_total: 100, net_amount: 0 });
  let out = await run([L('2026-11-03', '10:00'), noshow]);
  check('⑦ 노쇼 줄 합계 −₱100 (수업료 − 공제가 그 줄에서 맞는다)', out.includes('−₱100</b>'));
  check('⑦ 기간 합계 ₱0 (₱50 − ₱100, 0 하한 = 월 «예상 지급액» 과 같은 규칙)', out.includes('Total ₱0<') && out.includes('<td class="n">₱0</td></tr></tfoot>'));
  out = await run([L('2026-11-03', '10:00', { amount: 200, net_amount: 200 }), noshow]);
  check('⑦ 남는 돈이 있으면 기간 합계 = 수업료 합 − 공제 합 (₱200 − ₱100 = ₱100)', out.includes('Total ₱100<'));
}

// ⑧ 실패한 옛 조회가 나중에 성공한 조회를 덮지 않는다(.catch 쪽 순서 가드)
{
  let rejectOct;
  const slowFail = new Promise((_, rej) => { rejectOct = rej; });
  slowFail.catch(() => {});
  const { env, api } = makeEnv({ '2026-10': slowFail, '2026-11': { ok: true, lessons: [L('2026-11-05', '10:00')] } });
  env.MY.feeRange = { from: '2026-10-01', to: '2026-10-31' }; api.search();
  env.MY.feeRange = { from: '2026-11-01', to: '2026-11-30' }; api.search();
  await tick(); await tick();
  rejectOct(new Error('late')); await tick(); await tick();
  check('⑧ 늦게 실패한 10월 조회가 11월 결과를 «오류» 로 바꾸지 않는다', !!env.MY.fee && !env.MY.fee.err && env.MY.fee.lessons.length === 1);
}

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${pass} · 실패 ${fails.length}`);
if (fails.length) fails.forEach((f) => console.log('   · ' + f));
console.log('─────────────────────────────────────────────');
process.exit(fails.length ? 1 : 0);
