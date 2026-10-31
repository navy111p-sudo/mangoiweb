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
  const mk = (tag, cls) => {
    const props = {};                                   // style.setProperty 로 넣은 사용자 정의 속성
    const node = {
      tagName: tag, className: cls || '', textContent: '', videoWidth: 0, id: '',
      /* offsetHeight — 가짜 DOM 은 배치를 안 하므로 «띠 한 줄» 을 흉내 낸 값.
         진짜 높이·가림 여부는 test-harness/manual/vc-aao-freeze-browser.mjs 가 브라우저에서 잰다. */
      offsetHeight: 24,
      style: {
        cssText: '', filter: '', position: '',
        setProperty(k, v) { props[k] = v; },
        removeProperty(k) { delete props[k]; },
        getPropertyValue(k) { return props[k] || ''; }
      },
      classList: {
        _s: new Set(), _rm: 0,                            // _rm — «없는 토큰 remove» 도 관찰자를 깨우므로 횟수를 센다
        add(c) { this._s.add(c); }, remove(c) { this._rm++; this._s.delete(c); }, contains(c) { return this._s.has(c); }
      },
      _attr: {}, children: [], parent: null,
      setAttribute(k, v) { this._attr[k] = v; }, getAttribute(k) { return this._attr[k]; },
      appendChild(c) { c.parent = this; this.children.push(c); return c; },
      remove() { if (this.parent) this.parent.children = this.parent.children.filter(x => x !== this); },
      querySelector(sel) {
        const hit = (n) => sel.startsWith('.') ? (' ' + n.className + ' ').includes(' ' + sel.slice(1) + ' ') : n.tagName === sel;
        const walk = (n) => { for (const c of n.children) { if (hit(c)) return c; const r = walk(c); if (r) return r; } return null; };
        return walk(this);
      },
      /* 📷 (2026-09-15) 마지막 모습 스냅샷 절이 쓴다 — 배열이라 forEach 가 그대로 산다 */
      querySelectorAll(sel) {
        const hit = (n) => sel.startsWith('.') ? (' ' + n.className + ' ').includes(' ' + sel.slice(1) + ' ') : n.tagName === sel;
        const out = [];
        const walk = (n) => { for (const c of n.children) { if (hit(c)) out.push(c); walk(c); } };
        walk(this);
        return out;
      }
    };
    /* 📷 캔버스 — 스냅샷을 «실제로 뜨는지» 를 재려면 이 둘이 필요하다.
       drawImage 가 받은 폭·높이를 남겨 두어 «축소해서 뜨는가» 까지 본다. */
    if (tag === 'canvas') {
      node._drew = null;
      node.getContext = () => ({ drawImage: (src, x, y, w, h) => { node._drew = { src, w, h }; } });
      node.toDataURL = (type) => 'data:' + (type || 'image/png') + ';base64,SNAP' + (node.width || 0) + 'x' + (node.height || 0);
    }
    return node;
  };
  const byId = {};
  const head = mk('head');
  const doc = {
    getElementById: (id) => byId[id] || (head.children.find(c => c.id === id) || null),
    createElement: (t) => mk(t),
    body: mk('body'),
    head,
    documentElement: mk('html')
  };
  return { doc, byId, mk, head };
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
    setParameters: (np) => {
      calls.setParameters++;
      if (opts.rejectSet) return Promise.reject(new Error('InvalidStateError'));   // 스냅샷 어긋남 재현
      p.encodings = np.encodings; return Promise.resolve();
    },
    replaceTrack: (t) => { calls.replaceTrack++; sender.track = t; return Promise.resolve(); }
  };
  /* 🎥 프레임 확인용 — opts.frames 를 준 검사에서만 붙는다(다른 검사의 동작은 그대로) */
  if (opts.frames) {
    let i = 0;
    sender.getStats = () => {
      const f = opts.frames[Math.min(i, opts.frames.length - 1)]; i++;
      return Promise.resolve({ forEach: (cb) => cb({ type: 'outbound-rtp', framesSent: f }) });
    };
  }
  /* 🔊 오디오 sender — «음성전용» 이 이름값을 하는지 재려고 «안정된 객체» 로 둔다.
     ⛔ 매번 새 객체를 돌려주면 «건드렸는가» 를 셀 수가 없어, 오디오까지 끄는 변이가 무방비가 된다. */
  const aParams = { encodings: [{}] };
  const aCalls = { setParameters: 0 };
  const aSender = {
    track: { kind: 'audio', enabled: true, readyState: 'live' },
    getParameters: () => JSON.parse(JSON.stringify(aParams)),
    setParameters: (np) => { aCalls.setParameters++; aParams.encodings = np.encodings; return Promise.resolve(); }
  };
  return {
    getSenders: () => [sender, aSender],
    addTrack: () => { calls.addTrack++; }, removeTrack: () => { calls.removeTrack++; },
    _p: p, _calls: calls, _sender: sender, _track: track, _aParams: aParams, _aCalls: aCalls, _aSender: aSender
  };
}

