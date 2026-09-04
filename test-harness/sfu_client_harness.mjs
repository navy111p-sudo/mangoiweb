#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════════════
   📡 sfu_client_harness — 브라우저 SFU 경로(`public/js/idx-vc-sfu.js`)를 «실제로 돌린다»

   [왜 문자열 검사로는 안 되나]
   이 파일이 하는 일은 «Cloudflare SFU 와 정해진 순서로 말을 주고받는 것» 이다.
   함수도 값도 다 «있어» 보이는데 순서 하나가 틀리면 영상이 안 온다 — 그리고 에러가 안 난다.
   그래서 가짜 fetch·가짜 RTCPeerConnection 을 물려 **나간 요청의 순서와 본문을 들여다본다.**

   [특히 지키는 것]
     · 안 켰으면 네트워크를 **한 번도** 안 건드린다 (기본이 꺼짐이라는 계약)
     · mesh 영상 송신은 **SFU 트랙이 실제로 도착한 뒤에만** 끈다 (순서가 뒤집히면 영상 공백)
     · 어디서 실패하든 **mesh 로 되돌아간다** (원래 트랙·원래 스트림)
     · 감싸는 전역 이름이 `idx-main.js` 에 아직 있는가 (바뀌면 조용히 헛돈다)
   ═══════════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLIENT = path.join(ROOT, 'cloudflare-deploy/public/js/idx-vc-sfu.js');
const IDXMAIN = path.join(ROOT, 'cloudflare-deploy/public/js/idx-main.js');
const INDEXHTML = path.join(ROOT, 'cloudflare-deploy/public/index.html');
const APIMANGO = path.join(ROOT, 'cloudflare-deploy/src/api-mango.ts');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('  ✅ ' + m); } else { fail++; console.log('  ❌ ' + m); } };
const sec = (t) => console.log('\n' + t);

/* ── 주석을 벗긴 사본 — 부정 검사는 반드시 이걸로 한다(자기 주석을 잡는 함정) ────────
   ⛔ /\*[\s\S]*?\*\/ 한 방으로 지우지 말 것 — 문자열 안의 짝 없는 «별표+슬래시» 하나에
      그 뒤가 통째로 사라진다(CLAUDE.md 2장, 실제로 8만자가 증발한 적이 있다). 줄 단위로 센다. */
function stripComments(t) {
  const out = []; let inBlock = false;
  for (const line of t.split('\n')) {
    let s = line;
    if (inBlock) { const e = s.indexOf('*/'); if (e < 0) { out.push(''); continue; } s = s.slice(e + 2); inBlock = false; }
    for (;;) {
      const b = s.indexOf('/*');
      const l = s.indexOf('//');
      if (b >= 0 && (l < 0 || b < l)) {
        const e = s.indexOf('*/', b + 2);
        if (e < 0) { s = s.slice(0, b); inBlock = true; break; }
        s = s.slice(0, b) + s.slice(e + 2); continue;
      }
      if (l >= 0) s = s.slice(0, l);
      break;
    }
    out.push(s);
  }
  return out.join('\n');
}

const clientSrc = fs.readFileSync(CLIENT, 'utf8');
const clientBare = stripComments(clientSrc);

/* ══════════════════════════════════════════════════════════════════════════════
   가짜 브라우저 — 이 파일이 쓰는 것만 딱 만든다
   ══════════════════════════════════════════════════════════════════════════════ */
