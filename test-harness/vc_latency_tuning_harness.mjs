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
check('수신 지연 조절 함수가 있다', /function tuneReceiveLatency\(pc,\s*\w+\)/.test(js),
      '없으면 브라우저 지터버퍼가 잡은 지연을 그대로 물고 간다');
/* ⚠️ 인자 이름을 «글자 그대로»(pc, good) 못 박지 않는다 — 2026-09-05 에 상태가 둘에서
   셋이 되면서 그 검사가 깨졌다. 보장이 세지는 변경에 검사만 빨간불이 나는 그 함정이다. */
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
check('같은 상태면 다시 쓰지 않는다', /if \(pc\.__rx\w* === \w+\) return;/.test(js),
      '재설정 자체가 소리를 튀게 한다 — 상태 비교 가드가 있어야 한다');

/* ── 1-b. 늦게 온 패킷을 «기다려 주는» 버퍼 (2026-09-05) ─────────────
   [왜 넣었나] D1 vc_quality 725분 실측(2026-09-01~04)에서 «소리 끊김» 을 쪼개 보니:

       RTT 구간     소리끊김%   진짜 오디오 손실%   늦어서 버린 것   배수
       < 120 ms       2.37           0.14            2.23%p        17배
       120–200        5.46           0.44            5.02%p        13배
       200–300        9.55           0.75            8.81%p        13배
       300–450        7.82           0.43            7.39%p        18배
       450 ms +      33.01           0.97           32.05%p        34배

     ⟹ 끊김의 거의 전부가 «진짜 잃은 것» 이 아니라 «도착했는데 늦어서 버린 것» 이다.
        늦은 것은 버퍼가 기다려 주면 살아난다.
   ⛔ 이 전제(conceal ≫ aloss)가 이 기능의 존재 이유다. 진짜 손실이 원인인 회선에서는
      버퍼를 키워도 아무것도 안 살아나고 지연만 늘어난다. 값을 올리기 전에 그 비를 다시 재라.
      재는 법: tools/vc-netem-lab → `python cli.py report --who`
   ⚠️ 대가는 지연이다(+300ms). 그래서 «구조적으로 먼» 회선(기준 RTT 300ms 이상)이나
      «지금 막힌» 연결(rttDown 초과가 3틱=12초)에만 건다. 가까운 회선은 손대지 않는다.

   🟡 아직 사람이 정하지 않은 것 / open
      · 200~300ms 구간(끊김 9.6% · 104분)은 일부러 «안» 넣었다. 지연을 300ms 더하는 대가가
        그 이득에 맞는지는 판단이 필요하다. 배포 뒤 rx_conceal 이 실제로 내려가는 것을 보고 정할 것.
      · 300ms 는 «첫 값» 이지 최적값이 아니다. 실측 지터(Farrah RTT 494~1091)를 보면 더
        키워야 할 수도 있는데, 대화 지연이 그만큼 늘어난다. 시험: window.__vcRxBufMs
      · 효과 확인은 «배포 전후 rx_conceal 비교» 로 한다. 아직 안 했다. */
{
  const s = js.indexOf('function tuneReceiveLatency(pc,');
  const e = js.indexOf('window.__vcTuneReceiveLatency', s);
  const body = s >= 0 && e > s ? js.slice(s, e) : '';
  check('함수 본문을 찾았다', body.length > 200);
  if (body.length > 200) {
    const sandbox = { console: { log() {} }, window: {} };
    vm.createContext(sandbox);
    vm.runInContext(body + '\nthis.__t = tuneReceiveLatency;', sandbox, { timeout: 2000 });
    const run = (mode, prev, bufMs) => {
      const wrote = [];
      const mk = (kind) => {
        const o = { track: { kind } };
        Object.defineProperty(o, 'jitterBufferTarget', { set: v => wrote.push(kind + '.jbt=' + v), get: () => undefined, configurable: true });
        Object.defineProperty(o, 'playoutDelayHint',  { set: v => wrote.push(kind + '.pdh=' + v), get: () => undefined, configurable: true });
        return o;
      };
      sandbox.window.__vcRxBufMs = bufMs;
      const pc = { __rxLat: prev, getReceivers: () => [mk('audio'), mk('video')] };
      sandbox.__t(pc, mode);
      return wrote;
    };
    const num = (arr, k) => Number((arr.find(x => x.startsWith(k)) || '=NaN').split('=')[1]);

    const good = run('low', undefined);
    check('회선 양호 → 오디오 지연을 0 으로 낮춘다', good.includes('audio.jbt=0'), good.join(', '));
    check('회선 양호 → 영상은 여유를 둔다 (0 이 아니다)',
          good.some(x => /^video\.jbt=\d+$/.test(x) && x !== 'video.jbt=0'), good.join(', '));
    const auto = run('auto', 'low');
    check('회선 불안정 → 전부 브라우저 자동(null)으로 되돌린다',
          auto.filter(x => /=null$/.test(x)).length === 4, auto.join(', '));
    check('상태가 그대로면 한 번도 쓰지 않는다', run('low', 'low').length === 0,
          '재설정 자체가 소리를 튀게 한다');

    /* 🔴 여기가 새 상태다 — 되돌리면(둘로 되돌리면) 아래가 실제로 FAIL 한다 */
    const buf = run('buf', 'auto');
    check('먼 회선 → 버퍼를 «키운다» (자동도 0 도 아니다)',
          num(buf, 'audio.jbt') >= 120 && num(buf, 'video.jbt') >= 120, buf.join(', '));
    check('버퍼가 대화를 못 할 만큼 크지는 않다 (≤ 1초)',
          num(buf, 'audio.jbt') <= 1000, buf.join(', '));
    /* ⚠️ 단위가 다르다 — jitterBufferTarget 은 ms, playoutDelayHint 는 «초».
       섞으면 1000배 틀리는데 «둘 다 값이 있다» 로만 보면 안 잡힌다. */
    check('playoutDelayHint 는 «초» 단위로 쓴다 (ms 와 1000배 차이)',
          Math.abs(num(buf, 'audio.pdh') - num(buf, 'audio.jbt') / 1000) < 1e-6,
          buf.join(', '));
    check('시험용 손잡이가 실제로 먹는다 (__vcRxBufMs)',
          num(run('buf', 'auto', 500), 'audio.jbt') === 500);
    check('손잡이 0 = 끄기 → 브라우저 자동으로 돌아간다',
          run('buf', 'auto', 0).filter(x => /=null$/.test(x)).length === 4);
    /* 🪤 이 검사를 «prev 를 손으로 적어» 쓰면 헛돈다 — 2026-09-05 변이시험에서 실제로 통과했다.
       'buf300' 이라고 적어 두면, 상태 키에서 ms 를 빼는 변이('buf')에서도 prev 와 달라
       «다시 걸린 것처럼» 보인다. ✅ «같은 연결» 에 두 번 걸어서 확인해야 한다. */
    {
      const wrote = [];
      const mk = (kind) => {
        const o = { track: { kind } };
        Object.defineProperty(o, 'jitterBufferTarget', { set: v => wrote.push(kind + '.jbt=' + v), get: () => undefined, configurable: true });
        Object.defineProperty(o, 'playoutDelayHint',  { set: v => wrote.push(kind + '.pdh=' + v), get: () => undefined, configurable: true });
        return o;
      };
      const pc = { getReceivers: () => [mk('audio'), mk('video')] };
      sandbox.window.__vcRxBufMs = 300; sandbox.__t(pc, 'buf');   // 1회차
      wrote.length = 0;
      sandbox.window.__vcRxBufMs = 500; sandbox.__t(pc, 'buf');   // 2회차 — 값만 바뀜
      check('같은 연결에서 손잡이 값을 바꾸면 다시 걸린다 (상태 키에 ms)',
            wrote.length > 0 && num(wrote, 'audio.jbt') === 500,
            'ms 를 상태 키에 안 넣으면 값을 바꿔도 안 먹는다 — 시험이 불가능해진다');
    }
  }
}

