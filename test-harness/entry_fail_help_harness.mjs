// ═══════════════════════════════════════════════════════════════════════
// 🆘 수업 입장 실패 → 진단·상담 안내 카드 (P5, 2026-10-02) 회귀 하니스
//   session-guard.js 의 ENTRY-FAIL-HELP 절을 «오려 내» 가짜 window·document 로 실제로 돌린다.
//   「뜬다」 옆에 반드시 「안 뜬다」를 짝으로 둔다 — 짝이 없으면 «언제나 띄우기» 도 통과한다.
//   변이시험: SG_SRC=<고친 사본> node test-harness/entry_fail_help_harness.mjs
// ═══════════════════════════════════════════════════════════════════════
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(HERE, '..', 'cloudflare-deploy', 'public');
const SRC = process.env.SG_SRC || path.join(PUB, 'js', 'session-guard.js');

let pass = 0, fail = 0;
function ok(cond, label) { if (cond) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ FAIL ' + label); } }

console.log('═'.repeat(66));
console.log('  🆘 entry_fail_help — 입장 실패 순간 진단·상담 안내');
console.log('═'.repeat(66));

const full = fs.readFileSync(SRC, 'utf8');
const a = full.indexOf('🆘 ENTRY-FAIL-HELP');
const b = full.indexOf('/* ENTRY-FAIL-HELP 끝 */');
const startCmt = a >= 0 ? full.lastIndexOf('/*', a) : -1;
const section = (startCmt >= 0 && b > a) ? full.slice(startCmt, b) : '';
ok(section.length > 2000, '전제: ENTRY-FAIL-HELP 절을 오려 냈다 (' + section.length + '자)');

// ── ① 감싸는 전역이 idx-main.js 에 아직 그 이름으로 있는가(이름이 바뀌면 조용히 헛돈다) ──
const idxMain = fs.readFileSync(path.join(PUB, 'js', 'idx-main.js'), 'utf8');
ok(/\nfunction createWebSocket\(path, onMessage, onOpen, onClose\)/.test(idxMain), 'idx-main: createWebSocket(path,onMessage,onOpen,onClose) 전역 함수가 있다');
ok(/vcConn = createWebSocket\(\s*`\/ws\/video-call\?roomId=/.test(idxMain), 'idx-main: 수업 연결이 createWebSocket(/ws/video-call…) 를 «맨 이름» 으로 부른다');
ok(/window\.vcShowLocalPlaceholder = function\(kind, errMsg\)/.test(idxMain), 'idx-main: window.vcShowLocalPlaceholder 가 있다');
ok(/vcShowLocalPlaceholder\('all-fail'/.test(idxMain) && /vcShowLocalPlaceholder\('camera-fail', msg\)/.test(idxMain), "idx-main: 'all-fail'·'camera-fail' 로 부르는 자리가 그대로다");
ok(/\nfunction describeMediaError\(err\)/.test(idxMain) && /const msg = describeMediaError\(err\);/.test(idxMain), 'idx-main: describeMediaError(err) 가 실패 직후 불린다');
ok(/alert\('⚠️ 마이크가 감지되지 않았습니다/.test(idxMain), 'idx-main: 「마이크가 감지되지 않았습니다」 alert 문구가 그대로다');
const idxHtml = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');
ok(/<script src="\/js\/session-guard\.js" defer><\/script>/.test(idxHtml), 'index.html 이 session-guard.js 를 defer(·?v= 없이) 싣는다');
ok(idxHtml.indexOf('session-guard.js') > idxHtml.indexOf('/js/idx-main.js'), 'session-guard.js 는 idx-main.js «뒤» 에 실린다(감쌀 전역이 이미 있음)');
const teacherHtml = fs.readFileSync(path.join(PUB, 'teacher.html'), 'utf8');
ok(!/session-guard\.js/.test(teacherHtml), 'teacher.html 은 이 파일을 안 싣는다(학생 화면 전용)');

// ── 가짜 브라우저 ──
function makeEnv(opts = {}) {
  const els = new Map();
  const appended = [];
  const timers = [];
  const log = { alerts: [], ph: [], desc: [], opened: [], wsCalls: [] };
  function mkEl(tag) {
    const e = {
      tagName: String(tag).toUpperCase(), attrs: {}, hidden: false, innerHTML: '', textContent: '', _ls: {},
      setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); },
      getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; },
      addEventListener(t, fn) { (this._ls[t] = this._ls[t] || []).push(fn); },
      appendChild(c) { appended.push(c); if (c.id) els.set(c.id, c); return c; },
    };
    Object.defineProperty(e, 'id', { get() { return e._id || ''; }, set(v) { e._id = v; if (v) els.set(v, e); }, configurable: true });
    return e;
  }
  const bodyClasses = new Set(opts.bodyClasses || []);
  const body = mkEl('body'); body.classList = { contains: c => bodyClasses.has(c) };
  const head = mkEl('head');
  const document = {
    body, head, documentElement: head, readyState: 'complete',
    getElementById: id => els.get(id) || null,
    createElement: mkEl,
    _ls: {}, addEventListener(t, fn) { (this._ls[t] = this._ls[t] || []).push(fn); },
  };
  const loc = { href: 'https://mangoi.ai/' };
  const win = {
    document, location: loc, navigator: { language: opts.navLang || 'ko-KR' },
    localStorage: { getItem: () => null },
    _ls: {}, addEventListener(t, fn) { (this._ls[t] = this._ls[t] || []).push(fn); },
    setTimeout: (fn, ms) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; },
    clearTimeout: t => { if (t) t.cleared = true; },
    open: (u) => { log.opened.push(u); return opts.openReturns === undefined ? null : opts.openReturns; },
    alert: (m) => { log.alerts.push(m); },
    describeMediaError: (err) => { log.desc.push(err && err.name); return 'DESC:' + (err && err.name); },
    vcShowLocalPlaceholder: (kind, msg) => { log.ph.push([kind, msg]); return 'PH'; },
    createWebSocket: (p, onMessage, onOpen, onClose) => {
      const rec = { p, onMessage, onOpen, onClose, closed: 0 };
      log.wsCalls.push(rec);
      return { close() { rec.closed++; }, send() {} };
    },
  };
  if (opts.lang) win.getLang = () => opts.lang;
  win.window = win;
  if (opts.noGlobals) { delete win.createWebSocket; delete win.vcShowLocalPlaceholder; }
  const ctx = vm.createContext(win);
  ctx.Date = Date; ctx.String = String; ctx.Object = Object;
  let err = null;
  try { vm.runInContext(section, ctx); } catch (e) { err = e; }
  const card = () => els.get('mg-entry-help') || null;
  const visible = () => { const c = card(); return !!(c && !c.hidden); };
  return { win, document, log, timers, card, visible, err, loc, bodyClasses };
}

function clickMeh(env, key) {
  const c = env.card();
  if (!c) return false;
  let prevented = false;
  const target = { closest: () => ({ getAttribute: () => key }) };
  (c._ls.click || []).forEach(fn => fn({ target, preventDefault() { prevented = true; } }));
  return prevented;
}

function safe(label, fn) { try { fn(); } catch (e) { ok(false, label + ' — 실행 중 예외: ' + (e && e.message)); } }

// ── ② 카메라·마이크 ──
safe('media', () => {
  const env = makeEnv();
  ok(!env.err, '절이 예외 없이 실행된다');
  ok(!!env.win.__mgEntryHelp, '수업 화면(전역 있음)에서는 설치된다');
  ok(!env.visible(), '로드만으로는 카드가 안 뜬다');
  const d = env.win.describeMediaError({ name: 'NotAllowedError' });
  ok(d === 'DESC:NotAllowedError' && env.log.desc.length === 1, '원래 describeMediaError 결과가 그대로 돌아온다');
  const r = env.win.vcShowLocalPlaceholder('camera-fail', 'm');
  ok(r === 'PH' && env.log.ph.length === 1, '원래 placeholder 가 그대로 불린다');
  ok(env.visible(), '권한 거부(NotAllowedError) 뒤 camera-fail → 카드가 뜬다');
  ok(env.win.__mgEntryHelp.state.reason === 'media', '사유는 media');
});
safe('media-busy', () => {
  const env = makeEnv();
  env.win.describeMediaError({ name: 'NotReadableError' });
  env.win.vcShowLocalPlaceholder('camera-fail', 'm');
  ok(!env.visible(), '짝: «사용 중»(NotReadable) camera-fail 은 안 뜬다(idx-main 이 스스로 재시도)');
  env.win.vcShowLocalPlaceholder('camera-off', 'x');
  ok(!env.visible(), '짝: camera-off(연결 중) 는 안 뜬다');
  env.win.vcShowLocalPlaceholder('all-fail', 'x');
  ok(env.visible(), 'all-fail 은 오류 종류와 무관하게 뜬다');
});
safe('media-notfound', () => {
  const env = makeEnv();
  env.win.describeMediaError({ name: 'NotFoundError' });
  env.win.vcShowLocalPlaceholder('camera-fail', 'm');
  ok(env.visible(), '장치 없음(NotFoundError) 뒤 camera-fail → 뜬다');
});
safe('alert', () => {
  const env = makeEnv();
  env.win.alert('다른 안내');
  ok(env.log.alerts.length === 1 && !env.visible(), '짝: 다른 alert 는 그대로 뜨고 카드는 안 뜬다');
  env.win.alert('⚠️ 마이크가 감지되지 않았습니다.\n\n• …');
  ok(env.log.alerts.length === 2, '마이크 미감지 alert 도 원래대로 뜬다(지우지 않음)');
  ok(env.visible(), '마이크 미감지 alert 뒤 카드가 뜬다');
});

// ── ③ 수업 연결(WebSocket) ──
safe('ws-fail', () => {
  const env = makeEnv();
  const onOpen = () => 'OPENED', onClose = () => 'CLOSED';
  const conn = env.win.createWebSocket('/ws/video-call?roomId=x', () => {}, onOpen, onClose);
  ok(env.log.wsCalls.length === 1 && typeof conn.close === 'function', '원래 createWebSocket 이 불리고 연결 객체가 돌아온다');
  const rec = env.log.wsCalls[0];
  const N = env.win.__mgEntryHelp.FAIL_N;
  for (let i = 0; i < N - 1; i++) rec.onClose({ code: 1006 });
  ok(!env.visible(), '짝: 끊김이 FAIL_N 미만이면 안 뜬다');
  ok(rec.onClose({ code: 1006 }) === 'CLOSED', '원래 onClose 반환값이 그대로다');
  ok(env.visible() && env.win.__mgEntryHelp.state.reason === 'net', '성공 없이 FAIL_N 번 끊기면 net 카드가 뜬다');
  ok(rec.onOpen({}) === 'OPENED', '원래 onOpen 이 불린다');
  ok(!env.visible(), '다시 연결되면 net 카드를 거둔다');
});
safe('ws-ok', () => {
  const env = makeEnv();
  env.win.createWebSocket('/ws/video-call?roomId=x', () => {}, () => {}, () => {});
  const rec = env.log.wsCalls[0];
  rec.onOpen({});
  const t = env.timers[0];
  ok(t && t.cleared, '정상 연결: 열리면 대기 타이머를 지운다');
  if (t) t.fn();
  rec.onClose({ code: 1006 });
  ok(!env.visible(), '정상 연결 뒤 한 번 끊김 → 안 뜬다');
  ok(env.timers.length === 1, '타이머는 소켓마다 하나뿐(상주 없음)');
});
safe('ws-hang', () => {
  const env = makeEnv();
  env.win.createWebSocket('/ws/video-call?roomId=x', () => {}, () => {}, () => {});
  const t = env.timers[0];
  ok(t && t.ms === env.win.__mgEntryHelp.OPEN_WAIT_MS, '첫 연결 대기 타이머가 OPEN_WAIT_MS 로 걸린다');
  ok(!env.visible(), '짝: 타이머 전에는 안 뜬다');
  t.fn();
  ok(env.visible(), '한 번도 안 열린 채 시간이 지나면 net 카드가 뜬다');
});
safe('ws-intentional', () => {
  const env = makeEnv();
  const conn = env.win.createWebSocket('/ws/video-call?roomId=x', () => {}, () => {}, () => {});
  const rec = env.log.wsCalls[0];
  conn.close();
  ok(rec.closed === 1, '원래 close() 가 불린다');
  for (let i = 0; i < 10; i++) rec.onClose({ code: 1000 });
  env.timers[0].fn();
  ok(!env.visible(), '짝: 우리가 닫은(퇴장) 연결은 아무리 끊겨도 안 뜬다');
});
safe('ws-other', () => {
  const env = makeEnv();
  const onOpen = () => {};
  env.win.createWebSocket('/ws/signaling?roomId=x', () => {}, onOpen, () => {});
  ok(env.log.wsCalls[0].onOpen === onOpen && env.timers.length === 0, '다른 경로의 소켓은 손대지 않는다');
});

// ── ④ 카드 내용·링크·닫기 ──
safe('links', () => {
  const env = makeEnv();
  env.win.__mgEntryHelp.show('media');
  const h = env.card().innerHTML;
  ok(h.indexOf('href="/precheck.html"') >= 0, '🎥 수업 진단 → /precheck.html');
  ok(h.indexOf('href="https://pf.kakao.com/_xlqnSxd"') >= 0 && h.indexOf('/chat') < 0, '💬 카카오 상담 → 채널 홈(/chat 없음)');
  ok(/수업 진단 열기/.test(h) && /카카오 상담/.test(h), '한국어 버튼 문구');
  ok(!/data-ko|data-en/.test(h), 'data-ko/data-en 을 달지 않는다(i18n 엔진이 본문을 갈아끼움)');
  ok(clickMeh(env, 'diag') && env.log.opened[0] === '/precheck.html' && env.loc.href === '/precheck.html', '새 창이 막히면(null) 같은 창으로 진단을 연다');
  clickMeh(env, 'kakao');
  ok(env.log.opened[1] === 'https://pf.kakao.com/_xlqnSxd', '카카오도 window.open 으로 연다');
  clickMeh(env, 'x');
  ok(!env.visible(), '닫기(×) 를 누르면 사라진다');
  ok(env.win.__mgEntryHelp.show('media') === false && !env.visible(), '같은 사유로 닫았으면 이 페이지에서 다시 안 뜬다');
  ok(env.win.__mgEntryHelp.show('net') === true && env.visible(), '짝: 다른 사유(net)는 뜬다');
});
safe('tab', () => {
  const w = { opener: 'X' };
  const env = makeEnv({ openReturns: w });
  ok(env.win.__mgEntryHelp.openOut('/precheck.html') === 'tab' && w.opener === null && env.loc.href === 'https://mangoi.ai/', '새 창이 열리면 opener 를 끊고 지금 화면은 그대로');
});
safe('en-zh', () => {
  const env = makeEnv({ lang: 'en', navLang: 'zh-CN' });
  env.win.__mgEntryHelp.show('net');
  const h = env.card().innerHTML;
  ok(/Open class check/.test(h) && /Ask on KakaoTalk/.test(h) && /connect to the class/.test(h), 'EN 화면은 영어 문구');
  ok(/lang="zh"/.test(h), 'navigator.language 가 zh 면 중국어 한 줄을 덧붙인다');
  const env2 = makeEnv();
  env2.win.__mgEntryHelp.show('net');
  ok(!/lang="zh"/.test(env2.card().innerHTML), '짝: 한국어 기기에는 중국어 줄이 없다');
});
safe('observer', () => {
  const env = makeEnv({ bodyClasses: ['vc-observer'] });
  env.win.alert('⚠️ 마이크가 감지되지 않았습니다.');
  ok(!env.visible(), '참관(vc-observer) 중에는 안 뜬다');
});
safe('no-globals', () => {
  const env = makeEnv({ noGlobals: true });
  ok(!env.win.__mgEntryHelp && env.win.alert.__mehWrapped !== true, '다른 학생 화면(전역 없음)에서는 아무것도 안 감싼다');
});

// ── ⑤ 겹침 순서 ──
const z = (section.match(/#mg-entry-help\{[^}]*z-index:(\d+)/) || [])[1];
ok(z && Number(z) > 2147483000 && Number(z) < 2147483200, 'z-index 가 A.i 상담사 위젯(2147483000) 위·➕ FAB(2147483200) 아래 (' + z + ')');
ok(/#mg-entry-help\[hidden\]\{display:none!important\}/.test(section), '[hidden] 을 !important 로 못 박았다');
const code = section.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
ok(!/setInterval\s*\(/.test(code) && !/MutationObserver/.test(code), '상주 setInterval·MutationObserver 없음');
ok(!/window\.open\([^)]*noopener/.test(code), "window.open 에 'noopener' 기능 문자열을 주지 않는다");

console.log('─'.repeat(66));
console.log('결과: PASS ' + pass + ' / FAIL ' + fail);
process.exit(fail ? 1 : 0);
