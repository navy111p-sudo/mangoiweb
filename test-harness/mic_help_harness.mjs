// mic_help_harness.mjs — «🎤 마이크 인식이 안 되시나요?» 안내 (js/mic-help.js, 2026-11-10)
//
// 문자열이 아니라 그 파일을 가짜 브라우저(vm)에서 «실제로 돌려» 본다:
//  A. 페이지의 getUserMedia 결과를 바꾸지 않는다(성공은 그대로 성공, 실패는 그대로 같은 에러) — 짝
//  B. 오디오 실패면 알림을 띄우고, 오디오가 아닌 요청(카메라만)이나 성공에는 안 띄운다 — 짝
//  C. 에러 이름 → 사유(권한 거부·마이크 없음·사용 중) 판정
//  D. SpeechRecognition 감싸기: 같은 객체·같은 프로토타입, 'not-allowed' 는 알리고 'no-speech' 는 안 알림
//  E. 수업 안 iframe 에서는 상시 버튼을 안 띄운다(문제가 생기면 알림은 뜬다)
//  F. 마이크 화면 5곳이 그 파일을 싣는다
//  G. 변이: 위 판정을 실제로 깨면 FAIL 이 나는가
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public');
const SRC = readFileSync(join(PUB, 'js/mic-help.js'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, ok, why = '') { if (ok) PASS++; else { FAIL++; FAILS.push(name + (why ? ' — ' + why : '')); } console.log((ok ? '  ✅ ' : '  ❌ ') + name); }

function makeEl(tag) {
  const e = {
    tagName: tag.toUpperCase(), attrs: {}, children: [], innerHTML: '', textContent: '', style: {}, listeners: {},
    classList: { set: new Set(), add(c) { this.set.add(c); }, remove(c) { this.set.delete(c); }, toggle(c, f) { f ? this.set.add(c) : this.set.delete(c); }, contains(c) { return this.set.has(c); } },
    setAttribute(k, v) { this.attrs[k] = v; if (k === 'id') this.id = v; }, getAttribute(k) { return this.attrs[k] ?? null; },
    addEventListener(t, f) { (this.listeners[t] ||= []).push(f); }, appendChild(c) { this.children.push(c); c.parentNode = this; return c; },
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter((x) => x !== this); this.parentNode = null; },
    querySelector() { return null; }, querySelectorAll() { return []; },
    offsetWidth: 190, offsetHeight: 34, contains(x) { return x === this; }, closest() { return null; },
  };
  return e;
}

/** 가짜 브라우저에서 src 를 돌린다. gum: (constraints) => Promise. */
async function boot(src, { gum, inFrame = false, SR, efp } = {}) {
  const body = makeEl('body'), head = makeEl('head');
  const byId = (root, id) => { for (const c of root.children) { if (c.id === id) return c; const r = byId(c, id); if (r) return r; } return null; };
  const document = {
    body, head, documentElement: makeEl('html'),
    createElement: makeEl, getElementById: (id) => byId(body, id) || byId(head, id),
    addEventListener() {}, removeEventListener() {},
  };
  if (efp) document.elementsFromPoint = efp;
  const mediaDevices = { getUserMedia: gum || (() => Promise.resolve({ getTracks: () => [] })) };
  const win = { document, navigator: { userAgent: 'Mozilla/5.0 (Windows NT 10.0) Chrome/130', mediaDevices, maxTouchPoints: 0 }, location: { reload() {} } };
  Object.assign(win, { innerWidth: 390, innerHeight: 844, addEventListener() {} });
  win.window = win; win.self = win; win.top = inFrame ? {} : win;
  if (SR) win.webkitSpeechRecognition = SR;
  vm.runInNewContext(src, Object.assign(win, { setTimeout, clearTimeout, setInterval: () => 0, requestAnimationFrame: () => 0, cancelAnimationFrame() {} }));
  await new Promise((r) => setTimeout(r, 0));
  return { win, body, mediaDevices, find: (id) => byId(body, id) };
}

