/* meet_room_split_harness.mjs — 관리자 「지금 진행 중인 수업」이 «회의방» 을 «수업» 으로
 * 섞어 그리지 않는지 감시 (2026-09-10)
 *
 * ── 왜 ──────────────────────────────────────────────────────────────────────
 * 사장님 제보 「meet-1234 가 계속 이렇게 보이는데 이유가 뭐지?」.
 * 그 카드 제목은 「지금 진행 중인 수업」인데 /api/active-rooms 는 방 종류를 가리지 않아
 * 예약이 없는 회의방이 «수업» 칸 «—» 인 채로 진짜 수업과 나란히 떴고, 혼자 있으면
 * 「⚠ 혼자 대기중」 노란불까지 붙었다. 회의방은 «끝나는 시각» 이 없어(예약이 없다)
 * 탭을 닫기 전에는 사라지지 않으므로 그 노란불이 몇 시간이고 켜져 있었다.
 * 2026-09-10 실측: meet-1234 가 09:05 부터 그 상태로 남아 있었다.
 *
 * ── 어떻게 검사하나 ─────────────────────────────────────────────────────────
 * ⛔ «그 글자가 파일에 있는가» 로 묻지 않는다 — 함수도 값도 다 «있고» 틀린 것은
 *    «무엇이 어느 구역에 그려지는가» 뿐이라, 수리 전에도 문자열 검사는 전부 초록이었다.
 * ✅ adm-s1.js 를 **가짜 DOM·가짜 fetch 로 실제로 돌려** 나온 HTML 을 본다.
 *
 * ⚠️ 짝으로 묻는다 — 「회의방에는 노란불이 없다」만 두면 «전부 없애기» 도 통과하므로
 *    「수업방에는 그대로 있다」를 옆에 둔다. 「회의방 줄이 감춰지지 않는다(버튼 그대로)」도 함께.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'public', 'js', 'adm-s1.js');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

console.log('■ 관리자 「지금 진행 중인 수업」 — 회의방 갈라 그리기 (adm-s1.js)');

const code = readFileSync(SRC, 'utf8');

/** adm-s1.js 를 가짜 화면에서 실제로 실행하고 ghLoadLive() 결과를 돌려준다. */
async function render(rooms, { en = false, classes = [], live = {} } = {}) {
  const el = () => ({ value: '', textContent: '', innerHTML: '', style: {}, focus() {} });
  const nodes = {
    'gh-live-list': el(), 'gh-live-count': el(), 'gh-admin-uid': el(), 'gh-reason': el(), 'gh-room-id': el()
  };
  const win = { adminLang: en ? 'en' : 'ko', addEventListener() {} };
  const sandbox = {
    window: win,
    document: { getElementById: (id) => nodes[id] || null, addEventListener() {} },
    localStorage: { getItem: () => null, setItem() {} },
    console: { log() {}, warn() {}, error() {} },
    setTimeout: (fn) => { void fn; return 0; },
    alert() {}, confirm: () => false,
    async fetch(url) {
      const u = String(url);
      const body = u.startsWith('/api/active-rooms') ? rooms
        : u.startsWith('/api/admin/classes-now') ? { ok: true, classes }
        : u.startsWith('/api/admin/live-classes') ? { ok: true, rooms: live }
        : { ok: false };
      return { ok: true, json: async () => body };
    }
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox, { filename: 'adm-s1.js' });
  if (typeof win.ghLoadLive !== 'function') throw new Error('ghLoadLive 가 전역에 없다');
  await win.ghLoadLive();
  return { html: nodes['gh-live-list'].innerHTML, count: nodes['gh-live-count'].textContent };
}

const room = (roomId, userCount, users) => ({ roomId, userCount, users: users || [] });
const CLASS_ROOM = room('class-849-20260910', 1, [{ username: '교사 강선생님', role: 'teacher' }]);
const MEET_ROOM = room('meet-1234', 1, [{ username: '교사 강선생님', role: 'teacher' }]);

/** <details>(회의방 구역) 안쪽만 잘라낸다 — «어느 구역에 그려졌나» 를 가르는 유일한 방법. */
function meetSection(html) {
  const i = html.indexOf('<details');
  if (i < 0) return '';
  const j = html.indexOf('</details>', i);
  return j < 0 ? html.slice(i) : html.slice(i, j);
}
function outsideMeet(html) {
  const i = html.indexOf('<details');
  return i < 0 ? html : html.slice(0, i);
}

let mixed = null;
try { mixed = await render([CLASS_ROOM, MEET_ROOM]); } catch (e) { mixed = { err: e.message }; }

/* ⓪ 전제 — 이 줄이 없으면 아래 검사가 통째로 헛돈다(가짜 DOM 이 깨져도 «없다» 로 통과한다). */
ok(!!mixed && !mixed.err && /class-849-20260910/.test(mixed.html || ''),
  '전제: adm-s1.js 를 실제로 돌려 목록 HTML 을 얻었다', mixed && mixed.err);

