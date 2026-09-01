/**
 * 🕐 실시간성 가드 — "오디오 지연 · 렉 · 영상 멈춤" (Melca 테스트: Ness ②③ · Belle ①②)
 *
 * 보내는 쪽(비트레이트 적응 · Opus FEC/DTX · AAO)은 오래 다듬어 왔는데
 * **받는 쪽 지연** 과 **인코더 힌트** 는 비어 있었다. 그 둘을 지킨다.
 *
 * 지켜야 할 규칙
 *   ① 받는 쪽 지연은 «회선이 좋다고 측정됐을 때만» 낮춘다.
 *      무조건 0 으로 낮추면 손실 있는 회선(필리핀)에서 소리가 끊긴다 — 지연을 없애려다 끊김을 만든다.
 *   ② 나빠지면 즉시 브라우저 자동(null)으로 되돌린다. 끊김이 지연보다 우선이다.
 *   ③ 같은 상태면 다시 쓰지 않는다(재설정 자체가 소리를 튀게 한다).
 *   ④ 카메라는 'motion'(멈추면 안 됨), 화면공유는 'detail'(글자가 뭉개지면 안 됨) — 정반대다.
 *   ⑤ 부하 시 초당 장수를 지킨다(maintain-framerate). 'balanced' 는 프레임을 함께 깎는다.
 *
 * 실행: node test-harness/vc_latency_tuning_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');
const js = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ❌ ' + n + (d ? '\n       ' + d : '')); }
};

console.log('\n════════ 수업 실시간성 (지연 · 끊김 · 멈춤) ════════\n');

/* ── 1. 받는 쪽 지연 조절이 «측정 기반» 인가 ────────────────── */
console.log('▶ 1. 받는 쪽 지연');
check('수신 지연 조절 함수가 있다', /function tuneReceiveLatency\(pc, good\)/.test(js),
      '없으면 브라우저 지터버퍼가 잡은 지연을 그대로 물고 간다');
/* ⚠️ (2026-09-01) 예전엔 이 검사가 옛 식을 «글자 그대로» 못 박고 있었다.
   그래서 class-1015 수리(「지금 이 4초가 좋다」 → 「32초 연속 양호 + 스파이크 후 30초」)에
   빨간불이 났다 — 보장은 오히려 세졌는데 검사만 깨진 것이다.
   ✅ 이제 «뜻» 으로 본다: 손실률과 RTT 를 «측정해서» 정하는가 + 단계 0 일 때만인가.
      그리고 «지속 확인이 있는가»(__qGood)까지 요구한다 — 한 틱만 보고 켜면
      RTT 가 요동치는 회선에서 켜졌다 꺼졌다 하며 소리가 튄다(그게 그 사고였다). */
{
  const call = (js.match(/tuneReceiveLatency\(pc,([^;]+)\);/) || [])[1] || '';
  check('적응 루프가 «측정값» 으로 호출한다 (임의 상수 아님)',
        /step === 0/.test(call) && /lossPct < [\d.]+/.test(call) && /rtt < \d+/.test(call),
        '손실률·RTT 를 보고 결정해야 한다');
  check('한 틱이 아니라 «지속» 을 보고 켠다 (소리 튐 방지)',
        /__qGood/.test(call),
        '2026-09-01 class-1015 — 스파이크 사이 조용한 4초마다 켜졌다 꺼져 소리가 튀었다');
}
check('두 API 모두 기능 감지 후 쓴다 (미지원 브라우저 안전)',
      /'jitterBufferTarget' in r/.test(js) && /'playoutDelayHint' in r/.test(js));
check('같은 상태면 다시 쓰지 않는다', /pc\.__rxLowLat === good/.test(js));

/* 함수를 떼어내 실제로 돌려 본다 */
{
  const s = js.indexOf('function tuneReceiveLatency(pc, good)');
  const e = js.indexOf('window.__vcTuneReceiveLatency', s);
  const body = s >= 0 && e > s ? js.slice(s, e) : '';
  check('함수 본문을 찾았다', body.length > 200);
  if (body.length > 200) {
    const sandbox = { console: { log() {} } };
    vm.createContext(sandbox);
    vm.runInContext(body + '\nthis.__t = tuneReceiveLatency;', sandbox, { timeout: 2000 });
    const run = (good, prev) => {
      const wrote = [];
      const mk = (kind) => {
        const o = { track: { kind } };
        Object.defineProperty(o, 'jitterBufferTarget', { set: v => wrote.push(kind + '.jbt=' + v), get: () => undefined, configurable: true });
        Object.defineProperty(o, 'playoutDelayHint',  { set: v => wrote.push(kind + '.pdh=' + v), get: () => undefined, configurable: true });
        return o;
      };
      const pc = { __rxLowLat: prev, getReceivers: () => [mk('audio'), mk('video')] };
      sandbox.__t(pc, good);
      return wrote;
    };
    const good = run(true, undefined);
    check('회선 양호 → 오디오 지연을 0 으로 낮춘다', good.includes('audio.jbt=0'), good.join(', '));
    check('회선 양호 → 영상은 여유를 둔다 (0 이 아니다)',
          good.some(x => /^video\.jbt=\d+$/.test(x) && x !== 'video.jbt=0'), good.join(', '));
    const bad = run(false, true);
    check('회선 불안정 → 전부 브라우저 자동(null)으로 되돌린다',
          bad.filter(x => /=null$/.test(x)).length === 4, bad.join(', '));
    check('상태가 그대로면 한 번도 쓰지 않는다', run(true, true).length === 0,
          '재설정 자체가 소리를 튀게 한다');
  }
}

/* ── 2. 인코더 힌트 ──────────────────────────────────────── */
console.log('\n▶ 2. 인코더에게 «무엇을 찍는지» 알려 주는가');
check('힌트 헬퍼가 있다', /window\.vcApplyContentHints = function/.test(js));
check('카메라 = motion (멈추면 안 된다)', /t\.contentHint = 'motion'/.test(js));
check('마이크 = speech', /t\.contentHint = 'speech'/.test(js));
check('화면공유 = detail (글자가 뭉개지면 안 된다)', /st\.contentHint = 'detail'/.test(js),
      '카메라와 정반대여야 한다');
check('카메라를 얻는 모든 경로에 걸린다 (getUserMedia 헬퍼에서 호출)',
      /vcApplyContentHints && window\.vcApplyContentHints\(_s\)/.test(js),
      '한 곳에서만 걸면 장치 교체·자가치유 경로가 빠진다');

/* ── 3. 부하가 걸렸을 때 무엇을 지키는가 ────────────────────── */
console.log('\n▶ 3. 부하 시 초당 장수를 지키는가');
check("'balanced' 가 남아 있지 않다", !/degradationPreference = 'balanced'/.test(js),
      'balanced 는 부하 시 프레임을 함께 깎는다 = "영상이 멈춘다"');
check('프레임 우선(maintain-framerate)을 쓴다',
      (js.match(/'maintain-framerate'/g) || []).length >= 2);

console.log('\n──────────────────────────────────────────');
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('──────────────────────────────────────────\n');
process.exit(fail ? 1 : 0);
