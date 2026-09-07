/* ══════════════════════════════════════════════════════════════════════════
   rx_buf_threshold_harness — «늦어서 버려지는 소리» 에만 지터버퍼 완화를 건다
     · 판정  : public/js/idx-vc-qlog.js 의 vcqBufDecide (defer)
     · 사용  : public/js/idx-main.js 의 tuneReceiveLatency 호출부 (blocking)
     2026-09-07 사장님 지시 「지터버퍼 문턱 넣어줘」

   [왜 이 검사가 필요한가]
     판정과 사용이 «다른 파일» 에 있다. idx-main.js 는 blocking 예산이 81바이트뿐이라
     판정을 거기 둘 수 없어 pc.__qWantBuf 한 칸으로만 읽는다. **그 칸 이름이 어긋나면
     아무 에러 없이 조용히 헛돈다** — 그래서 여기서 «양쪽이 같은 이름을 쓰는가» 를 대조한다.

   [무엇을 지키나]
     · 끊기는데 진짜 손실이 작으면(늦어서 버린 것) → 켠다
     · 끊기는데 진짜 손실도 크면(정말 잃은 것) → 켜지 않는다 ← 짝 검사.
       없으면 «무조건 켜기» 회귀가 통과하고, 그때 대가는 모두에게 +300ms 다
     · 흔들리지 않는다(3틱 켜기 / 5틱 끄기 · 사이 구간은 유지)
     · 손실을 못 잰 틱은 세지 않는다(모르면 +300ms 를 물리지 않는다)
     · low(지연 0)가 이 표시를 이기지 못한다 ← 이게 없으면 수리가 정반대로 뒤집힌다

   [문자열 검사가 아니다] 판정 함수를 소스에서 오려 내 **실제로 돌린다.**
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QLOG = process.env.RBT_QLOG_FILE || path.join(ROOT, 'cloudflare-deploy/public/js/idx-vc-qlog.js');
const MAIN = process.env.RBT_MAIN_FILE || path.join(ROOT, 'cloudflare-deploy/public/js/idx-main.js');

let pass = 0, fail = 0;
function ok(cond, name, detail) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  →  ' + detail : ''}`); }
}
const qlog = fs.readFileSync(QLOG, 'utf8');
const main = fs.readFileSync(MAIN, 'utf8');

/* ── ⓪ 판정 함수를 오려 낸다 (중괄호 짝 — 길이로 자르지 않는다) ───────── */
console.log('\n⓪ vcqBufDecide 를 소스에서 오려 낸다');
function sliceFn(text, anchor) {
  const i = text.indexOf(anchor);
  if (i < 0) return null;
  const open = text.indexOf('{', i);
  let d = 0;
  for (let k = open; k < text.length; k++) {
    if (text[k] === '{') d++;
    else if (text[k] === '}') { d--; if (d === 0) return text.slice(i, k + 1); }
  }
  return null;
}
const fnSrc = sliceFn(qlog, 'function vcqBufDecide(');
ok(!!fnSrc && fnSrc.length > 300, 'vcqBufDecide 본문을 잘라냈다', `len=${fnSrc ? fnSrc.length : 0}`);
if (!fnSrc) { console.log(`\nrx_buf_threshold_harness — PASS ${pass} / FAIL ${fail}`); process.exit(1); }

/* 상수도 «소스에서 읽는다» — 손으로 옮겨 적으면 소스를 한 번도 안 보게 된다 */
const num = (n) => Number((qlog.match(new RegExp(n + '\\s*=\\s*([0-9.]+)')) || [])[1]);
const ON_C = num('VCQ_BUF_ON_CONCEAL'), OFF_C = num('VCQ_BUF_OFF_CONCEAL');
const RATIO = num('VCQ_BUF_LATE_RATIO'), ON_T = num('VCQ_BUF_ON_TICKS'), OFF_T = num('VCQ_BUF_OFF_TICKS');
ok([ON_C, OFF_C, RATIO, ON_T, OFF_T].every(v => Number.isFinite(v) && v > 0),
  `문턱을 소스에서 읽었다 (켜기 ${ON_C}% · 끄기 ${OFF_C}% · 배수 ${RATIO} · ${ON_T}틱/${OFF_T}틱)`,
  JSON.stringify({ ON_C, OFF_C, RATIO, ON_T, OFF_T }));
