#!/usr/bin/env node
/* 🗣️⚡ A.i 말하기 연습 — «첫 문장부터 먼저 읽기» + «대기 시간 재기» 하니스 (2026-09-25)
 *
 * [왜] 사장님 「대답하면 AI 가 다시 질문하기까지 기다리는 시간을 절반으로」.
 *      예전에는 AI 답장 «전체» 를 음성 서버로 보내 «전체» 소리를 받은 뒤에야 말을 시작했다.
 *      이제 첫 문장(짧으면 둘째까지)과 나머지를 «동시에» 요청하고, 첫 조각이 오는 대로 읽는다.
 *
 * 이 하니스는 «그 글자가 있는가» 가 아니라 함수를 warmup.html 에서 중괄호 짝으로 오려 내
 * 가짜 부품으로 «실제로 돌려» 답을 본다. 「나눈다」 옆에 「안 나눠야 할 때는 안 나눈다」를,
 * 「다음 조각을 읽는다」 옆에 「끊겼으면 안 읽는다」를 짝으로 둔다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const HTML = fs.readFileSync(process.env.WARMUP_SRC || path.join(ROOT, 'cloudflare-deploy/public/warmup.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, ok, why) {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}

/* 선언부터 짝이 맞는 닫는 중괄호까지(선언 포함) */
function fnSrc(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  const b = src.indexOf('{', i);
  let d = 0;
  for (let k = b; k < src.length; k++) {
    const c = src[k];
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return src.slice(i, k + 1); }
  }
  return '';
}
function bodyOf(src, name) {
  const f = fnSrc(src, name);
  return f ? f.slice(f.indexOf('{') + 1, -1) : '';
}
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/* ── ① 조각 나누기 ───────────────────────────────────────────── */
console.log('\n① 첫 문장 / 나머지로 나누기 (_speechChunks)');
const chunkSrc = fnSrc(HTML, '_warmChunkOn') + '\n' + fnSrc(HTML, '_speechChunks');
const minLine = (HTML.match(/var CHUNK_MIN_EN\s*=\s*\d+\s*,\s*CHUNK_MIN_ZH\s*=\s*\d+\s*;/) || [''])[0];
check('전제: 두 함수와 최소 길이 상수를 오려 냈다', chunkSrc.length > 300 && !!minLine, 'len=' + chunkSrc.length);
function mkSplit(search, ls) {
  try {
    const f = new Function('location', 'localStorage', minLine + chunkSrc + '\nreturn _speechChunks;');
    return f({ search: search || '' }, { getItem: (k) => (ls || {})[k] || null });
  } catch (e) { return () => ['THREW:' + e.message]; }
}
const split = mkSplit('');
const run = (t) => { try { return split(t); } catch (e) { return ['THREW:' + e.message]; } };
const squash = (a) => a.join(' ').replace(/\s+/g, ' ').trim();

const EX = 'Wow! That is great. What is your favorite food?';
const r1 = run(EX);
check('여러 문장이면 두 조각으로 나눈다', r1.length === 2, JSON.stringify(r1));
check('«Wow!» 한 마디만 먼저 떼지 않는다(짧으면 둘째 문장까지)', /^Wow! That is great\.$/.test(r1[0] || ''), JSON.stringify(r1[0]));
check('나눠도 글자를 잃지 않는다', squash(r1) === EX, squash(r1));
const long = 'Nice! I like pizza too. Do you eat it on weekends? What topping do you like best? Tell me!';
const r2 = run(long);
check('조각은 많아야 둘이다(잘게 나누면 뚝뚝 끊긴다)', r2.length === 2, JSON.stringify(r2));
check('긴 답장도 글자를 잃지 않는다', squash(r2) === long);
/* 짝 — 안 나눠야 할 때 */
check('한 문장이면 나누지 않는다(예전 경로 그대로) (짝)', JSON.stringify(run('What is your favorite food?')) === JSON.stringify(['What is your favorite food?']));
check('숫자 속 점(3.5)에서 자르지 않는다 (짝)', run('It costs 3.5 dollars today.').length === 1, JSON.stringify(run('It costs 3.5 dollars today.')));
check('빈 글자도 던지지 않는다', Array.isArray(run('')) && !String(run('')[0]).startsWith('THREW'));
const zh = run('你好！你今天吃了什么？');
check('중국어 문장부호(！？)에서도 나눈다', zh.length === 2 && zh.join('') === '你好！你今天吃了什么？', JSON.stringify(zh));
check('?chunk=0 이면 나누지 않는다(비교 측정 스위치) (짝)', mkSplit('?chunk=0')(EX).length === 1);
check("localStorage mangoi_warm_chunk='0' 이면 나누지 않는다 (짝)", mkSplit('', { mangoi_warm_chunk: '0' })(EX).length === 1);

