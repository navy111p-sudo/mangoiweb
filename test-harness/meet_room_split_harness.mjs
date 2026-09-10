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


/* ══════════════════════════════════════════════════════════════════════════
   ⑩ 🗼 수업 관제탑(/admin/monitor-wall.html + js/monitor-wall.js)
   ─────────────────────────────────────────────────────────────────────────
   같은 목록(/api/active-rooms)을 쓰는 화면이 «둘» 이다. 한쪽만 고치면
   「화면마다 답이 다른」 상태가 된다 — 이 저장소가 반복해서 밟은 함정이라
   두 화면을 **같은 방식으로 실제로 돌려** 나란히 본다.
   ══════════════════════════════════════════════════════════════════════════ */
const WALL = join(ROOT, 'cloudflare-deploy', 'public', 'js', 'monitor-wall.js');
const WALL_HTML = join(ROOT, 'cloudflare-deploy', 'public', 'admin', 'monitor-wall.html');
const wallCode = readFileSync(WALL, 'utf8');

/** monitor-wall.js 를 가짜 화면에서 실제로 실행하고 그려진 결과를 돌려준다. */
async function renderWall(rooms) {
  const store = {};
  const mk = (id) => (store[id] ||= {
    id, value: '', textContent: '', innerHTML: '', placeholder: '', hidden: false, disabled: false,
    style: {}, dataset: {}, classList: { add() {}, remove() {}, contains: () => false },
    addEventListener() {}, removeEventListener() {}, querySelectorAll: () => [], querySelector: () => null,
    closest: () => null, appendChild() {}, setAttribute() {}, getAttribute: () => null, focus() {},
    options: Array.from({ length: 8 }, () => ({ textContent: '', value: '' }))
  });
  const sb = {
    window: { addEventListener() {}, open: () => null, location: { origin: 'https://x' } },
    document: { getElementById: mk, addEventListener() {}, querySelector: () => null, querySelectorAll: () => [], hidden: false, title: '' },
    localStorage: { getItem: () => null, setItem() {} },
    console: { log() {}, warn() {}, error() {} },
    setInterval: () => 0, clearInterval() {}, setTimeout: (f) => setTimeout(f, 0), clearTimeout() {},
    alert() {}, confirm: () => false, navigator: { language: 'ko' },
    async fetch(u) {
      u = String(u);
      const b = u.startsWith('/api/active-rooms') ? rooms
        : u.startsWith('/api/admin/classes-now') ? { ok: true, classes: [], counts: { now: 0 } }
        : u.startsWith('/api/admin/alerts') ? { ok: true, items: [] }
        : u.startsWith('/api/admin/vc/quality') ? { ok: true, rooms: [] }
        : { ok: true, rooms: {} };
      return { ok: true, headers: { get: () => null }, json: async () => b, text: async () => JSON.stringify(b) };
    }
  };
  sb.globalThis = sb;
  vm.createContext(sb);
  vm.runInContext(wallCode, sb, { filename: 'monitor-wall.js' });
  await new Promise((r) => setTimeout(r, 60));
  const t = (id) => (store[id] ? String(store[id].innerHTML || '') : '');
  return { chips: t('chips'), rooms: t('rooms'), meet: t('meet-rooms'),
           meetHidden: store['meet-sec'] ? store['meet-sec'].hidden : null,
           meetTitle: store['meet-title'] ? store['meet-title'].textContent : '' };
}

console.log('\n■ 🗼 수업 관제탑 — 같은 갈래 (monitor-wall.js)');

let wall = null;
try { wall = await renderWall([CLASS_ROOM, MEET_ROOM]); } catch (e) { wall = { err: e.message }; }

ok(!!wall && !wall.err && /class-849-20260910/.test(wall.rooms || ''),
  '⑩-0 전제: monitor-wall.js 를 실제로 돌려 표를 얻었다', wall && wall.err);