ok(OFF_C < ON_C && OFF_T >= ON_T,
  '히스테리시스가 성립한다 (끄는 문턱이 더 낮고, 끄는 데 더 오래 걸린다)',
  JSON.stringify({ ON_C, OFF_C, ON_T, OFF_T }));

/* 🪤 상수 선언도 «소스에서» 함께 오려 낸다.
   처음엔 함수 본문만 떼어 돌렸는데, 상수가 함수 밖에 있어 사본에서 undefined 였다.
   그러면 `concealPct >= undefined` 가 늘 false 라 **아무것도 안 세는데**,
   그 ReferenceError 를 정본의 try/catch 가 삼켜 조용했다 —
   즉 «안 켜진다» 검사들만 전부 통과하는 헛도는 상태가 된다(실제로 그렇게 나왔다).
   ⛔ 값을 여기 손으로 적어 주입하지 말 것 — 그러면 소스를 한 번도 안 보게 된다. */
const CONST_SRC = (qlog.match(/^var VCQ_BUF_[A-Z_]+\s*=.*$/gm) || []).join('\n');
ok((CONST_SRC.match(/^var /gm) || []).length === 5,
  '상수 선언 5개를 소스에서 함께 오려 냈다 (사본이 헛돌지 않는다)',
  JSON.stringify(CONST_SRC.slice(0, 120)));

function makeDecide(bufMs) {
  const win = {};
  if (typeof bufMs === 'number') win.__vcRxBufMs = bufMs;
  const fn = new Function('window', 'console', CONST_SRC + '\n' + fnSrc + '; return vcqBufDecide;')(
    win, { log() {}, warn() {} });
  return { fn, win };
}

/* 🔴 전제 검사 — 사본이 «실제로 판정을 한다» 는 것부터 확인한다.
   이게 통과하지 않으면 아래 «안 켜진다» 검사들은 전부 뜻이 없다. */
{
  const { fn, win } = makeDecide();
  const pc = {};
  for (let i = 0; i < ON_T; i++) fn('smoke', pc, 10.24, 0.6);
  ok(pc.__qWantBuf === true && win.__vcBufS && win.__vcBufS.smoke,
    '오려 낸 사본이 실제로 판정한다 (헛돌지 않는다)',
    JSON.stringify({ pc, s: win.__vcBufS }));
}
/* 틱을 n번 먹인다 */
function feed(fn, pc, n, conceal, aloss, id = 'p1') {
  for (let i = 0; i < n; i++) fn(id, pc, conceal, aloss);
  return pc;
}

/* ── ① 늦어서 버린 것 → 켠다 ────────────────────────────────────────── */
console.log('\n① 끊기는데 진짜 손실은 작다(늦어서 버린 것) → 켠다');
{
  const { fn } = makeDecide();
  const pc = {};
  feed(fn, pc, ON_T - 1, 10.24, 0.6);
  ok(!pc.__qWantBuf, `${ON_T - 1}틱까지는 아직 안 켠다 (흔들림 방지)`, JSON.stringify(pc));
  feed(fn, pc, 1, 10.24, 0.6);
  ok(pc.__qWantBuf === true, `${ON_T}틱 연속이면 켠다 — 실측값(conceal 10.24% / aloss 0.60%)`, JSON.stringify(pc));
}

/* ── ② 진짜로 잃은 것 → 켜지 않는다 (짝 검사) ─────────────────────────
   ⛔ 이 절이 없으면 «무조건 켜기» 가 통과한다. 기다려도 안 살아나는 손실에
      +300ms 를 물리는 것은 손해만 남는다. */
console.log('\n② 끊김이 «진짜 손실» 때문이면 켜지 않는다 — 기다려도 안 살아난다');
{
  const { fn } = makeDecide();
  const pc = {};
  feed(fn, pc, ON_T + 5, 10, 5);          // conceal 10% 인데 손실도 5% → 10 < 5×3
  ok(!pc.__qWantBuf, '손실이 큰 끊김에는 안 켠다', JSON.stringify(pc));
}