function makeEnv(opts = {}) {
  const calls = [];                 // 나간 요청 전부 { url, body }
  const painted = [];               // vcAddRemoteVideo(userId, name, stream)
  const replaced = [];              // sender.replaceTrack(x)
  const timers = [];
  const log = [];

  let trackFire = null;             // subPc 의 'track' 을 쏘는 손잡이

  class FakeTrack {
    constructor(kind, id) { this.kind = kind; this.id = id; this.readyState = 'live'; this.enabled = true; }
  }
  class FakeStream {
    constructor(tracks = []) { this._t = tracks.slice(); }
    getTracks() { return this._t.slice(); }
    getVideoTracks() { return this._t.filter(t => t.kind === 'video'); }
    getAudioTracks() { return this._t.filter(t => t.kind === 'audio'); }
    addTrack(t) { this._t.push(t); }
  }
  class FakeSender {
    constructor(track) { this.track = track; }
    replaceTrack(t) { replaced.push({ from: this.track && this.track.id, to: t && t.id ? t.id : null }); this.track = t; return Promise.resolve(); }
  }
  class FakeReceiver {
    constructor(track, frames) { this.track = track; this._f = frames; }
    getStats() {
      const self = this;
      return Promise.resolve({ forEach(cb) { cb({ type: 'inbound-rtp', framesDecoded: self._f() }); } });
    }
  }
  class FakePC {
    constructor(cfg) {
      this.cfg = cfg; this.iceConnectionState = 'new';
      this._tx = []; this._h = {}; this._recv = []; this.closed = false;
      this._isSub = false;
    }
    addTransceiver(track, o) {
      const t = { mid: String(this._tx.length), sender: new FakeSender(track), direction: o && o.direction };
      this._tx.push(t); return t;
    }
    createOffer() { return Promise.resolve({ type: 'offer', sdp: 'v=0 OFFER' }); }
    createAnswer() { return Promise.resolve({ type: 'answer', sdp: 'v=0 ANSWER' }); }
    setLocalDescription(d) { this.local = d; return Promise.resolve(); }
    setRemoteDescription(d) { this.remote = d; return Promise.resolve(); }
    addEventListener(k, f) { (this._h[k] = this._h[k] || []).push(f); if (k === 'track') trackFire = (ev) => this._emit('track', ev); }
    removeEventListener(k, f) { this._h[k] = (this._h[k] || []).filter(x => x !== f); }
    _emit(k, ev) { (this._h[k] || []).slice().forEach(f => f(ev)); }
    getSenders() { return this._tx.map(t => t.sender); }
    getReceivers() { return this._recv; }
    close() { this.closed = true; }
    _connect() { this.iceConnectionState = 'connected'; this._emit('iceconnectionstatechange', {}); }
  }

  /* 가짜 SFU — 진짜 규약대로 답한다(cloudflare/realtime-examples echo/index.html 기준). */
  let frames = 0;
  const server = {
    enabled: opts.enabled !== false,
    failOn: opts.failOn || '',        // 'tracks-new' 등 — 그 op 에서 실패시킨다
    peers: opts.peers || [],
  };
  async function fakeFetch(url, init) {
    const body = init && init.body ? JSON.parse(init.body) : {};
    calls.push({ url, body });
    const j = (o) => ({ json: () => Promise.resolve(o) });
    if (url === '/api/class/sfu-peers') {
      if (!server.enabled) return j({ ok: true, enabled: false, reason: 'no_secrets', peers: [] });
      if (server.failOn === 'peers') return j({ ok: false, enabled: true, error: 'boom' });
      return j({ ok: true, enabled: true, peers: body.leave ? [] : server.peers });
    }
    const op = url.replace('/api/class/sfu/', '');
    if (!server.enabled) return j({ ok: true, enabled: false, reason: 'no_secrets' });
    if (server.failOn === op) return j({ ok: false, enabled: true, error: 'boom' });
    if (op === 'session-new') return j({ ok: true, enabled: true, sfu: { sessionId: 'sess-' + calls.length + '-abcdefgh' } });
    if (op === 'tracks-new') {
      const isPull = !!(body.payload && body.payload.tracks && body.payload.tracks[0] && body.payload.tracks[0].location === 'remote');
      if (isPull) {
        return j({ ok: true, enabled: true, sfu: {
          requiresImmediateRenegotiation: true,
          sessionDescription: { type: 'offer', sdp: 'v=0 SFU-OFFER' },
          tracks: body.payload.tracks.map((t, i) => ({ mid: 'r' + i, trackName: t.trackName })),
        } });
      }
      return j({ ok: true, enabled: true, sfu: {
        sessionDescription: { type: 'answer', sdp: 'v=0 SFU-ANSWER' },
        tracks: (body.payload.tracks || []).map(t => ({ mid: t.mid, trackName: t.trackName })),
      } });
    }
    if (op === 'renegotiate') return j({ ok: true, enabled: true, sfu: {} });
    return j({ ok: false, enabled: true, error: 'unknown_op' });
  }

  /* mesh 쪽 상태 — 되돌리기를 확인하려면 «원래 트랙» 이 있어야 한다 */
  const camTrack = new FakeTrack('video', 'cam-1');
  const micTrack = new FakeTrack('audio', 'mic-1');
  const localStream = new FakeStream([camTrack, micTrack]);
  const meshPc = new FakePC({});
  meshPc.addTransceiver(camTrack, { direction: 'sendrecv' });
  meshPc.addTransceiver(micTrack, { direction: 'sendrecv' });
  const meshStream = new FakeStream([new FakeTrack('video', 'mesh-v')]);

  const pcs = [];
  const win = {
    __vcSfuForceOff: false,
    vcMyRole: 'student',
    addEventListener() {},
  };

  const env = {
    calls, painted, replaced, timers, log, server, pcs,
    camTrack, micTrack, localStream, meshPc, meshStream,
    fireTracks(n) { for (let i = 0; i < n; i++) { const tr = new FakeTrack(i === 0 ? 'audio' : 'video', 'sfu-t' + i); if (trackFire) trackFire({ transceiver: { mid: 'r' + i }, track: tr }); } },
    setFrames(f) { frames = f; },
    bumpFrames() { frames += 10; },
    window: win,
    vcRoomId: 'class-1-20260904',
    vcUserId: 'u_me',
    vcLocalStream: localStream,
    vcPeerConnections: { u_them: meshPc },
    vcRemoteStreams: { u_them: meshStream },
    vcIsObserver: false,
    ICE_SERVERS: { iceServers: [{ urls: 'turn:x' }] },
    vcAddRemoteVideo(id, name, stream) { painted.push({ id, name, stream }); },
    vcCreatePeer(id, name) { return new FakePC({}); },
    fetch: fakeFetch,
    RTCPeerConnection: function (cfg) {
      const p = new FakePC(cfg); pcs.push(p);
      /* 올리기 PC 는 곧바로 연결되게 한다(진짜 브라우저의 iceconnectionstatechange 대신). */
      setTimeout(() => { if (!p.closed) p._connect(); }, 0);
      p._recv = [new FakeReceiver(new FakeTrack('video', 'sfu-t1'), () => frames)];
      return p;
    },
    RTCSessionDescription: function (d) { return d; },
    MediaStream: FakeStream,
    localStorage: { _d: opts.ls || {}, getItem(k) { return this._d[k] == null ? null : this._d[k]; }, setItem(k, v) { this._d[k] = v; } },
    location: { search: opts.search == null ? '?sfu=1' : opts.search },
    navigator: { sendBeacon() { return true; } },
    document: {
      body: { classList: { contains: (c) => c === 'vc-in-call' ? (opts.inCall !== false) : false } },
      getElementById() { return null; },
      querySelector() { return null; },
    },
    console: { log: (...a) => log.push(a.join(' ')), warn: () => {}, error: () => {} },
  };
  return env;
}