if (wall && !wall.err) {
  ok(!/meet-1234/.test(wall.rooms), '⑩-a 회의방이 «수업» 표에 없다');
  ok(/meet-1234/.test(wall.meet), '⑩-b 회의방은 접힌 «회의방» 구역에 그린다');
  ok(wall.meetHidden === false && /회의방/.test(wall.meetTitle), '⑩-c 회의방이 있으면 그 구역을 펼칠 수 있게 켠다');
  ok(/혼자 대기중/.test(wall.rooms), '⑩-d 수업방에는 「⚠ 혼자 대기중」이 그대로 붙는다');
  ok(!/혼자 대기중/.test(wall.meet) && /혼자/.test(wall.meet),
    '⑩-e 회의방은 노란 경고 대신 «혼자» 로만 적는다');
  ok(/data-act="observe"/.test(wall.meet), '⑩-f 회의방 줄에도 참관 버튼이 그대로 있다');
  // 칩 — 숫자를 갈라 세는가
  ok(/수업방<b>1<\/b>/.test(wall.chips.replace(/\s+/g, '')) || /수업방[^<]*<b>1</.test(wall.chips),
    '⑩-g 칩이 «수업방 1» 을 센다', wall.chips);
  ok(/회의방[^<]*<b>1</.test(wall.chips), '⑩-h 칩에 «회의방 1» 이 따로 있다', wall.chips);
  ok(!/🎥 화상방/.test(wall.chips), '⑩-i 한 숫자(«화상방 N»)로 합치지 않는다', wall.chips);
}

/* ⑩-j 「혼자 대기」 칩은 수업방만 센다 — 회의방까지 세면 그 칩이 늘 켜져 있다.
   회의방만 있는 화면을 그려 «0» 인지 본다(짝: 위 ⑩-g 가 «셀 때는 센다» 를 봤다). */
let wallMeetOnly = null;
try { wallMeetOnly = await renderWall([MEET_ROOM]); } catch (e) { wallMeetOnly = { err: e.message }; }
if (wallMeetOnly && !wallMeetOnly.err) {
  ok(!/혼자 대기<b>/.test(wallMeetOnly.chips.replace(/\s+/g, '')) && !/혼자 대기[^<]*<b>[1-9]/.test(wallMeetOnly.chips),
    '⑩-j 회의방만 있을 때 「⚠ 혼자 대기」 칩이 켜지지 않는다', wallMeetOnly.chips);
  ok(!/접속해 있는 수업이 없습니다/.test(wallMeetOnly.rooms),
    '⑩-k 회의방만 있을 때 «아무도 접속해 있지 않다» 고 말하지 않는다');
} else ok(false, '⑩-j 회의방만 있는 관제탑 화면을 그렸다', wallMeetOnly && wallMeetOnly.err);

/* ⑪ 두 화면의 판정이 «같은 말» 을 하는가 — 규칙을 두 곳에 적었으니 반드시 대조한다.
   ⛔ 하니스에 규칙을 세 번째로 적지 않는다 — 양쪽 소스에서 오려 내 전수로 돌린다. */
const mw = wallCode.match(/function isMeetRoom\s*\([^)]*\)\s*\{[\s\S]*?\n?\s*\}/);
ok(!!mw, '⑪-0 전제: monitor-wall.js 에서도 판정을 오려 냈다');
if (mw && m) {
  let a = null, b = null;
  try { a = new Function(m[0] + '; return _ghIsMeetRoom;')(); } catch {}
  try { b = new Function(mw[0] + '; return isMeetRoom;')(); } catch {}
  ok(typeof a === 'function' && typeof b === 'function', '⑪-0b 둘 다 실제로 부를 수 있다');
  if (typeof a === 'function' && typeof b === 'function') {
    const CORPUS = ['meet-1234', 'MEET-1234', 'Meet-abc', 'meet-mangoi-class', 'meet-', 'meeting', 'meet',
      'class-849-20260910', 'class-1078-20260901', 'c24-511741', 'demo-1', 'room-7', 'mangoi-class',
      'MANGOI-CLASS', '1234', '', null, undefined, 'xmeet-1', ' meet-1'];
    const diff = CORPUS.filter((r) => !!a(r) !== !!b(r));
    ok(diff.length === 0, '⑪ 두 화면의 회의방 판정이 모든 표본에서 같은 답을 낸다',
      diff.map((d) => `${JSON.stringify(d)} → adm-s1:${!!a(d)} / 관제탑:${!!b(d)}`).join(' · '));
  }
}

