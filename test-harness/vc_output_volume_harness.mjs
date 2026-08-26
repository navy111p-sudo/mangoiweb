// vc_output_volume_harness.mjs — 화상수업 «출력 음량» 이 실제로 소리를 «크게» 하는지 (2026-08-26)
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 제보는 「볼륨을 올려도 소리가 안 커진다」였다(안드로이드 삼성 — 하드웨어 볼륨키가 "통화"
// 스트림을 움직이는데 실제 출력은 "미디어" 스트림을 따라간다). 그런데 처음 붙은 대책은
// **0~100% 슬라이더**였다. `HTMLMediaElement.volume` 은 상한이 1(=지금 소리)이라
// «작게» 만 되고 «크게» 는 안 된다 — 즉 그 기능은 **제보를 하나도 풀지 못한다.**
// 화면에는 슬라이더가 멀쩡히 보이고 값도 저장되므로 «고쳐졌다» 로 읽히는 것이 더 나쁘다.
//
// 두 번째 사고는 «값이 유지되지 않는» 것이었다. idx-main.js 에는 소리 자가복구가 둘 있고
//   · vcEnsureRemoteAudio : 수업 중 아무 터치·키 입력마다
//   · vcAudioWatchdog     : 3초마다
// 둘 다 `volume = 1` 로 되돌린다. 그래서 학생이 값을 내려도 화면을 한 번 만지면 튕겨 올라갔다.
// 「기능도 있고 값도 저장되는데 아무 일도 안 일어난다」 — 문자열 하니스가 제일 못 보는 모양이다.
//
// ── 이 하니스가 못 박는 것 ──────────────────────────────────────────────────
//   ① 슬라이더 상한이 100 이 아니다 (100 이면 제보를 못 푼다)
//   ② 100% 초과 구간을 WebAudio GainNode 로 «실제로» 증폭한다
//   ③ 자가복구 두 곳이 하드코딩 1 로 되돌아가지 않는다 (되돌리면 곧바로 FAIL)
//   ④ 같은 소리를 두 번 증폭하지 않는다 (보조 오디오는 같은 트랙을 새 스트림에 담는다)
//   ⑤ 상주 setInterval·body class 감시를 쓰지 않는다 (CLAUDE.md 금지 두 건)
//   ⑥ 실패하면 «고치기 전» 으로 되돌아간다 (AudioContext 가 running 이 아니면 증폭 안 함)
//   ⑦ 값 저장·범위 제한은 **파일을 실제로 실행해서** 확인한다
//
// 실행: node test-harness/vc_output_volume_harness.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}

const vol  = readFileSync(join(PUB, 'js', 'idx-vc-outputvolume.js'), 'utf8');
const dock = readFileSync(join(PUB, 'js', 'vc-dock.js'), 'utf8');
const main = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8');
const html = readFileSync(join(PUB, 'index.html'), 'utf8');

/* 주석을 벗긴 사본 — 「이 글자가 없어야 한다」류 검사는 반드시 이쪽으로 본다
   (CLAUDE.md: 부정 검사가 자기 설명 주석을 잡는 함정). */
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const volCode = strip(vol);

console.log('\n🔊 화상수업 출력 음량 검사\n');

/* ── ① 슬라이더가 «크게» 를 할 수 있는가 ─────────────────────────────────── */
const sliderTag = (dock.match(/<input[^>]*id="sg-out-vol"[^>]*>/) || [''])[0];
check('① 설정 팝업에 출력 음량 슬라이더가 있다', !!sliderTag);
const maxAttr = Number((sliderTag.match(/max="(\d+)"/) || [])[1]);
check('① 슬라이더 상한이 100% 가 아니다 (100 이면 «작게» 만 되어 제보를 못 푼다)',
  maxAttr > 100, 'max=' + (maxAttr || '없음'));
check('① 지금 몇 % 인지 글자로 보여 준다 (슬라이더만으론 100%=원래 소리인지 알 수 없다)',
  /id="sg-out-vol-num"/.test(dock) && /sg-out-vol-num'\)[\s\S]{0,120}textContent/.test(dock));
check('① 슬라이더를 움직이는 그 자리에서 vcSetOutputVolume 을 부른다 (제스처 안에서 켜야 AudioContext 가 resume 된다)',
  /oninput\s*=\s*function[\s\S]{0,300}call\('vcSetOutputVolume'/.test(dock));

/* ── ② 100% 초과를 실제로 증폭하는가 ─────────────────────────────────────── */
check('② GainNode 로 증폭한다', /createGain\s*\(/.test(volCode));
check('② 원격 스트림을 WebAudio 로 받는다', /createMediaStreamSource\s*\(/.test(volCode));
check('② 100% 이하에서는 WebAudio 를 안 쓴다 (가장 단순한 경로 = 가장 안전한 경로)',
  /if\s*\(\s*v\s*>\s*1\s*\)\s*boostOn/.test(volCode) && /else\s*\{[^}]*applyPlain/.test(volCode));
check('② 크게 올렸을 때 소리가 찢어지지 않게 리미터를 둔다',
  /createDynamicsCompressor\s*\(/.test(volCode));

/* ── ③ idx-main.js 의 자가복구가 값을 되돌리지 않는가 ──────────────────────
   ⚠️ 이 절이 이 하니스의 핵심이다. 되돌리면(=하드코딩 1 로 복귀) 화면은 그대로인데
      기능만 조용히 죽는다 — 실제로 그 상태로 한 번 병합돼 있었다. */
check('③ vcOutVol() 정본이 idx-main.js 에 있다', /function\s+vcOutVol\s*\(/.test(main));
check('③ vcEnsureRemoteAudio 가 증폭 중에는 손을 뗀다 (안 그러면 음소거가 풀려 이중재생)',
  /function vcEnsureRemoteAudio\(\)\s*\{\s*\n?\s*if\s*\(window\.vcOutBoost\)\s*return;/.test(main));
const ensureBody = (main.match(/function vcEnsureRemoteAudio\(\)[\s\S]*?\n\}/) || [''])[0];
check('③ vcEnsureRemoteAudio 가 volume 을 하드코딩 1 로 되돌리지 않는다',
  !/\bvolume\s*=\s*1\s*;/.test(strip(ensureBody)),
  '되돌아왔다 — 학생이 고른 값이 화면을 만질 때마다 튕긴다');
const watchBody = (main.match(/\(function vcAudioWatchdog\(\)[\s\S]*?\n\}\)\(\);/) || [''])[0];
check('③ 3초 감시견도 volume 을 하드코딩 1 로 되돌리지 않는다',
  !/\bvolume\s*=\s*1\s*;/.test(strip(watchBody)),
  '되돌아왔다 — 3초마다 값이 튕긴다');
check('③ 3초 감시견이 «증폭 때문에 음소거된 것» 을 «소리 막힘» 으로 오판하지 않는다',
  /outputBlocked\s*=\s*window\.vcOutBoost\s*\?\s*false/.test(watchBody),
  '오판하면 「🔊 소리 켜기」 배너가 계속 뜨고 보조 오디오를 헛되이 만든다');

/* ── ④ 같은 소리를 두 번 증폭하지 않는가 ─────────────────────────────────── */
check('④ «스트림 id» 가 아니라 «오디오 트랙 id» 로 묶는다 (보조 오디오는 같은 트랙을 새 스트림에 담는다)',
  /getAudioTracks\s*\(\s*\)/.test(volCode) && /tracks\[0\]\.id/.test(volCode));
check('④ 증폭 중에는 element 를 음소거한다 (안 하면 element + WebAudio 이중재생)',
  /\.muted\s*=\s*true/.test(volCode));
check('④ 내 미리보기(#vc-local-box)는 건드리지 않는다', /#vc-local-box/.test(volCode));

/* ── ⑤ CLAUDE.md 금지 두 건 ──────────────────────────────────────────────── */
check('⑤ 상주 setInterval 을 두지 않는다 (홈에 머무는 학생 폰을 계속 깨운다)',
  !/setInterval\s*\(/.test(volCode),
  'CLAUDE.md 2장 「상주 setInterval 금지」');
check('⑤ body class 를 MutationObserver 로 지켜보지 않는다 (홈 전체를 멎게 한 전력)',
  !/observe\s*\(\s*document\.body/.test(volCode) && !/attributeFilter/.test(volCode));
check('⑤ 감시는 #vc-video-grid 로 범위를 좁힌다',
  /getElementById\('vc-video-grid'\)/.test(volCode) && /childList:\s*true/.test(volCode));
check('⑤ 수업을 나가면 감시를 끊고 증폭도 끈다',
  /watchOff\(\)[\s\S]{0,80}boostOff\(\)/.test(volCode));

/* ── ⑥ 실패하면 «고치기 전» 으로 ─────────────────────────────────────────── */
check('⑥ AudioContext 가 running 일 때만 증폭한다 (suspended 인 채 음소거하면 소리가 통째로 사라진다)',
  /state\s*!==\s*'running'/.test(volCode));
check('⑥ 증폭 실패 경로는 전부 applyPlain 으로 되돌아간다',
  (volCode.match(/applyPlain\(1\)/g) || []).length >= 4);
/* ⚠️ 순서 검사 — 값도 조건도 «있는» 채로 순서만 틀리면 조용히 통과한다(CLAUDE.md 반복 실측).
   vcOutBoost 를 «음소거보다 먼저» 켜야 3초 감시견이 그 순간을 «소리 막힘» 으로 오판하지 않는다. */
/* ⚠️ 「boostBuild」 를 파일 전체에서 찾으면 «함수 정의» 가 먼저 걸려 멀쩡한 코드가 FAIL 난다
   (CLAUDE.md: 검사 범위를 «길이»·«글자» 로 자르지 말고 «구조» 로 자를 것).
   그래서 실제 실행 순서가 정해지는 `go` 블록만 오려 내서 본다. */
const goBlock = (volCode.match(/var go = function \(\)[\s\S]*?\n    \};/) || [''])[0];
const iFlag = goBlock.indexOf('window.vcOutBoost = true');
const iBuild = goBlock.indexOf('boostBuild(v)');
check('⑥ vcOutBoost 를 «타일을 음소거하기 전» 에 켠다 (순서)',
  goBlock && iFlag >= 0 && iBuild > iFlag, 'go블록 ' + goBlock.length + '자 · flag=' + iFlag + ' build=' + iBuild);

/* ── ⑦ 파일을 실제로 실행해 값 저장·범위 제한을 확인 ─────────────────────── */
{
  const store = {};
  const el = () => ({ volume: 1, muted: false, srcObject: null, closest: () => null });
  const win = {
    localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    addEventListener() {}, AudioContext: undefined, webkitAudioContext: undefined,
  };
  const doc = {
    readyState: 'complete',
    body: { classList: { contains: () => false } },
    addEventListener() {},
    getElementById: () => null,
    querySelectorAll: () => [el(), el()],
  };
  const ctxObj = vm.createContext({ window: win, document: doc, localStorage: win.localStorage,
    MediaStream: function () {}, MutationObserver: function () { this.observe = () => {}; this.disconnect = () => {}; },
    setTimeout, clearTimeout, console, parseFloat, isFinite, Math });
  ctxObj.globalThis = ctxObj;
  let ran = true;
  try { vm.runInContext(vol, ctxObj, { timeout: 3000 }); } catch (e) { ran = false; console.log('       실행 실패: ' + e.message); }
  check('⑦ 파일이 브라우저 없이도 끝까지 실행된다', ran);
  const set = win.vcSetOutputVolume, get = win.vcSavedOutputVolume;
  check('⑦ vcSetOutputVolume·vcSavedOutputVolume 을 전역으로 내놓는다',
    typeof set === 'function' && typeof get === 'function');
  if (typeof set === 'function' && typeof get === 'function') {
    set(0.5);  check('⑦ 50% 를 저장하고 그대로 읽는다', get() === 0.5, '읽은 값 ' + get());
    set(2.5);  check('⑦ 100% 를 넘는 값도 저장한다 (여기서 1 로 깎으면 증폭이 통째로 죽는다)', get() === 2.5, '읽은 값 ' + get());
    set(99);   check('⑦ 상한 밖은 상한으로 자른다', get() === win.vcOutputVolumeMax, '읽은 값 ' + get());
    set(-5);   check('⑦ 음수는 0 으로 자른다', get() === 0, '읽은 값 ' + get());
    const before = get(); set('abc');
    check('⑦ 숫자가 아니면 값을 바꾸지 않는다', get() === before, '읽은 값 ' + get());
    store['mangoi_vc_out_vol'] = 'zzz';
    check('⑦ 저장값이 깨져 있으면 원래 소리(1)로 읽는다', get() === 1, '읽은 값 ' + get());
  }
}

/* ── ⑧ 첫 화면 예산 — defer 로만 붙는다 ──────────────────────────────────── */
const tag = (html.match(/<script[^>]*idx-vc-outputvolume\.js[^>]*>/) || [''])[0];
check('⑧ index.html 에 defer 로 등록돼 있다', /\bdefer\b/.test(tag), tag || '태그 없음');

console.log('\n' + '─'.repeat(56));
console.log(`  ✅ PASS ${pass}   ❌ FAIL ${fail}`);
if (fail) { console.log('\n실패:'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
