/* ═══════════════════════════════════════════════════════════════════════════
   📶 aao_freeze_harness.mjs — 음성전용(AAO) 「화면 멈춤」 감시 (2026-09-10)

   [무엇을 지키나] 회선이 무너져 영상을 끌 때 받는 쪽이 «검은 사각형» 이 아니라
     «마지막 장면» 에서 멈추게 한 수리. 사장님 「얼굴이 안 보이게 하는 것보단 화면 멈춤」.

   [왜 문자열 검사로는 안 되나] 함수도 값도 다 «있고» 틀리는 것은 «무엇이 일어나는가» 뿐이다.
     수리 «전» 에도 --fast 는 전부 초록이었다. 그래서 여기서는 소스를 오려 내
     **가짜 peer·가짜 DOM 으로 실제로 돌려** 답을 본다.

   [짝으로 묻는 것들 — 한쪽만 두면 엉터리 수리가 통과한다]
     · «음성전용이면 멈춘다» ↔ «사람이 카메라를 끈 것은 전면 덮개 그대로»(프라이버시)
     · «영상을 멈춘다»       ↔ «트랙은 건드리지 않는다»(sender 를 track 으로 찾는 코드 10곳)
     · «띠를 붙인다»         ↔ «보여 줄 장면이 없으면 안 붙인다»(검은 바탕에 «멈춤» 은 거짓말)
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, writeFileSync } from 'node:fs';
import vm from 'node:vm';

const ROOT = new URL('../cloudflare-deploy/public/', import.meta.url);
const rd = (f) => readFileSync(new URL(f, ROOT), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; } else { fail++; console.log('  ❌ ' + m); } };
const sec = (t) => console.log('\n' + t);

/* ── 중괄호 짝으로 함수 몸통을 자른다. ⚠️ 길이로 자르면 옆 함수가 딸려 온다(CLAUDE.md). ── */
function bodyOf(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  let j = src.indexOf('{', i), d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(j, k + 1); }
  }
  return '';
}

/* ── 주석을 벗겨 낸 사본. 부정 검사(«이 글자가 없어야 한다»)는 반드시 이것으로 판정한다 —
   안 그러면 «쓰지 말라» 고 적어 둔 주석 자신이 걸린다(CLAUDE.md 2장. 여기서 실제로 밟았다).
   ⚠️ 정규식 한 줄로 지우면 문자열 속 «슬래시+별표» 하나에 뒤가 통째로 날아간다 — 줄 단위로 «지금
      블록주석 안인가» 를 추적한다. */
function strip(src) {
  let inBlock = false;
  return src.split('\n').map((line) => {
    let out = '', i = 0;
    while (i < line.length) {
      if (inBlock) {
        const e = line.indexOf('*/', i);
        if (e < 0) { i = line.length; } else { inBlock = false; i = e + 2; }
      } else {
        const b = line.indexOf('/*', i), l = line.indexOf('//', i);
        if (l >= 0 && (b < 0 || l < b)) { out += line.slice(i, l); break; }
        if (b >= 0) { out += line.slice(i, b); inBlock = true; i = b + 2; }
        else { out += line.slice(i); break; }
      }
    }
    return out;
  }).join('\n');
}

/* ── ⑤절만 오려 낸다 (파일 나머지는 fetch·navigator 의존이 많다) ── */
function sectionFive(qlog) {
  const i = qlog.indexOf('/* ═══ ⑤ 음성전용(AAO)');
  return i < 0 ? '' : qlog.slice(i);
}

/* ── 아주 작은 가짜 DOM. querySelector 는 '.클래스' 와 'video' 만 안다 ── */
function makeDom() {
  const mk = (tag, cls) => ({
    tagName: tag, className: cls || '', textContent: '', videoWidth: 0,
    style: { cssText: '', filter: '', position: '' }, _attr: {}, children: [], parent: null,
    setAttribute(k, v) { this._attr[k] = v; }, getAttribute(k) { return this._attr[k]; },
    appendChild(c) { c.parent = this; this.children.push(c); return c; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); },
    querySelector(sel) {
      const hit = (n) => sel.startsWith('.') ? (' ' + n.className + ' ').includes(' ' + sel.slice(1) + ' ') : n.tagName === sel;
      const walk = (n) => { for (const c of n.children) { if (hit(c)) return c; const r = walk(c); if (r) return r; } return null; };
      return walk(this);
    }
  });
  const byId = {};
  const doc = {
    getElementById: (id) => byId[id] || null,
    createElement: (t) => mk(t),
    body: mk('body')
  };
  return { doc, byId, mk };
}

