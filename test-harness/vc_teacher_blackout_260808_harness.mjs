// -*- coding: utf-8 -*-
// 🎥 「교사가 구글·교재·카톡을 열 때마다 화면이 black-out 된다」 하네스 (마이마이 1·3·6번, 2026-08-08)
//   실행: node test-harness/vc_teacher_blackout_260808_harness.mjs
//
//   [원인] index.html 의 vcBackgroundThrottle 이 탭이 가려지는 순간 카메라 트랙을 껐다.
//          «학생 휴대폰 배터리 절약» 으로 만든 코드인데, 교사는 수업 중 구글·카톡·교재를
//          끊임없이 오가므로 교사에게는 «선생님이 사라지는» 사고가 된다.
//
//   ⚠️ 이 하네스는 «그 글자가 있는지» 를 보지 않는다. index.html 에서 그 함수를 **떼어내
//      실제로 실행**하고, 탭 전환 이벤트를 쏴서 카메라 트랙이 어떻게 되는지 관찰한다.
//      (글자로 박아 두면 옳은 리팩터링이 하네스를 깨서 되돌리게 만든다)
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(resolve(__dir, '../cloudflare-deploy/public/index.html'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${!cond && extra !== undefined ? '  → ' + JSON.stringify(extra) : ''}`);
}

// ── 대상 함수만 떼어낸다 ────────────────────────────────────────────────
const START = '(function vcBackgroundThrottle(){';
const i0 = html.indexOf(START);
if (i0 < 0) { console.log('❌ vcBackgroundThrottle 를 찾지 못했습니다 (이름이 바뀌었나요?)'); process.exit(1); }
const i1 = html.indexOf('\n})();', i0);
if (i1 < 0) { console.log('❌ 함수 끝을 찾지 못했습니다'); process.exit(1); }
const SRC = html.slice(i0, i1 + '\n})();'.length);

/* 가짜 브라우저 위에서 그 함수를 돌리고, 탭 전환을 흉내낸다.
   ⚠️ 브라우저에서는 `window.vcLocalStream` 과 맨 이름 `vcLocalStream` 이 **같은 전역**이다.
      코드가 `if (window.vcLocalStream) vcLocalStream.getVideoTracks()` 처럼 두 표기를 섞어 쓰므로,
      컨텍스트 객체 자신을 window 로 두지 않으면(ctx.window = ctx) 맨 이름이 ReferenceError 가 나고
      try/catch 에 먹혀 **아무 일도 안 하는데 통과한 것처럼** 보인다. 실제로 한 번 속았다. */
function makeCtx({ staff, camOn = true, aaoActive = false, inCall = true }) {
  const listeners = {};
  const track = { kind: 'video', enabled: true };
  const sent = [];
  const ctx = {
    console,
    document: {
      visibilityState: 'visible',
      body: { classList: { contains: (c) => inCall && c === 'vc-in-call' } },
      addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
    },
    __vcAAO: { active: aaoActive },
    vcLocalStream: { getVideoTracks: () => [track] },
    vcBg: undefined,
    vcIsStaffNow: () => staff,
    vcCamOn: camOn,
    vcBroadcastCamState: (on, reason) => sent.push({ on, reason }),
    addEventListener: (t, f) => { (listeners[t] = listeners[t] || []).push(f); },
  };
  ctx.window = ctx;              // ← 브라우저와 같게: window.x 와 x 가 한 몸
  vm.createContext(ctx);
  vm.runInContext(SRC, ctx);
  const fire = (state) => {
    ctx.document.visibilityState = state;
    (listeners.visibilitychange || []).forEach((f) => f());
  };
  return { fire, track, sent, ctx };
}
const run = makeCtx;

console.log('\n[ 🔴 교사 — 탭을 옮겨도 얼굴이 계속 나가야 한다 (1·3·6번) ]');
{
  const t = run({ staff: true });
  t.fire('hidden');
  check('교사가 구글/카톡/교재로 옮겨도 카메라가 꺼지지 않는다', t.track.enabled === true, { enabled: t.track.enabled });
  t.fire('visible');
  check('돌아와도 그대로 켜져 있다', t.track.enabled === true);
  check('교사에 대해서는 cam-state 를 쏘지 않는다 (끈 적이 없으니 알릴 것도 없다)', t.sent.length === 0, t.sent);
}

console.log('\n[ 🔋 학생 — 배터리 절약은 그대로 남아 있어야 한다 (없애면 폰이 뜨거워진다) ]');
{
  const s = run({ staff: false });
  s.fire('hidden');
  check('학생이 탭을 옮기면 카메라가 꺼진다 (기존 절약 유지)', s.track.enabled === false, { enabled: s.track.enabled });
  check('📢 상대에게 «꺼졌다» 를 알린다 (안 알리면 검은 사각형=고장으로 보인다)',
    s.sent.some((x) => x.on === false), s.sent);
  s.fire('visible');
  check('돌아오면 다시 켜진다', s.track.enabled === true);
  check('📢 «다시 켜졌다» 도 알린다', s.sent.some((x) => x.on === true), s.sent);
}

console.log('\n[ 🔒 카메라를 손수 꺼 둔 사람 — 탭 다녀왔다고 저절로 켜지면 안 된다 ]');
{
  const u = run({ staff: false, camOn: false });
  u.track.enabled = false;             // 사용자가 이미 꺼 둔 상태
  u.fire('hidden');
  u.fire('visible');
  check('🔴 동의 없이 카메라가 다시 켜지지 않는다', u.track.enabled === false, { enabled: u.track.enabled });
}

console.log('\n[ 📶 저대역 음성전용(AAO) 중 — 복구는 AAO 가 한다. 여기서 건드리면 안 된다 ]');
{
  const a = run({ staff: false, camOn: true, aaoActive: true });
  a.track.enabled = false;             // AAO 가 꺼 둔 상태
  a.fire('visible');
  check('🔴 AAO 가 꺼 둔 영상을 탭 복귀가 되살리지 않는다', a.track.enabled === false, { enabled: a.track.enabled });
}

console.log('\n[ 🛡 수업 중이 아닐 때는 아무 일도 하지 않는다 ]');
{
  const n = run({ staff: false, inCall: false });
  n.fire('hidden');
  check('수업 밖에서는 카메라를 건드리지 않는다', n.track.enabled === true, { enabled: n.track.enabled });
}

console.log('\n[ 🧪 하네스 자체가 «진짜로 돌고 있는가» — 헛통과 방지 ]');
{
  // 학생 경로가 실제로 트랙을 만지는 걸 확인했으니, 스텁이 안 불려 조용히 통과할 수는 없다.
  const probe = run({ staff: false });
  probe.fire('hidden');
  check('가짜 브라우저에서 코드가 실제로 트랙에 닿는다 (닿지 않으면 위 검사 전부 무의미)',
    probe.track.enabled === false && probe.sent.length > 0, { enabled: probe.track.enabled, sent: probe.sent });
}

console.log('\n[ 🧷 곁가지 규칙 ]');
check('강사 판정은 정본(vcIsStaffNow) 하나만 쓴다 — 역할을 여기서 다시 추측하지 않는다',
  /vcIsStaffNow/.test(SRC) && !/vcMyRole\s*===/.test(SRC));
check('한 번만 등록된다 (중복 등록 가드)', /__vcBgThrottle/.test(SRC));
// AAO 본체는 이 수정과 별개 — 지워지지 않았는지 확인(CLAUDE.md: AAO 제거 금지)
check('⛔ 저대역 음성전용(AAO) 이 지워지지 않았다', /function vcAAOApply/.test(html) && /vcBroadcastCamState\(false, 'aao'\)/.test(html));

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach((f) => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
