// 🔈 (2026-10-08) class-4586 「선생님 목소리가 수업 내내 안 들렸다」 후속 감시.
//   A. 사무실 모드 게이트 문턱을 9/8 첫 판 값(OPEN 12 · HYST 6 · DUCK 0.08)으로 되돌렸다.
//      → 게이트 tick() 을 소스에서 «오려 내 실제로 돌려» 「목소리가 소음보다 10dB 남짓 크면 거의 다 잘리던」
//        절벽이 사라졌는지 + (짝) 「소음만 있을 때는 여전히 닫힌다」를 본다.
//   B. 회선 기록(vc_quality)에 소리 «크기» 를 남긴다 — rx_alevel / tx_alevel / office / gate_closed / mic_db.
//      → 에너지→dB 계산·게이트 통계 함수를 오려 내 실제로 돌리고, 서버 INSERT 의 칸·자리·바인드 수를 대조한다.
// ⛔ 기대값(문턱 숫자)을 이 파일에 베껴 적지 않는다 — 소스에서 읽는다.
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (c, name, hint) => { if (c) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ ' + name + (hint ? '\n     → ' + hint : '')); } };

const OM = readFileSync('cloudflare-deploy/public/js/idx-vc-officemode.js', 'utf8');
const QL = readFileSync('cloudflare-deploy/public/js/idx-vc-qlog.js', 'utf8');
const SV = readFileSync('cloudflare-deploy/src/api-mango.ts', 'utf8');
const IX = readFileSync('cloudflare-deploy/public/index.html', 'utf8');

// 중괄호 짝으로 함수 하나를 오려 낸다(선언 뒤 첫 «{» 부터).
function bodyOf(src, head) {
  const i = src.indexOf(head);
  if (i < 0) return '';
  const j = src.indexOf('{', i + head.length - 1);
  let d = 0;
  for (let k = j; k < src.length; k++) {
    const c = src[k];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}
const num = k => { const m = OM.match(new RegExp('var ' + k + '\\s*=\\s*([0-9.\\-]+)')); return m ? Number(m[1]) : NaN; };

console.log('\n① 사무실 모드 게이트 — 판정 함수를 실제로 돌림');
const TICK = bodyOf(OM, 'function tick()');
ok(TICK.length > 200, '전제: tick() 을 오려 냈다');
const C = {};
for (const k of ['ATTACK', 'RELEASE', 'HOLD_MS', 'DUCK', 'OPEN_DB', 'HYST_DB', 'ABS_DB', 'STALL_MS']) C[k] = num(k);
ok(Object.values(C).every(Number.isFinite), '전제: 상수를 소스에서 읽었다', JSON.stringify(C));

function makeGate(o = {}) {
  const K = Object.assign({}, C, o);
  const src = `
    var ATTACK=${K.ATTACK}, RELEASE=${K.RELEASE}, HOLD_MS=${K.HOLD_MS}, DUCK=${K.DUCK}, OPEN_DB=${K.OPEN_DB}, HYST_DB=${K.HYST_DB}, ABS_DB=${C.ABS_DB}, STALL_MS=${C.STALL_MS};
    var on=true, autoFailed=false, stalledAt=null, resumeTried=false;
    var floorDb=-60, openUntil=0, isOpen=false, G={ticks:0,closed:0,loud:0,loudClosed:0,db:[]};
    var buf=new Float32Array(1024), level=0;
    var ctx={state:'running', currentTime:0, resume:function(){}};
    var anaNode={getFloatTimeDomainData:function(b){ for (var i=0;i<b.length;i++) b[i]=level*Math.sqrt(2)*Math.sin(i*0.3); }};
    var gainNode={gain:{setTargetAtTime:function(){}}};
    function disable(){ return Promise.resolve(); }
    ${TICK}
    return { tick: tick, set: function(db){ level=Math.pow(10, db/20); }, open: function(){ return isOpen; }, G: function(){ return G; } };`;
  return new Function('document', 'Date', src);
}
let T = 0;
const FakeDate = { now: () => T };
function run(floor, speech, o) {
  const g = makeGate(o)({ hidden: false }, FakeDate);
  let sp = 0, cut = 0, noiseTicks = 0, noiseOpen = 0;
  for (let i = 0; i < 40 * 120; i++) {
    T += 25;
    const t = T % 3000, inWord = t < 2200, syl = (T % 250) < 180;
    const db = inWord ? (syl ? speech + ((i * 7) % 6 - 3) : speech - 12) : floor + ((i * 3) % 4 - 2);
    g.set(db); g.tick();
    if (inWord && syl) { sp++; if (!g.open()) cut++; }
    if (!inWord && t > 2700) { noiseTicks++; if (g.open()) noiseOpen++; }
  }
  return { cut: Math.round(100 * cut / sp), noiseOpen: Math.round(100 * noiseOpen / noiseTicks), G: g.G() };
}
let r;
try { r = run(-50, -40); } catch (e) { r = null; console.log('     실행 실패: ' + e.message); }
ok(r && r.cut <= 10, '목소리가 소음보다 10dB 크면 잘리는 말소리가 10% 이하(9/9 값에서는 89~100%)', r && ('지금 ' + r.cut + '%'));
let r2; try { r2 = run(-60, -45); } catch (e) { r2 = null; }
ok(r2 && r2.cut <= 5, '15dB 차이면 거의 안 잘린다', r2 && ('지금 ' + r2.cut + '%'));
let r3; try { r3 = run(-50, -10); } catch (e) { r3 = null; }
ok(r3 && r3.noiseOpen <= 20, '(짝) 말이 없는 동안 소음만 있으면 게이트는 여전히 닫힌다 — 기능이 죽지 않았다', r3 && ('소음 구간 열림 ' + r3.noiseOpen + '%'));
ok(r && r.G.ticks > 0 && r.G.db.length > 0, '게이트 통계(G)가 틱마다 쌓인다');
let rOld; try { rOld = run(-50, -40, { OPEN_DB: 16, HYST_DB: 8, DUCK: 0.03 }); } catch (e) { rOld = null; }
ok(rOld && rOld.cut >= 80, '(짝) 9/9 값(16·8·0.03)으로 같은 조건을 돌리면 실제로 대부분 잘린다 — 위 검사가 헛돌지 않는다', rOld && ('9/9 값 ' + rOld.cut + '%'));
ok(rOld && rOld.G.loud > 0 && rOld.G.loudClosed / rOld.G.loud >= 0.5 && r && r.G.loudClosed / r.G.loud <= 0.2,
  'loudClosed/loud(= gate_closed) 가 «잘리는 경우» 크고 «안 잘리는 경우» 작다 — 조용한 시간에 휘둘리지 않는다',
  rOld && r && JSON.stringify({ old: [rOld.G.loudClosed, rOld.G.loud], now: [r.G.loudClosed, r.G.loud] }));
ok(r3 && r3.G.closed > 0 && r3.G.closed < r3.G.ticks, '(짝) 닫힌 틱을 실제로 센다 — 소음 구간이 있으면 0 보다 크고 전체보다 작다', r3 && JSON.stringify({ticks: r3.G.ticks, closed: r3.G.closed}));

console.log('\n② 게이트 통계 내보내기 — vcOfficeGateStats 를 실제로 돌림');
const GS = bodyOf(OM, 'window.vcOfficeGateStats = function');
ok(GS.length > 50, '전제: vcOfficeGateStats 를 오려 냈다');
try {
  const f = new Function(`var on=true; var G={ticks:400, closed:100, loud:120, loudClosed:6, db:[]}; for (var i=0;i<100;i++) G.db.push(-60+i*0.3);
    var window={}; ${GS}; var a=window.vcOfficeGateStats(); var b=window.vcOfficeGateStats(); return [a,b];`);
  const [a, b] = f();
  ok(a.on === true && a.ticks === 400 && a.closed === 100 && a.loud === 120 && a.loudClosed === 6, '켜짐·틱·닫힌 틱·소리있던 틱을 돌려준다');
  ok(typeof a.mic_db === 'number' && a.mic_db > -35 && a.mic_db < -30, 'mic_db 는 상위 10% 세기다', 'mic_db=' + a.mic_db);
  ok(b.ticks === 0 && b.loud === 0 && b.mic_db === null, '(짝) 한 번 가져가면 비운다 — 다음 1분과 섞이지 않는다');
} catch (e) { ok(false, 'vcOfficeGateStats 실행', e.message); }

console.log('\n③ 에너지 → dB — vcqEnergyDb 를 실제로 돌림');
const ED = bodyOf(QL, 'function vcqEnergyDb(');
ok(ED.length > 50, '전제: vcqEnergyDb 를 오려 냈다');
try {
  const f = new Function(ED + '; return vcqEnergyDb;')();
  const v = f(0.01 * 4 + 1, 14, 1, 10, true);            // 4초에 평균 전력 0.01 → -20dB
  ok(Math.abs(v - (-20)) < 0.01, '4초 평균 전력 0.01 은 -20dBFS', 'v=' + v);
  ok(f(1, 14, 1, 10, true) === -127, '전력 0(완전 무음)은 -127 — «모름» 이 아니라 «무음»');
  ok(f(2, 14, 1, 10, false) === null, '(짝) 다른 트랙·다른 통계면 null(«모름»)');
  ok(f(null, 14, 1, 10, true) === null && f(2, 10.5, 1, 10, true) === null, '값이 없거나 1초 미만이면 null');
} catch (e) { ok(false, 'vcqEnergyDb 실행', e.message); }

console.log('\n④ 배선 — 1분 요약에 실리는가');
const ACC = bodyOf(QL, 'function vcQualityAcc(');
ok(/rx_alevel:/.test(ACC) && /tx_alevel:/.test(ACC) && /gate_closed:/.test(ACC) && /mic_db:/.test(ACC) && /office:/.test(ACC), '요약 본문에 다섯 칸이 실린다');
ok(/vcOfficeGateStats\(\)/.test(ACC), '게이트 통계를 실제로 부른다');
ok(!/rx_alevel:[^\n]*:\s*-1\b/.test(ACC) && !/tx_alevel:[^\n]*:\s*-1\b/.test(ACC), 'dB 칸의 «모름» 을 -1 로 적지 않는다(-1dBFS 는 큰 소리)');
const RX = bodyOf(QL, 'function vcqRxTick(');
ok(/var lv = vcqEnergyDb\(en, du, prev\.en, prev\.du, sameMedia\);/.test(RX) && /if \(lv !== null\) \(Q\.rxl/.test(RX), '받은 소리 세기를 rxl 에 쌓는다');
ok(/try\s*\{\s*vcqTxLevelTick\(pcs\);\s*\}/.test(RX), '보낸 소리 세기 측정을 «조건 없이» 부른다(false && 같은 죽은 조건 금지)');
ok(/media-source/.test(bodyOf(QL, 'function vcqTxLevelTick(')), '보낸 쪽은 media-source(가공 «뒤» 실제 송출)로 잰다');

// 요약 조립식 세 줄을 오려 내 실제로 평가한다(글자만 보면 1/0 뒤집기·분자 바꾸기가 통과한다).
// 주석 안의 «gate_closed: …» 설명문을 잡지 않게, 줄 첫머리가 정확히 «키:» 이고 식이 G0 를 쓰는 줄만 고른다.
const line = k => { const hit = ACC.split('\n').map(t => t.trim()).find(t => t.startsWith(k + ':') && /G0/.test(t)); return hit ? hit.slice(k.length + 1).trim().replace(/,$/, '') : null; };
const exOffice = line('office'), exGate = line('gate_closed'), exMic = line('mic_db');
ok(exOffice && exGate && exMic, '전제: office·gate_closed·mic_db 식을 오려 냈다');
try {
  const ev = (ex, G0) => new Function('G0', 'return (' + ex + ');')(G0);
  ok(ev(exOffice, { on: true }) === 1 && ev(exOffice, { on: false }) === 0 && ev(exOffice, null) === null, 'office: 켜짐 1 · 꺼짐 0 · 모름 null');
  ok(ev(exGate, { on: true, loud: 100, loudClosed: 25 }) === 25, 'gate_closed = 소리 있던 시간 중 닫힌 %');
  ok(ev(exGate, { on: false, loud: 100, loudClosed: 25 }) === null && ev(exGate, { on: true, loud: 10, loudClosed: 5 }) === null && ev(exGate, null) === null,
    '(짝) 꺼짐·소리 1초 미만·모름이면 null — 0% 로 적지 않는다');
  ok(ev(exMic, { mic_db: -33.26 }) === -33.3 && ev(exMic, { mic_db: null }) === null && ev(exMic, null) === null, 'mic_db: 숫자는 소수 1자리 · 없으면 null');
} catch (e) { ok(false, '요약 식 실행', e.message); }

console.log('\n④-2 보낸 소리 측정 — vcqTxLevelTick 을 실제로 돌림');
const TX = bodyOf(QL, 'function vcqTxLevelTick(');
ok(TX.length > 100, '전제: vcqTxLevelTick 을 오려 냈다');
try {
  const mk = new Function('window', 'Promise', ED + '\n' + TX + '\n return vcqTxLevelTick;');
  const flush = () => new Promise(r => setTimeout(r, 0));
  const sender = (id, energyRef, calls) => ({ track: { kind: 'audio', readyState: 'live', id }, getStats: () => { calls.n++; return Promise.resolve([{ type: 'media-source', kind: 'audio', totalAudioEnergy: energyRef.e, totalSamplesDuration: energyRef.d }]); } });
  // (a) 정상: 두 번 읽으면 dB 하나가 쌓인다
  let W = { __vcQ: { txl: [] } }; let fn = mk(W, Promise);
  const E = { e: 1, d: 10 }, c1 = { n: 0 }, s1 = sender('t1', E, c1);
  const pcA = { getSenders: () => [s1] };
  fn({ a: pcA }); await flush(); await flush(); E.e = 1.04; E.d = 14; fn({ a: pcA }); await flush(); await flush();
  ok(W.__vcQ.txl.length === 1 && Math.abs(W.__vcQ.txl[0] - (-20)) < 0.01, '4초 차분으로 -20dBFS 를 쌓는다', JSON.stringify(W.__vcQ.txl));
  // (b) 첫 sender 가 읽는 중이면 다른 연결로 넘어가지 않는다
  W = { __vcQ: { txl: [] } }; fn = mk(W, Promise);
  const c2 = { n: 0 }, s2 = sender('t2', { e: 1, d: 1 }, c2); const cb = { n: 0 }, busy = sender('t1', E, cb); busy.__vcTxReading = true;
  fn({ a: { getSenders: () => [busy] }, b: { getSenders: () => [s2] } }); await flush();
  ok(c2.n === 0 && cb.n === 0, '첫 sender 가 읽는 중이면 그 틱은 건너뛴다(겹쳐 읽지도·다른 연결로 넘어가지도 않음)', `busy=${cb.n} other=${c2.n}`);
  // (c) 기다리는 사이 트랙이 바뀌면 기준을 버린다
  W = { __vcQ: { txl: [] }, __vcTxPrev: { tid: 't9', en: 0, du: 0 } }; fn = mk(W, Promise);
  const s3 = sender('t9', { e: 5, d: 50 }, { n: 0 }); const g0 = s3.getStats; s3.getStats = () => { s3.track = { kind: 'audio', readyState: 'live', id: 't10' }; return g0(); };
  fn({ a: { getSenders: () => [s3] } }); await flush(); await flush();
  ok(W.__vcQ.txl.length === 0 && W.__vcTxPrev === null, '(짝) 기다리는 사이 replaceTrack 되면 그 값을 버리고 기준도 비운다');
} catch (e) { ok(false, 'vcqTxLevelTick 실행', e.message); }

console.log('\n⑤ 서버 — 칸·자리표시·바인드 수가 맞는가');
const ins = SV.match(/INSERT INTO vc_quality \(([^)]*)\) VALUES \(([^)]*)\)/);
ok(!!ins, '전제: INSERT 문을 찾았다');
if (ins) {
  const cols = ins[1].split(',').map(x => x.trim());
  const qs = (ins[2].match(/\?/g) || []).length;
  ok(cols.length === qs, `칸 수(${cols.length}) == 자리표시 수(${qs})`);
  for (const c of ['rx_alevel', 'tx_alevel', 'office', 'gate_closed', 'mic_db']) ok(cols.includes(c), `INSERT 에 ${c}`);
  for (const c of ['rx_alevel REAL', 'tx_alevel REAL', 'office INTEGER', 'gate_closed REAL', 'mic_db REAL']) ok(SV.includes(`'${c}'`), `ALTER 목록에 ${c}`);
  // 바인드 인자 수 — .bind( 부터 괄호 짝으로
  const bi = SV.indexOf('.bind(', SV.indexOf('INSERT INTO vc_quality'));
  let d = 0, k = bi + 5, args = 1;
  for (; k < SV.length; k++) { const c = SV[k]; if (c === '(' ) d++; else if (c === ')') { d--; if (d === 0) break; } else if (c === ',' && d === 1) args++; }
  ok(args === qs, `바인드 인자 수(${args}) == 자리표시 수(${qs})`);
}
const nnM = SV.match(/const nn = \(v: any, lo: number, hi: number\): number \| null => \{([\s\S]*?)\n\s*\};/);
ok(!!nnM, '전제: nn() 을 찾았다');
if (nnM) {
  const nn = new Function('v', 'lo', 'hi', nnM[1].replace(/: any/g, ''));
  ok(nn(null, -127, 0) === null && nn('', -127, 0) === null && nn('x', -127, 0) === null, '모르는 값은 NULL');
  ok(nn(-30.5, -127, 0) === -30.5 && nn(50, -127, 0) === 0 && nn(-999, -127, 0) === -127, '숫자는 범위로 자른다(무인증 본문)');
}

console.log('\n⑥ 캐시 — 바꾼 두 파일의 ?v= 를 올렸는가');
ok(/idx-vc-qlog\.js\?v=(\d+)/.test(IX) && Number(IX.match(/idx-vc-qlog\.js\?v=(\d+)/)[1]) >= 22, 'idx-vc-qlog.js ?v= ≥ 22');
ok(/idx-vc-officemode\.js\?v=(\d+)/.test(IX) && Number(IX.match(/idx-vc-officemode\.js\?v=(\d+)/)[1]) >= 10, 'idx-vc-officemode.js ?v= ≥ 10');

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