/* ── 가짜 peer 하나. setParameters/replaceTrack/addTrack 호출을 센다 ── */
function makePc(opts = {}) {
  const p = { encodings: [{ maxBitrate: 900000 }] };
  if ('active' in opts) p.encodings[0].active = opts.active;
  const track = { kind: 'video', enabled: true, readyState: 'live', id: 'cam1' };
  const calls = { setParameters: 0, replaceTrack: 0, addTrack: 0, removeTrack: 0 };
  const sender = {
    track,
    getParameters: () => opts.throwOnGet ? (() => { throw new Error('boom'); })() : JSON.parse(JSON.stringify(p)),
    setParameters: (np) => { calls.setParameters++; p.encodings = np.encodings; return Promise.resolve(); },
    replaceTrack: (t) => { calls.replaceTrack++; sender.track = t; return Promise.resolve(); }
  };
  return {
    getSenders: () => [sender, { track: { kind: 'audio' }, getParameters: () => ({ encodings: [{}] }), setParameters: () => Promise.resolve() }],
    addTrack: () => { calls.addTrack++; }, removeTrack: () => { calls.removeTrack++; },
    _p: p, _calls: calls, _sender: sender, _track: track
  };
}

/* ── ⑤절을 돌릴 수 있는 세계를 만든다 ── */
function boot(code, { screenSharing = false, en = false } = {}) {
  const { doc, byId, mk } = makeDom();
  const origCalls = [];
  const win = {
    __vcScreenSharing: screenSharing,
    vcPeerConnections: {},
    vcRemoteCamOff: {},
    __vcAAO: null,
    vcApplyRemoteCamHint: (uid) => { origCalls.push(uid); },
    vcqRxStart: () => {},
    miIsEn: () => en
  };
  const ctx = vm.createContext(win);
  ctx.window = win; ctx.document = doc; ctx.Date = Date; ctx.Math = Math;
  ctx.Object = Object; ctx.JSON = JSON; ctx.Promise = Promise; ctx.console = { log() {}, warn() {} };
  ctx.vcqRxStart = win.vcqRxStart; ctx.miIsEn = win.miIsEn;
  vm.runInContext(code, ctx);
  return { ctx, win, doc, byId, mk, origCalls };
}

/* 타일 하나를 세계에 등록한다 */
function addTile(env, id, videoWidth) {
  const box = env.mk('div', 'video-box');
  const v = env.mk('video'); v.videoWidth = videoWidth;
  box.appendChild(v);
  env.byId[id === 'self' ? 'vc-local-box' : 'vc-video-' + id] = box;
  return { box, v };
}

// ══════════════════════════════════════════════════════════════════════════
const idxMain = rd('js/idx-main.js');
const qlog = rd('js/idx-vc-qlog.js');
const five = sectionFive(qlog);
const indexHtml = rd('index.html');