async function suite(src, quiet) {
  const bad = [];
  const ok = (name, cond) => { if (!cond) bad.push(name); if (!quiet) check(name, cond); };

  // A·B — 실패는 그대로 같은 에러로, 알림은 뜬다
  const err = Object.assign(new Error('x'), { name: 'NotAllowedError' });
  let b = await boot(src, { gum: () => Promise.reject(err) });
  ok('E 일반 페이지에는 상시 버튼이 뜬다', !!b.find('mgmh-pill'));
  let got = null;
  try { await b.mediaDevices.getUserMedia({ audio: true }); } catch (e) { got = e; }
  await new Promise((r) => setTimeout(r, 0));
  ok('A 실패는 같은 에러 객체로 그대로 던진다', got === err);
  ok('B 오디오 실패 → 큰 알림이 뜬다', !!b.find('mgmh-alert'));
  ok('B 오디오 실패 → 버튼이 빨갛게 바뀐다', !!b.find('mgmh-pill') && b.find('mgmh-pill').classList.contains('mgmh-hot'));
  ok('C 권한 거부 사유를 말한다', /차단/.test(b.find('mgmh-alert')?.innerHTML || ''));

  const stream = { getTracks: () => [] };
  b = await boot(src, { gum: () => Promise.resolve(stream) });
  const s = await b.mediaDevices.getUserMedia({ audio: true });
  ok('A 성공은 같은 스트림을 그대로 돌려준다', s === stream);
  ok('B 성공에는 알림을 안 띄운다', !b.find('mgmh-alert'));

  b = await boot(src, { gum: () => Promise.reject(Object.assign(new Error(), { name: 'NotAllowedError' })) });
  try { await b.mediaDevices.getUserMedia({ video: true }); } catch {}
  await new Promise((r) => setTimeout(r, 0));
  ok('B 카메라만 요청한 실패에는 마이크 알림을 안 띄운다', !b.find('mgmh-alert'));

  for (const [name, re] of [['NotFoundError', /찾지 못/], ['NotReadableError', /다른 프로그램/]]) {
    b = await boot(src, { gum: () => Promise.reject(Object.assign(new Error(), { name })) });
    try { await b.mediaDevices.getUserMedia({ audio: true }); } catch {}
    await new Promise((r) => setTimeout(r, 0));
    ok(`C ${name} → 맞는 사유`, re.test(b.find('mgmh-alert')?.innerHTML || ''));
  }

  // D — SpeechRecognition
  function FakeSR() { this.ls = []; this.addEventListener = (t, f) => this.ls.push(f); }
  FakeSR.prototype.start = function () {};
  b = await boot(src, { SR: FakeSR });
  const r = new b.win.webkitSpeechRecognition();
  ok('D 감싼 생성자도 같은 프로토타입의 객체를 준다', r instanceof FakeSR && typeof r.start === 'function');
  r.ls.forEach((f) => f({ error: 'no-speech' }));
  ok('D no-speech(말을 안 함)에는 알리지 않는다', !b.find('mgmh-alert'));
  r.ls.forEach((f) => f({ error: 'not-allowed' }));
  ok('D not-allowed 에는 알린다', !!b.find('mgmh-alert'));

  // E — iframe
  b = await boot(src, { inFrame: true, gum: () => Promise.reject(Object.assign(new Error(), { name: 'NotAllowedError' })) });
  ok('E 수업 안 iframe 에는 상시 버튼이 없다', !b.find('mgmh-pill'));
  try { await b.mediaDevices.getUserMedia({ audio: true }); } catch {}
  await new Promise((r) => setTimeout(r, 0));
  ok('E iframe 에서도 문제가 생기면 알림은 뜬다', !!b.find('mgmh-alert'));
  // P — 자리 고르기: 왼쪽 아래에 버튼이 있으면 그 자리를 피한다(짝: 비어 있으면 왼쪽 아래)
  const btn = { closest: () => btn };
  b = await boot(src, { efp: (x, y) => (x < 200 && y > 780 ? [btn] : []) });
  const pl = b.find('mgmh-pill');
  ok('P 왼쪽 아래 버튼이 있으면 다른 자리로 옮긴다', pl && pl.style.left !== '12px' && pl.style.visibility !== 'hidden');
  b = await boot(src, { efp: () => [] });
  ok('P 비어 있으면 왼쪽 아래', b.find('mgmh-pill')?.style.left === '12px' && b.find('mgmh-pill')?.style.top === (844 - 12 - 34) + 'px');
  b = await boot(src, { efp: () => [btn] });
  ok('P 어디나 막히면 가린다(버튼을 덮지 않음)', b.find('mgmh-pill')?.style.visibility === 'hidden');
  return bad;
}

console.log('— 실제 실행');
await suite(SRC, false);

console.log('— F 화면 연결');
for (const f of ['warmup.html', 'ai-friend.html', 'speech-coach.html', 'speech-coach-cn.html', 'ai-class.html']) {
  check(`F ${f} 가 mic-help.js 를 싣는다`, /<script\s+defer\s+src="\/js\/mic-help\.js\?v=\d+"/.test(readFileSync(join(PUB, f), 'utf8')));
}

console.log('— G 변이');
const MUT = [
  ['실패를 삼킨다', 'p.then(null, function (err) {', 'p = p.then(null, function (err) {'],
  ['오디오 조건 제거', 'if (c && c.audio) p.then', 'if (c) p.then'],
  ['권한 거부 판정 뒤집기', "name === 'NotAllowedError' ||", "name === 'NotAllowedErrorX' ||"],
  ['SR no-speech 도 알림', "c === 'not-allowed' || c === 'service-not-allowed'", "c === 'not-allowed' || c === 'no-speech'"],
  ['iframe 에도 버튼', 'if (inFrame || pill', 'if (pill'],
  ['버튼 위도 그냥 둔다', 'if (c && c !== document.body && !pill.contains(c)) return true;', ''],
];
for (const [name, from, to] of MUT) {
  if (!SRC.includes(from)) { check(`G 변이 앵커: ${name}`, false, '앵커를 못 찾음'); continue; }
  const bad = await suite(SRC.replace(from, to), true).catch((e) => ['던짐: ' + e.message]);
  check(`G 변이가 잡힌다: ${name}`, bad.length > 0);
}

console.log(`\n${FAIL === 0 ? '🎉' : '💥'} mic_help_harness — PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('\n실패 목록:'); FAILS.forEach((f) => console.log('  · ' + f)); }
process.exit(FAIL ? 1 : 0);