/* ⑫ 관제탑 HTML 에 회의방 구역 자리가 있다 — JS 가 아무리 맞아도 자리가 없으면 안 그려진다.
      (그 구역은 hidden 으로 시작하고 monitor-wall.html 에 [hidden]{display:none!important} 이 이미 있다) */
let wallHtml = '';
try { wallHtml = readFileSync(WALL_HTML, 'utf8'); } catch {}
ok(/id="meet-sec"/.test(wallHtml) && /id="meet-rooms"/.test(wallHtml) && /id="meet-title"/.test(wallHtml),
  '⑫ 관제탑 HTML 에 회의방 구역(meet-sec · meet-title · meet-rooms)이 있다');
ok(/\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(wallHtml),
  '⑫-b [hidden] 을 !important 로 못 박아 두었다', '작성자 CSS 가 display 를 정하면 el.hidden 이 진다(CLAUDE.md 2장)');

/* ⑬ list.map(rowHtml) 함정 — 둘째 인자가 «순번» 이라 두 번째 줄부터 전부 회의방이 된다.
   ⚠️ **부정 검사는 주석을 벗겨 낸 사본으로** 판정한다 — 「그렇게 부르지 말 것」이라고 적어 둔
      경고 주석 자신이 걸린다(CLAUDE.md 2장. 이 검사도 처음에 그렇게 걸렸다).
   ⛔ 블록주석을 정규식 한 줄로 지우지 않는다 — 짝 없는 «별표+슬래시» 하나에 뒤가 통째로 날아간다.
      줄 단위로 «지금 블록주석 안인가» 를 추적한다. */
function stripComments(t) {
  let inBlock = false;
  return t.split('\n').map((line) => {
    let out = '', i = 0;
    while (i < line.length) {
      if (inBlock) {
        const e = line.indexOf('*/', i);
        if (e < 0) { i = line.length; } else { inBlock = false; i = e + 2; }
        continue;
      }
      const b = line.indexOf('/*', i), l = line.indexOf('//', i);
      if (l >= 0 && (b < 0 || l < b)) { out += line.slice(i, l); i = line.length; continue; }
      if (b >= 0) { out += line.slice(i, b); inBlock = true; i = b + 2; continue; }
      out += line.slice(i); i = line.length;
    }
    return out;
  }).join('\n');
}
const wallNoCmt = stripComments(wallCode);
ok(/rowHtml/.test(wallNoCmt), '⑬-0 전제: 주석을 벗겨 내도 rowHtml 은 남아 있다(스트리퍼가 코드를 먹지 않았다)');
ok(!/\.map\(rowHtml\)/.test(wallNoCmt),
  '⑬ rowHtml 을 map 에 그대로 넘기지 않는다(둘째 인자가 순번이 되어 둘째 줄부터 회의방이 된다)');


/* ══════════════════════════════════════════════════════════════════════════
   ⑭ 접두사 정본과 대조 — 판정을 세 곳에 손으로 적지 않는다.
      회의방 접두사의 정본은 js/idx-vc-roomcode.js 의 MEET_PREFIX 다(resolveRoomCode 가 그것으로 붙인다).
      ⛔ 기대값 'meet-' 을 하니스에 베껴 적지 말 것 — 정본이 바뀌면 조용히 어긋난다
         (CLAUDE.md 가 meet_room_code_harness ⑪에 「하니스에 도메인을 손으로 적지 마세요」로 못 박은 것과 같은 원칙).
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n■ 접두사 정본(js/idx-vc-roomcode.js)과 대조');
let rc = '';
try { rc = readFileSync(join(ROOT, 'cloudflare-deploy', 'public', 'js', 'idx-vc-roomcode.js'), 'utf8'); } catch {}
const pm = rc.match(/var\s+MEET_PREFIX\s*=\s*'([^']+)'/);
ok(!!pm, '⑭-0 전제: 정본에서 MEET_PREFIX 를 읽었다', '못 읽으면 아래 대조가 통째로 헛돈다');
if (pm && m && mw) {
  const PFX = pm[1];
  let a = null, b = null;
  try { a = new Function(m[0] + '; return _ghIsMeetRoom;')(); } catch {}
  try { b = new Function(mw[0] + '; return isMeetRoom;')(); } catch {}
  if (typeof a === 'function' && typeof b === 'function') {
    ok(a(PFX + '1234') && b(PFX + '1234'), `⑭-a 두 화면 다 정본 접두사(${PFX})를 회의방으로 본다`);
    ok(a(PFX.toUpperCase() + '1234') && b(PFX.toUpperCase() + '1234'),
      '⑭-b 대문자로 만들어진 방도 회의방으로 본다(idFromName 은 대소문자를 구분해 «다른 방» 이다)');
    ok(!a('x' + PFX + '1') && !b('x' + PFX + '1'), '⑭-c 접두사가 «맨 앞» 일 때만 회의방이다');
  }
}

/* ⑮ 색은 «클래스» 로 준다 — 이 카드 안에서 인라인 color 는 한 글자도 안 먹는다.
      (2026-09-10 함정 대조 브라우저 실측: 인라인 앰버·회색이 둘 다 rgb(16,24,40) 이었다)
   ⚠️ «실제로 갈리는가» 는 문자열로 못 봅니다 — test-harness/manual/meet-split-color-browser.mjs 가 잽니다. */