/* ── ⑤절을 돌릴 수 있는 세계를 만든다 ── */
function boot(code, { screenSharing = false, en = false } = {}) {
  const { doc, byId, mk, head } = makeDom();
  const origCalls = [], bcast = [];
  const win = {
    __vcScreenSharing: screenSharing,
    vcPeerConnections: {},
    vcRemoteCamOff: {},
    __vcAAO: null,
    vcApplyRemoteCamHint: (uid) => { origCalls.push(uid); },
    vcqRxStart: () => {},
    miIsEn: () => en,
    vcBroadcastCamState: (camOn, why) => { bcast.push([camOn, why]); }
  };
  win.__bcast = bcast;
  const ctx = vm.createContext(win);
  ctx.window = win; ctx.document = doc; ctx.Date = Date; ctx.Math = Math;
  const warns = [];
  ctx.Object = Object; ctx.JSON = JSON; ctx.Promise = Promise;
  ctx.console = { log() {}, warn(...a) { warns.push(a.map(String).join(' ')); } };
  ctx.vcqRxStart = win.vcqRxStart; ctx.miIsEn = win.miIsEn; ctx.vcBroadcastCamState = win.vcBroadcastCamState;
  vm.runInContext(code, ctx);
  return { ctx, win, doc, byId, mk, head, origCalls, bcast, warns };
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
  ok(/\/js\/idx-vc-qlog\.js\?v=\d+/.test(indexHtml) && /\/js\/idx-main\.js\?v=\d+/.test(indexHtml),
     'A-10 두 파일이 ?v= 를 달고 실린다(원장 대조는 asset_version_harness 담당)');
  // ⚠️ 아래 이름을 하니스가 «지어내면» idx-main.js 에서 바뀌어도 초록불이 된다 — 소스에서 읽어 대조한다.
  const aaoVar = (idxMain.match(/window\.(__vcAAO)\b/) || [])[1];
  ok(aaoVar === '__vcAAO', 'A-11 AAO 상태 이름을 idx-main.js 에서 읽어 확인했다(' + aaoVar + ')');
  ok(five.includes('window.' + aaoVar), 'A-12 ⑤절이 그 «같은» 이름을 본다');
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

  /* 🔊 (2026-09-16) 이 기능의 이름이 «음성전용» 이다 — 영상만 멈추고 «소리는 그대로» 가야 한다.
     ⛔ 이 짝이 없으면 오디오 인코딩까지 함께 끄는 한 줄이 **한 건도 안 걸립니다**(실측: 92/0 무방비).
        그 변이가 실서비스에 들어가면 음성전용 구간에서 수업이 통째로 무음이 되는데,
        「영상이 멈춘다」·「다시 나간다」·「프라이버시」는 전부 초록이라 아무도 못 봅니다.
     ⚠️ 브라우저 검사(manual/vc-aao-realpc-browser C-4)가 같은 것을 «받는 쪽 패킷» 으로 재지만
        그쪽은 manual/ 이라 게이트가 물어 가지 않는다 — 자동으로 막는 것은 여기뿐이다. */
  ok(pc._aCalls.setParameters === 0,
     'B-4b 짝 — 오디오 sender 는 아예 건드리지 않는다(«음성전용» 이 이름값을 해야 한다)',
     '오디오 setParameters ' + pc._aCalls.setParameters + '회');
  ok(pc._aParams.encodings[0].active === undefined,
     'B-4c 짝 — 오디오 인코딩은 «보내는 중» 그대로다');

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

  /* 🔴 함정 대조가 잡은 결함: 화면공유 가드가 «켜기» 까지 막아 영상이 영영 안 돌아왔다.
     active=true 로 되돌리는 코드는 저장소에 vcAAOVideo 한 곳뿐이라 되살릴 사람이 없다. */
  const e6 = boot(five, { screenSharing: true });
  const frozen = makePc({ active: false });          // AAO 로 이미 꺼진 채 공유가 시작된 상태
  e6.win.vcPeerConnections = { u1: frozen };
  addTile(e6, 'self', 320);
  e6.ctx.vcAAOVideo(1);
  ok(frozen._p.encodings[0].active === true, 'B-10 공유 중이어도 «켜기» 는 반드시 돌아온다(영영 안 돌아오던 결함)');

  const e7 = boot(five, { screenSharing: true });
  const frozen2 = makePc({ active: false });         // AAO 중에 공유가 시작된 순간
  e7.win.vcPeerConnections = { u1: frozen2 };
  addTile(e7, 'self', 320);
  e7.ctx.vcAAOVideo(0);
  ok(frozen2._p.encodings[0].active === true, 'B-11 AAO 중에 공유가 시작되면 되살린다 — 안 그러면 학생에게 교재가 안 간다');
  ok(e7.bcast.some(b => b[0] === true && b[1] === 'aao'),
     'B-12 «실제로 보내는가» 가 뒤집히면 상대에게 다시 알린다 — 안 그러면 살아 있는 교재 위에 «N초 전» 이 얹힌다');
  ok(!e7.doc.getElementById('vc-local-box').querySelector('.vc-aao-freeze'),
     'B-13 공유 중에는 내 타일에 «안 나감» 을 적지 않는다(실제로 나가고 있다)');

  const e8 = boot(five);                              // 공유가 아닐 때는 헛되이 알리지 않는다
  e8.win.vcPeerConnections = { u1: makePc() };
  addTile(e8, 'self', 320);
  e8.ctx.vcAAOVideo(0);
  ok(e8.bcast.length === 0, 'B-14 평소에는 알림을 덧붙이지 않는다(대역폭 위기에 WS 를 더 쓰지 않게)');

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
  ok(!!s5 && /안 나감/.test(s5.textContent), 'C-13 내 타일에 «안 나감» 을 적는다 — 이제 내 미리보기는 살아 있어서(R3)');
  ok(self.v.style.filter === '', 'C-14 내 미리보기는 흑백으로 만들지 않는다(실제로 살아 움직인다)');
  e5.ctx.vcAAOVideo(1);
  ok(!self.box.querySelector('.vc-aao-freeze'), 'C-15 복구되면 내 타일 표시도 뗀다');

  // ⑥ 영어 화면
  const e6 = boot(five, { en: true });
  const t6 = addTile(e6, 'u1', 320);
  e6.win.vcRemoteCamOff = { u1: 'aao' };
  e6.win.vcApplyRemoteCamHint('u1');
  /* 🌐 2026-09-11 — 「EN 화면에는 «영어로» 적는다」던 단정을 버렸다.
     사장님 지시가 «한/영 병기» 이고(9/10 제보: 폰 언어가 EN 인 한국인이 영어만 받음),
     언어로 «갈라» 쓰는 것이 바로 그 사고였다. 새 경계는 «두 말이 늘 함께 있다» 이다.
     ⚠️ 짝으로 묻는다 — 앞만 보면 «한국어만» 도 통과하고, 뒤만 보면 «영어만» 도 통과한다. */
  const s16 = t6.box.querySelector('.vc-aao-freeze').textContent;
  ok(/Video paused/.test(s16), 'C-16 EN 화면에도 영어가 들어 있다');
  ok(/영상 멈춤/.test(s16), 'C-16b 그때도 한국어가 함께 있다(병기)');
  const s16k = t.box.querySelector('.vc-aao-freeze').textContent;
  ok(/Video paused/.test(s16k) && /영상 멈춤/.test(s16k), 'C-16c KO 화면에서도 두 말이 함께');

  // ⑦ 늦게 들어온 상대에게도 다시 건다
  const e7 = boot(five);
  addTile(e7, 'self', 320);
  e7.win.__vcAAO = { active: true };
  const late = makePc();
  e7.win.vcPeerConnections = { late };
  e7.ctx.vcAaoTick();
  ok(late._p.encodings[0].active === false, 'C-17 AAO 중에 들어온 상대의 sender 에도 4초 안에 다시 건다');

  /* 🔴 짝이 빠져 있었다 — 이것이 없으면 «모든 수업에서 4초마다 전원의 영상을 끄는» 변이도 통과한다. */
  const e8 = boot(five);
  const idle = makePc();
  e8.win.vcPeerConnections = { idle };
  e8.win.__vcAAO = { active: false };
  e8.ctx.vcAaoTick();
  ok(idle._calls.setParameters === 0 && idle._p.encodings[0].active === undefined,
     'C-18 AAO 가 아닐 때는 4초 타이머가 sender 를 건드리지 않는다');

  // 「N초 전」이 실제로 갱신되는가 — 갱신이 없으면 그 표시의 존재 이유가 사라진다
  const e9 = boot(five);
  const t9 = addTile(e9, 'u1', 320);
  e9.win.vcRemoteCamOff = { u1: 'aao' };
  e9.win.vcApplyRemoteCamHint('u1');
  e9.ctx.__vcAaoSince.u1 = Date.now() - 42000;        // 42초 전에 멈춘 것으로 돌려 놓고
  e9.ctx.vcAaoTick();
  ok(/4[12]초 전/.test(t9.box.querySelector('.vc-aao-freeze').textContent),
     'C-19 4초 타이머가 «N초 전» 을 다시 쓴다');

  // 상대가 나가 타일이 사라지면 기준 시각도 지운다(다음 사람에게 옛 시각이 붙지 않게)
  const e10 = boot(five);
  const t10 = addTile(e10, 'u1', 320);
  e10.win.vcRemoteCamOff = { u1: 'aao' };
  e10.win.vcApplyRemoteCamHint('u1');
  delete e10.byId['vc-video-u1'];
  e10.ctx.vcAaoTick();
  ok(!('u1' in e10.ctx.__vcAaoSince), 'C-20 타일이 사라지면 그 상대의 기준 시각도 지운다');

  /* 🔴 (2026-09-15) 이 수리의 핵심 — «켜기» 도 4초마다 다시 건다.
     옛 코드는 «끄기» 만 다시 걸고 «켜기» 는 복구 순간 딱 한 번이라, 그 한 번이 거절되면
     (같은 4초 틱의 applyStep 과 setParameters 스냅샷이 어긋나면 실제로 거절된다)
     소리는 오는데 얼굴만 멈춘 채로 수업이 끝났다. 되돌리면 이 검사가 빨간불이 난다. */
  const e11 = boot(five);
  const off = makePc({ active: false });          // «복구 때 한 번 거절돼 꺼진 채로 남은» 상태
  e11.win.vcPeerConnections = { off };
  e11.win.__vcAAO = { active: false };            // AAO 는 이미 복구로 판단했다
  e11.ctx.vcAaoTick();
  ok(off._p.encodings[0].active === true,
     'C-21 복구 뒤 꺼진 채 남은 sender 를 4초 타이머가 다시 켠다(한 번 거절돼도 영상이 돌아온다)');

  /* 짝 — SFU 가 mesh 송신을 일부러 끊어 둔 동안에는 켜지 않는다(켜면 두 갈래로 나간다) */
  const e12 = boot(five);
  const cut = makePc({ active: false });
  e12.win.vcPeerConnections = { cut };
  e12.win.__vcAAO = { active: false };
  e12.win.__vcSfu = { meshCut: true };
  e12.ctx.vcAaoTick();
  ok(cut._p.encodings[0].active === false && cut._calls.setParameters === 0,
     'C-22 짝 — SFU 가 mesh 를 끊어 둔 동안에는 4초 타이머가 켜지 않는다');

  /* 🎥 «켰다» 와 «나간다» 는 다르다 — 프레임이 안 늘면 말해야 한다 */
  const e13 = boot(five);
  const stuckPc = makePc({ active: false, frames: [100, 100, 100, 100, 100, 100] });
  e13.win.vcPeerConnections = { u1: stuckPc };
  e13.win.__vcAAO = { active: false };
  for (let i = 0; i < 5; i++) { e13.ctx.vcAaoTick(); await new Promise(r => setTimeout(r, 0)); }
  ok(e13.warns.some(w => /프레임이 안 나갑니다/.test(w)),
     'C-23 되살린 뒤 프레임이 실제로 안 나가면 «안 돌아온다» 고 말한다', e13.warns.join(' | '));

  /* 짝 — 프레임이 실제로 늘면 아무 말도 하지 않는다(거짓 경보가 더 나쁘다) */
  const e14 = boot(five);
  const finePc = makePc({ active: false, frames: [100, 130, 160, 190, 220, 250] });
  e14.win.vcPeerConnections = { u1: finePc };
  e14.win.__vcAAO = { active: false };
  for (let i = 0; i < 5; i++) { e14.ctx.vcAaoTick(); await new Promise(r => setTimeout(r, 0)); }
  ok(!e14.warns.some(w => /프레임이 안 나갑니다/.test(w)),
     'C-24 짝 — 프레임이 실제로 늘면 경보하지 않는다', e14.warns.join(' | '));

  /* 사람이 카메라를 끈 경우엔 보지 않는다 — 안 그러면 카메라 끈 학생마다 12초마다 거짓 경보 */
  const e15 = boot(five);
  const camOff = makePc({ active: false, frames: [7, 7, 7, 7, 7, 7] });
  camOff._track.enabled = false;
  e15.win.vcPeerConnections = { u1: camOff };
  e15.win.__vcAAO = { active: false };
  for (let i = 0; i < 5; i++) { e15.ctx.vcAaoTick(); await new Promise(r => setTimeout(r, 0)); }
  ok(!e15.warns.some(w => /프레임이 안 나갑니다/.test(w)),
     'C-25 사람이 끈 카메라에는 경보하지 않는다', e15.warns.join(' | '));

  /* 🔒 (2026-09-16) 프라이버시 짝 — «켜기» 를 4초마다 다시 걸게 된 뒤로 반드시 있어야 하는 검사.
     사람이 카메라를 끈 것은 «트랙»(track.enabled=false) 이고 AAO 는 «인코딩»(encodings.active) 이라
     축이 다르다 — 그래서 회복 틱이 active=true 로 되돌려도 나가는 것은 검은 프레임뿐이고 얼굴은
     돌아오지 않는다. 그 전제가 코드로 지켜지는지 여기서 직접 잰다(추론으로 두지 않는다).
     ⛔ 이 검사가 없으면 vcAAOVideo 에 «s.track.enabled = true» 한 줄을 더하는 변이가 초록불이다
        (= 카메라를 끈 사람의 얼굴이 4초 뒤 상대에게 나가는 프라이버시 사고). */
  const e15b = boot(five);
  const priv = makePc({ active: false });     // AAO 로 꺼져 있던 상태
  priv._track.enabled = false;                // 그 사이에 사람이 카메라를 껐다
  e15b.win.vcPeerConnections = { u1: priv };
  e15b.win.__vcAAO = { active: false };       // 회선이 회복됐다
  e15b.ctx.vcAaoTick();
  ok(priv._track.enabled === false,
     'C-25b 회복 틱이 «사람이 끈 카메라» 를 다시 켜지 않는다(프라이버시 — 트랙은 건드리지 않는다)');
  ok(priv._p.encodings[0].active === true,
     'C-25c 짝 — 그래도 인코딩은 되살린다(카메라를 다시 켜면 그 순간 바로 나가야 한다)');

  /* ⛔ 거절을 삼키면 «왜 영상이 안 돌아왔나» 를 사후에 가릴 근거가 통째로 사라진다.
     CLAUDE.md 가 규칙으로 못 박은 자리인데 이 검사가 없으면 옛 .catch(function(){}) 로
     되돌려도 초록불이다(함정 대조 실측). */
  const e16 = boot(five);
  const rej = makePc({ rejectSet: true });          // 켜져 있는 상태에서 «끄기» → 실제로 setParameters 가 불린다
  e16.win.vcPeerConnections = { u1: rej };
  e16.ctx.vcAAOVideo(0);
  await new Promise(r => setTimeout(r, 0));
  ok(e16.warns.some(w => /setParameters 거절/.test(w)),
     'C-26 setParameters 거절을 삼키지 않고 말한다 — 원인을 사후에 가릴 유일한 근거', e16.warns.join(' | '));

  /* 🔴 4초 타이머가 «켜기» 도 다시 걸면서 평상시에도 이 갈래가 돈다.
     «없는 토큰 remove()» 도 class 속성을 다시 써서 관찰자를 1회 깨운다(홈이 두 번 멎은 뿌리). */
  const e17 = boot(five);
  const t17 = addTile(e17, 'self', 320);
  e17.win.__vcAAO = { active: false };
  e17.ctx.vcAaoTick(); e17.ctx.vcAaoTick(); e17.ctx.vcAaoTick();
  ok(t17.box.classList._rm === 0,
     'C-27 평상시 4초 틱이 «없는 클래스» 를 지우지 않는다 — 남의 관찰자를 4초마다 깨우지 않게',
     'remove 호출 ' + t17.box.classList._rm + '회');

  /* 짝 — 진짜로 켜져 있던 상태에서는 제대로 지운다(가드가 «영영 안 지움» 이 되면 안 된다) */
  const e18 = boot(five);
  const t18 = addTile(e18, 'self', 320);
  e18.ctx.vcAaoSelfMark(true);
  ok(t18.box.classList.contains('vc-aao-on'), 'C-28 전제: 켜면 실제로 클래스가 붙는다');
  e18.ctx.vcAaoSelfMark(false);
  ok(!t18.box.classList.contains('vc-aao-on') && !t18.box.querySelector('.vc-aao-freeze'),
     'C-29 짝 — 붙어 있던 상태에서는 제대로 지운다');
}