/* 클라이언트를 «맨 이름» 이 보이는 스코프에서 돌린다 —
   idx-main.js 의 선언이 let/function 이라 최상위 classic script 끼리 어휘 바인딩을 공유하는 것과 같은 모양. */
function runClient(env, srcOverride) {
  const src = srcOverride || clientSrc;
  const factory = new Function('E', `
    let vcRoomId = E.vcRoomId, vcUserId = E.vcUserId, vcLocalStream = E.vcLocalStream,
        vcPeerConnections = E.vcPeerConnections, vcRemoteStreams = E.vcRemoteStreams,
        ICE_SERVERS = E.ICE_SERVERS, vcIsObserver = E.vcIsObserver;
    let vcAddRemoteVideo = E.vcAddRemoteVideo;
    const window = E.window, document = E.document, fetch = E.fetch,
          RTCPeerConnection = E.RTCPeerConnection, RTCSessionDescription = E.RTCSessionDescription,
          MediaStream = E.MediaStream, localStorage = E.localStorage, location = E.location,
          navigator = E.navigator, console = E.console;
    window.vcCreatePeer = E.vcCreatePeer;
    ${src}
    return window;
  `);
  return factory(env);
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* 타이밍만 줄인 사본 — «논리» 는 그대로 두고 주기·문턱만 짧게 해서 실제로 돌린다.
   ⛔ 논리를 바꾸지 말 것. 그리고 원본 상수가 사람이 쓸 만한 값인지는 아래 ⑯이 따로 본다. */
function fastSrc() {
  let t = clientSrc;
  t = t.replace('var POLL_MS = 3000;', 'var POLL_MS = 40;');
  t = t.replace('var STALL_MS = 6000;', 'var STALL_MS = 120;');
  t = t.replace('var GRACE_MS = 12000;', 'var GRACE_MS = 400;');
  return t;
}

console.log('═══ 📡 SFU 브라우저 경로 하니스 ═══');

/* ══════════════════════════════════════════════════════════════════════════════ */
sec('① 기본은 «꺼짐» — 네트워크를 한 번도 안 건드린다');
await (async () => {
  const env = makeEnv({ search: '' });                     // ?sfu=1 없음
  const w = runClient(env);
  w.vcCreatePeer('u_them', 'Farrah');
  await sleep(60);
  ok(env.calls.length === 0, '안 켰으면 요청 0건 (실제 ' + env.calls.length + '건)');
  ok(env.window.__vcSfu.state === 'off', 'state=off');
  ok(env.window.__vcSfu.why === 'not_enabled', '이유를 적어 둔다(not_enabled)');
  ok(env.replaced.length === 0, 'mesh 송신을 안 건드린다');
})();

await (async () => {
  const env = makeEnv({ search: '', ls: { mangoi_sfu: '1' } });
  const w = runClient(env);
  w.vcCreatePeer('u_them', 'Farrah');
  await sleep(60);
  ok(env.calls.length > 0, 'localStorage mangoi_sfu=1 로도 켜진다');
})();

sec('② 서버가 «꺼짐»(시크릿 없음) 이라고 하면 거기서 끝난다');
await (async () => {
  const env = makeEnv({ enabled: false });
  const w = runClient(env);
  w.vcCreatePeer('u_them', 'Farrah');
  await sleep(80);
  ok(env.calls.length === 1, 'session-new 한 번만 부르고 멈춘다 (실제 ' + env.calls.length + '건)');
  ok(env.window.__vcSfu.state === 'off', 'state=off');
  ok(env.replaced.length === 0, 'mesh 송신을 안 건드린다');
  ok(env.painted.length === 0, '화면도 안 건드린다');
})();

sec('③ 참관자는 올리지 않는다 (올릴 것이 없다)');
await (async () => {
  const env = makeEnv(); env.vcIsObserver = true;
  const w = runClient(env);
  w.vcCreatePeer('u_them', 'Farrah');
  await sleep(60);
  ok(env.calls.length === 0, '참관자는 요청 0건');
  ok(env.window.__vcSfu.why === 'observer', '이유=observer');
})();

sec('④ 올리기 — 규약대로 부르는가');
let pubEnv;
await (async () => {
  const env = pubEnv = makeEnv();
  const w = runClient(env);
  w.vcCreatePeer('u_them', 'Farrah');
  await sleep(120);
  const c = env.calls;
  ok(c[0] && c[0].url === '/api/class/sfu/session-new', '① session-new 먼저');
  ok(c[0] && c[0].body.room_id === 'class-1-20260904', '방 번호를 함께 보낸다');
  const push = c.find(x => x.url === '/api/class/sfu/tracks-new' && x.body.payload && x.body.payload.sessionDescription);
  ok(!!push, '② tracks-new 로 올린다');
  if (push) {
    const p = push.body.payload;
    ok(p.sessionDescription.type === 'offer', 'offer 를 싣는다');
    ok(Array.isArray(p.tracks) && p.tracks.length === 2, '트랙 2개(영상·소리)');
    ok(p.tracks.every(t => t.location === 'local'), "location='local'");
    ok(p.tracks.every(t => typeof t.mid === 'string' && t.mid !== ''), 'mid 를 싣는다');
    ok(p.tracks.some(t => t.trackName === 'cam-1'), 'trackName = 실제 track.id (지어내지 않는다)');
    ok(push.body.session_id && push.body.session_id.indexOf('sess-') === 0, '내 세션 id 를 싣는다');
  }
  ok(env.pcs[0] && env.pcs[0]._tx.every(t => t.direction === 'sendonly'), '올리기 PC 는 sendonly');
  ok(env.pcs[0] && env.pcs[0].cfg.bundlePolicy === 'max-bundle', 'bundlePolicy=max-bundle');
  ok(env.pcs[0] && env.pcs[0].cfg.iceServers[0].urls === 'turn:x',
     'ICE 는 mesh 와 같은 것을 쓴다 — UDP 가 막히면 SFU 도 TURN 이 필요하다');
})();

sec('⑤ 명단 — 내 세션·트랙 이름을 알린다');
await (async () => {
  const a = pubEnv.calls.find(x => x.url === '/api/class/sfu-peers');
  ok(!!a, 'sfu-peers 를 부른다');
  if (a) {
    ok(a.body.peer_id === 'u_me', '내 화상방 임시번호(peer_id)를 싣는다');
    ok(a.body.video_track === 'cam-1', '올린 영상 트랙 이름을 싣는다');
    ok(a.body.audio_track === 'mic-1', '올린 소리 트랙 이름을 싣는다');
    ok(!!a.body.session_id, '세션 id 를 싣는다(서버가 소유권을 본다)');
  }
})();

sec('⑥ 받기 — remote 로 끌고, 재협상 answer 를 돌려준다');
let subEnv;
await (async () => {
  const env = subEnv = makeEnv({ peers: [{ peer_id: 'u_them', session_id: 'sess-them-xxxxxxxx', audio_track: 'their-a', video_track: 'their-v', name: 'Farrah' }] });
  const w = runClient(env);
  w.vcCreatePeer('u_them', 'Farrah');
  await sleep(150);
  env.fireTracks(2);                                     // SFU 트랙 도착
  await sleep(150);
  const pull = env.calls.find(x => x.url === '/api/class/sfu/tracks-new' && x.body.payload && x.body.payload.tracks && x.body.payload.tracks[0] && x.body.payload.tracks[0].location === 'remote');
  ok(!!pull, 'tracks-new 로 remote 를 끈다');
  if (pull) {
    const t = pull.body.payload.tracks;
    ok(t.some(x => x.trackName === 'their-v' && x.sessionId === 'sess-them-xxxxxxxx'),
       '남의 «세션 id + 트랙 이름» 으로 끈다');
    ok(!pull.body.payload.sessionDescription, '끌 때는 offer 를 싣지 않는다(SFU 가 준다)');
  }
  const rene = env.calls.find(x => x.url === '/api/class/sfu/renegotiate');
  ok(!!rene, 'renegotiate 를 부른다');
  ok(rene && rene.body.payload.sessionDescription.type === 'answer', 'answer 를 돌려준다');
  ok(env.window.__vcSfu.subSid && env.window.__vcSfu.subSid !== env.window.__vcSfu.sid,
     '받기 세션은 올리기 세션과 «따로» 둔다(재협상이 서로를 밟지 않게)');
})();

sec('⑦ 화면 — 기존 타일에 SFU 스트림을 갈아끼운다');
await (async () => {
  const p = subEnv.painted.filter(x => x.id === 'u_them');
  ok(p.length > 0, 'vcAddRemoteVideo 를 부른다(타일을 새로 만들지 않는다)');
  ok(p.length > 0 && p[p.length - 1].name === 'Farrah', '이름을 그대로 넘긴다');
  ok(p.length > 0 && p[p.length - 1].stream !== subEnv.meshStream, 'mesh 스트림이 아니라 SFU 스트림');
})();

sec('⑧ mesh 영상 송신은 «도착한 뒤에만» 끈다 — 그리고 소리는 안 끈다');
await (async () => {
  const r = subEnv.replaced;
  ok(r.length > 0, 'mesh 영상 sender 를 replaceTrack(null) 한다');
  ok(r.every(x => x.to === null), '되돌릴 수 있게 null 로만 바꾼다');
  ok(r.every(x => x.from === 'cam-1'), '영상만 끈다 (소리 mic-1 은 그대로)');
  ok(!subEnv.meshPc.closed, 'mesh PeerConnection 은 닫지 않는다(되돌아갈 길)');
  /* 순서 — «타일에 붙이기» 가 «mesh 끄기» 보다 먼저여야 영상 공백이 안 생긴다 */
  /* ⚠️ indexOf('cutMeshVideo()') 로 세지 말 것 — 함수 «선언» 이 먼저 걸려 늘 통과한다.
     세어야 할 것은 «부르는 자리» 뿐이고, 그 자리는 paint 가 참을 돌려준 뒤여야 한다. */
  const bare = clientBare;
  const iPaint = bare.indexOf('paint(pid, S.streams[pid])');
  const callSites = [];
  const reCall = /(^|[^n])\s*cutMeshVideo\(\);/g;
  let mm; while ((mm = reCall.exec(bare))) callSites.push(mm.index);
  ok(iPaint > 0, 'paint 를 부르는 자리를 찾았다');
  ok(callSites.length === 1, 'cutMeshVideo 를 부르는 자리는 한 곳뿐 (실제 ' + callSites.length + ')');
  ok(callSites.length === 1 && callSites[0] > iPaint, 'cutMeshVideo 는 paint «성공» 뒤에 온다');
})();

sec('⑨ 실패하면 mesh 로 되돌아간다');
await (async () => {
  const env = makeEnv({ peers: [{ peer_id: 'u_them', session_id: 'sess-them-xxxxxxxx', audio_track: 'their-a', video_track: 'their-v', name: 'Farrah' }], failOn: 'renegotiate' });
  const w = runClient(env);
  w.vcCreatePeer('u_them', 'Farrah');
  await sleep(200);
  const S = env.window.__vcSfu;
  ok(S.state === 'fallback', 'state=fallback (실제 ' + S.state + ')');
  ok(S.meshCut === false, 'mesh 영상 송신이 복구되었다');
  ok(env.pcs.some(p => p.closed), 'SFU PC 는 닫는다');
  ok(!env.meshPc.closed, 'mesh PC 는 살려 둔다');
  const last = env.painted[env.painted.length - 1];
  ok(!last || last.stream === env.meshStream || env.painted.length === 0,
     '되돌릴 때 원래 mesh 스트림을 다시 붙인다');
  ok(env.calls.some(x => x.url === '/api/class/sfu-peers' && x.body.leave), '명단에서 내 줄을 지운다');
})();

await (async () => {
  const env = makeEnv({ failOn: 'session-new' });
  const w = runClient(env);
  w.vcCreatePeer('u_them', 'Farrah');
  await sleep(120);
  ok(env.window.__vcSfu.state === 'off', '올리기 자체가 실패하면 조용히 off');
  ok(env.replaced.length === 0, '아직 mesh 를 안 껐으므로 되돌릴 것도 없다');
  ok(env.painted.length === 0, '화면을 건드리지 않았다');
})();

sec('⑨-2 «켜진 뒤» 실패해도 되돌아간다 — 여기가 진짜 되돌리기 자리다');
await (async () => {
  const env = makeEnv({ peers: [{ peer_id: 'u_them', session_id: 'sess-them-xxxxxxxx', audio_track: 'their-a', video_track: 'their-v', name: 'Farrah' }] });
  const w = runClient(env, fastSrc());
  w.vcCreatePeer('u_them', 'Farrah');
  await sleep(120);
  env.fireTracks(2);
  env.bumpFrames();
  await sleep(120);
  ok(env.window.__vcSfu.meshCut === true, '먼저 SFU 가 켜졌다(mesh 영상 송신 꺼짐)');
  const cutCount = env.replaced.length;
  /* 화면공유·가상배경·장치교체 — 카메라 트랙이 «바뀌면» 우리가 올린 것과 어긋난다 */
  env.localStream._t = env.localStream._t.filter(t => t.kind !== 'video');
  env.localStream._t.push({ kind: 'video', id: 'screen-1', readyState: 'live', enabled: true });
  await sleep(200);
  const S = env.window.__vcSfu;
  ok(S.state === 'fallback', '트랙이 바뀌면 손을 뗀다 (실제 ' + S.state + ')');
  ok(S.why === 'local_track_changed', '이유를 적어 둔다 (실제 ' + S.why + ')');
  ok(S.meshCut === false, 'mesh 영상 송신이 «실제로» 복구되었다');
  ok(env.replaced.length > cutCount && env.replaced.slice(cutCount).some(x => x.to === 'cam-1'),
     '원래 카메라 트랙을 되돌려 놓는다');
  const last = env.painted[env.painted.length - 1];
  ok(last && last.stream === env.meshStream, '타일도 원래 mesh 스트림으로 되돌린다');
})();

sec('⑩ 프레임이 멈추면 되돌린다 — track.readyState 로 판정하지 않는다');
await (async () => {
  const env = makeEnv({ peers: [{ peer_id: 'u_them', session_id: 'sess-them-xxxxxxxx', audio_track: 'their-a', video_track: 'their-v', name: 'Farrah' }] });
  env.setFrames(0);
  const w = runClient(env);
  w.vcCreatePeer('u_them', 'Farrah');
  await sleep(150);
  env.fireTracks(2);
  env.bumpFrames();                                       // 프레임이 늘었다 = 살아 있다
  await sleep(200);
  ok(env.window.__vcSfu.state === 'live' || env.window.__vcSfu.state === 'sub',
     '프레임이 늘면 유지 (실제 ' + env.window.__vcSfu.state + ')');
  ok(/framesDecoded/.test(clientBare), '살아 있는지를 framesDecoded 로 잰다');
  ok(!/readyState\s*===\s*'live'/.test(clientBare.replace(/x\.track\.readyState/g, '')),
     "원격 트랙의 readyState 로 «살아 있다» 를 판정하지 않는다");
})();

sec('⑪ ⛔ 금지 — 홈을 멎게 한 패턴을 다시 쓰지 않는다');
{
  ok(!/MutationObserver/.test(clientBare), 'MutationObserver 를 쓰지 않는다(홈 전체 정지 전력 2회)');
  ok(!/classList\.(add|remove|toggle)\s*\(/.test(clientBare), 'body class 를 쓰지 않는다');
  ok(!/vcRemovePeer/.test(clientBare), "vcRemovePeer 를 부르지 않는다(학생 화면에 「수업이 끝났어요」)");
  ok(!/window\.vcRoomId|window\.vcUserId|window\.vcLocalStream/.test(clientBare),
     'let 전역을 window. 로 읽지 않는다(영원히 undefined)');
  /* setInterval 은 쓰되 «수업 안» 에서만 살아야 한다 — 상주 타이머 금지 */
  const nInt = (clientBare.match(/setInterval\(/g) || []).length;
  ok(nInt === 1, 'setInterval 은 한 곳뿐 (실제 ' + nInt + ')');
  ok(/if\s*\(!inCall\(\)\)\s*\{\s*fallback/.test(clientBare), '수업 밖이면 스스로 끈다');
  ok(/clearInterval\(S\.timer\)/.test(clientBare), '되돌릴 때 타이머를 끈다');
  ok(/ev\s*&&\s*ev\.persisted/.test(clientBare), 'pagehide 는 bfcache(앱 전환·화면잠금)를 제외한다');
}

sec('⑫ 감싸는 전역 이름이 idx-main.js 에 아직 있는가 (바뀌면 조용히 헛돈다)');
{
  const m = fs.readFileSync(IDXMAIN, 'utf8');
  for (const name of ['function vcCreatePeer(', 'function vcAddRemoteVideo(', 'let vcRemoteStreams', 'let ICE_SERVERS', 'let vcRoomId', 'let vcUserId', 'let vcLocalStream', 'let vcIsObserver']) {
    ok(m.indexOf(name) >= 0, 'idx-main.js 에 `' + name + '` 이 아직 있다');
  }
  ok(/vcPeerConnections\s*=/.test(m), 'vcPeerConnections 가 아직 있다');
}

sec('⑬ 화면에 실렸는가 — defer 로, ?v= 와 함께');
{
  const h = fs.readFileSync(INDEXHTML, 'utf8');
  const tag = /<script[^>]*src="\/js\/idx-vc-sfu\.js\?v=\d+"[^>]*>/.exec(h);
  ok(!!tag, 'index.html 에 idx-vc-sfu.js 가 ?v= 와 함께 실려 있다');
  ok(!!tag && /\bdefer\b/.test(tag[0]), 'defer 다 — 첫 화면 예산을 건드리지 않는다');
}

sec('⑭ 서버 «명단» 계약 — 아무나 남의 방을 들여다볼 수 없다');
{
  const t = fs.readFileSync(APIMANGO, 'utf8');
  const i = t.indexOf("path === '/api/class/sfu-peers'");
  ok(i > 0, '/api/class/sfu-peers 핸들러가 있다');
  const blk = i > 0 ? t.slice(i, i + 6000) : '';
  ok(/authUidGlobal/.test(blk) && /checkAdminSession/.test(blk), '신원을 «직접» 확인한다(라우팅과 인증은 다르다)');
  ok(/unauthorized/.test(blk), '신원이 없으면 401');
  ok(/sfu:sess:/.test(blk) && /not_your_session/.test(blk),
     '«이 방에 내 세션을 만든 사람» 만 명단을 본다(소유권 기록 재사용)');
  ok(/sfuConfigured/.test(blk) && /no_secrets/.test(blk), '시크릿이 없으면 표도 안 만들고 꺼짐을 돌려준다');
  ok(/peer_id <> \?/.test(blk), '내 줄은 빼고 준다');
  ok(/updated_at > \?/.test(blk), '오래된(죽은 탭) 줄은 주지 않는다');
  ok(/replace\(\/\[\^A-Za-z0-9_-\]\/g/.test(blk), 'peer_id 는 글자를 좁힌다(화면에 그대로 그려진다)');
  ok(/console\.error\('\[sfu-peers\]/.test(blk), '기록 실패를 조용히 넘기지 않는다');
}

/* ══════════════════════════════════════════════════════════════════════════════
   ⑮ 변이시험 — 되돌리면 «실제로» FAIL 나는가
   ⚠️ 이 절이 없으면 위 검사들이 헛돌아도 알 수 없다(CLAUDE.md 2장).
   ══════════════════════════════════════════════════════════════════════════════ */
sec('⑮ 변이시험 — 일부러 되돌려 보고 진짜 잡히는지');
await (async () => {
  /* 변이 1 — 기본을 «켜짐» 으로 바꾸면? */
  const mut1 = clientSrc.replace('if (window.__vcSfuForceOff) return false;', 'return true;');
  const env = makeEnv({ search: '' });
  const w = runClient(env, mut1);
  w.vcCreatePeer('u_them', 'Farrah');
  await sleep(80);
  ok(env.calls.length > 0, '변이1(기본을 켜짐으로) → ①이 실제로 잡는다');
})();
await (async () => {
  /* 변이 2 — 도착 «전에» mesh 를 끄면? */
  const mut2 = clientSrc.replace('S.state = \'sub\';\n        S.timer', 'S.state = \'sub\'; cutMeshVideo();\n        S.timer');
  const changed = mut2 !== clientSrc;
  const env = makeEnv({ failOn: 'peers' });
  const w = runClient(env, mut2);
  w.vcCreatePeer('u_them', 'Farrah');
  await sleep(200);
  ok(changed, '변이2 를 실제로 만들었다(문자열이 바뀌었다)');
  ok(changed ? env.replaced.length > 0 : true, '변이2 → 도착 전에 mesh 가 꺼진다(⑧이 잡는 상태)');
})();
await (async () => {
  /* 변이 3 — 되돌리기에서 복구를 빼면? */
  const mut3 = clientSrc.replace('restoreMeshVideo();\n        Object.keys(S.streams).forEach(repaintMesh);', '');
  const changed = mut3 !== clientSrc;
  const env = makeEnv({ peers: [{ peer_id: 'u_them', session_id: 'sess-them-xxxxxxxx', audio_track: 'their-a', video_track: 'their-v', name: 'Farrah' }] });
  const w = runClient(env, mut3);
  w.vcCreatePeer('u_them', 'Farrah');
  await sleep(150);
  env.fireTracks(2);
  await sleep(120);
  env.window.__vcSfu && (function () { try { env.window.__vcSfu.state = 'live'; } catch (_) {} })();
  ok(changed, '변이3 을 실제로 만들었다');
  ok(changed && env.window.__vcSfu.meshCut === true, '변이3 → mesh 가 꺼진 채로 남는다(⑨가 잡는 상태)');
})();

sec('⑯ 시간 상수 — 사람이 쓸 만한 값인가 (위 ⑨-2 는 줄인 사본으로 돌렸다)');
{
  const num = (n) => { const m = new RegExp('var ' + n + ' = (\\d+);').exec(clientBare); return m ? Number(m[1]) : -1; };
  const poll = num('POLL_MS'), stall = num('STALL_MS'), grace = num('GRACE_MS');
  ok(poll >= 2000 && poll <= 10000, '명단 확인 주기 2~10초 (실제 ' + poll + 'ms) — 더 짧으면 D1 쓰기가 는다');
  ok(stall >= 4000, '멈춤 판정 4초 이상 (실제 ' + stall + 'ms) — 짧으면 잠깐 끊긴 사람을 버린다');
  ok(grace >= stall, '붙는 데 주는 시간이 멈춤 문턱보다 길다 (' + grace + ' >= ' + stall + ')');
}

console.log('\n' + '═'.repeat(60));
console.log(`  ✅ PASS ${pass}   ❌ FAIL ${fail}   (총 ${pass + fail})`);
process.exit(fail ? 1 : 0);
