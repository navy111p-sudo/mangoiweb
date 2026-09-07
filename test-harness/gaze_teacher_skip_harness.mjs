/* ══════════════════════════════════════════════════════════════════════════
   gaze_teacher_skip_harness — 교사 기기에서는 시선 측정을 하지 않는다
                               (public/js/mango-gaze.js, 2026-09-07 사장님 지시)

   [무엇을 지키나]
     · 교사 기기 → MediaPipe 를 **로드조차 하지 않는다**(모델 3.58MB)
     · 학생 기기 → **그대로 측정한다** ← 짝 검사. 없으면 «전부 끄기» 회귀가 통과한다
     · 역할이 늦게 와서 교사로 밝혀지면 → 그 자리에서 멈추고 **아무것도 보내지 않는다**
     · 모르면 → 측정한다(안전한 실패는 «학생 지표를 잃지 않는» 쪽)

   [왜 문자열 검사로는 안 되나] 함수도 조건도 다 «있고» 틀릴 수 있는 것은
     «누가 재고 누가 안 재는가» 뿐이다. 그래서 모듈을 가짜 DOM 에 올려 **실제로 돌린다.**
     ⚠️ 이 모듈은 top-level IIFE 라 import 로 못 부른다 → new Function 으로 실행하고
        window.MangoGaze 손잡이와 «MediaPipe 를 부르려 했는가» 로 판정한다.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC_FILE = process.env.GTS_SRC_FILE
  || path.join(ROOT, 'cloudflare-deploy/public/js/mango-gaze.js');
const HTML_FILE = path.join(ROOT, 'cloudflare-deploy/public/index.html');

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  →  ' + detail : ''}`); }
}
const src = fs.readFileSync(SRC_FILE, 'utf8');

/* ── 가짜 브라우저 ────────────────────────────────────────────────────
   ⚠️ 이 모듈은 body class 를 MutationObserver 로 지켜본다(원래 있던 것).
      가짜에서도 그것을 흉내내야 start 경로가 실제로 돈다. */
function makeEnv({ teacher, optIn = false, disabled = false, roleLate = false } = {}) {
  const store = {};
  if (optIn) store.mango_gaze_teacher = 'on';
  if (disabled) store.mango_gaze_disabled = '1';

  const calls = { loadLandmarker: 0, beacon: 0, fetchGaze: 0, detect: 0 };
  let roleIsTeacher = roleLate ? false : teacher;   // 늦게 오는 역할 흉내

  const timers = [];
  let nowMs = 1_000_000;

  const videoEl = { readyState: 4, paused: false, ended: false, tagName: 'VIDEO', id: 'vc-local-video' };
  const bodyCls = new Set(['vc-in-call']);
  const body = {
    classList: { contains: (c) => bodyCls.has(c), add: (c) => bodyCls.add(c), remove: (c) => bodyCls.delete(c) }
  };
  const doc = {
    readyState: 'complete',
    body,
    addEventListener() {},
    getElementById: (id) => (id === 'vc-local-video' ? videoEl : null),
    querySelector: () => videoEl,
    querySelectorAll: () => [videoEl]
  };
  const win = {
    vcRoomId: 'class-1-20260907',
    vcUserId: 'u_test',
    vcLocalStream: {},
    vcIsObserver: false,
    MangoV3: { userId: 'u_test' },
    vcIsTeacherRole: () => roleIsTeacher,
    addEventListener() {},
    location: { origin: 'https://mangoi.ai' }
  };
  const ls = {
    getItem: (k) => (k in store ? store[k] : null),
    setItem: (k, v) => { store[k] = String(v); },
    removeItem: (k) => { delete store[k]; }
  };
  const nav = {
    sendBeacon: (url) => { if (String(url).includes('gaze-score')) calls.beacon++; return true; }
  };
  const fetchFn = async (url) => {
    if (String(url).includes('gaze-score')) calls.fetchGaze++;
    if (String(url).includes('vision_bundle') || String(url).includes('mediapipe')) calls.loadLandmarker++;
    return { ok: true, json: async () => ({}) };
  };
  /* MediaPipe 는 동적 import 로 온다 → import 를 가로채 «부르려 했는가» 를 센다.
     여기서 던지면 모듈이 「MediaPipe 로드 실패 → 비활성」 경로로 조용히 빠진다(원래 설계). */
  const importShim = async (spec) => { calls.loadLandmarker++; throw new Error('no-net(harness)'); };

  const api = {
    calls,
    revealTeacher() { roleIsTeacher = true; },
    tick(ms) {                                   // setInterval 흉내 — 실제로 콜백을 돌린다
      nowMs += ms;
      for (const t of timers) {
        if (t.cleared) continue;
        t.acc += ms;
        while (t.acc >= t.ms) { t.acc -= t.ms; if (!t.cleared) t.fn(); }
      }
    },
    get now() { return nowMs; }
  };

  const g = {
    window: win, document: doc, localStorage: ls, navigator: nav, fetch: fetchFn,
    console: { log() {}, warn() {}, error() {} },
    setInterval: (fn, ms) => { const t = { fn, ms, acc: 0, cleared: false }; timers.push(t); return t; },
    clearInterval: (t) => { if (t) t.cleared = true; },
    setTimeout: (fn) => { return { fn }; },       // 폴링 대기는 돌리지 않는다
    Date: { now: () => nowMs },
    performance: { now: () => nowMs },
    Blob: function () {},
    MutationObserver: function (cb) { this.observe = () => {}; this.disconnect = () => {}; this._cb = cb; },
    __import: importShim
  };
  return { g, api, win };
}

