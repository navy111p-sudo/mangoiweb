// -*- coding: utf-8 -*-
// ↩📢 참관자 귓속말 «놓칠 수 없는 알림» + 강사 답장·읽음 하니스  (2026-11-04)
//   실행:  node test-harness/observer_whisper_reply_harness.mjs
//   대상:  cloudflare-deploy/src/video-call-room.ts  (handleObserverWhisper · handleObserverWhisperReply)
//          cloudflare-deploy/public/js/idx-whisper.js (강사 카드 · 참관자 답장 카드)
//
//   ── 왜 만들었나 ──────────────────────────────────────────────────────────────
//   필리핀 매니저: 「선생님께 메시지를 보냈는데 못 봤다. BODA 처럼 알림이 바로 떠서
//   강사가 보고 바로 답할 수 있게 해 달라」. 실측하니 메시지는 «도착» 했고(delivered=1)
//   강사 화면의 표시가 ⓐ 구석 ⓑ 수업 화면과 같은 남색 ⓒ 소리 없음 ⓓ 8초 뒤 사라짐이었으며,
//   강사가 «답할 길» 이 없었다(참관자는 유령이라 1:1 채팅이 안 닿고, 방 채팅은 학생이 본다).
//
//   ⛔ 이 기능에서 가장 위험한 것은 «학생에게 새는 것» 과 «학생 몰래 하는 1:1 통로가 되는 것» 이다.
//      그래서 문자열이 아니라 **함수를 실제로 돌려서** «누구에게 가는가» 를 답으로 묻는다
//      (CLAUDE.md 2장 — 문자열 검사는 «있는가» 만 보고 «무엇이 나가는가» 를 못 본다).
//   ⚠️ 「간다」 검사 옆에는 반드시 「안 간다」 를 짝으로 둔다 — 앞만 보면 «전부 보내기» 도 통과한다.

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const __dir = dirname(fileURLToPath(import.meta.url));
const R = (p) => readFileSync(resolve(__dir, '..', p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

/** 표시 문구부터 «중괄호 짝» 까지 잘라 낸다(slice 로 대충 자르면 옆 함수가 딸려 온다). */
function blockAt(src, marker) {
  const i = src.indexOf(marker);
  if (i < 0) return '';
  const open = src.indexOf('{', src.indexOf(')', i));
  if (open < 0) return '';
  let depth = 0;
  for (let k = open; k < src.length; k++) {
    const c = src[k];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(i, k + 1); }
  }
  return '';
}
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

const DO_SRC = R('cloudflare-deploy/src/video-call-room.ts');
const WH_SRC = R('cloudflare-deploy/public/js/idx-whisper.js');
/* 참관자 이름 — 화면이 참관 입장 때 실제로 보내는 값을 «읽어 온다»(하니스에 손으로 적지 않는다).
   2026-11-04 함정 대조: 처음엔 'Maimai' 로 시험해 «늘 '관찰자'» 인 실제 값에서 나는 문제를 원리상 못 봤다. */
const MAIN_SRC = R('cloudflare-deploy/public/js/idx-main.js');
const OBS_M = MAIN_SRC.match(/type:\s*'join-observe',\s*data:\s*\{\s*username:\s*'([^']*)'/);
const OBS_NAME = OBS_M ? OBS_M[1] : null;

console.log('\n════════ ↩📢 참관자 귓속말 알림·답장 하니스 ════════');
check('(전제) 참관 입장 때 보내는 실제 이름을 idx-main.js 에서 읽었다', OBS_NAME !== null, '읽기 실패 — 아래 검사가 실제 값을 못 본다');

/* ═════════════════ A. 서버 — 답장이 «진짜 참관자 한 사람» 에게만 간다 ═════════════════ */
console.log('\n[ A. 서버: handleObserverWhisperReply 를 실제로 돌린다 ]');
const METHODS = ['private attOf(', 'private isStaffAtt(', 'private wsOf(', 'private send(',
                 'private handleObserverWhisper(', 'private handleObserverWhisperReply('];
const parts = METHODS.map(m => blockAt(DO_SRC, m));
check('필요한 메서드 6개를 모두 오려 냈다 (전제)', parts.every(Boolean),
      METHODS.filter((m, i) => !parts[i]).join(', ') || '');
let Room = null;
try {
  /* ⚠️ 함수 «밖» 의 return 은 타입 제거가 거절한다(CLAUDE.md 2장) — 클래스만 벗기고 return 은 뒤에 붙인다. */
  const js = stripTypeScriptTypes('class Room {\n' + parts.join('\n') + '\n}');
  Room = new Function('WebSocket', js + '\nreturn Room;')({ OPEN: 1 });
} catch (e) { check('서버 코드를 실행 가능한 형태로 바꿨다 (전제)', false, e.message); }
check('서버 코드를 실행 가능한 형태로 바꿨다 (전제)', !!Room);

function sock(att, open = true) {
  return {
    att, readyState: open ? 1 : 3, sent: [],
    send(s) { this.sent.push(JSON.parse(s)); },
    deserializeAttachment() { return this.att; },
  };
}
function room(sockets) {
  const r = new Room();
  r.state = { getWebSockets: () => sockets };
  return r;
}
const T = () => sock({ userId: 't1', username: 'Teacher Len', role: 'teacher', joined: true });
const S = () => sock({ userId: 's1', username: 'delaware', role: 'student', joined: true });
const O = (id = 'o1', name = OBS_NAME) => sock({ userId: id, username: name, role: 'observer', joined: false, ghost: true });
const FAKE_O = () => sock({ userId: 'fx', username: OBS_NAME, role: 'observer', joined: false });   // role 만 적어 보낸 소켓

let ran = 0;
if (Room) {
  ran = 1;
  // A1 강사 → 참관자 답장
  {
    const t = T(), s = S(), o = O();
    room([t, s, o]).handleObserverWhisperReply('t1', t.att, { toUserId: 'o1', toName: 'Maimai', message: '👍 OK', ref: 123 });
    const m = o.sent[0];
    check('A1 강사 답장이 그 참관자에게 간다', o.sent.length === 1 && m.type === 'admin-whisper' && m.data.kind === 'reply' && m.data.message === '👍 OK',
          JSON.stringify(o.sent));
    check('A1 받는 쪽 이중 방어 표시(direct·to=참관자 id)를 싣는다', m && m.data.direct === true && m.data.to === 'o1');
    check('A1 학생에게는 한 글자도 안 간다', s.sent.length === 0, JSON.stringify(s.sent));
    const a = t.sent[0];
    check('A1 강사에게 «갔다» 회신(reply-ack, delivered=1)', t.sent.length === 1 && a.type === 'admin-whisper-ack' && a.data.kind === 'reply-ack' && a.data.delivered === 1,
          JSON.stringify(t.sent));
  }
  // A2 학생이 보내면 아무 데도 안 간다
  {
    const t = T(), s = S(), o = O();
    room([t, s, o]).handleObserverWhisperReply('s1', s.att, { toUserId: 'o1', message: 'hi' });
    check('A2 학생은 참관자에게 몰래 말을 걸 수 없다', o.sent.length === 0 && s.sent.length === 0 && t.sent.length === 0,
          JSON.stringify([o.sent, s.sent, t.sent]));
  }
  // A3 학생을 대상으로 지정해도 안 간다 (학생 몰래 1:1 통로 금지)
  {
    const t = T(), s = S(), o = O();
    room([t, s, o]).handleObserverWhisperReply('t1', t.att, { toUserId: 's1', toName: 'delaware', message: 'secret' });
    check('A3 대상이 학생이면 보내지 않는다', s.sent.length === 0, JSON.stringify(s.sent));
    check('A3 강사에게 «안 갔다» 를 정직하게 회신한다 (delivered=0)', t.sent[0] && t.sent[0].data.delivered === 0, JSON.stringify(t.sent));
  }
  // A4 role 만 observer 로 적어 보낸 소켓(서명 토큰 없음)에는 안 간다
  {
    const t = T(), f = FAKE_O();
    room([t, f]).handleObserverWhisperReply('t1', t.att, { toUserId: 'fx', toName: 'Maimai', message: 'x' });
    check('A4 서명 토큰 없이 role 만 observer 인 소켓에는 안 간다', f.sent.length === 0, JSON.stringify(f.sent));
  }
  // A5 원래 참관자가 나가고 «다른» 참관자 하나만 남았다 — 이름이 같아도(늘 '관찰자') 그 사람에게 가면 안 된다
  {
    const t = T(), other = O('o2');
    room([t, other]).handleObserverWhisperReply('t1', t.att, { toUserId: 'o1-left', toName: OBS_NAME, message: 'again' });
    check('A5 원래 참관자가 나가면 남은 «다른» 참관자에게 가지 않는다 (이름은 신원이 아니다)', other.sent.length === 0, JSON.stringify(other.sent));
    const a = t.sent[0];
    check('A5 강사에게 «못 갔다» + 이유(not_found) 를 회신한다', a && a.data.delivered === 0 && a.data.reason === 'not_found', JSON.stringify(t.sent));
  }
  // A6 번호를 모르면(빈 값) 이름만으로는 아무에게도 안 간다 — 학생이 강사 역할을 신고하고 참관자를 더듬는 길
  {
    const t = T(), o1 = O('o2'), o2 = O('o3');
    room([t, o1, o2]).handleObserverWhisperReply('t1', t.att, { toUserId: '', toName: OBS_NAME, message: 'who?' });
    check('A6 번호 없이 이름만으로는 어떤 참관자에게도 안 간다', o1.sent.length === 0 && o2.sent.length === 0);
    check('A6 그때 delivered=0', t.sent[0] && t.sent[0].data.delivered === 0, JSON.stringify(t.sent));
  }
  // A12 보내다 소켓이 던지면 «보낸 척» 하지 않고 이유(send_failed)를 말한다
  {
    const t = T(), o = O();
    o.send = () => { throw new Error('closed'); };
    room([t, o]).handleObserverWhisperReply('t1', t.att, { toUserId: 'o1', message: 'x' });
    const a = t.sent[0];
    check('A12 보내기가 실패하면 delivered=0 + reason=send_failed', a && a.data.delivered === 0 && a.data.reason === 'send_failed', JSON.stringify(t.sent));
  }
  // A7 읽음 표시
  {
    const t = T(), o = O();
    room([t, o]).handleObserverWhisperReply('t1', t.att, { toUserId: 'o1', read: true, ref: 9 });
    check('A7 «읽음» 이 참관자에게 간다 (kind=read)', o.sent.length === 1 && o.sent[0].data.kind === 'read', JSON.stringify(o.sent));
    check('A7 읽음은 강사에게 회신을 안 만든다', t.sent.length === 0, JSON.stringify(t.sent));
  }
  // A8 빈 메시지 + 읽음 아님 → 아무것도 안 함
  {
    const t = T(), o = O();
    room([t, o]).handleObserverWhisperReply('t1', t.att, { toUserId: 'o1', message: '   ' });
    check('A8 빈 글은 보내지 않는다', o.sent.length === 0 && t.sent.length === 0);
  }
  // A9 수업에 안 들어온(joined:false) 강사 역할 소켓은 못 보낸다
  {
    const t = sock({ userId: 't9', username: 'X', role: 'teacher', joined: false }), o = O();
    room([t, o]).handleObserverWhisperReply('t9', t.att, { toUserId: 'o1', message: 'x' });
    check('A9 입장 안 한 소켓은 답장을 못 보낸다', o.sent.length === 0);
  }
  // A10 귓속말이 강사에게 갈 때 «답장 대상(fromId)» 이 실린다 — 학생에게는 안 실린다
  {
    const t = T(), s = S(), o = O();
    const r = room([t, s, o]);
    r.handleObserverWhisper('o1', o.att, { message: 'Hello teacher' });
    const toT = t.sent.find(m => m.type === 'admin-whisper');
    check('A10 강사 전원 경로: fromId=참관자 id 가 실린다', toT && toT.data.fromId === 'o1', JSON.stringify(t.sent));
    check('A10 강사 전원 경로: 학생에게는 안 간다', s.sent.length === 0, JSON.stringify(s.sent));
    t.sent.length = 0; s.sent.length = 0; o.sent.length = 0;
    r.handleObserverWhisper('o1', o.att, { message: 'Hello teacher', toUserId: 't1' });
    const d1 = t.sent.find(m => m.type === 'admin-whisper');
    check('A10 강사를 콕 집은 경로: fromId 가 실린다', d1 && d1.data.fromId === 'o1' && d1.data.toStaff === true, JSON.stringify(t.sent));
    r.handleObserverWhisper('o1', o.att, { message: '잘 듣고 있나요?', toUserId: 's1' });
    const d2 = s.sent.find(m => m.type === 'admin-whisper');
    check('A10 학생을 콕 집은 경로: 학생은 참관자 id 를 못 받는다 (fromId 빈 값)', d2 && d2.data.fromId === '' && d2.data.from === '',
          JSON.stringify(s.sent));
  }
  // A11 role 만 observer 인 소켓의 «귓속말» 에는 답장 대상이 안 실린다
  {
    const t = T(), f = FAKE_O();
    room([t, f]).handleObserverWhisper('fx', f.att, { message: 'fake' });
    const m = t.sent.find(x => x.type === 'admin-whisper');
    check('A11 서명 토큰 없는 «참관자 흉내» 는 답장 대상(fromId)을 못 얻는다', m && m.data.fromId === '', JSON.stringify(t.sent));
  }
}
check('A 절이 실제로 돌았다 (전제)', ran === 1);

/* 배선 — 메시지가 그 함수까지 실제로 가는가, ghost 표시는 서명 확인 «뒤» 한 곳에서만 붙는가 */
console.log('\n[ A-배선 ]');
{
  const code = strip(DO_SRC);
  check("switch 가 'observer-whisper-reply' 를 답장 함수로 보낸다",
        /case\s*'observer-whisper-reply'\s*:\s*\n?\s*this\.handleObserverWhisperReply\(userId,\s*att,/.test(code));
  const join = blockAt(code, 'private async handleJoinObserve(');
  const v = join.indexOf('verifyGhostObserveSig'), g = join.indexOf('ghost: true');
  check('ghost:true 는 handleJoinObserve 안, 서명 확인 «뒤» 에 붙는다', v >= 0 && g > v, `verify@${v} ghost@${g}`);
  /* «ghost: true» 글자만 세면 join-room 이 클라이언트 값을 믿는 «ghost: !!data.ghost» 를 못 본다(함정 대조 실측).
     ghost 에 «무엇이든» 값을 넣는 자리를 센다 — 인터페이스 선언(ghost?:)은 이 식에 안 걸린다. */
  check('ghost 에 값을 넣는 곳은 파일 전체에 한 곳뿐이다 (ghost:true)', (code.match(/\bghost\s*:/g) || []).length === 1
        && (code.match(/\bghost\s*:\s*true\b/g) || []).length === 1, String((code.match(/\bghost\s*:/g) || []).length));
  const joinRoom = blockAt(code, 'private handleJoinRoom(');
  check('일반 입장(join-room)은 ghost 를 읽지도 쓰지도 않는다', !!joinRoom && !/\bghost\b/.test(joinRoom), !joinRoom ? 'handleJoinRoom 을 못 찾음' : '');
}

/* ═════════════════ B. 화면 — 가짜 DOM 으로 idx-whisper.js 를 실제로 돌린다 ═════════════════ */
console.log('\n[ B. 화면: 강사 카드·답장·읽음, 학생 화면은 예전 그대로 ]');

function makeEnv(opts = {}) {
  const doc = {};
  class El {
    constructor(tag) { this.tagName = String(tag).toUpperCase(); this.children = []; this.parentNode = null;
      this.attrs = {}; this.style = { cssText: '', display: '' }; this._t = ''; this.L = {}; this.value = ''; this.id = ''; }
    set textContent(v) { this._t = String(v); this.children = []; }
    get textContent() { return this._t + this.children.map(c => c.textContent).join(''); }
    appendChild(c) { c.parentNode = this; this.children.push(c); return c; }
    removeChild(c) { const i = this.children.indexOf(c); if (i >= 0) this.children.splice(i, 1); c.parentNode = null; return c; }
    remove() { if (this.parentNode) this.parentNode.removeChild(this); }
    setAttribute(k, v) { this.attrs[k] = String(v); if (k === 'id') this.id = String(v); }
    getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; }
    addEventListener(t, f) { (this.L[t] = this.L[t] || []).push(f); }
    fire(t, extra) {
      const ev = Object.assign({ type: t, target: this, _stop: false, defaultPrevented: false,
        preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this._stop = true; } }, extra || {});
      let n = this;
      while (n) { for (const f of (n.L[t] || [])) f.call(n, ev); if (ev._stop) break; n = n.parentNode; }
      return ev;
    }
    focus() { doc.activeElement = this; }
    getBoundingClientRect() { return { top: 0, bottom: 44, left: 0, right: 100, width: 100, height: 44 }; }
    querySelectorAll(sel) {
      const m = sel.startsWith('#') ? (c => c.id === sel.slice(1))
              : sel.startsWith('[') ? (c => c.getAttribute(sel.slice(1, -1)) !== null)
              : (() => false);
      const out = [];
      const walk = (n) => { for (const c of n.children) { if (m(c)) out.push(c); walk(c); } };
      walk(this);
      return out;
    }
    querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  }
  const root = new El('html'), head = new El('head'), body = new El('body');
  root.appendChild(head); root.appendChild(body);
  const st = { focus: opts.focus !== false, inCall: opts.inCall !== false };
  body.classList = { contains: (c) => (c === 'vc-in-call' ? st.inCall : false) };
  const dl = {}, wl = {};
  Object.assign(doc, {
    documentElement: root, head, body, title: 'Mangoi', hidden: !!opts.hidden, activeElement: null,
    createElement: (t) => new El(t),
    getElementById: (id) => root.querySelector('#' + id),
    querySelector: (s) => root.querySelector(s),
    querySelectorAll: (s) => root.querySelectorAll(s),
    hasFocus: () => st.focus,
    addEventListener(t, f) { (dl[t] = dl[t] || []).push(f); },
  });
  const chat = [], toasts = [], sent = [], timers = [], notes = [];
  const intervals = new Map(); let ivSeq = 100;
  function Notif(title, opt) { const n = { title, opt, closed: false }; notes.push(n); this.close = () => { n.closed = true; }; }
  Notif.permission = opts.notif || 'denied';
  Notif.requestPermission = () => Promise.resolve('granted');
  let osc = 0;
  const ac = { state: 'running', currentTime: 0, destination: {},
    createOscillator: () => ({ type: '', frequency: { value: 0 }, connect() {}, start() { osc++; }, stop() {} }),
    createGain: () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} }) };
  const win = {
    vcAddChatSystem: (t) => chat.push(String(t)),
    vcMyRole: opts.role || '',
    _vcObserverMode: !!opts.observer,
    innerHeight: 800,
    __vcWhisperQ: opts.queue || undefined,
    __vcScreenSharing: !!opts.sharing,
    addEventListener(t, f) { (wl[t] = wl[t] || []).push(f); },
  };
  if (opts.notif) win.Notification = Notif;      // 'Notification' in window 가 참이 되게
  const conn = { send: (m) => { sent.push(m); return opts.sendOk !== false; } };
  const fn = new Function('window', 'document', 'getLang', 'vcUserId', 'vcConn', 'vcGetSharedAC', 'showToast',
                          'setTimeout', 'setInterval', 'clearInterval', 'navigator', 'Notification', WH_SRC);
  fn(win, doc, () => (opts.lang || 'ko'), opts.me || '', conn, () => ac, (t) => toasts.push(String(t)),
     (f, ms) => { timers.push({ f, ms }); return timers.length; },
     (f, ms) => { const id = ++ivSeq; intervals.set(id, { f, ms }); return id; },
     (id) => { intervals.delete(id); }, {}, opts.notif ? Notif : undefined);
  return {
    win, doc, chat, toasts, sent, timers, notes, st, intervals, osc: () => osc,
    tick: () => { for (const [, v] of [...intervals]) { try { v.f(); } catch (_) {} } },
    fireDoc: (t) => { for (const f of (dl[t] || [])) f({}); },
    card: () => doc.getElementById('vc-whisper-alert'),
    box: () => doc.getElementById('vc-whisper-box'),
    runTimers: () => { const list = timers.splice(0); for (const t of list) { try { t.f(); } catch (_) {} } },
    on: (type, data) => win.vcWhisperOn(type, data),
  };
}
const W = (extra) => Object.assign({ message: 'Hello teacher', from: OBS_NAME, fromId: 'o1', observer: true, at: Date.now() }, extra || {});
const btn = (card, attr) => card && card.querySelector('[' + attr + ']');