if (mixed && !mixed.err) {
  const before = outsideMeet(mixed.html), inside = meetSection(mixed.html);

  ok(/class-849-20260910/.test(before), '① 수업방은 위쪽 표에 그대로 그린다');
  ok(!/class-849-20260910/.test(inside), '②-a 수업방이 회의방 구역으로 내려가지 않는다');
  ok(/meet-1234/.test(inside), '②-b 회의방은 접힌 «회의방» 구역 안에 그린다',
    '섞여 있으면 매니저가 봐야 할 줄과 구분이 안 된다');
  ok(!/meet-1234/.test(before), '②-c 회의방이 위쪽 «수업» 표에는 없다');

  // ③ 짝 — 노란 경고는 수업방에만
  ok(/혼자 대기중/.test(before), '③-a 수업방에는 「⚠ 혼자 대기중」이 그대로 붙는다(급한 줄 표시 유지)');
  ok(!/혼자 대기중/.test(inside), '③-b 회의방에는 노란 「⚠ 혼자 대기중」을 붙이지 않는다');
  ok(/혼자/.test(inside), '③-c 그래도 회의방에 «혼자» 라는 사실은 적는다(정보를 지우지 않는다)');

  // ④ 감추기가 아니라 «갈라 놓기» — 조작은 그대로 남아야 한다
  ok(/ghQuickObserve/.test(inside) && /ghEnterRoom/.test(inside),
    '④ 회의방 줄에도 참관·직접입장 버튼이 그대로 있다', '지우면 「기능이 없어졌다」가 된다');

  // ⑤ 숫자도 갈라 센다
  ok(/수업방\s*1\s*개/.test(mixed.count) && /회의방\s*1\s*개/.test(mixed.count),
    '⑤ 개수를 «수업방 N개 · 회의방 M개» 로 갈라 센다', '지금: ' + mixed.count);
  ok(!/화상방/.test(mixed.count), '⑤-b 한 숫자(«화상방 N개»)로 합치지 않는다', '지금: ' + mixed.count);
}

/* ⑥ 수업방 0 · 회의방 1 — 「접속해 있는 사람이 없습니다」는 거짓말이 된다 */
let onlyMeet = null;
try { onlyMeet = await render([MEET_ROOM]); } catch (e) { onlyMeet = { err: e.message }; }
if (onlyMeet && !onlyMeet.err) {
  ok(!/접속해 있는 사람이 없습니다/.test(onlyMeet.html),
    '⑥-a 회의방만 있을 때 «아무도 접속해 있지 않다» 고 말하지 않는다');
  ok(/수업방이 없습니다/.test(onlyMeet.html) && /meet-1234/.test(onlyMeet.html),
    '⑥-b 대신 «수업방이 없습니다» 라고 말하고 회의방은 아래에 남긴다');
} else ok(false, '⑥ 회의방만 있는 화면을 그렸다', onlyMeet && onlyMeet.err);

/* ⑦ 진짜로 아무도 없을 때는 예전 문구 그대로 — 회귀 방지 */
let empty = null;
try { empty = await render([]); } catch (e) { empty = { err: e.message }; }
ok(!!empty && !empty.err && /접속해 있는 사람이 없습니다/.test(empty.html || ''),
  '⑦ 방이 하나도 없을 때는 예전 문구 그대로');

/* ⑧ 영어 화면에서도 같은 갈래 */
let enOut = null;
try { enOut = await render([CLASS_ROOM, MEET_ROOM], { en: true }); } catch (e) { enOut = { err: e.message }; }
if (enOut && !enOut.err) {
  ok(/Meeting rooms/.test(meetSection(enOut.html)), '⑧-a EN 에서도 회의방 구역이 갈린다');
  ok(!/waiting alone/.test(meetSection(enOut.html)) && /waiting alone/.test(outsideMeet(enOut.html)),
    '⑧-b EN 에서도 노란 경고는 수업방에만');
  ok(/class room\(s\)/.test(enOut.count) && /meeting room\(s\)/.test(enOut.count),
    '⑧-c EN 개수도 갈라 센다', '지금: ' + enOut.count);
} else ok(false, '⑧ EN 화면을 그렸다', enOut && enOut.err);

/* ⑨ 방 이름 판정 전수 — «수업방을 회의방으로 잘못 내리는» 쪽이 더 나쁘다.
   ⛔ 판정을 하니스에 다시 적지 않는다 — 소스에서 오려 내 실제로 돌린다. */
const m = code.match(/function _ghIsMeetRoom\s*\([^)]*\)\s*\{[\s\S]*?\n?\s*\}/);
ok(!!m, '⑨-0 전제: _ghIsMeetRoom 을 소스에서 오려 냈다');
if (m) {
  let isMeet = null;
  try { isMeet = new Function(m[0] + '; return _ghIsMeetRoom;')(); } catch (e) { isMeet = null; }
  ok(typeof isMeet === 'function', '⑨-0b 오려 낸 판정을 실제로 부를 수 있다');
  if (typeof isMeet === 'function') {
    const MEET = ['meet-1234', 'MEET-1234', 'Meet-abc', 'meet-mangoi-class'];
    const NOT = ['class-849-20260910', 'c24-511741', 'demo-1', 'room-7', 'mangoi-class', 'meeting', 'meet', '', null, undefined];
    const badMeet = MEET.filter((r) => !isMeet(r));
    const badNot = NOT.filter((r) => isMeet(r));
    ok(badMeet.length === 0, '⑨-a meet- 로 시작하면 대소문자와 무관하게 회의방', badMeet.join(', '));
    ok(badNot.length === 0, '⑨-b 수업방(class-·c24-·demo-·room-·mangoi-class)은 한 글자도 안 건드린다',
      badNot.join(', ') + ' — 이 방향의 오판이 훨씬 나쁘다(진짜 수업이 접힌 구역으로 숨는다)');
  }
}

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
