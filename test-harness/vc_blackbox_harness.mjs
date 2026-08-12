/**
 * 📼 수업 블랙박스 — 「깜빡임·카메라 꺼짐」 신고를 데이터로 만드는 장치 (2026-08-12)
 *
 *   Ness ②③ · Belle ①② · Ana ② — «화면이 깜빡인다 / 카메라가 갑자기 꺼진다» 는
 *   신고가 반복되는데 재현 조건이 없어 매번 추측으로 끝났다.
 *   비행기록장치처럼 «신고가 오기 전에» 이미 기록하고 있어야 다음 신고 때 원인이 잡힌다.
 *
 * ⚠️ 이 장치의 제 1 원칙: 수업을 절대 무겁게 하지 않는다.
 *    기록은 배열 push 한 줄, 저장은 5초 스로틀, 정상 신호(connected)는 안 남긴다.
 *
 * 하니스는 링버퍼·스로틀 로직을 **실제로 실행**해 검증한다.
 *
 * 실행: node test-harness/vc_blackbox_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');
const js = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ❌ ' + n + (d ? '\n       ' + d : '')); }
};

console.log('\n════════ 📼 수업 블랙박스 ════════\n');

console.log('▶ 장치가 있고, 실사용 입구가 있는가');
const s = js.indexOf('(function vcBlackbox(){');
const e = js.indexOf('})();', s);
const box = s >= 0 && e > s ? js.slice(s, e + 5) : '';
check('블랙박스 본체를 찾았다', box.length > 500);
check('새로고침에도 살아남는다 (localStorage 백업+복원)',
      /localStorage\.getItem\('vc_blackbox'/.test(box) && /localStorage\.setItem\('vc_blackbox'/.test(box));
check('강사용 입구: 연결상태 글씨 5번 클릭 → 복사',
      /vc-ice-status/.test(box) && /clicks\.length >= 5/.test(box),
      '강사는 콘솔을 못 연다 — 화면에서 꺼낼 길이 없으면 이 장치는 무용지물');
check('복사했다고 말해 준다 (다음 행동 안내)', /붙여넣어 보내 주세요/.test(box));

console.log('\n▶ 링버퍼·스로틀이 실제로 동작하는가');
if (box.length > 500) {
  const calls = { toasts: 0, saved: null, timeouts: [] };
  const sandbox = {
    window: {}, navigator: { userAgent: 'test-agent' },
    localStorage: {
      _s: {},
      getItem(k){ return this._s[k] || null; },
      setItem(k, v){ this._s[k] = v; calls.saved = v; },
    },
    document: { addEventListener(){} },
    setTimeout(fn, ms){ calls.timeouts.push({ fn, ms }); return calls.timeouts.length; },
    showToast(){ calls.toasts++; },
    console: { log(){} },
    Date, JSON, String,
  };
  sandbox.window.navigator = sandbox.navigator;
  const run = Function('window','navigator','localStorage','document','setTimeout','showToast','console',
                       box + '; return window;');
  const w = run(sandbox.window, sandbox.navigator, sandbox.localStorage, sandbox.document,
                sandbox.setTimeout, sandbox.showToast, sandbox.console);
  check('vcBB / vcBBDump 가 만들어진다', typeof w.vcBB === 'function' && typeof w.vcBBDump === 'function');
  for (let i = 0; i < 450; i++) w.vcBB('ev' + i, 'x');
  const dump = w.vcBBDump();
  check('450줄을 넣어도 400줄만 남는다 (링버퍼)',
        !dump.includes('ev5 |') && dump.includes('ev449'),
        '무한히 쌓이면 localStorage 와 메모리를 먹는다');
  check('저장은 스로틀된다 (450번 기록에 setTimeout 1개)',
        calls.timeouts.filter(t => t.ms === 5000).length === 1,
        '기록마다 저장하면 «가볍게» 원칙이 깨진다');
  calls.timeouts.filter(t => t.ms === 5000).forEach(t => t.fn());
  check('스로틀이 터지면 진짜 저장된다', !!calls.saved && calls.saved.includes('ev449'));
  check('민감정보를 담지 않는다 (긴 detail 은 90자에서 자른다)',
        (() => { w.vcBB('long', 'A'.repeat(500)); return !w.vcBBDump().includes('A'.repeat(120)); })());
}

console.log('\n▶ 지문이 필요한 곳에 다 걸려 있는가');
const HOOKS = [
  ['소켓 열림(재연결 여부)', /vcBB\('ws-open'/],
  ['소켓 닫힘(code)',        /vcBB\('ws-close'/],
  ['전체 정리 = 깜빡임 대표 지문', /vcBB\('cleanup-all'/],
  ['피어 재연결',            /vcBB\('reconnect-peer'/],
  ['ICE 이상 상태',          /vcBB\('ice'/],
  ['연결 이상 상태',         /vcBB\('conn'/],
  ['카메라 자가치유 = 「카메라가 꺼진다」 지문', /vcBB\('cam-heal'/],
];
HOOKS.forEach(([name, re]) => check(name, re.test(js)));
check('cam-heal 은 ended 와 muted 를 구분한다', /ended\(트랙 죽음\)/.test(js) && /muted\(프레임0 지속\)/.test(js),
      '장치가 죽은 것과 프레임이 멈춘 것은 원인이 다르다');
check('⚡ 정상 신호는 기록하지 않는다 (connected 제외)',
      /st !== 'connected' && st !== 'completed'/.test(js),
      '정상 소음으로 400줄이 차면 정작 사고 순간이 밀려난다');
check('⚡ 모든 훅이 안전하다 (vcBB 없어도 수업이 안 죽게 가드)',
      (js.match(/window\.vcBB && vcBB\(/g) || []).length >= 7);

console.log('\n──────────────────────────────────────────');
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('──────────────────────────────────────────\n');
process.exit(fail ? 1 : 0);