let ranB = 0;
try {
  // B1 강사(대상 없음 경로) — 카드가 뜨고, 소리가 나고, 채팅창에 남고, 스스로 사라지지 않는다
  {
    const e = makeEnv({ role: 'teacher', me: 't1' });
    e.on('admin-whisper', W());
    const c = e.card();
    check('B1 강사 화면에 카드가 뜬다', !!c && /Hello teacher/.test(c.textContent), c ? c.textContent.slice(0, 80) : '(없음)');
    check('B1 알림음이 울린다', e.osc() > 0);
    check('B1 받은 글이 채팅창에도 남는다', e.chat.some(l => /Hello teacher/.test(l)), JSON.stringify(e.chat));
    e.runTimers();
    check('B1 타이머가 다 돌아도 카드가 남아 있다 («확인» 전까지)', !!e.card());
    check('B1 강사에게는 예전 작은 상자를 쓰지 않는다', !e.box());
    check('B1 답장 칸·보내기·확인 버튼이 있다', !!btn(c, 'data-vcw-input') && !!btn(c, 'data-vcw-send') && !!btn(c, 'data-vcw-ok'));
    ranB++;
  }
  // B2 빠른 답장 — 그 참관자에게 답장 1건, 카드가 닫힌다
  {
    const e = makeEnv({ role: 'teacher', me: 't1' });
    e.on('admin-whisper', W());
    btn(e.card(), 'data-vcw-quick').fire('click');
    const m = e.sent[0] || {};
    check('B2 빠른 답장이 소켓으로 나간다 (observer-whisper-reply)', e.sent.length === 1 && m.type === 'observer-whisper-reply', JSON.stringify(e.sent));
    check('B2 받는 사람이 보낸 참관자다 (toUserId=o1)', m.data && m.data.toUserId === 'o1', JSON.stringify(m.data));
    check('B2 답장 내용이 실린다', m.data && /네/.test(m.data.message), JSON.stringify(m.data));
    check('B2 보내면 카드가 닫힌다', !e.card());
  }
  // B3 직접 입력 + Enter (한글 조합 중 Enter 는 보내지 않는다)
  {
    const e = makeEnv({ role: 'teacher', me: 't1' });
    e.on('admin-whisper', W());
    const inp = btn(e.card(), 'data-vcw-input');
    inp.value = '알겠습니다 바로 할게요';
    inp.fire('keydown', { key: 'Enter', isComposing: true, keyCode: 229 });
    check('B3 한글 조합 중 Enter 는 보내지 않는다', e.sent.length === 0, JSON.stringify(e.sent));
    inp.fire('keydown', { key: 'Enter', isComposing: false, keyCode: 13 });
    check('B3 Enter 로 보낸다', e.sent.length === 1 && e.sent[0].data.message === '알겠습니다 바로 할게요', JSON.stringify(e.sent));
  }
  // B4 「확인」 — 읽음 표시가 보낸 참관자에게 간다
  {
    const e = makeEnv({ role: 'teacher', me: 't1' });
    e.on('admin-whisper', W());
    btn(e.card(), 'data-vcw-ok').fire('click');
    const m = e.sent[0] || {};
    check('B4 확인을 누르면 읽음(read:true)이 그 참관자에게 간다', e.sent.length === 1 && m.data && m.data.read === true && m.data.toUserId === 'o1',
          JSON.stringify(e.sent));
    check('B4 확인을 누르면 카드가 닫힌다', !e.card());
  }
  // B5 참관자 둘 → 확인 하나로 둘 다 읽음, 카드는 «2개» 를 말한다
  {
    const e = makeEnv({ role: 'teacher', me: 't1' });
    e.on('admin-whisper', W());
    e.on('admin-whisper', W({ message: 'Please check the mic', fromId: 'o2' }));
    check('B5 카드가 최근 글을 보여 주고 «2개» 를 말한다', /check the mic/.test(e.card().textContent) && /2개/.test(e.card().textContent),
          e.card().textContent.slice(0, 120));
    btn(e.card(), 'data-vcw-ok').fire('click');
    const ids = e.sent.filter(m => m.data && m.data.read === true).map(m => m.data.toUserId).sort().join(',');
    check('B5 두 참관자 모두에게 읽음이 간다 (한 번씩)', ids === 'o1,o2', ids);
  }
  // B6 연결이 끊겨 못 보내면 «보낸 척» 하지 않는다 — 카드·입력이 남는다
  {
    const e = makeEnv({ role: 'teacher', me: 't1', sendOk: false });
    e.on('admin-whisper', W());
    const inp = btn(e.card(), 'data-vcw-input');
    inp.value = '잠시만요';
    btn(e.card(), 'data-vcw-send').fire('click');
    const c = e.card();
    check('B6 못 보내면 카드가 남는다', !!c);
    check('B6 못 보낸 이유가 카드에 보인다', !!c && /보내지 못했어요/.test(c.textContent), c ? c.textContent.slice(-80) : '');
    check('B6 쓰던 글이 남아 있다', !!c && btn(c, 'data-vcw-input').value === '잠시만요');
  }
  // B7 쓰는 도중 새 글 — 같은 참관자면 쓰던 글을 이어 받고, 다른 참관자면 옮기지 않는다
  {
    const e = makeEnv({ role: 'teacher', me: 't1' });
    e.on('admin-whisper', W());
    btn(e.card(), 'data-vcw-input').value = '쓰는 중';
    e.on('admin-whisper', W({ message: 'one more' }));
    check('B7 같은 참관자의 새 글이 와도 쓰던 답장이 남는다', btn(e.card(), 'data-vcw-input').value === '쓰는 중');
    e.on('admin-whisper', W({ message: 'from another observer', fromId: 'o2' }));
    check('B7 다른 참관자의 글이 오면 쓰던 답장을 그쪽으로 옮기지 않는다', btn(e.card(), 'data-vcw-input').value === '');
  }
  // B8 관리자 «수업 관찰» 화면(방 밖)에서 온 귓속말 — 답장 대상이 없으니 답장 칸 없이 확인만
  {
    const e = makeEnv({ role: 'teacher', me: 't1' });
    e.on('admin-whisper', { message: '수업 시작해 주세요', from: '관리자', at: Date.now() });
    const c = e.card();
    check('B8 답장 대상이 없으면 카드에 답장 칸을 그리지 않는다', !!c && !btn(c, 'data-vcw-input') && !!btn(c, 'data-vcw-ok'));
  }
  // B9 학생 — 강사용 귓속말은 안 뜨고, 나에게 온 것은 예전 작은 상자(스스로 사라짐)
  {
    const e = makeEnv({ role: 'student', me: 's1' });
    e.on('admin-whisper', W());
    check('B9 학생 화면에 강사용 귓속말이 안 뜬다', !e.card() && !e.box());
    check('B9 학생 화면에서는 소리도 안 난다', e.osc() === 0);
    e.on('admin-whisper', { message: '마이크를 확인해 주세요', direct: true, to: 's1', toStaff: false, from: '', fromId: '' });
    check('B9 나에게 온 것은 예전 작은 상자로 뜬다', !!e.box() && !e.card());
    check('B9 학생 상자는 스스로 사라지는 타이머(14초)가 있다', e.timers.some(t => t.ms === 14000));
    e.runTimers();
    check('B9 타이머가 돌면 학생 상자가 사라진다', !e.box());
    e.on('admin-whisper', { message: '남에게 간 글', direct: true, to: 's2', toStaff: false });
    check('B9 남에게 간 글은 안 뜬다', !e.box() && !e.card());
  }
  // B10 강사를 콕 집은 경로(direct·toStaff:true)도 카드로 뜬다 — 이번 제보가 정확히 이 경로였다
  {
    const e = makeEnv({ role: '', me: 't1' });
    e.on('admin-whisper', W({ direct: true, to: 't1', toStaff: true }));
    check('B10 «Teacher mangoi_172» 처럼 콕 집어 보낸 것도 카드로 뜬다', !!e.card() && e.osc() > 0);
    const e2 = makeEnv({ role: 'teacher', me: 't1' });
    e2.on('admin-whisper', W({ direct: true, to: 't2', toStaff: true }));
    check('B10 남(다른 강사)을 콕 집은 것은 안 뜬다', !e2.card());
  }
  // B11 참관자 화면 — 답장 카드·읽음 줄
  {
    const e = makeEnv({ observer: true, me: 'o1' });
    e.on('admin-whisper', { kind: 'reply', message: '👍 OK', from: 'Teacher Len', fromId: 't1', direct: true, to: 'o1', toStaff: true, at: Date.now() });
    const c = e.card();
    check('B11 참관자 화면에 강사 답장 카드가 뜬다', !!c && /OK/.test(c.textContent) && /Teacher Len/.test(c.textContent), c ? c.textContent.slice(0, 80) : '(없음)');
    check('B11 답장이 참관자 채팅창에도 남는다', e.chat.some(l => /Teacher Len/.test(l) && /OK/.test(l)), JSON.stringify(e.chat));
    check('B11 참관자 답장 카드에는 강사용 답장 칸이 없다', !btn(c, 'data-vcw-input'));
    e.on('admin-whisper', { kind: 'read', message: '', from: 'Teacher Len', direct: true, to: 'o1', toStaff: true });
    check('B11 «읽음» 은 채팅창에 한 줄로 남는다', e.chat.some(l => /확인했습니다/.test(l)), JSON.stringify(e.chat));
    const e2 = makeEnv({ observer: true, me: 'o9' });
    e2.on('admin-whisper', { kind: 'reply', message: 'x', from: 'T', direct: true, to: 'o1', toStaff: true });
    check('B11 다른 참관자에게 간 답장은 안 뜬다', !e2.card() && e2.chat.length === 0);
  }
  // B12 강사 화면의 답장 회신(reply-ack)
  {
    const e = makeEnv({ role: 'teacher', me: 't1' });
    e.on('admin-whisper-ack', { kind: 'reply-ack', delivered: 1, message: '👍 OK' });
    e.on('admin-whisper-ack', { kind: 'reply-ack', delivered: 0, reason: 'not_found', message: 'late' });
    e.on('admin-whisper-ack', { kind: 'reply-ack', delivered: 0, reason: 'send_failed', message: 'oops' });
    check('B12 답장이 갔으면 채팅창에 «관찰자에게만 답장했습니다» + 내용', e.chat.some(l => /관찰자에게만 답장했습니다/.test(l) && /OK/.test(l)), JSON.stringify(e.chat));
    check('B12 참관자가 나갔으면 그 이유로 말한다', e.chat.some(l => /나갔거나 다시 접속/.test(l) && /late/.test(l)), JSON.stringify(e.chat));
    check('B12 보내기 오류는 다른 문구로 말한다 (한 문구로 뭉치지 않는다)', e.chat.some(l => /연결 오류/.test(l) && /oops/.test(l)), JSON.stringify(e.chat));
  }
  // B13 파일이 늦게 와도 — 큐에 쌓인 귓속말을 카드로 띄운다
  {
    const e = makeEnv({ role: 'teacher', me: 't1', queue: [['admin-whisper', W({ message: 'queued one' })]] });
    check('B13 로드 전에 온 귓속말도 카드로 뜬다', !!e.card() && /queued one/.test(e.card().textContent));
  }
  // B14 영어 화면
  {
    const e = makeEnv({ role: 'teacher', me: 't1', lang: 'en' });
    e.on('admin-whisper', W());
    const t = e.card() ? e.card().textContent : '';
    check('B14 영어 화면은 영어로 말한다 (EN/KO)', /class observer/.test(t) && /OK, got it/.test(t) && /Send/.test(t), t.slice(0, 160));
    const head = e.card() ? e.card().children[0].textContent : '';
    check('B14 영어 머리글에 한글이 섞이지 않는다 (참관자 기본 이름이 한글이어도)', !/[\uac00-\ud7a3]/.test(head), head);
    const k = makeEnv({ role: 'teacher', me: 't1' });
    k.on('admin-whisper', W());
    const kh = k.card() ? k.card().children[0].textContent : '';
    check('B14 한국어 머리글이 이름을 두 번 말하지 않는다 («관찰자 관찰자» 금지)', !!kh && !/관찰자\s*관찰자/.test(kh) && !new RegExp(OBS_NAME + '\\s*님').test(kh), kh);
  }
  // B15 자리를 비웠을 때(다른 탭·창) — 제목 깜빡임 + 브라우저 알림 / 보고 있으면 둘 다 없음
  {
    const e = makeEnv({ role: 'teacher', me: 't1', focus: false, notif: 'granted' });
    e.on('admin-whisper', W());
    check('B15 자리를 비웠으면 브라우저 알림을 띄운다 (내용 포함)', e.notes.length === 1 && /Hello teacher/.test(e.notes[0].opt.body), JSON.stringify(e.notes));
    e.tick();
    check('B15 자리를 비웠으면 탭 제목이 깜빡인다', /새 메시지/.test(e.doc.title), e.doc.title);
    btn(e.card(), 'data-vcw-ok').fire('click');
    check('B15 「확인」을 누르면 브라우저 알림도 닫힌다', e.notes[0] && e.notes[0].closed === true);
    check('B15 「확인」을 누르면 제목이 원래대로 돌아온다', e.doc.title === 'Mangoi', e.doc.title);
    const f = makeEnv({ role: 'teacher', me: 't1', focus: true, notif: 'granted' });
    f.on('admin-whisper', W());
    f.tick();
    check('B15 보고 있으면 브라우저 알림을 띄우지 않는다', f.notes.length === 0, JSON.stringify(f.notes));
    check('B15 보고 있으면 제목을 건드리지 않는다', f.doc.title === 'Mangoi', f.doc.title);
    const g = makeEnv({ role: 'teacher', me: 't1', focus: false, notif: 'default' });
    g.on('admin-whisper', W());
    check('B15 알림 권한이 없으면 브라우저 알림을 만들지 않는다', g.notes.length === 0, JSON.stringify(g.notes));
  }
  // B16 깜빡이는 도중 두 번째 글이 와도 돌아오면 제목이 원래대로
  {
    const e = makeEnv({ role: 'teacher', me: 't1', focus: false });
    e.on('admin-whisper', W());
    e.tick();                                    // 제목 = «새 메시지 (1)»
    e.on('admin-whisper', W({ message: 'second' }));
    e.st.focus = true;
    e.fireDoc('visibilitychange');
    check('B16 두 번째 글 뒤 돌아와도 제목이 원래대로 돌아온다', e.doc.title === 'Mangoi', e.doc.title);
  }
  // B17 화면 공유 중 — 카드·채팅·알림에 내용을 싣지 않고, 눌러야 보인다
  {
    const e = makeEnv({ role: 'teacher', me: 't1', sharing: true, focus: false, notif: 'granted' });
    e.on('admin-whisper', W({ message: 'SECRET NOTE' }));
    const c = e.card();
    check('B17 화면 공유 중이면 카드에 내용이 안 보인다', !!c && !/SECRET NOTE/.test(c.textContent), c ? c.textContent.slice(0, 120) : '(없음)');
    check('B17 화면 공유 중이라는 경고가 보인다', !!c && /화면 공유 중/.test(c.textContent));
    check('B17 채팅창 기록에도 내용이 없다', !e.chat.some(l => /SECRET NOTE/.test(l)), JSON.stringify(e.chat));
    check('B17 브라우저 알림에도 내용이 없다', e.notes.length === 1 && !/SECRET NOTE/.test(e.notes[0].opt.body), JSON.stringify(e.notes));
    btn(c, 'data-vcw-reveal').fire('click');
    check('B17 「내용 보기」를 누르면 그때 보인다', /SECRET NOTE/.test(e.card().textContent));
    const n = makeEnv({ role: 'teacher', me: 't1' });
    n.on('admin-whisper', W({ message: 'PLAIN NOTE' }));
    check('B17 (짝) 공유 중이 아니면 바로 보인다', /PLAIN NOTE/.test(n.card().textContent) && !btn(n.card(), 'data-vcw-reveal'));
  }
  // B18 수업을 나가면 카드를 치운다 — 다만 «수업 중에 그린» 카드만
  {
    const e = makeEnv({ role: 'teacher', me: 't1', inCall: true });
    e.on('admin-whisper', W());
    e.st.inCall = false;
    e.tick();
    check('B18 수업을 나가면 카드가 사라진다', !e.card());
    check('B18 나가서 치울 때는 «읽음» 을 보내지 않는다', e.sent.length === 0, JSON.stringify(e.sent));
    check('B18 카드가 없어지면 확인 타이머도 멈춘다', e.intervals.size === 0, String(e.intervals.size));
    const f = makeEnv({ role: 'teacher', me: 't1', inCall: false });
    f.on('admin-whisper', W());
    f.tick();
    check('B18 (짝) 처음부터 수업 표시가 없던 화면의 카드는 저절로 안 지운다', !!f.card());
  }
  // B19 자동 번역이 보낸 사람의 글을 바꾸지 않게
  {
    const e = makeEnv({ role: 'teacher', me: 't1' });
    e.on('admin-whisper', W());
    check('B19 카드에 translate="no" 가 붙는다', e.card() && e.card().getAttribute('translate') === 'no');
  }
  ranB++;
} catch (e) {
  check('B 절 실행 중 예외가 없다', false, e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : String(e));
}
check('B 절이 실제로 돌았다 (전제)', ranB === 2);

/* 정적 안전장치 */
console.log('\n[ C. 화면 정적 안전장치 ]');
{
  const code = strip(WH_SRC);
  check('innerHTML 로 글을 넣지 않는다 (보낸 사람이 쓴 글이 HTML 이 되면 XSS)', !/\.innerHTML\s*=/.test(code));
  check('opacity:0 으로 시작하지 않는다 (백그라운드 탭에서 «영영 안 보임»)', !/opacity\s*:\s*0\s*[;'"]/.test(code));
  check('브라우저 알림 권한을 «저절로» 묻지 않는다 (버튼 안에서만)',
        (code.match(/requestPermission\(\)/g) || []).length === 1 && /tap\(nb,[\s\S]{0,120}?requestPermission\(\)/.test(code));
  check('index.html 이 새 버전(?v=)으로 부른다 (defer)', /idx-whisper\.js\?v=([4-9]|\d{2,})"\s+defer/.test(R('cloudflare-deploy/public/index.html')));
}

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); for (const f of FAILS) console.log('   · ' + f); }
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