/* ── ③ 조용한 회선은 안 건드린다 ─────────────────────────────────────── */
console.log('\n③ 소리가 멀쩡한 연결에는 +300ms 를 물리지 않는다');
{
  const { fn } = makeDecide();
  const pc = {};
  feed(fn, pc, 20, 1.0, 0.2);
  ok(!pc.__qWantBuf, '끊김이 문턱 아래면 안 켠다', JSON.stringify(pc));
}

/* ── ④ 좋아지면 끈다 — 그리고 «사이 구간» 에서는 유지 ─────────────────── */
console.log('\n④ 좋아지면 끄고, 애매한 구간에서는 상태를 유지한다');
{
  const { fn } = makeDecide();
  const pc = {};
  feed(fn, pc, ON_T, 10.24, 0.6);
  ok(pc.__qWantBuf === true, '먼저 켜졌다');
  feed(fn, pc, OFF_T - 1, 0.5, 0.1);
  ok(pc.__qWantBuf === true, `${OFF_T - 1}틱까지는 유지한다`, JSON.stringify(pc));
  feed(fn, pc, 1, 0.5, 0.1);
  ok(pc.__qWantBuf === false, `${OFF_T}틱 연속 좋으면 끈다`, JSON.stringify(pc));

  /* 사이 구간(끄기문턱~켜기문턱)에서는 카운트가 안 쌓여 상태가 그대로여야 한다 */
  const { fn: f2 } = makeDecide();
  const pc2 = {};
  feed(f2, pc2, ON_T, 10.24, 0.6);
  feed(f2, pc2, 30, (ON_C + OFF_C) / 2, 0.1);   // 예: 3% — 켜지도 끄지도 않는 구간
  ok(pc2.__qWantBuf === true, '애매한 구간이 오래 이어져도 뒤집히지 않는다 (소리 튐 방지)', JSON.stringify(pc2));
}

/* ── ⑤ 모르면 안 켠다 ───────────────────────────────────────────────── */
console.log('\n⑤ 손실을 못 잰 틱은 세지 않는다 — «모름» 으로 +300ms 를 물리지 않는다');
{
  const { fn } = makeDecide();
  const pc = {};
  feed(fn, pc, 20, 12, null);
  ok(!pc.__qWantBuf, 'aloss 가 null 이면 아무것도 세지 않는다', JSON.stringify(pc));
  feed(fn, pc, 20, 12, undefined);
  ok(!pc.__qWantBuf, 'aloss 가 없어도 마찬가지', JSON.stringify(pc));
}

/* ── ⑥ 되돌리는 손잡이 ──────────────────────────────────────────────── */
console.log('\n⑥ window.__vcRxBufMs = 0 이면 통째로 꺼진다');
{
  const { fn } = makeDecide(0);
  const pc = { __qWantBuf: true };            // 이미 켜져 있던 상태
  feed(fn, pc, 10, 12, 0.2);
  ok(pc.__qWantBuf === false, '끄면 즉시 예전 동작으로 되돌아간다', JSON.stringify(pc));
}

/* ── ⑦ 연결마다 따로 센다 ───────────────────────────────────────────── */
console.log('\n⑦ 연결마다 따로 판정한다 (한 사람이 나쁘다고 다른 연결까지 켜지지 않는다)');
{
  const { fn } = makeDecide();
  const bad = {}, good = {};
  for (let i = 0; i < ON_T + 2; i++) { fn('bad', bad, 12, 0.5); fn('good', good, 0.4, 0.1); }
  ok(bad.__qWantBuf === true && !good.__qWantBuf,
    '나쁜 연결만 켜진다', JSON.stringify({ bad, good }));
}

/* ── ⑧ 던지지 않는다 ───────────────────────────────────────────────── */
console.log('\n⑧ 어떤 입력에도 던지지 않는다 (감시가 통화를 죽이면 안 된다)');
{
  const { fn } = makeDecide();
  let threw = false;
  try {
    fn('x', null, 1, 1); fn(null, {}, NaN, NaN); fn('y', {}, 'a', 'b'); fn('z', {}, Infinity, 0);
  } catch (e) { threw = true; }
  ok(!threw, 'null·NaN·문자열·Infinity 를 넣어도 던지지 않는다');
}

