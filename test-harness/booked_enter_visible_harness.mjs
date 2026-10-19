/* booked_enter_visible_harness.mjs — 「수업 관찰」 카드의 «예약 기준 지금 수업» 줄에
 * «🚪 직접 입장(보임)» 버튼이 붙는지 감시 (2026-10-19)
 *
 * ── 왜 ──────────────────────────────────────────────────────────────────────
 * 필리핀 매니저 질문 「참관할 때 매니저가 보이게 할 수 있나요?」 → 보이게 들어가는 버튼
 * (ghEnterRoom)은 위쪽 «화상방» 표에만 있었고, 그 표는 «누가 접속해야» 뜬다.
 * 그래서 아무도 안 들어온 수업 시작 직전에는 아래 «예약 기준 지금 수업» 줄에
 * 「👁 바로 참관」(안 보임)만 있고, 학생에게 «보이며» 들어갈 길이 없었다(사장님 지시로 추가).
 *
 * ── 어떻게 검사하나 ─────────────────────────────────────────────────────────
 * ⛔ «그 글자가 파일에 있는가» 로 묻지 않는다 — `if (false)` 한 글자에 뚫린다.
 * ✅ adm-s1.js 를 **가짜 DOM·가짜 fetch 로 실제로 돌려** 나온 HTML 을 보고,
 *    버튼의 onclick 을 **실제로 눌러** 어느 방으로 들어가는지까지 본다.
 * ⚠️ 짝으로 묻는다 — 「방이 있는 줄에는 붙는다」 옆에 «방이 없는 카페24 줄에는 안 붙는다»
 *    (빈 방 번호로 들어가면 안 된다)·«참관 버튼은 그대로다» 를 둔다.
 * 변이시험: ADM_S1_SRC=<고친 사본> 으로 가리킬 수 있다(저장소 파일을 고쳤다 되돌리지 말 것).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.ADM_S1_SRC || join(ROOT, 'cloudflare-deploy', 'public', 'js', 'adm-s1.js');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

console.log('■ 수업 관찰 — 예약 줄의 «직접 입장(보임)» 버튼 (adm-s1.js)');

const code = readFileSync(SRC, 'utf8');

/** adm-s1.js 를 가짜 화면에서 실제로 실행하고 ghLoadLive() 결과와 그 화면을 돌려준다. */
async function render(rooms, { en = false, classes = [] } = {}) {
  const el = () => ({ value: '', textContent: '', innerHTML: '', style: {}, focus() {} });
  const nodes = {
    'gh-live-list': el(), 'gh-live-count': el(), 'gh-admin-uid': el(), 'gh-reason': el(), 'gh-room-id': el()
  };
  const opened = [];
  const win = { adminLang: en ? 'en' : 'ko', addEventListener() {}, mangoiOpenTab: (u) => opened.push(String(u)) };
  const sandbox = {
    window: win,
    location: { origin: 'https://mangoi.ai' },
    document: { getElementById: (id) => nodes[id] || null, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn) => { void fn; return 0; },
    alert() {}, confirm: () => true,
    async fetch(url) {
      const u = String(url);
      const body = u.startsWith('/api/active-rooms') ? rooms
        : u.startsWith('/api/admin/classes-now') ? { ok: true, classes }
        : u.startsWith('/api/admin/live-classes') ? { ok: true, rooms: {} }
        : { ok: false };
      return { ok: true, json: async () => body };
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'adm-s1.js' });
  if (typeof win.ghLoadLive !== 'function') throw new Error('ghLoadLive 가 전역에 없다');
  await win.ghLoadLive();
  return { html: nodes['gh-live-list'].innerHTML, win, opened };
}

/** «예약 기준 지금 수업» 구역만 — 위쪽 화상방 표에도 같은 버튼이 있어서 갈라야 한다. */
function schedSection(html) {
  const i = html.search(/Booked classes for this moment|예약 기준 지금 수업/);
  return i < 0 ? '' : html.slice(i);
}
/** 예약 구역에서 «그 학생» 줄 하나만 잘라낸다. */
function rowOf(sec, student) {
  const rows = sec.split('<div style="padding:4px 0;');
  return rows.find(r => r.includes(student)) || '';
}
const onclickOf = (row, fn) => {
  const m = row.match(new RegExp('onclick="(' + fn + '\\([^"]*)"'));
  return m ? m[1] : '';
};
/** 그 onclick 을 그 화면의 함수로 실제로 실행해 «어디로 열었나» 를 돌려준다.
 *  ghQuickObserve 는 async 라 그 끝까지 기다린다(안 기다리면 «아무것도 안 열림» 으로 헛돈다). */
async function press(r, onclick) {
  r.opened.length = 0;
  if (!onclick) return '(onclick 없음)';
  try {
    await new Function('ghEnterRoom', 'ghQuickObserve', 'decodeURIComponent', 'return ' + onclick)(
      r.win.ghEnterRoom, r.win.ghQuickObserve, decodeURIComponent);
  } catch (e) { return 'ERR ' + e.message; }
  return r.opened[0] || '';
}

const ENROL = { start_kst: '19:20', end_kst: '19:40', phase: 'soon', observable: true,
  room_id: 'class-2001-20261019', student_name: 'Yuchan Kim', teacher_name: 'CINDY', connected: false };
const C24_NOROOM = { start_kst: '19:00', end_kst: '19:20', phase: 'now', observable: false,
  room_id: 'c24-511741', live_room: '', student_name: 'Hyeon Ha-min', teacher_name: 'Teacher Far', connected: false };