console.log('\n■ 「혼자」 표시 색 — 인라인이 아니라 클래스로');
const s1NoCmt = stripComments(code);
ok(/class="gh-alone"/.test(s1NoCmt) && /class="gh-alone-meet"/.test(s1NoCmt),
  '⑮-a 두 표시를 클래스로 준다');
/* ⚠️ 검사를 «그 표시» 로 좁힌다 — 같은 줄의 다른 인라인 색(「회의방」 라벨·방 번호 등)까지 잡으면
      이번 수리와 무관한 곳에 빨간불이 난다(처음에 그렇게 짰다가 거짓 FAIL 을 냈다).
   ⚠️ 그 나머지 인라인 색도 이 카드에서는 검정으로 눌립니다 — 고친 것은 «혼자» 두 표시뿐입니다. */
const aloneSlice = (function () {
  const i = s1NoCmt.indexOf('const alone =');
  if (i < 0) return '';
  const j = s1NoCmt.indexOf('const sc =', i);
  return j < 0 ? s1NoCmt.slice(i, i + 600) : s1NoCmt.slice(i, j);
})();
ok(/const alone =/.test(s1NoCmt) && aloneSlice.length > 40, '⑮-b0 전제: 「혼자」 표시를 만드는 자리를 잘라 냈다');
ok(!/style="color:/.test(aloneSlice),
  '⑮-b 「혼자」 표시를 인라인 color 로 되돌리지 않았다', '인라인은 [id^="card-"] :is(…) 의 #101828 !important 에 진다');
ok(/gh-alone"/.test(aloneSlice) && /gh-alone-meet"/.test(aloneSlice),
  '⑮-b2 잘라 낸 그 자리가 실제로 두 클래스를 쓴다(엉뚱한 곳을 자르지 않았다)');
let css = '';
try { css = readFileSync(join(ROOT, 'cloudflare-deploy', 'public', 'css', 'admin-inline-c.css'), 'utf8'); } catch {}
/* ⚠️ `\b` 를 쓰면 안 된다 — «gh-alone» 뒤의 «-» 도 낱말 경계라 `.gh-alone-meet` 에 걸려
      수업방 규칙을 지워도 통과한다(변이시험에서 실제로 그 상태였다). 뒤에 «-·글자» 가 없어야 한다. */
ok(/#card-admin-ghost\s+\.gh-alone(?![-\w])/.test(css), '⑮-c admin-inline-c.css 에 수업방 꼬리 규칙이 있다(조상 id 로 1,1,0)');
ok(/#card-admin-ghost\s+\.gh-alone-meet(?![-\w])/.test(css), '⑮-c2 회의방 꼬리 규칙도 있다');
ok(!/#card-admin-ghost\s+\.gh-alone\s*\{[^}]*#fbbf24/.test(css),
  '⑮-d 앰버 #fbbf24 로 되돌리지 않았다(흰 카드 위 대비 1.67 — 안 읽힌다)');

console.log(`\n${pass} PASS / ${fail} 실패`);
process.exit(fail ? 1 : 0);