let CORNER_BASES = [];
sec('Ⓔ 비켜서기 — 띠가 타일의 «누를 것» 을 덮지 않게');
{
  /* ⚠️ 가짜 DOM 은 «배치» 를 못 한다 — 실제로 가려졌는지는 브라우저가 잰다
        (test-harness/manual/vc-aao-freeze-browser.mjs, 픽셀로 확인).
     여기서는 «배선» 과 «CSS 가 소스와 같은 말을 하는가» 만 본다. */
  const e = boot(five);
  const t = addTile(e, 'u1', 320);
  e.win.vcRemoteCamOff = { u1: 'aao' };
  e.win.vcApplyRemoteCamHint('u1');
  ok(t.box.classList.contains('vc-aao-on'), 'E-1 멈추면 타일에 vc-aao-on 이 붙는다(위쪽 버튼을 내리는 스위치)');
  ok(t.box.style.getPropertyValue('--aao-h') === '24px', 'E-2 잰 띠 높이를 --aao-h 로 넘긴다');
  ok(!!e.head.children.find(c => c.id === 'vc-aao-css'), 'E-3 비켜서기 CSS 를 한 번 주입한다');

  e.win.vcRemoteCamOff = {};
  e.win.vcApplyRemoteCamHint('u1');
  ok(!t.box.classList.contains('vc-aao-on'), 'E-4 회복하면 클래스를 뗀다 (짝 — 없으면 «전부 내리기» 도 통과한다)');
  ok(t.box.style.getPropertyValue('--aao-h') === '', 'E-5 --aao-h 도 지운다 — 남으면 다음에 «이미 비킨» 채로 또 내려간다');

  /* 높이를 못 쟀으면(아직 안 그려진 타일) 아무것도 하지 않는다 — 0 을 넣으면 «안 비킨» 것과 같다 */
  const e2 = boot(five);
  const t2 = addTile(e2, 'u1', 320);
  const mkOrig = e2.doc.createElement;
  e2.doc.createElement = (tag) => { const n = mkOrig(tag); n.offsetHeight = 0; return n; };   // 아직 안 그려진 타일
  e2.win.vcRemoteCamOff = { u1: 'aao' };
  e2.win.vcApplyRemoteCamHint('u1');
  ok(!t2.box.classList.contains('vc-aao-on'), 'E-6 띠 높이가 0이면 «비켰다» 고 표시하지 않는다');

  /* 내 타일도 같다 */
  const e3 = boot(five, { screenSharing: false });
  const t3 = addTile(e3, 'self', 320);
  e3.win.vcPeerConnections = { u1: makePc() };
  e3.ctx.vcAAOVideo(0);
  ok(t3.box.classList.contains('vc-aao-on'), 'E-7 내 타일(PIP)도 같은 방식으로 비킨다');
  e3.ctx.vcAAOVideo(1);
  ok(!t3.box.classList.contains('vc-aao-on'), 'E-8 내 타일도 회복하면 되돌린다');

  /* ── 주입한 CSS 가 «소스에 실재하는» 모서리 조각과 같은 말을 하는가 ──
     ⛔ 숫자를 여기에 베껴 적지 않는다. 두 쪽 모두 소스에서 읽어 대조한다
        (CLAUDE.md 「검사에 설정표를 손으로 적으면 소스를 한 번도 안 본다」). */
  const css = e.head.children.find(c => c.id === 'vc-aao-css').textContent;
  /* ⚠️ qlog «자신» 도 읽어야 한다 — ②절의 📶 회선 경고(.vc-netlow-hint)가 이 파일에 있고,
     빼먹었더니 그 조각이 비켜서기 목록에서 통째로 새어 나갔다(2026-09-11 함정 대조). */
  const src = indexHtml + '\n' + idxMain + '\n' + qlog;
  const CORNERS = ['vc-star-btn', 'vc-dm-btn', 'vc-devhelp-btn', 'vc-star-toast', 'vc-point-basket',
                   'vpb-fly', 'vc-ss-badge', 'video-detach-btn', 'vc-netlow-hint'];
  const baseTop = (name) => {
    let i = -1;
    while ((i = src.indexOf(name, i + 1)) >= 0) {
      const win = src.slice(i, i + 320);
      if (!/position\s*:\s*absolute/.test(win)) continue;      // 주석·다른 언급은 건너뛴다
      const m = win.match(/top\s*:\s*(\d+)px/);
      if (m) return Number(m[1]);
    }
    return null;
  };
  const found = CORNERS.map(n => [n, baseTop(n)]).filter(([, v]) => v !== null);
  CORNER_BASES = found;                                     // Ⓓ 변이시험이 그대로 쓴다
  ok(found.length === CORNERS.length,
     `E-9 전제: 모서리 조각 ${CORNERS.length}개의 base top 을 소스에서 읽었다 (못 읽으면 아래가 헛돈다)`,
     CORNERS.filter(n => baseTop(n) === null).join(' / '));
  let bad = [];
  for (const [name, base] of found) {
    const re = new RegExp('\\.video-box\\.vc-aao-on \\.' + name + '[^{]*\\{top:calc\\((\\d+)px \\+ var\\(--aao-h');
    const m = css.match(re);
    if (!m) { bad.push(name + ' (비켜서기 목록에 없음)'); continue; }
    if (Number(m[1]) !== base) bad.push(`${name} (소스 ${base}px ≠ 비켜서기 ${m[1]}px)`);
  }
  ok(bad.length === 0,
     'E-10 위쪽 모서리 조각이 «전부» 같은 만큼 내려간다 — 하나만 두면 그 밑칸에 올라탄다',
     bad.join(' / '));
}