const C24_LIVE = { start_kst: '19:00', end_kst: '19:20', phase: 'now', observable: false,
  room_id: 'c24-511900', live_room: 'mangoi class 7', student_name: 'Woo Sol Kang', teacher_name: 'KAYE', connected: true };
const CLASSES = [ENROL, C24_NOROOM, C24_LIVE];

/* ── 1. 스크린샷 그대로 — 아무도 접속 안 했을 때(위쪽 표가 없음) ── */
let ko = null;
try { ko = await render([], { classes: CLASSES }); } catch (e) { ko = { err: e.message }; }
const secKo = ko && !ko.err ? schedSection(ko.html) : '';

ok(!!secKo && secKo.includes('Yuchan Kim'), '전제: adm-s1.js 를 실제로 돌려 «예약 기준 지금 수업» 구역을 얻었다', ko && ko.err);

if (secKo) {
  const rEnrol = rowOf(secKo, 'Yuchan Kim'), rNoRoom = rowOf(secKo, 'Hyeon Ha-min'), rLive = rowOf(secKo, 'Woo Sol Kang');
  ok(!!rEnrol && !!rNoRoom && !!rLive, '전제: 세 줄을 각각 잘라냈다');

  const enterOn = onclickOf(rEnrol, 'ghEnterRoom');
  ok(!!enterOn, '① 수강신청 줄(아무도 접속 안 함)에 «직접 입장(보임)» 버튼이 붙는다',
    '위쪽 표가 없을 때 학생에게 보이며 들어갈 유일한 길이다');
  ok(/직접 입장\(보임\)/.test(rEnrol), '①-b 한국어 라벨 «🚪 직접 입장(보임)»');
  ok(/class="gh-act gh-act-enter"/.test(rEnrol), '①-c 위쪽 표와 같은 주황 클래스(gh-act gh-act-enter)를 쓴다');
  const enterTag = (rEnrol.match(/<button[^>]*gh-act-enter[^>]*>/) || [''])[0];
  ok(!!enterTag && !/style="[^"]*background/.test(enterTag), '①-d 인라인 background 를 쓰지 않는다(전역 !important 에 먹힘)');
  ok(/title="[^"]*학생에게 보입니다/.test(enterTag), '①-e 툴팁이 «학생에게 보인다» 를 말한다');

  ok(!!onclickOf(rEnrol, 'ghQuickObserve'), '② 짝 — 같은 줄의 «👁 바로 참관» 은 그대로 있다');

  ok(!/ghEnterRoom|ghQuickObserve/.test(rNoRoom), '③ 짝 — 방이 없는 카페24 줄에는 버튼을 달지 않는다',
    '달면 빈 방 번호로 들어간다');
  ok(!!onclickOf(rLive, 'ghEnterRoom'), '④ 접속이 잡힌 카페24 줄(live_room)에는 붙는다(참관과 같은 방)');

  const nEnter = (secKo.match(/ghEnterRoom\(/g) || []).length;
  const nObs = (secKo.match(/ghQuickObserve\(/g) || []).length;
  ok(nEnter === 2 && nEnter === nObs, '⑤ 직접 입장 버튼 수 = 참관 버튼 수 (같은 조건)', 'enter=' + nEnter + ' observe=' + nObs);

  /* ⑥ 실제로 눌러 본다 — 학생에게 보이는 «참가자» 입장 주소로, 그 줄의 방으로, 카메라 끈 채로 */
  const url = await press(ko, enterOn);
  ok(url === 'https://mangoi.ai/?vc_autojoin=1&vc_cam=off&vc_role=teacher&vc_room=class-2001-20261019',
    '⑥ 누르면 그 줄의 방으로 «실제 참가자» 입장(카메라 꺼짐)', '열린 주소: ' + url);
  const urlLive = await press(ko, onclickOf(rLive, 'ghEnterRoom'));
  ok(urlLive.endsWith('&vc_room=' + encodeURIComponent('mangoi class 7')),
    '⑥-b 방 번호에 공백이 있어도 그 방 그대로 연다(encode→decode 왕복)', '열린 주소: ' + urlLive);
  const urlObs = await press(ko, onclickOf(rEnrol, 'ghQuickObserve'));
  ok(urlObs === 'https://mangoi.ai/?observe=class-2001-20261019',
    '⑥-c 짝 — «바로 참관» 은 여전히 참관 주소(안 보임)로 연다', '열린 주소: ' + urlObs);
}

/* ── 2. 영어 화면 ── */
let en = null;
try { en = await render([], { en: true, classes: CLASSES }); } catch (e) { en = { err: e.message }; }
const secEn = en && !en.err ? schedSection(en.html) : '';
ok(/🚪 Enter \(visible\)/.test(rowOf(secEn, 'Yuchan Kim')), '⑦ 영어 라벨 «🚪 Enter (visible)» (위쪽 표와 같은 이름)');
ok(/title="[^"]*students see you/.test(rowOf(secEn, 'Yuchan Kim')), '⑦-b 영어 툴팁');

/* ── 3. 위쪽 표가 있을 때도 예약 구역에 그대로 ── */
let mixed = null;
try {
  mixed = await render([{ roomId: 'class-849-20261019', userCount: 1, users: [{ username: '교사 강선생님', role: 'teacher' }] }],
    { classes: CLASSES });
} catch (e) { mixed = { err: e.message }; }
const secMixed = mixed && !mixed.err ? schedSection(mixed.html) : '';
ok(!!onclickOf(rowOf(secMixed, 'Yuchan Kim'), 'ghEnterRoom'), '⑧ 화상방 표가 있는 화면에서도 예약 줄에 붙는다(두 갈래 모두)');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