function runModule(env) {
  const { g } = env;
  /* 동적 import 를 가로챈다 — new Function 안에서는 import() 가 못 쓰이므로 치환한다. */
  const patched = src.replace(/\bimport\(/g, '__import(');
  const fn = new Function(
    'window', 'document', 'localStorage', 'navigator', 'fetch', 'console',
    'setInterval', 'clearInterval', 'setTimeout', 'Date', 'performance', 'Blob',
    'MutationObserver', '__import',
    patched
  );
  fn(g.window, g.document, g.localStorage, g.navigator, g.fetch, g.console,
     g.setInterval, g.clearInterval, g.setTimeout, g.Date, g.performance, g.Blob,
     g.MutationObserver, g.__import);
  return g.window.MangoGaze;
}

/* ── ⓪ 전제 — 모듈이 실제로 실행됐는가 ────────────────────────────────
   ⚠️ 이 절이 없으면 «아무것도 안 돈» 상태에서 아래 검사가 전부 통과한다. */
console.log('\n⓪ 가짜 브라우저에서 모듈이 실제로 실행된다');
{
  const env = makeEnv({ teacher: false });
  const gz = runModule(env);
  ok(gz && typeof gz.start === 'function' && typeof gz.status === 'function',
    'window.MangoGaze 손잡이가 붙는다 (모듈이 끝까지 돌았다)');
}

/* ── ① 학생 — 그대로 잰다 (짝 검사) ─────────────────────────────────── */
console.log('\n① 학생 기기는 그대로 측정한다 — 이 절이 없으면 «전부 끄기» 가 통과한다');
{
  const env = makeEnv({ teacher: false });
  const gz = runModule(env);
  await gz.start();
  ok(env.api.calls.loadLandmarker > 0,
    '학생이면 MediaPipe 를 부른다 (측정 시작)', JSON.stringify(env.api.calls));
}

/* ── ② 교사 — 아예 시작하지 않는다 ─────────────────────────────────── */
console.log('\n② 교사 기기는 MediaPipe 로드조차 하지 않는다 (모델 3.58MB)');
{
  const env = makeEnv({ teacher: true });
  const gz = runModule(env);
  await gz.start();
  ok(env.api.calls.loadLandmarker === 0,
    '교사면 MediaPipe 를 아예 안 부른다', JSON.stringify(env.api.calls));
  ok(env.api.calls.beacon === 0 && env.api.calls.fetchGaze === 0,
    '교사면 /api/gaze-score 로 아무것도 안 보낸다', JSON.stringify(env.api.calls));
  ok(gz.status().running === false, '측정이 돌지 않는다', JSON.stringify(gz.status()));
}

/* ── ③ 되돌리는 스위치 ─────────────────────────────────────────────── */
console.log("\n③ localStorage 'mango_gaze_teacher'='on' 이면 교사도 다시 측정한다");
{
  const env = makeEnv({ teacher: true, optIn: true });
  const gz = runModule(env);
  await gz.start();
  ok(env.api.calls.loadLandmarker > 0, '스위치를 켜면 교사도 잰다', JSON.stringify(env.api.calls));
}

/* ── ④ 모르면 잰다 (안전한 실패 방향) ──────────────────────────────────
   ⚠️ 250kbps 상한과 방향이 «반대» 다. 거기는 «안 낮추는» 쪽이 안전했고
      여기는 «측정하는» 쪽이 안전하다(학생 지표를 잃지 않는다). */
console.log('\n④ 역할을 모르면 «측정하는» 쪽으로 실패한다');
{
  const env = makeEnv({ teacher: false });
  delete env.win.vcIsTeacherRole;                  // 판정 함수가 아예 없음
  const gz = runModule(env);
  await gz.start();
  ok(env.api.calls.loadLandmarker > 0, '판정 함수가 없으면 그대로 잰다', JSON.stringify(env.api.calls));

  const env2 = makeEnv({ teacher: false });
  env2.win.vcIsTeacherRole = () => { throw new Error('role unknown'); };
  const gz2 = runModule(env2);
  await gz2.start();
  ok(env2.api.calls.loadLandmarker > 0, '판정이 던져도 그대로 잰다', JSON.stringify(env2.api.calls));
}

/* ── ⑤ 기존 스위치를 안 깨뜨렸는가 ─────────────────────────────────── */
console.log("\n⑤ 원래 있던 'mango_gaze_disabled' 스위치가 그대로 산다");
{
  const env = makeEnv({ teacher: false, disabled: true });
  const gz = runModule(env);
  await gz.start();
  ok(env.api.calls.loadLandmarker === 0, '완전 비활성 스위치는 그대로', JSON.stringify(env.api.calls));
}

/* ── ⑥ 소스 계약 — 위치와 방향 ──────────────────────────────────────
   ⚠️ 「그 함수가 있는가」가 아니라 «어디에 있는가/무엇을 하는가» 를 본다. */
console.log('\n⑥ 소스 계약 — 늦게 오는 역할·전송 금지·끝이 있는 확인');
{
  const clean = src.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
  ok(/function abortForTeacher\s*\(/.test(src), '교사로 밝혀졌을 때의 정지 함수가 있다');
  const ab = src.slice(src.indexOf('function abortForTeacher'), src.indexOf('async function start()'));
  ok(/sessionTotal\s*=\s*0/.test(ab) && /sessionForward\s*=\s*0/.test(ab),
    '멈출 때 모은 샘플을 0 으로 되돌린다 (pagehide 비콘이 교사 점수를 보내지 못하게)', ab.slice(0, 80));
  ok(!/sendFinalBeacon/.test(ab), '멈출 때 아무것도 보내지 않는다');
  ok(/roleRecheckUntil\s*=\s*Date\.now\(\)\s*\+\s*ROLE_RECHECK_MS/.test(clean),
    '시작할 때 «끝이 있는» 재확인 창을 연다');
  ok(/ROLE_RECHECK_MS\s*=\s*30_000|ROLE_RECHECK_MS\s*=\s*30000/.test(clean),
    '그 창은 30초다');
  /* 이름 휴리스틱을 여기서 다시 만들지 않았는가 — 정본(vcIsTeacherRole)만 본다 */
  const dev = src.slice(src.indexOf('function isTeacherDevice'), src.indexOf('// 메인 페이지의 top-level'));
  ok(!/teacher\|강사|선생님/.test(dev) || /vcIsTeacherRole/.test(dev),
    '판정을 복제하지 않고 정본 vcIsTeacherRole 만 쓴다');
}

/* ── ⑦ 늦게 오는 역할 — 도중에 교사로 밝혀지면 멈추고 안 보낸다 ─────── */
console.log('\n⑦ 시작 뒤 역할이 «교사» 로 밝혀지면 멈추고 아무것도 안 보낸다');
{
  const env = makeEnv({ teacher: true, roleLate: true });
  const gz = runModule(env);
  await gz.start();
  ok(env.api.calls.loadLandmarker > 0, '역할이 아직 안 왔으므로 일단 시작한다', JSON.stringify(env.api.calls));
  /* 이 하니스 환경은 MediaPipe 가 없어 landmarker 가 null → detectOnce 가 첫 줄에서 돌아간다.
     그래서 «검출 루프» 대신 정지 계약을 소스로 확인한다(위 ⑥절)과 짝. */
  env.api.revealTeacher();
  ok(typeof gz.stop === 'function', '멈출 수단이 노출돼 있다');
  await gz.stop();
  ok(env.api.calls.beacon === 0 && env.api.calls.fetchGaze === 0,
    '샘플이 없으면 최종 비콘도 나가지 않는다', JSON.stringify(env.api.calls));
}

/* ── ⑧ 배선 ────────────────────────────────────────────────────────── */
console.log('\n⑧ index.html 이 새 판을 싣는가');
{
  const html = fs.readFileSync(HTML_FILE, 'utf8');
  const m = html.match(/mango-gaze\.js\?v=(\d+)/);
  ok(!!m, 'index.html 이 mango-gaze.js 를 싣는다');
  ok(m && Number(m[1]) >= 37, `?v= 가 37 이상이다 (실측 ${m ? m[1] : '-'})`);
}

/* ── ⑨ 「무엇이 줄어드나」를 부풀려 적지 않았는가 ──────────────────────
   이 저장소가 실제로 밟은 오해다 — 「화면 크기 = 용량」. 같은 실수를 여기서 반복하지 않는다. */
console.log('\n⑨ 소스가 효과를 부풀리지 않는다');
{
  ok(/트래픽이 줄어든다.*요약하지 말|매 수업 반복되는 트래픽은 거의 그대로/.test(src.replace(/\s+/g, ' ')),
    '「트래픽이 줄어든다」로 요약하지 말라는 경고가 있다');
  ok(/wasm 크기는 이 저장소에서 못 쟀다/.test(src), '못 잰 값을 «못 쟀다» 고 적어 두었다');
}

console.log(`\n👁 gaze_teacher_skip_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
