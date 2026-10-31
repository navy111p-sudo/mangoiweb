/* observe_join_visible_harness.mjs — 관찰 중 «보이게 입장» 문이 실제로 열리는지 감시 (2026-10-20)
 *
 * ── 왜 ──────────────────────────────────────────────────────────────
 * 필리핀 매니저 질문(2026-10-19 문서): «At manager's page, observe class option, is there an
 * option where the manager can be seen during the observation?»
 * 참관은 «투명 유령»(학생·강사에게 안 보임)이라 그 상태로는 보이게 바꿀 수 없다 — 보이려면
 * «실제 참가자» 로 새로 들어가야 한다. 그런데 매니저가 보는 관찰 화면(admin/ghost-view.html)과
 * 매니저 화면 「지금 진행 중인 수업」(manager.html paintLive)에는 그 문이 없었다.
 *
 * ── 어떻게 검사하나 ──────────────────────────────────────────────────
 * ⛔ «그 글자가 있는가» 로 묻지 않는다 — 함수를 소스에서 **중괄호 짝으로 오려 내 실제로 돌려**
 *    «무슨 주소를 여는가» 를 답으로 본다.
 * ⚠️ 짝으로 묻는다 — 「확인하면 연다」 옆에 「취소하면 안 연다」, 「방 번호가 있으면 버튼」
 *    옆에 「없으면 버튼 없음」, 「보이게 입장 버튼」 옆에 「관찰 버튼은 그대로」.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
let pass = 0, fail = 0;
const ok = (c, m, extra) => { c ? (pass++, console.log('  ✅ ' + m)) : (fail++, console.log('  ❌ ' + m + (extra ? '\n       · ' + extra : ''))); };

/** 문자열·주석을 건너뛰며 중괄호 짝을 맞춰 `{` 부터 짝 `}` 까지 돌려준다. */
function braceBlock(src, openIdx) {
  let depth = 0, i = openIdx, q = null;
  for (; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (q) {
      if (c === '\\') { i++; continue; }
      if (c === q) q = null;
      continue;
    }
    if (c === '/' && n === '/') { const e = src.indexOf('\n', i); i = e < 0 ? src.length : e; continue; }
    if (c === '/' && n === '*') { const e = src.indexOf('*/', i + 2); i = e < 0 ? src.length : e + 1; continue; }
    /* 정규식 리터럴 — `.replace(/'/g, …)` 의 따옴표를 문자열 시작으로 읽으면 짝이 통째로 어긋난다 */
    if (c === '/') {
      let k = i - 1; while (k >= 0 && /\s/.test(src[k])) k--;
      if (k < 0 || /[(,=:[!&|?{};+]/.test(src[k])) {
        let j = i + 1, cls = false;
        for (; j < src.length; j++) {
          const d = src[j];
          if (d === '\\') { j++; continue; }
          if (d === '[') cls = true; else if (d === ']') cls = false;
          else if (d === '/' && !cls) break;
          else if (d === '\n') break;
        }
        i = j; continue;
      }
    }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(openIdx, i + 1); }
  }
  return '';
}
/** 앵커(선언 줄)부터 그 함수 «전체» 문장을 돌려준다. */
function cutFn(src, anchor) {
  const a = src.indexOf(anchor);
  if (a < 0) return '';
  const open = src.indexOf('{', a + anchor.length - 1);
  const body = braceBlock(src, open);
  return body ? src.slice(a, open) + body : '';
}

const ghost = readFileSync(join(PUB, 'admin', 'ghost-view.html'), 'utf8');
const mgr = readFileSync(join(PUB, 'manager.html'), 'utf8');
const ORIGIN = 'https://mangoi.ai';
const expectUrl = (room) => ORIGIN + '/?vc_autojoin=1&vc_cam=off&vc_role=teacher&vc_room=' + encodeURIComponent(room);

/* ═══ A. 관찰 화면(admin/ghost-view.html) ═══════════════════════════════ */
console.log('■ A. 관찰 화면 — 🚪 보이게 입장 (admin/ghost-view.html)');

const joinSrc = cutFn(ghost, 'window.ghdJoinVisible = function');
ok(joinSrc.length > 200, 'A-0 전제: ghdJoinVisible 을 소스에서 오려 냈다', 'len=' + joinSrc.length);

function runJoin({ arg, pageRoom = 'class-77-20261020', answer = true, en = false } = {}) {
  const opened = []; const asked = [];
  const env = {
    roomId: pageRoom,
    ghdEn: () => en,
    confirm: (m) => { asked.push(m); return answer; },
    ghdOpenTab: (u) => opened.push(u),
    location: { origin: ORIGIN, search: '?room_id=' + pageRoom + '&obs_id=9&admin_uid=mgr_karl' },
  };
  const window = {};
  try {
    const f = new Function('window', 'roomId', 'ghdEn', 'confirm', 'ghdOpenTab', 'location',
      joinSrc + '\nreturn window.ghdJoinVisible;');
    const fn = f(window, env.roomId, env.ghdEn, env.confirm, env.ghdOpenTab, env.location);
    fn(arg);
  } catch (e) { return { err: String(e && e.message || e), opened, asked }; }
  return { opened, asked };
}

{
  const r = runJoin({ arg: 'class-12-20261020' });
  ok(!r.err && r.opened.length === 1 && r.opened[0] === expectUrl('class-12-20261020'),
    'A-1 확인하면 «실제 참가자·카메라 꺼짐» 주소를 연다', r.err || JSON.stringify(r.opened));
  ok(!r.err && r.opened.length === 1 && !/observe=|room_id=|obs_id=|admin_uid=/.test(r.opened[0]),
    'A-2 지금 주소(?room_id·obs_id·admin_uid)·참관 파라미터를 물려받지 않는다');
}
{
  const r = runJoin({ arg: 'class-12-20261020', answer: false });
  ok(!r.err && r.asked.length === 1 && r.opened.length === 0, 'A-3 (짝) 취소하면 아무것도 안 연다', r.err || JSON.stringify(r));
}
{
  const r = runJoin({ arg: undefined, pageRoom: 'class-55-20261020' });
  ok(!r.err && r.opened[0] === expectUrl('class-55-20261020'), 'A-4 인자가 없으면 이 화면의 방으로 들어간다', r.err || JSON.stringify(r.opened));
}
{
  const r = runJoin({ arg: undefined, pageRoom: '' });
  ok(!r.err && r.asked.length === 0 && r.opened.length === 0, 'A-5 방이 아예 없으면 묻지도 열지도 않는다(빈 방 입장 금지)', r.err || JSON.stringify(r));
}
{
  const ko = runJoin({ arg: 'r1' }), en = runJoin({ arg: 'r1', en: true });
  ok(/보이게 입장/.test(ko.asked[0] || '') && /학생·강사/.test(ko.asked[0] || ''), 'A-6 한국어 확인창은 «보인다» 를 말한다');
  ok(/as a participant/.test(en.asked[0] || '') && /see and hear you/.test(en.asked[0] || ''), 'A-7 (짝) 영어 확인창도 «보인다» 를 말한다');
  ok(/먼저 닫아/.test(ko.asked[0] || '') && /close it first/.test(en.asked[0] || ''),
    'A-8 두 언어 모두 «라이브 관찰 창을 먼저 닫으라» 고 말한다(열어 두면 내 목소리가 울린다)');
  ok(/카메라는 꺼진/.test(ko.asked[0] || '') && /Camera starts OFF/.test(en.asked[0] || ''), 'A-9 카메라가 꺼진 채 시작한다는 것을 말한다');
}

/* 고르기 목록 버튼 — ghdPickBtns 를 실제로 돌린다 */
const pickSrc = cutFn(ghost, 'function ghdPickBtns(');
ok(pickSrc.length > 100, 'A-10 전제: ghdPickBtns 를 오려 냈다');
{
  let html = '', err = '';
  try {
    const esc = (s) => String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    html = new Function('esc', pickSrc + '\nreturn ghdPickBtns;')(esc)('class-9-20261020', false);
  } catch (e) { err = String(e && e.message || e); }
  ok(!err && /onclick="ghdJoinVisible\(this\.dataset\.room\)"[^>]*data-room="class-9-20261020"/.test(html),
    'A-11 고르기 목록 줄마다 «보이게 입장» 버튼이 그 방 번호로 붙는다', err || html.slice(0, 300));
  ok(!err && /ghdPick\(this\.dataset\.room,\\?'live\\?'\)|ghdPick\(this\.dataset\.room,'live'\)/.test(html) && /'meta'/.test(html),
    'A-12 (짝) 라이브 화면·채팅 버튼은 그대로 있다');
  const enHtml = (() => { try { const esc = (s) => String(s); return new Function('esc', pickSrc + '\nreturn ghdPickBtns;')(esc)('r', true); } catch (e) { return ''; } })();
  ok(/Join \(visible\)/.test(enHtml) && /보이게 입장/.test(html), 'A-13 버튼 글자가 두 언어로 그려진다');
}

/* 헤더·영상칸 버튼 — 그 버튼이 실재하고 그 함수를 부르는가 */
const headerTag = (ghost.match(/<button[^>]*id="ghd-join-visible"[^>]*>/) || [''])[0];
ok(/onclick="ghdJoinVisible\(\)"/.test(headerTag) && /\bbtn-enter\b/.test(headerTag), 'A-14 헤더에 «보이게 입장» 버튼이 있고 ghdJoinVisible() 을 부른다', headerTag);
ok(!/\sdata-ko=|\sdata-en=/.test(headerTag), 'A-15 그 버튼 «자체» 에는 data-ko/data-en 이 없다(있으면 i18n 이 아이콘째 갈아끼운다 — 글자 span 에만)');
const actions = (() => { const a = ghost.indexOf('class="header-actions"'); const b = ghost.indexOf('</div>', a); return a > 0 ? ghost.slice(a, b) : ''; })();
ok(actions.includes('id="ghd-join-visible"'), 'A-16 그 버튼은 .header-actions 안에 있다');
const videoTag = (ghost.match(/<button[^>]*id="ghd-join-visible-2"[^>]*>/) || [''])[0];
ok(/onclick="ghdJoinVisible\(\)"/.test(videoTag), 'A-17 영상칸(라이브 화면 열기 옆)에도 같은 문이 있다');

/* 고르기 화면에서는 감춘다 — 방이 없으니 누를 곳이 없다 */
const pickerMode = cutFn(ghost, 'function ghdEnterPickerMode(');
const hideSel = (pickerMode.match(/querySelectorAll\('([^']+)'\)/) || ['', ''])[1];
ok(/\.header-actions \.btn-enter/.test(hideSel), 'A-18 고르기 화면(방 없음)에서는 헤더 버튼을 감춘다', hideSel);

/* 대비 — 흰 글자가 두 끝 색 어디서든 읽히는가 */
function lum(hex) {
  const v = hex.replace('#', ''); const ch = [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const enterCss = (ghost.match(/\.btn-enter\s*\{([^}]*)\}/) || ['', ''])[1];
const stops = enterCss.match(/#[0-9a-fA-F]{6}/g) || [];
const bgStops = stops.filter((s) => s.toLowerCase() !== '#ffffff');
const worst = bgStops.length ? Math.min(...bgStops.map((s) => cr('#ffffff', s))) : 0;
ok(/color:\s*#fff\b/.test(enterCss) && bgStops.length >= 2 && worst >= 4.5,
  'A-19 .btn-enter 흰 글자 대비가 두 끝 색 모두 4.5 이상', 'stops=' + bgStops.join(',') + ' worst=' + worst.toFixed(2));
console.log('     (대비 실측: 가장 낮은 쪽 ' + worst.toFixed(2) + ':1)');

/* ═══ B. 매니저 화면(manager.html) ═══════════════════════════════════ */
console.log('■ B. 매니저 화면 — 지금 진행 중인 수업 · 오늘 수업 (manager.html)');

const paintSrc = cutFn(mgr, 'function paintLive(');
ok(paintSrc.length > 300, 'B-0 전제: paintLive 를 오려 냈다', 'len=' + paintSrc.length);

function runPaint(rows, names, en = false) {
  const out = {};
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const T = (e, k) => (en ? e : k);
  const hqRows = (id, rs, fn, empty) => { out.html = rs.length ? rs.map(fn).join('') : '[empty]' + empty; };
  try {
    const f = new Function('D', 'hqRows', 'LIVE_NAMES', 'esc', 'T', paintSrc + '\nreturn paintLive;');
    f({ live: rows }, hqRows, names, esc, T)();
  } catch (e) { out.err = String(e && e.message || e); }
  return out;
}
{
  const r = runPaint([{ roomId: 'class-12-20261020', userCount: 2 }],
    { 'class-12-20261020': { teacher_name: 'Teacher Ana', student_name: '김선우' } });
  ok(!r.err && /onclick="return taJoin\(this\)"[^>]*data-room="class-12-20261020"/.test(r.html || ''),
    'B-1 진행 중인 방 줄에 «보이게 입장» 이 그 방 번호로 붙는다', r.err || (r.html || '').slice(0, 400));
  ok(!r.err && /ghost-view\.html\?room_id=class-12-20261020/.test(r.html || ''), 'B-2 (짝) 관찰 링크는 그대로 있다');
  ok(!r.err && /data-who="Teacher Ana · 김선우"/.test(r.html || ''), 'B-3 확인창에 쓸 «누구 수업» 이 실린다');
  ok(!r.err && /입장\(보임\)/.test(r.html || '') && /관찰\(안 보임\)/.test(r.html || ''), 'B-4 두 버튼이 «보임/안 보임» 으로 갈려 말한다');
}
{
  const r = runPaint([{ room: '', userCount: 1 }], {});
  ok(!r.err && !/taJoin/.test(r.html || ''), 'B-5 (짝) 방 번호가 없는 줄에는 입장 버튼을 주지 않는다(빈 방 입장 금지)', r.err || r.html);
}
{
  const r = runPaint([{ roomId: 'meet-1234', userCount: 1 }], {}, true);
  ok(!r.err && /Join \(visible\)/.test(r.html || '') && /Observe \(hidden\)/.test(r.html || ''), 'B-6 영어 화면에서도 갈려 말한다');
}

/* taJoin — 확인창과 여는 주소 */
const taSrc = cutFn(mgr, 'window.taJoin = function');
ok(taSrc.length > 200, 'B-7 전제: taJoin 을 오려 냈다');
function runTa(answer, en = false) {
  const opened = [], asked = [];
  const a = { getAttribute: (k) => ({ 'data-room': 'class-3-20261020', 'data-who': 'Ana · 김' }[k] || '') };
  const window = { open: (u) => { opened.push(u); return {}; } };
  try {
    new Function('window', 'confirm', 'location', 'T', taSrc + '\nreturn window.taJoin;')(
      window, (m) => { asked.push(m); return answer; }, { origin: ORIGIN, href: '' }, (e, k) => (en ? e : k))(a);
  } catch (e) { return { err: String(e && e.message || e), opened, asked }; }
  return { opened, asked };
}
{
  const y = runTa(true), n = runTa(false), e = runTa(true, true);
  ok(!y.err && y.opened[0] === expectUrl('class-3-20261020'), 'B-8 확인하면 실제 참가자·카메라 꺼짐 주소를 연다', y.err || JSON.stringify(y.opened));
  ok(!n.err && n.opened.length === 0, 'B-9 (짝) 취소하면 안 연다');
  ok(/먼저 닫아/.test(y.asked[0] || '') && /close it first/.test(e.asked[0] || ''), 'B-10 두 언어 모두 «라이브 관찰 창을 먼저 닫으라» 고 말한다');
}

/* 오늘 수업 줄의 입장 라벨 — 관리자 화면(🚪 Join (visible))과 같은 말 */
ok(/taJoin\(this\)[^\n]*\n\s*\+ esc\(T\('🚪 Join \(visible\)', '🚪 입장\(보임\)'\)\)/.test(mgr),
  'B-11 「오늘 수업」 줄의 입장 버튼도 «보임» 이라고 말한다');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