sec('Ⓐ 배선 — 어디에 있는가(문자열이 아니라 «위치» 로)');
{
  const apply = bodyOf(idxMain, 'function vcAAOApply(');
  ok(apply.length > 200, '전제: vcAAOApply 몸통을 잘라 냈다');

  const iOff = apply.indexOf('vcAAOVideo(0)');
  const iBc = apply.indexOf("vcBroadcastCamState(false, 'aao')");
  ok(iOff > 0, 'A-1 진입 갈래가 vcAAOVideo(0) 을 부른다');
  ok(iBc > 0 && iBc < iOff, 'A-2 «끄기 전» 에 알린다 — 늦으면 상대가 재협상을 건다(R2)');

  // 옛 방식은 «폴백(catch)» 안에만 남아 있어야 한다. 주 경로에 있으면 검은 프레임이 나간다.
  const firstEnabledFalse = apply.indexOf('t.enabled = false');
  ok(firstEnabledFalse < 0 || apply.lastIndexOf('catch', firstEnabledFalse) > iOff,
     'A-3 t.enabled=false 는 폴백(catch) 안에만 있다 — 주 경로에 있으면 검정에서 얼어붙는다');

  const iOn = apply.indexOf('vcAAOVideo(1)');
  ok(iOn > 0, 'A-4 복구 갈래가 vcAAOVideo(1) 을 부른다');
  ok(apply.slice(Math.max(0, iOn - 60), iOn).includes('vcCamOn !== false'),
     'A-5 복구는 «사용자가 따로 꺼 둔 카메라» 를 존중한다');

  ok(/\nfunction vcApplyRemoteCamHint\s*\(/.test(idxMain),
     'A-6 vcApplyRemoteCamHint 가 아직 최상위 함수다 — 밖에서 덮는 것이 성립하는 전제');
  ok(/window\.vcAAOVideo\s*=\s*vcAAOVideo/.test(qlog), 'A-7 qlog 가 vcAAOVideo 를 전역으로 내보낸다');
  ok(/try \{ vcAaoTick\(\); \} catch/.test(qlog), 'A-8 4초 타이머가 vcAaoTick 을 부른다');
  const fiveCode = strip(five);
  ok(!/setInterval/.test(fiveCode), 'A-9 ⑤절이 새 setInterval 을 만들지 않는다(홈이 멎은 전력 2회)');
  ok(/setInterval/.test(five), 'A-9b 전제: 주석 벗기기가 실제로 무언가를 벗겨 냈다(안 그러면 A-9 가 헛돈다)');
  ok(indexHtml.includes('/js/idx-vc-qlog.js?v=10') && indexHtml.includes('/js/idx-main.js?v=54'),
     'A-10 두 파일의 ?v= 가 올라갔다(immutable 캐시에 옛 사본이 남지 않게)');
}

sec('Ⓑ 끄고 켜기 — 실제로 돌려서');
{
  const e = boot(five);
  const pc = makePc();
  e.win.vcPeerConnections = { u1: pc };
  addTile(e, 'self', 320);

  e.ctx.vcAAOVideo(0);
  ok(pc._p.encodings[0].active === false, 'B-1 끄면 encodings[0].active = false');
  ok(pc._calls.replaceTrack === 0 && pc._sender.track === pc._track,
     'B-2 트랙은 그대로 둔다 — 비우면 영상 sender 를 track 으로 찾는 코드 10곳이 헛돈다');
  ok(pc._calls.addTrack === 0 && pc._calls.removeTrack === 0, 'B-3 재협상을 부르는 addTrack/removeTrack 이 없다');
  ok(pc._track.enabled === true, 'B-4 track.enabled 는 건드리지 않는다 — 검은 프레임이 먼저 나가면 검정에서 얼어붙는다');

  const n = pc._calls.setParameters;
  e.ctx.vcAAOVideo(0);
  ok(pc._calls.setParameters === n, 'B-5 이미 꺼져 있으면 다시 걸지 않는다(인코더를 흔들지 않게)');

  e.ctx.vcAAOVideo(1);
  ok(pc._p.encodings[0].active === true, 'B-6 켜면 active = true 로 돌아온다');

  const e2 = boot(five, { screenSharing: true });
  const pc2 = makePc();
  e2.win.vcPeerConnections = { u1: pc2 };
  e2.ctx.vcAAOVideo(0);
  ok(pc2._calls.setParameters === 0, 'B-7 화면공유 중에는 손대지 않는다 — 끄면 교재가 사라진다');

  // 한 peer 가 던져도 나머지는 처리해야 한다
  const e3 = boot(five);
  const bad = makePc({ throwOnGet: true }), good = makePc();
  e3.win.vcPeerConnections = { a: bad, b: good };
  e3.ctx.vcAAOVideo(0);
  ok(good._p.encodings[0].active === false, 'B-8 한 상대에서 예외가 나도 나머지는 그대로 끈다');

  // encodings 가 비어 있는 sender(일부 브라우저)
  const e4 = boot(five);
  const empty = makePc(); empty._p.encodings = [];
  e4.win.vcPeerConnections = { a: empty };
  e4.ctx.vcAAOVideo(0);
  ok(empty._p.encodings.length === 1 && empty._p.encodings[0].active === false,
     'B-9 encodings 가 비어 있어도 만들어서 끈다');
}

sec('Ⓒ 받는 쪽 화면 — 실제로 돌려서');
{
  // ① 음성전용 + 보여 줄 장면 있음 → 멈춤 띠
  const e = boot(five);
  const t = addTile(e, 'u1', 320);
  e.win.vcRemoteCamOff = { u1: 'aao' };
  e.win.vcApplyRemoteCamHint('u1');
  const strip = t.box.querySelector('.vc-aao-freeze');
  ok(!!strip, 'C-1 음성전용이면 «멈춤» 띠를 붙인다');
  ok(!t.box.querySelector('.vc-camoff-hint'), 'C-2 얼굴을 덮는 전면 상자는 없다');
  ok(t.v.style.filter === 'grayscale(1)', 'C-3 흑백 — «지금» 으로 오인되지 않게');
  ok(/초 전/.test(strip.textContent), 'C-4 «N초 전» 경과 시간을 함께 적는다(R4)');
  ok(!!strip.getAttribute('data-ko') && !!strip.getAttribute('data-en'),
     'C-5 data-ko/data-en 을 함께 갱신한다 — 🌐 를 눌러도 따라오게');
  ok(!/display:flex/.test(strip.style.cssText), 'C-6 flex 를 쓰지 않는다(좁은 타일에서 낱글자로 쪼개짐)');

  // ② 사람이 «일부러» 껐다 → 옛 전면 덮개 그대로 (짝)
  const e2 = boot(five);
  const t2 = addTile(e2, 'u1', 320);
  e2.win.vcRemoteCamOff = { u1: 'user' };
  e2.win.vcApplyRemoteCamHint('u1');
  ok(!t2.box.querySelector('.vc-aao-freeze'), 'C-7 사람이 끈 카메라에는 멈춤 띠를 안 붙인다(프라이버시)');
  ok(e2.origCalls.includes('u1'), 'C-8 그때는 원본 안내를 그대로 부른다');

  // ③ 한 프레임도 온 적 없는 상대 → 보여 줄 장면이 없다 → 옛 안내
  const e3 = boot(five);
  const t3 = addTile(e3, 'u1', 0);
  e3.win.vcRemoteCamOff = { u1: 'aao' };
  e3.win.vcApplyRemoteCamHint('u1');
  ok(!t3.box.querySelector('.vc-aao-freeze'), 'C-9 보여 줄 마지막 장면이 없으면 «멈춤» 이라 말하지 않는다');
  ok(e3.origCalls.includes('u1'), 'C-10 그때는 원본 전면 안내로 떨어진다');

  // ④ 회복 → 띠·흑백 모두 제거
  const e4 = boot(five);
  const t4 = addTile(e4, 'u1', 320);
  e4.win.vcRemoteCamOff = { u1: 'aao' };
  e4.win.vcApplyRemoteCamHint('u1');
  e4.win.vcRemoteCamOff = {};
  e4.win.vcApplyRemoteCamHint('u1');
  ok(!t4.box.querySelector('.vc-aao-freeze'), 'C-11 회복되면 띠를 뗀다');
  ok(t4.v.style.filter === '', 'C-12 회복되면 흑백도 푼다');

  // ⑤ 내 타일 — 내가 «음성만» 보내는 동안
  const e5 = boot(five);
  const self = addTile(e5, 'self', 320);
  const pc = makePc(); e5.win.vcPeerConnections = { u1: pc };
  e5.ctx.vcAAOVideo(0);
  const s5 = self.box.querySelector('.vc-aao-freeze');
  ok(!!s5 && /안 나갑니다/.test(s5.textContent), 'C-13 내 타일에 «지금 상대에게 안 나갑니다» 를 적는다(R3)');
  ok(self.v.style.filter === '', 'C-14 내 미리보기는 흑백으로 만들지 않는다(실제로 살아 움직인다)');
  e5.ctx.vcAAOVideo(1);
  ok(!self.box.querySelector('.vc-aao-freeze'), 'C-15 복구되면 내 타일 표시도 뗀다');

  // ⑥ 영어 화면
  const e6 = boot(five, { en: true });
  const t6 = addTile(e6, 'u1', 320);
  e6.win.vcRemoteCamOff = { u1: 'aao' };
  e6.win.vcApplyRemoteCamHint('u1');
  ok(/ago/.test(t6.box.querySelector('.vc-aao-freeze').textContent), 'C-16 EN 화면에는 영어로 적는다');

  // ⑦ 늦게 들어온 상대에게도 다시 건다
  const e7 = boot(five);
  addTile(e7, 'self', 320);
  e7.win.__vcAAO = { active: true };
  const late = makePc();
  e7.win.vcPeerConnections = { late };
  e7.ctx.vcAaoTick();
  ok(late._p.encodings[0].active === false, 'C-17 AAO 중에 들어온 상대의 sender 에도 4초 안에 다시 건다');
}

sec('Ⓓ 변이시험 — 되돌리면 실제로 빨간불이 나는가');
{
  const mut = [
    ['옛 방식으로 되돌리기(enabled=false)', five.replace('p.encodings[0].active = !!on;', 'p.encodings[0].active = true;')],
    ['트랙을 비우는 방식으로 바꾸기', five.replace('p.encodings[0].active = !!on;', 's.replaceTrack(null);')],
    ['사람이 끈 카메라에도 멈춤 띠 붙이기', five.replace("if (why !== 'aao') {", 'if (false) {')],
    ['보여 줄 장면이 없어도 «멈춤» 이라 말하기', five.replace('if (!v || !v.videoWidth) {', 'if (false) {')],
    ['«N초 전» 을 빼기', five.replace(" + sec + '초 전 모습'", " + ''")],
    ['흑백을 빼기', five.replace("v.style.filter = 'grayscale(1)'", "v.style.filter = ''")],
    ['화면공유 가드를 빼기', five.replace('if (window.__vcScreenSharing) return;', '')],
    ['내 타일 표시를 빼기', five.replace('try { vcAaoSelfMark(!on); } catch (_) {}', '')]
  ];
  for (const [name, code] of mut) {
    if (code === five) { fail++; console.log('  ❌ 변이 «' + name + '» 가 소스에 안 걸렸다(검사가 헛돈다)'); continue; }
    let broke = false;
    try {
      const e = boot(code);
      const pc = makePc(); e.win.vcPeerConnections = { u1: pc };
      addTile(e, 'self', 320);
      e.ctx.vcAAOVideo(0);
      if (pc._p.encodings[0].active !== false) broke = true;
      if (pc._calls.replaceTrack !== 0) broke = true;
      if (!e.doc.getElementById('vc-local-box').querySelector('.vc-aao-freeze')) broke = true;

      const e2 = boot(code);
      const t2 = addTile(e2, 'u1', 320);
      e2.win.vcRemoteCamOff = { u1: 'user' };
      e2.win.vcApplyRemoteCamHint('u1');
      if (t2.box.querySelector('.vc-aao-freeze')) broke = true;

      const e3 = boot(code);
      const t3 = addTile(e3, 'u1', 0);
      e3.win.vcRemoteCamOff = { u1: 'aao' };
      e3.win.vcApplyRemoteCamHint('u1');
      if (t3.box.querySelector('.vc-aao-freeze')) broke = true;

      const e4 = boot(code);
      const t4 = addTile(e4, 'u1', 320);
      e4.win.vcRemoteCamOff = { u1: 'aao' };
      e4.win.vcApplyRemoteCamHint('u1');
      const st = t4.box.querySelector('.vc-aao-freeze');
      if (!st || !/초 전/.test(st.textContent)) broke = true;
      if (t4.v.style.filter !== 'grayscale(1)') broke = true;

      const e5 = boot(code, { screenSharing: true });
      const pc5 = makePc(); e5.win.vcPeerConnections = { u1: pc5 };
      e5.ctx.vcAAOVideo(0);
      if (pc5._calls.setParameters !== 0) broke = true;
    } catch (_) { broke = true; }
    ok(broke, '변이 «' + name + '» 가 그대로 통과했다 — 이 검사는 그것을 못 막는다');
  }
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