/* ── 1-c. «언제» 버퍼를 켜는가 — 호출부 ───────────────────────── */
{
  /* ⚠️ `[\s\S]` 로 잡으면 함수 «정의»(`function tuneReceiveLatency(pc, mode) {`)가 먼저 걸리고
     본문 안의 `');'` 까지 삼킨다 — 실제로 그렇게 짰다가 멀쩡한 코드가 FAIL 났다.
     인자에는 `; { }` 가 없으므로 그것을 막아 «호출부만» 잡는다. */
  const call = (js.match(/tuneReceiveLatency\(pc,([^;{}]{0,400}?)\);/) || [])[1] || '';
  check('호출부를 찾았다 (정의가 아니라)', call.length > 40 && !/\bmode\)\s*$/.test(call),
        call.replace(/\s+/g, ' ').slice(0, 120));
  check('세 상태를 «측정값» 으로 고른다', /'low'/.test(call) && /'buf'/.test(call) && /'auto'/.test(call),
        call.replace(/\s+/g, ' ').slice(0, 140));
  check('버퍼는 «먼 회선» 또는 «지금 막힌» 연결에만',
        /rb >= \d+/.test(call) && /__qLate/.test(call),
        '가까운 회선에까지 걸면 이유 없이 대화 지연만 늘어난다');
  check('막힘 판정이 한 틱이 아니라 «지속» 이다',
        /__qLate \|\| 0\) >= [2-9]/.test(js),
        '한 틱만 보고 켜면 스파이크마다 켜졌다 꺼져 소리가 튄다');
  check('막힘 카운터가 회복되면 0 으로 돌아간다',
        /rtt < rttUp\) pc\.__qLate = 0/.test(js),
        '안 지우면 한 번 막힌 연결이 수업 내내 버퍼를 물고 간다');
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