sec('Ⓕ 마지막 모습 — 영상이 «검어져도» 얼굴이 남는가 (2026-09-15)');
{
  /* [무엇을 지키나] 사장님 「음성만 나올 땐 화면은 교사의 얼굴이 멈춤 상태라도 나오게 해줘.
       검게 하지 말고 반드시 마지막 모습이 계속 나오게 할 수 있지??」
     [왜 필요했나] encodings.active=false 는 «대개» <video> 를 마지막 프레임에 멈춰 세운다.
       그 «대개» 가 아닌 경우(트랙이 죽거나 첫 프레임 전)에는 videoWidth 가 0 이고, 그러면
       아래 게이트가 옛 전면 덮개로 떨어져 얼굴이 통째로 사라졌다(2026-09-15 사장님 화면).
     [짝으로 묻는다 — 한쪽만 두면 엉터리 수리가 통과한다]
       · «검어지면 마지막 모습을 깐다»   ↔ «살아 있으면 안 깐다»(같은 그림을 덧그릴 이유가 없다)
       · «떠 둔 것이 있으면 멈춤으로»     ↔ «한 장도 없으면 옛 전면 안내»(검은 바탕에 «멈춤» 은 거짓말)
       · «영상이 살아 있을 때 떠 둔다»   ↔ «사람이 끈 카메라의 그림은 버린다»(프라이버시) */
  const e = boot(five);
  const grid = e.mk('div'); grid.id = 'vc-video-grid';
  e.byId['vc-video-grid'] = grid;
  const t = addTile(e, 'u1', 640);
  t.v.videoHeight = 360;
  grid.appendChild(t.box); t.box.id = 'vc-video-u1';
  e.win.__vcAAO = { active: false };

  /* ① 영상이 살아 있는 동안 4초 틱이 한 장을 떠 둔다 */
  e.ctx.vcAaoTick();
  const still = e.ctx.__vcAaoStill || {};
  ok(!!still.u1, 'F-1 영상이 살아 있으면 4초 틱이 «마지막 모습» 을 한 장 떠 둔다');
  ok(/^data:image\/jpeg/.test(String(still.u1 || '')), 'F-2 JPEG 로 뜬다(폭 320 으로 줄여 dataURL 비용을 낮춘다)');

  /* ② 그 상태에서 AAO 로 전환 + 영상이 검어짐(videoWidth 0) → 덮개가 아니라 «마지막 모습 + 띠» */
  t.v.videoWidth = 0;
  /* 🔎 살아 있을 때 정본 vcSmartFitVideo 가 인라인으로 박아 둔 값(타일마다 다르다) */
  t.v.style.objectFit = 'contain';
  e.win.vcRemoteCamOff = { u1: 'aao' };
  e.win.vcApplyRemoteCamHint('u1');
  const img = t.box.querySelector('.vc-aao-still');
  ok(!!img, 'F-3 영상이 검어져도 떠 둔 마지막 모습을 깐다');
  ok(!!img && img.getAttribute('src') === still.u1, 'F-4 깔린 그림이 «그때 떠 둔 그 한 장» 이다');
  ok(!!t.box.querySelector('.vc-aao-freeze'), 'F-5 멈춤 띠도 함께 붙는다(«지금» 으로 오인되지 않게)');
  ok(e.origCalls.length === 0, 'F-6 ⛔ 옛 전면 덮개(vcApplyRemoteCamHint 원본)로 떨어지지 않는다');
  /* ⚠️ img 가 없을 때 «크래시» 가 아니라 «깔끔한 FAIL» 이어야 한다 — 크래시하면 결과줄조차 안 나와
     «검출 못 함» 이 «통과» 로 위장한다(함정 대조가 이 자리에서 실제로 잡았다). */
  ok(!!img && /z-index:2/.test(String(img.style.cssText)) && /grayscale/.test(String(img.style.cssText)),
     'F-7 이름표(3)·띠(9) 아래에 깔고 흑백으로 — 가리지 않고, «지금» 으로도 안 보이게');
  /* 🔎 «어떻게 맞출지» 는 그 영상에게서 베낀다 — 내 타일의 가상배경·화면공유는 contain,
     폰 세로의 상대 타일은 cover 다. 여기에 한쪽을 박아 두면 «멈추는 순간 그림이 확 커지거나 잘려»
     방금 보던 그 화면이 아니게 된다. ⛔ 「contain 이다」만 묻지 말고 짝으로 물을 것 —
     한쪽만 두면 «전부 cover»(옛 코드)도, «전부 contain»(엉터리 수리)도 통과한다. */
  ok(!!img && img.style.objectFit === 'contain',
     'F-7b 🔎 contain 이던 타일의 마지막 모습도 contain (잰 값: ' + (img ? img.style.objectFit : '그림 없음') + ')');
  t.v.style.objectFit = 'cover';
  e.win.vcApplyRemoteCamHint('u1');
  const img2 = t.box.querySelector('.vc-aao-still');
  ok(!!img2 && img2.style.objectFit === 'cover',
     'F-7c 🔎 (짝) cover 이던 타일은 cover — 한쪽으로 박아 두지 않는다 (잰 값: ' + (img2 ? img2.style.objectFit : '그림 없음') + ')');
  t.v.style.objectFit = 'contain';

  /* ③ 짝 — 영상이 «살아 있으면» 안 깐다 */
  const e2 = boot(five);
  const g2 = e2.mk('div'); g2.id = 'vc-video-grid'; e2.byId['vc-video-grid'] = g2;
  const t2 = addTile(e2, 'u1', 640); t2.v.videoHeight = 360;
  g2.appendChild(t2.box); t2.box.id = 'vc-video-u1';
  e2.ctx.vcAaoTick();
  e2.win.vcRemoteCamOff = { u1: 'aao' };
  e2.win.vcApplyRemoteCamHint('u1');
  ok(!t2.box.querySelector('.vc-aao-still'),
     'F-8 ⛔ 멈춘 영상이 살아 있으면(videoWidth>0) 안 깐다 — <video> 가 이미 그 장면을 붙잡고 있다');

  /* ④ 짝 — 한 프레임도 안 온 상대는 예전처럼 «전면 안내»(사실이 그렇다) */
  const e3 = boot(five);
  const g3 = e3.mk('div'); g3.id = 'vc-video-grid'; e3.byId['vc-video-grid'] = g3;
  const t3 = addTile(e3, 'u1', 0);
  g3.appendChild(t3.box); t3.box.id = 'vc-video-u1';
  e3.ctx.vcAaoTick();
  e3.win.vcRemoteCamOff = { u1: 'aao' };
  e3.win.vcApplyRemoteCamHint('u1');
  ok(!t3.box.querySelector('.vc-aao-still') && e3.origCalls.length === 1,
     'F-9 한 장도 떠 둔 적 없으면 옛 전면 안내 그대로 — 검은 바탕에 «영상 멈춤» 은 거짓말이다');

  /* ⑤ 짝 — 사람이 «일부러» 끈 카메라의 그림은 갖고 있지 않는다(프라이버시) */
  const e4 = boot(five);
  const g4 = e4.mk('div'); g4.id = 'vc-video-grid'; e4.byId['vc-video-grid'] = g4;
  const t4 = addTile(e4, 'u1', 640); t4.v.videoHeight = 360;
  g4.appendChild(t4.box); t4.box.id = 'vc-video-u1';
  e4.ctx.vcAaoTick();
  ok(!!(e4.ctx.__vcAaoStill || {}).u1, 'F-10 (전제) 켜져 있는 동안에는 떠 둔다');
  e4.win.vcRemoteCamOff = { u1: 'user' };
  e4.ctx.vcAaoTick();
  ok(!(e4.ctx.__vcAaoStill || {}).u1,
     'F-11 🔒 사람이 카메라를 끄면 떠 둔 그림을 버린다 — 껐는데 얼굴이 남으면 프라이버시 사고다');

  /* ⑥ 해제하면 걷는다 · 나간 상대는 정리한다 */
  const e5 = boot(five);
  const g5 = e5.mk('div'); g5.id = 'vc-video-grid'; e5.byId['vc-video-grid'] = g5;
  const t5 = addTile(e5, 'u1', 640); t5.v.videoHeight = 360;
  g5.appendChild(t5.box); t5.box.id = 'vc-video-u1';
  e5.ctx.vcAaoTick();
  t5.v.videoWidth = 0;
  e5.win.vcRemoteCamOff = { u1: 'aao' };
  e5.win.vcApplyRemoteCamHint('u1');
  ok(!!t5.box.querySelector('.vc-aao-still'), 'F-12 (전제) 깔렸다');
  t5.v.videoWidth = 640;
  e5.win.vcRemoteCamOff = {};
  e5.win.vcApplyRemoteCamHint('u1');
  ok(!t5.box.querySelector('.vc-aao-still'), 'F-13 회복되면 걷는다 — 살아 있는 영상이 다시 보여야 한다');
  delete e5.byId['vc-video-u1'];
  g5.children = [];
  e5.ctx.vcAaoTick();
  ok(!(e5.ctx.__vcAaoStill || {}).u1, 'F-14 나간 상대의 그림은 버린다(메모리·프라이버시)');

  /* ⑦ 멈춤 중에는 다시 뜨지 않는다 — 뜨면 «멈춘 그림» 을 떠서 덮어쓴다 */
  const e6 = boot(five);
  const g6 = e6.mk('div'); g6.id = 'vc-video-grid'; e6.byId['vc-video-grid'] = g6;
  const t6 = addTile(e6, 'u1', 640); t6.v.videoHeight = 360;
  g6.appendChild(t6.box); t6.box.id = 'vc-video-u1';
  e6.ctx.vcAaoTick();
  const first = (e6.ctx.__vcAaoStill || {}).u1;
  t6.v.videoWidth = 0;
  e6.win.vcRemoteCamOff = { u1: 'aao' };
  e6.win.vcApplyRemoteCamHint('u1');
  t6.v.videoWidth = 999; t6.v.videoHeight = 999;      // 멈춘 뒤에 «새 그림» 이 온 척
  e6.ctx.vcAaoTick();
  ok((e6.ctx.__vcAaoStill || {}).u1 === first,
     'F-15 ⛔ 멈춤 중인 타일은 다시 뜨지 않는다 — 떠 두는 것은 «멈추기 직전» 의 모습이어야 한다');

  /* ⑧ 변이시험 — 되돌리면 이 절이 «실제로» 빨간불을 내는가.
     ⚠️ 치환이 안 먹으면 아무것도 안 돌리고 통과한다 — 「치환이 일어났는가」를 따로 FAIL 로 둔다. */
  function stillScene(code, { camOff = 'aao' } = {}) {
    const e = boot(code);
    const g = e.mk('div'); g.id = 'vc-video-grid'; e.byId['vc-video-grid'] = g;
    const tt = addTile(e, 'u1', 640); tt.v.videoHeight = 360;
    g.appendChild(tt.box); tt.box.id = 'vc-video-u1';
    e.ctx.vcAaoTick();                     // 살아 있는 동안 한 장을 떠 둔다
    tt.v.videoWidth = 0;                   // 그 뒤 검어졌다(트랙이 죽음)
    e.win.vcRemoteCamOff = { u1: camOff };
    e.win.vcApplyRemoteCamHint('u1');
    return { e, tt, img: tt.box.querySelector('.vc-aao-still'), orig: e.origCalls.length };
  }
  const fm = [
    ['옛 게이트로 되돌리기(떠 둔 한 장을 안 봄)',
      five.replace(/if \(!\(v && v\.videoWidth\) && ![A-Za-z_$]+\[userId\]\)/, 'if (!(v && v.videoWidth))'),
      (c) => { const r = stillScene(c); return !r.img && r.orig === 1; }],
    ['한 장도 떠 두지 않기',
      five.replace(/__vcAaoStill\[id\] = c\.toDataURL\([^)]*\);/, ''),
      (c) => !stillScene(c).img],
    ['살아 있는 영상 위에도 덧그리기',
      five.replace('vcAaoStill(box, id, !(v && v.videoWidth));', 'vcAaoStill(box, id, true);'),
      (c) => {
        const e = boot(c);
        const g = e.mk('div'); g.id = 'vc-video-grid'; e.byId['vc-video-grid'] = g;
        const tt = addTile(e, 'u1', 640); tt.v.videoHeight = 360;
        g.appendChild(tt.box); tt.box.id = 'vc-video-u1';
        e.ctx.vcAaoTick();
        e.win.vcRemoteCamOff = { u1: 'aao' };
        e.win.vcApplyRemoteCamHint('u1');
        return !!tt.box.querySelector('.vc-aao-still');     // 살아 있는데 깔렸다 = 잡아야 한다
      }],
    ['🔒 사람이 끈 카메라의 그림을 그대로 갖고 있기',
      five.replace(/if \(off\[pid\] === 'user'\) \{ delete __vcAaoStill\[pid\]; return; \}/, ''),
      (c) => {
        const e = boot(c);
        const g = e.mk('div'); g.id = 'vc-video-grid'; e.byId['vc-video-grid'] = g;
        const tt = addTile(e, 'u1', 640); tt.v.videoHeight = 360;
        g.appendChild(tt.box); tt.box.id = 'vc-video-u1';
        e.ctx.vcAaoTick();
        e.win.vcRemoteCamOff = { u1: 'user' };
        e.ctx.vcAaoTick();
        return !!(e.ctx.__vcAaoStill || {}).u1;              // 껐는데 얼굴이 남았다 = 잡아야 한다
      }],
    ['멈춤 중인 타일도 다시 뜨기(멈춘 그림을 덮어씀)',
      five.replace('if (!__vcAaoSince[pid]) vcAaoSnapOne(pid, b.querySelector(\'video\'));',
                   'vcAaoSnapOne(pid, b.querySelector(\'video\'));'),
      (c) => {
        const e = boot(c);
        const g = e.mk('div'); g.id = 'vc-video-grid'; e.byId['vc-video-grid'] = g;
        const tt = addTile(e, 'u1', 640); tt.v.videoHeight = 360;
        g.appendChild(tt.box); tt.box.id = 'vc-video-u1';
        e.ctx.vcAaoTick();
        const first = (e.ctx.__vcAaoStill || {}).u1;
        tt.v.videoWidth = 0; e.win.vcRemoteCamOff = { u1: 'aao' };
        e.win.vcApplyRemoteCamHint('u1');
        tt.v.videoWidth = 999; tt.v.videoHeight = 999;
        e.ctx.vcAaoTick();
        return (e.ctx.__vcAaoStill || {}).u1 !== first;       // 멈춘 뒤 새로 떴다 = 잡아야 한다
      }],
    ['나간 상대의 그림을 안 버리기',
      five.replace(/Object\.keys\(__vcAaoStill\)\.forEach\(function \(pid\) \{ if \(!live\[pid\]\) delete __vcAaoStill\[pid\]; \}\);/, ''),
      (c) => {
        const e = boot(c);
        const g = e.mk('div'); g.id = 'vc-video-grid'; e.byId['vc-video-grid'] = g;
        const tt = addTile(e, 'u1', 640); tt.v.videoHeight = 360;
        g.appendChild(tt.box); tt.box.id = 'vc-video-u1';
        e.ctx.vcAaoTick();
        delete e.byId['vc-video-u1']; g.children = [];
        e.ctx.vcAaoTick();
        return !!(e.ctx.__vcAaoStill || {}).u1;               // 나갔는데 남았다 = 잡아야 한다
      }]
  ];
  for (const [name, code, broke] of fm) {
    if (code === five) { fail++; console.log('  ❌ 변이 «' + name + '» 가 소스에 안 걸렸다(검사가 헛돈다)'); continue; }
    /* 🪤 «원본에서는 조용한가» 를 먼저 본다 — 판정 함수가 «언제나 참» 이면 이 절이 통째로 헛돈다.
       (CLAUDE.md 2장 「«변이 N종 전부 FAIL» 이라 적기 전에 원본이 통과하는지 전제 검사로 두세요」) */
    let base = false;
    try { base = !!broke(five); } catch (_) { base = true; }
    ok(!base, 'F-전제 «' + name + '» 판정이 원본에서는 조용하다');
    let caught = false;
    try { caught = !!broke(code); } catch (_) { caught = true; }   // 던져도 «달라졌다» 로 본다
    ok(caught, 'F-변이 «' + name + '» 를 이 절이 잡는다');
  }
}