/* ── ⑨ 🔴 배선 — 두 파일이 «같은 칸 이름» 을 쓰는가 ────────────────────
   판정과 사용이 다른 파일에 있어, 이름이 어긋나면 에러 없이 조용히 헛돈다. */
console.log('\n⑨ idx-main.js 와 idx-vc-qlog.js 가 같은 칸 이름을 쓴다');
{
  const nameInQlog = /pc\.__qWantBuf\s*=/.test(qlog);
  ok(nameInQlog, 'defer 쪽이 pc.__qWantBuf 에 쓴다');
  /* 🪤 `tuneReceiveLatency(pc,` 로 앞에서 찾으면 «함수 선언»(function tuneReceiveLatency(pc, mode))이
     먼저 잡혀 9,000자짜리 엉뚱한 조각이 잘린다 — CLAUDE.md 「«선언» 이 잡혀 호출을 통째로 지워도
     통과」의 그 함정이다(여기서 실제로 밟았다).
     ✅ 결론부(`? 'buf' : 'auto');`)를 먼저 찾고 거기서 «뒤로» 호출을 찾는다. */
  const bufAt = main.indexOf("? 'buf' : 'auto');");
  const callAt = bufAt > 0 ? main.lastIndexOf('tuneReceiveLatency(pc,', bufAt) : -1;
  const call = (callAt >= 0) ? main.slice(callAt, bufAt + 20) : '';
  ok(call.length > 50 && call.length < 800, 'idx-main.js 의 호출부를 잘라냈다 (선언이 아니라)', `len=${call.length}`);
  ok(!/^function\s/.test(call), '잘라낸 것이 «선언» 이 아니다', call.slice(0, 60));
  ok(/pc\.__qWantBuf\s*\|\|/.test(call),
    'buf 쪽이 그 칸을 본다 (켜지는 길이 실제로 이어져 있다)', call.slice(0, 160));
  /* 🔴 이것이 이 수리의 핵심이다 — 없으면 정반대로 뒤집힌다 */
  ok(/!pc\.__qWantBuf\s*&&/.test(call),
    'low(지연 0) 쪽이 그 칸에 막힌다 — 없으면 끊기는 연결이 오히려 버퍼 0 을 받는다',
    call.slice(0, 200));
  /* 순서 — low 판정이 buf 보다 앞에 있으므로 low 가드가 반드시 있어야 한다 */
  ok(call.indexOf("? 'low'") < call.indexOf("? 'buf'"),
    "low 판정이 buf 보다 먼저다 (그래서 low 가드가 필수다)");
}

/* ── ⑩ 배선 — ?v= 가 올라갔는가 ─────────────────────────────────────── */
console.log('\n⑩ 화면이 두 파일의 새 판을 싣는가');
{
  const html = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/public/index.html'), 'utf8');
  const q = html.match(/idx-vc-qlog\.js\?v=(\d+)/);
  const m = html.match(/idx-main\.js\?v=(\d+)/);
  ok(q && Number(q[1]) >= 10, `idx-vc-qlog.js ?v= 가 10 이상 (실측 ${q ? q[1] : '-'})`);
  ok(m && Number(m[1]) >= 52, `idx-main.js ?v= 가 52 이상 (실측 ${m ? m[1] : '-'})`);
}

/* ── ⑪ 근거를 부풀리지 않았는가 ──────────────────────────────────────── */
console.log('\n⑪ 소스가 «판단» 을 «측정» 으로 적지 않았다');
{
  const flat = qlog.replace(/\s+/g, ' ');
  ok(/판단 — 측정 아님/.test(flat), '「TCP 때문」을 판단으로 표시해 두었다');
  ok(/\+300ms/.test(qlog), '대가(+300ms 지연)를 적어 두었다');
}

console.log(`\n🔊 rx_buf_threshold_harness — PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