/* ── ② 조각 읽기 순서 ──────────────────────────────────────── */
console.log('\n② 조각을 «동시에» 받고 «차례대로» 읽기 (_speakChunks)');
const scSrc = fnSrc(HTML, '_speakChunks');
check('전제: _speakChunks 를 오려 냈다', scSrc.length > 300, 'len=' + scSrc.length);
function harness(opt) {
  opt = opt || {};
  const log = [];
  const env = { seq: 0, cache: {}, eng: {} };
  const pending = [];
  const fakePrefetch = (text, spk) => {
    log.push('prefetch:' + text);
    return new Promise((res) => pending.push(() => res(opt.prefetchFail ? null : { u: 'blob:' + text, got: opt.got || spk, eng: 'aura' })));
  };
  const fakeTts = (text, spk, key, btn, seq, next, playFn) => {
    log.push('tts:' + text);
    if (opt.cutAfterFirstTts) env.seq++;
    playFn('url:' + text, 'aura');
  };
  const f = new Function('ENV', '_ttsPrefetch', '_ttsSpeak', 'LOG',
    'var _latCur=null;' +
    'var _ttsCache=ENV.cache, _ttsEng=ENV.eng;' +
    scSrc.replace(/_speakSeq/g, 'ENV.seq') + '\nreturn _speakChunks;');
  let sc;
  try { sc = f(env, fakePrefetch, fakeTts, log); } catch (e) { return { err: e.message, log }; }
  const played = [];
  let doneN = 0;
  const done = () => { doneN++; log.push('done'); };
  const play = (u, eng, next) => { played.push(u); log.push('play:' + u); if (!opt.noAutoEnd) Promise.resolve().then(next); };
  try { sc(['First part here.', 'Second part.'], 'luna', null, done, play); } catch (e) { return { err: e.message, log }; }
  return { log, played, get doneN() { return doneN; }, env, pending };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

const A = harness();
check('실행된다', !A.err, A.err);
if (!A.err) {
  check('나머지 조각은 «첫 조각 재생 전» 에 이미 요청했다', A.log.indexOf('prefetch:Second part.') >= 0 &&
    A.log.indexOf('prefetch:Second part.') < A.log.indexOf('play:url:First part here.'), A.log.join(' | '));
  check('첫 조각은 기다리지 않고 곧바로 읽는다', A.played[0] === 'url:First part here.', JSON.stringify(A.played));
  await tick();
  check('첫 조각이 끝나기 전·나머지가 안 왔으면 둘째는 아직 안 읽는다', A.played.length === 1, JSON.stringify(A.played));
  A.pending.forEach((p) => p()); await tick(); await tick(); await tick();
  check('둘째 조각을 이어서 읽는다', A.played[1] === 'blob:Second part.', JSON.stringify(A.played));
  check('«다 읽었다»(done)는 마지막에 딱 한 번 (짝)', A.doneN === 1 && A.log[A.log.length - 1] === 'done', A.log.join(' | '));
  check('같은 목소리로 받은 조각은 캐시한다', A.env.cache['luna|Second part.'] === 'blob:Second part.');
}
const B = harness({ cutAfterFirstTts: true });
if (!B.err) {
  B.pending.forEach((p) => p()); await tick(); await tick(); await tick();
  check('중간에 끊겼으면(끼어들기·새 턴) 남은 조각을 안 읽는다 (짝)', B.played.length === 1 && B.doneN === 0, B.log.join(' | '));
} else check('중간 끊김 시나리오 실행', false, B.err);
const C = harness({ prefetchFail: true });
if (!C.err) {
  C.pending.forEach((p) => p()); await tick(); await tick(); await tick();
  check('미리 받기가 실패한 조각은 예전 경로(_ttsSpeak)로 다시 묻는다', C.log.indexOf('tts:Second part.') >= 0, C.log.join(' | '));
  check('그래도 끝까지 읽고 done 한 번', C.doneN === 1, 'done=' + C.doneN);
} else check('실패 폴백 시나리오 실행', false, C.err);
const D = harness({ got: 'orion' });
if (!D.err) {
  D.pending.forEach((p) => p()); await tick(); await tick(); await tick();
  check('서버가 «남의 목소리» 로 대체한 조각은 캐시하지 않는다 (짝)', !D.env.cache['luna|Second part.'], JSON.stringify(D.env.cache));
} else check('대체 목소리 시나리오 실행', false, D.err);

/* ── ③ speak() 배선 ─────────────────────────────────────────── */
console.log('\n③ speak() 배선');
const sp = strip(bodyOf(HTML, 'speak'));
check('전제: speak 몸통을 잘라 냈다', sp.length > 500, 'len=' + sp.length);
const iSplit = sp.indexOf('_speechChunks(text)');
const iCall = sp.search(/if\s*\(\s*chunks\.length\s*>\s*1\s*\)\s*\{\s*_speakChunks\(/);
const iZhDev = sp.indexOf('_zhMaleVoiceReady()');
const iCache = sp.search(/if\s*\(\s*_ttsCache\[key\]\s*\)/);
const iOld = sp.lastIndexOf('_ttsSpeak(text');
check('speak 가 조각을 나눠 본다', iSplit > 0);
check('두 조각 이상이면 _speakChunks 로 보낸다', iCall > iSplit);
check('기기 남자 목소리 갈래·캐시 적중은 그보다 «앞» 이다(예전 그대로)', iZhDev > 0 && iCache > iZhDev && iSplit > iCache);
check('한 조각이면 예전 _ttsSpeak(text…) 로 간다 (짝)', iOld > iCall);
const pl = HTML.slice(HTML.indexOf('var play=function(u, eng, onEnd){'));
const plBody = pl.slice(0, pl.indexOf('\n  };') + 5);
const play0Calls = (plBody.match(/play0\([^;]*?\)/g) || []);
check('전제: play 안의 play0 호출을 찾았다', play0Calls.length >= 3, String(play0Calls.length));
check('play 는 조각마다의 onEnd 를 play0 에 빠짐없이 넘긴다', play0Calls.length > 0 && play0Calls.every((c) => /onEnd\)$/.test(c)), play0Calls.join(' '));
check('play0 는 onEnd 가 없으면 예전 done 을 쓴다 (짝)', /var fin\s*=\s*onEnd\s*\|\|\s*done\s*;/.test(HTML) && /_ttsAudio\.onended\s*=\s*fin\s*;/.test(HTML));

/* ── ④ 대기 시간 재기 ─────────────────────────────────────── */
console.log('\n④ 대기 시간 재기 (_latMark)');
const latSrc = fnSrc(HTML, '_latOn') + '\n' + fnSrc(HTML, '_latMark');
check('전제: _latOn·_latMark 를 오려 냈다', latSrc.length > 300);
function latRun(cur, search) {
  const msgs = []; const win = {};
  const f = new Function('location', 'localStorage', 'addMsg', 'window', 'console', 'CUR',
    'var _latCur=CUR;' + latSrc + '\n_latMark(); return _latCur;');
  const left = f({ search: search || '' }, { getItem: () => null }, (t, w) => msgs.push([t, w]), win, { info() {} }, cur);
  return { msgs, rows: win.__warmLat || [], left };
}
const now = Date.now();
const L1 = latRun({ t0: now - 3000, t1: now - 1000, wait: 1500, tStop: now - 3300, chunk: 2 }, '?lat=1');
const row = L1.rows[0] || {};
check('한 턴을 기록한다', L1.rows.length === 1, JSON.stringify(L1.rows));
check('AI 시간 = 답장 도착 − 보냄', row.ai === 2000, 'ai=' + row.ai);
check('목소리 시간 = 첫 소리 − 답장 도착(약 1초)', row.voice >= 990 && row.voice < 1500, 'voice=' + row.voice);
check('합계 = 침묵 대기 + 침묵 끝 → 첫 소리', row.total >= 1500 + 3290 && row.total < 1500 + 3800, 'total=' + row.total);
check('한 번 재면 닫는다(다시 듣기로 두 번 안 잰다)', L1.left === null);
check('?lat=1 이면 화면에 한 줄 남긴다', L1.msgs.length === 1 && L1.msgs[0][1] === 'sys' && /AI 2\.0초/.test(L1.msgs[0][0]), JSON.stringify(L1.msgs));
check('?lat=1 이 아니면 화면에 안 남긴다 (짝)', latRun({ t0: now - 10, t1: now - 5 }, '').msgs.length === 0);
const L3 = latRun({ t0: now - 100, t1: now - 50, wait: null, tStop: null }, '?lat=1');
check('녹음 경로(침묵 시각 모름)는 «—» 로 적고 지어내지 않는다', (L3.rows[0] || {}).total === null && /기다림 —/.test((L3.msgs[0] || [''])[0]), JSON.stringify(L3.rows));
check('잴 턴이 없으면 아무것도 안 한다 (짝)', latRun(null, '?lat=1').rows.length === 0);

const sm = strip(bodyOf(HTML, 'sendMsg'));
/* 줄 머리에서 «그대로» 대입하는가 — `if(0)_latCur={…}` 처럼 조건을 씌우면 못 잡으므로 줄 머리로 묻는다 */
const mLat = sm.match(/\n[ \t]*_latCur=\{ ?t0:_lt0/);
const iLat = mLat ? mLat.index : -1;
const iAi = sm.search(/addMsg\(d\.ai_response/);
check('sendMsg 가 AI 답장을 «그리기 직전» 에 잴 준비를 한다(그리면 곧바로 읽기 시작)', iLat > 0 && iAi > iLat && iAi - iLat < 400);
check('침묵 타이머가 끊은 시각을 적는다', /_latSilence=\{\s*wait:ms,\s*at:Date\.now\(\)\s*\}/.test(HTML));
check('첫 소리가 나면 재기를 닫는다(원어민 음성·기기 음성 둘 다)',
  /_ttsAudio\.play\(\)\.then\(function\(\)\{[^}]*_latMark\(\)/.test(HTML) && /u\.onstart=function\(\)\{[^}]*_latMark\(\)/.test(HTML));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