sec('Ⓓ 변이시험 — 되돌리면 실제로 빨간불이 나는가');
{
  const mut = [
    ['영상을 아예 안 끄게 되돌리기', five.replace('p.encodings[0].active = want;', 'p.encodings[0].active = true;')],
    ['트랙을 비우는 방식으로 바꾸기', five.replace('p.encodings[0].active = want;', 's.replaceTrack(null);')],
    ['사람이 끈 카메라에도 멈춤 띠 붙이기', five.replace("if (why !== 'aao') {", 'if (false) {')],
    /* ⚠️ 이 셋은 예전에 «식 모양» 을 글자 그대로 적어 두었다가 2026-09-15 수리(마지막 모습 스냅샷)에
       보장은 그대로인데 앵커만 어긋나 «검사가 헛돈다» 3건이 났다 — 뜻으로 묻도록 정규식으로 바꿨다. */
    ['보여 줄 장면이 없어도 «멈춤» 이라 말하기',
      five.replace(/if \(![^\n]*videoWidth[^\n]*\) \{ vcAaoFreeze\(box, userId, false\);/, 'if (false) { vcAaoFreeze(box, userId, false);')],
    ['«N초 전» 을 빼기', five.replace(" + sec + '초 전 / ", " + '' + '")],
    ['흑백을 빼기', five.replace("v.style.filter = 'grayscale(1)'", "v.style.filter = ''")],
    ['화면공유 보호를 빼기(교재가 사라진다)', five.replace('window.__vcScreenSharing ? true : !!on', '!!on')],
    ['내 타일 표시를 빼기', five.replace('try { vcAaoSelfMark(!want); } catch (_) {}', '')],
    ['화면공유 가드를 옛 «조기 return» 으로 되돌리기',
      five.replace('var want = window.__vcScreenSharing ? true : !!on;', 'if (window.__vcScreenSharing) return;\n    var want = !!on;')],
    /* ⚠️ 옛 판의 «if (A && A.active) {» 를 글자로 못 박고 있었다 — 2026-09-15 에 타이머가
       «상태를 지정» 하는 모양으로 바뀌자 보장은 오히려 세졌는데 이 변이만 안 걸렸다.
       뜻으로 묻도록 고친다: «AAO 가 아닐 때도 끄게» 되돌리면 잡혀야 한다. */
    ['4초 타이머가 AAO 가 아닐 때도 «끄게» 되돌리기', five.replace('var want = (A && A.active) ? 0 : 1;', 'var want = 0;')],
    ['4초 타이머의 «켜기» 재적용을 옛 한쪽짜리로 되돌리기(이 수리의 핵심)',
      five.replace('if (!(want && vcAaoSfuCut())) { try { vcAAOVideo(want); } catch (_) {} }',
                   'if (want === 0) { try { vcAAOVideo(0); } catch (_) {} }')],
    ['SFU 가 mesh 를 끊어 둔 동안에도 켜기(영상이 두 갈래로 나간다)',
      five.replace('if (!(want && vcAaoSfuCut()))', 'if (true)')],
    ['프레임 확인을 통째로 빼기', five.replace('try { vcAaoVerify(); } catch (_) {}', '')],
    ['프레임이 안 늘어도 말하지 않기', five.replace('if (stuck === 3) {', 'if (false) {')],
    /* 🔴 함정 대조가 잡은 무방비 — CLAUDE.md 가 «삼키지 말 것» 을 규칙으로 못 박은 자리다 */
    ['setParameters 거절을 도로 삼키기',
      five.replace("try { console.warn('[vc-aao] setParameters 거절", "try { void ('[vc-aao] setParameters 거절")],
    /* 🔊 «음성전용» 인데 소리까지 끊는 변이 — 수업이 통째로 무음이 된다.
       영상 검사만 촘촘히 두면 이것이 한 건도 안 걸린다(넣기 전 실측 92/0 통과). */
    ['오디오 인코딩까지 «함께» 끄기(수업이 통째로 무음)',
      five.replace('        } catch (_) {}\n    });',
        "            var as_ = pc.getSenders().find(function (x) { return x.track && x.track.kind === 'audio'; });\n"
      + "            if (as_ && as_.getParameters) { var ap = as_.getParameters(); if (!ap.encodings || !ap.encodings.length) ap.encodings = [{}]; ap.encodings[0].active = want; as_.setParameters(ap).catch(function () {}); }\n"
      + '        } catch (_) {}\n    });')],
    /* 🔒 프라이버시 — «영상을 확실히 되살리자» 고 트랙까지 건드리는 그럴듯한 변이.
       카메라를 끈 사람의 얼굴이 4초 뒤 상대에게 나간다 — 이것이 안 잡히면 그 사고가 무방비다. */
    ['회복 틱이 트랙까지 다시 켜기(카메라를 끈 사람의 얼굴이 나간다)',
      five.replace('p.encodings[0].active = want;', 'p.encodings[0].active = want; if (want) s.track.enabled = true;')],
    ['평상시 틱의 «바뀔 때만» 가드 빼기(관찰자를 4초마다 깨움)',
      five.replace("if (box.classList.contains('vc-aao-on')) box.classList.remove('vc-aao-on');",
                   "box.classList.remove('vc-aao-on');")],
    ['「N초 전」 갱신을 빼기', five.replace('vcAaoLabel(el, id); vcAaoShift(box, el);', '/* 갱신 없음 */')],
    ['위쪽 버튼 비켜서기를 빼기', five.replace(/\n\s*vcAaoShift\(box, el\);/g, '\n    /* 없음 */')],
    ['비켜서기 CSS 에서 장치 도우미를 빼기',
      five.replace("+ '.video-box.vc-aao-on .vc-devhelp-btn{top:calc(40px + var(--aao-h,0px))!important}'\n        ", '')],
    ['나간 상대의 기준 시각 정리를 빼기', five.replace(/else \{? ?delete __vcAaoSince\[id\];[^\n]*/, '')],
    /* «어떻게 맞출지» 를 한쪽으로 박으면 멈추는 순간 그림이 확 커지거나 잘린다 — 양방향으로 본다 */
    ['마지막 모습의 맞춤을 cover 로 박기',
      five.replace(/img\.style\.objectFit = \(fit[^\n]*/, "img.style.objectFit = 'cover';")],
    ['마지막 모습의 맞춤을 contain 으로 박기',
      five.replace(/img\.style\.objectFit = \(fit[^\n]*/, "img.style.objectFit = 'contain';")]
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
      if (pc._aCalls.setParameters !== 0) broke = true;                    // 🔊 오디오를 건드리면 «음성전용» 이 아니다
      if (pc._aParams.encodings[0].active !== undefined) broke = true;     //    짝 — 오디오 인코딩은 그대로

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
      if (!t4.box.classList.contains('vc-aao-on')) broke = true;          // 위쪽 버튼을 비켜 주는 스위치
      if (t4.box.style.getPropertyValue('--aao-h') !== '24px') broke = true;
      /* 비켜서기 목록이 «소스에 실재하는 모서리 조각» 을 전부 담는가 — 하나만 빠져도 그 밑칸에 올라탄다 */
      const css4 = (e4.head.children.find(c => c.id === 'vc-aao-css') || { textContent: '' }).textContent;
      for (const [nm, bs] of CORNER_BASES) {
        const re4 = new RegExp('\\.video-box\\.vc-aao-on \\.' + nm + '[^{]*\\{top:calc\\((\\d+)px \\+ var\\(--aao-h');
        const m4 = css4.match(re4);
        if (!m4 || Number(m4[1]) !== bs) { broke = true; break; }
      }

      const e5 = boot(code, { screenSharing: true });
      const pc5 = makePc(); e5.win.vcPeerConnections = { u1: pc5 };
      addTile(e5, 'self', 320);
      e5.ctx.vcAAOVideo(0);
      if (pc5._calls.setParameters !== 0) broke = true;          // 공유 중 «끄기» 는 없어야 한다

      const e6 = boot(code, { screenSharing: true });
      const fz = makePc({ active: false }); e6.win.vcPeerConnections = { u1: fz };
      addTile(e6, 'self', 320);
      e6.ctx.vcAAOVideo(1);
      if (fz._p.encodings[0].active !== true) broke = true;      // 공유 중에도 «켜기» 는 돌아와야 한다

      const e7 = boot(code);
      const idle = makePc(); e7.win.vcPeerConnections = { idle };
      e7.win.__vcAAO = { active: false };
      e7.ctx.vcAaoTick();
      if (idle._calls.setParameters !== 0) broke = true;         // AAO 가 아니면 안 건드린다

      const e8 = boot(code);
      const t8 = addTile(e8, 'u1', 320);
      e8.win.vcRemoteCamOff = { u1: 'aao' };
      e8.win.vcApplyRemoteCamHint('u1');
      e8.ctx.__vcAaoSince.u1 = Date.now() - 42000;
      e8.ctx.vcAaoTick();
      if (!/4[12]초 전/.test(t8.box.querySelector('.vc-aao-freeze').textContent)) broke = true;
      delete e8.byId['vc-video-u1'];
      e8.ctx.vcAaoTick();
      if ('u1' in e8.ctx.__vcAaoSince) broke = true;

      /* 🔴 복구 뒤 꺼진 채 남은 sender 를 4초 타이머가 다시 켜는가(이 수리의 핵심) */
      const e9m = boot(code);
      const off9 = makePc({ active: false });
      e9m.win.vcPeerConnections = { off9 };
      e9m.win.__vcAAO = { active: false };
      e9m.ctx.vcAaoTick();
      if (off9._p.encodings[0].active !== true) broke = true;

      /* 짝 — SFU 가 mesh 를 끊어 둔 동안에는 켜지 않는가 */
      const e10m = boot(code);
      const cut10 = makePc({ active: false });
      e10m.win.vcPeerConnections = { cut10 };
      e10m.win.__vcAAO = { active: false };
      e10m.win.__vcSfu = { meshCut: true };
      e10m.ctx.vcAaoTick();
      if (cut10._p.encodings[0].active !== false) broke = true;

      /* 되살린 뒤 프레임이 안 나가면 말하는가 */
      const e11m = boot(code);
      const s11 = makePc({ active: false, frames: [5, 5, 5, 5, 5, 5] });
      e11m.win.vcPeerConnections = { u1: s11 };
      e11m.win.__vcAAO = { active: false };
      for (let i = 0; i < 5; i++) { e11m.ctx.vcAaoTick(); await new Promise(r => setTimeout(r, 0)); }
      if (!e11m.warns.some(w => /프레임이 안 나갑니다/.test(w))) broke = true;

      /* setParameters 거절을 말하는가 */
      const e12m = boot(code);
      const rej12 = makePc({ rejectSet: true });
      e12m.win.vcPeerConnections = { u1: rej12 };
      e12m.ctx.vcAAOVideo(0);
      await new Promise(r => setTimeout(r, 0));
      if (!e12m.warns.some(w => /setParameters 거절/.test(w))) broke = true;

      /* 평상시 틱이 «없는 클래스» 를 지우지 않는가 + 짝(붙어 있으면 지우는가) */
      const e13m = boot(code);
      const t13m = addTile(e13m, 'self', 320);
      e13m.win.__vcAAO = { active: false };
      e13m.ctx.vcAaoTick(); e13m.ctx.vcAaoTick();
      if (t13m.box.classList._rm !== 0) broke = true;
      e13m.ctx.vcAaoSelfMark(true);
      e13m.ctx.vcAaoSelfMark(false);
      if (t13m.box.classList.contains('vc-aao-on')) broke = true;

      /* 🔒 프라이버시 — 회복 틱이 «사람이 끈 카메라» 를 다시 켜지 않는가 + 짝 */
      const e14m = boot(code);
      const priv14 = makePc({ active: false });
      priv14._track.enabled = false;
      e14m.win.vcPeerConnections = { u1: priv14 };
      e14m.win.__vcAAO = { active: false };
      e14m.ctx.vcAaoTick();
      if (priv14._track.enabled !== false) broke = true;          // 트랙을 다시 켜면 프라이버시 사고
      if (priv14._p.encodings[0].active !== true) broke = true;   // 짝 — 인코딩은 되살아나야 한다
      /* 🔎 마지막 모습의 «맞춤» 은 그 영상을 따라가야 한다 — 짝으로 본다(한쪽만 보면 반대로 박아도 통과) */
      for (const want of ['contain', 'cover']) {
        const e9 = boot(code);
        const t9 = addTile(e9, 'u1', 0);
        e9.ctx.__vcAaoStill = { u1: 'data:image/jpeg;base64,zz' };
        t9.v.style.objectFit = want;
        e9.win.vcRemoteCamOff = { u1: 'aao' };
        e9.win.vcApplyRemoteCamHint('u1');
        const im9 = t9.box.querySelector('.vc-aao-still');
        if (!im9 || im9.style.objectFit !== want) { broke = true; break; }
      }
    } catch (_) { broke = true; }
    ok(broke, '변이 «' + name + '» 가 그대로 통과했다 — 이 검사는 그것을 못 막는다');
  }
}

console.log('\n결과: PASS ' + pass + ' / FAIL ' + fail);
if (fail) process.exit(1);
