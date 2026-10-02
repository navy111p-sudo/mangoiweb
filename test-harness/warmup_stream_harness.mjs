/* 📡 웜업 «첫 소리 2초 안에»(P2 · 2026-10-02) — 문장 단위 흘려보내기가 «실제로» 그렇게 도는가.
 *
 * [왜 있나]
 * 웜업은 답이 다 만들어지고 검사·재시도가 다 끝난 뒤에야 한 번에 받아, 그 뒤에 목소리를
 * 받으러 갔습니다. 이제 서버가 문장이 끝날 때마다 먼저 보내고(src/warmup-stream.ts) 화면이
 * 큐로 이어 읽습니다(public/warmup.html 의 _speakLive·_stmSentence·_stmTurn).
 *
 * 이 검사는 «그 글자가 있는가» 로 묻지 않습니다 —
 *   · 서버 모듈은 typescript 로 타입만 벗겨 **실제로 import 해서** 돌리고,
 *   · 화면 함수는 소스에서 **중괄호 짝으로 오려 내 가짜 부품으로 실제로** 돌리고,
 *   · index.ts 배선은 그 식을 **오려 내 평가**합니다.
 * 그리고 «흘려보내는 길이 돈다» 옆에 «옵트인 안 한 길은 예전과 같다» 를 **짝으로** 둡니다
 * (짝이 없으면 «언제나 스트림» 이나 «스트림 통째로 끄기» 도 통과합니다).
 *
 * [변이시험 — 2026-10-02 실제로 소스에 넣어 돌림. 전부 FAIL(종료코드 1)이어야 합니다]
 *   M1 (조건 뒤집기) 화면 sendMsg: `if(_stmOn && r.ok` → `if(!_stmOn && r.ok`
 *   M2 화면 _stopSpeak 에서 큐 끊기 줄 삭제(«정지가 큐를 모름»)
 *   M3 서버 createWarmupLive 먼저 막는 문 무력화: `if (why) {` → `if (false && why) {`
 *   M4 서버 replacedBy 를 언제나 0
 *   M5 (조건 뒤집기) 서버 warmupChatEntry: `if (!want) return core` → `if (want) return core`
 *   M6 화면 _stmTurn: 정본이 달라져도 다시 안 읽기 `(!d.replaced || interrupted)` → `(true)`
 *   M7 index.ts: `sseSend ? createWarmupLive(` → `false ? createWarmupLive(`
 *   M8 index.ts 첫 호출에서 live 빼기 `runWarmup(messages, 0.7, live)` → `runWarmup(messages, 0.7)`
 *   M9 화면 _stmSentence: 끼어든 뒤에도 계속 읽기(`L.seq!==_speakSeq` 가드 삭제)
 * 변이 실행은 환경변수로 사본을 가리킵니다(저장소 파일을 고쳤다 되돌리지 않습니다):
 *   WS_SRC=<warmup-stream.ts 사본> · WS_HTML=<warmup.html 사본> · WS_INDEX=<index.ts 사본>
 */
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SRC_DIR = join(ROOT, 'cloudflare-deploy/src');
const STREAM_TS = process.env.WS_SRC || join(SRC_DIR, 'warmup-stream.ts');
const HTML = readFileSync(process.env.WS_HTML || join(ROOT, 'cloudflare-deploy/public/warmup.html'), 'utf8');
const INDEX = readFileSync(process.env.WS_INDEX || join(SRC_DIR, 'index.ts'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};
const attempt = (name, fn) => { try { return fn(); } catch (e) { ok(name + ' (실행)', false, String(e && e.message || e)); return undefined; } };

/** 주석을 벗겨 낸 사본(블록·줄 — 문자열 안의 // 는 남긴다). 부정·배선 검사는 이것으로 본다. */
function strip(t) {
  let out = '', i = 0, q = '';
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (q) { out += c; if (c === '\\') { out += n || ''; i += 2; continue; } if (c === q) q = ''; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && n === '*') { const e = t.indexOf('*/', i + 2); i = e < 0 ? t.length : e + 2; continue; }
    if (c === '/' && n === '/') { const e = t.indexOf('\n', i); i = e < 0 ? t.length : e; continue; }
    out += c; i++;
  }
  return out;
}
/** 여는 중괄호부터 짝이 맞는 닫는 중괄호까지(문자열 안의 중괄호는 무시). */
function blockAt(src, open) {
  let d = 0, q = '';
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '\\') { i++; continue; } if (c === q) q = ''; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; continue; }
    if (c === '{') d++;
    else if (c === '}') { d--; if (d === 0) return src.slice(open, i + 1); }
  }
  return '';
}
/** 화면 함수 하나를 «선언째» 오려 낸다. */
function fnSrc(src, name) {
  const m = new RegExp('(async\\s+)?function\\s+' + name + '\\s*\\(').exec(src);
  if (!m) return '';
  const open = src.indexOf('{', src.indexOf(')', m.index));
  const body = blockAt(src, open);
  return body ? src.slice(m.index, open) + body : '';
}

/* ═══════════════ A. 서버 모듈을 실제로 돌린다 ═══════════════ */
let ts = null;
for (const p of [join(ROOT, 'cloudflare-deploy/node_modules/typescript'), '/opt/node22/lib/node_modules/typescript']) {
  try { if (existsSync(p)) { ts = createRequire(import.meta.url)(p); break; } } catch {}
}
ok('전제: typescript 를 찾았다(서버 모듈을 실제로 돌리려면 필요)', !!ts);
let M = null;
if (ts) {
  const dir = mkdtempSync(join(tmpdir(), 'wstream-'));
  const tr = (file, out) => {
    const code = readFileSync(file, 'utf8');
    let js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    js = js.replace(/from\s+'\.\/([\w-]+)'/g, "from './$1.mjs'");
    writeFileSync(join(dir, out), js);
  };
  for (const n of ['stream-json-text', 'reply-sanity', 'ai-friends', 'warmup-empathy']) tr(join(SRC_DIR, n + '.ts'), n + '.mjs');
  tr(STREAM_TS, 'warmup-stream.mjs');
  try { M = await import(pathToFileURL(join(dir, 'warmup-stream.mjs')).href); }
  catch (e) { ok('서버 모듈을 import 했다', false, String(e && e.message)); }
}

if (M) {
  console.log('\n[A1] 옵트인 판정');
  ok('stream:1·true·"1" 은 흘려보내기', M.wantsWarmupStream({ stream: 1 }) && M.wantsWarmupStream({ stream: true }) && M.wantsWarmupStream({ stream: '1' }));
  ok('(짝) 안 보냈거나 0·"0" 이면 예전 그대로', !M.wantsWarmupStream({}) && !M.wantsWarmupStream({ stream: 0 }) && !M.wantsWarmupStream({ stream: '0' }) && !M.wantsWarmupStream(null));

  console.log('\n[A2] 문장 자르기');
  const en = M.takeWarmupSentences('Hi there. How are', 'en');
  ok('영어: 끝난 문장만 내보내고 나머지는 남긴다', JSON.stringify(en.out) === '["Hi there."]' && en.rest.trim() === 'How are', JSON.stringify(en));
  const zh = M.takeWarmupSentences('你好！我是美美。你', 'zh');
  ok('중국어: 공백 없이도 。！ 에서 자른다', zh.out.length === 2 && zh.out[0] === '你好！' && zh.out[1] === '我是美美。' && zh.rest === '你', JSON.stringify(zh));
  const zw = M.takeWarmupSentences('你好。', 'zh');
  ok('중국어: 마침표가 맨 끝이면 닫는 따옴표를 기다린다(아직 안 자름)', zw.out.length === 0 && zw.rest === '你好。', JSON.stringify(zw));
  const enZh = M.takeWarmupSentences('你好！我是美美。你', 'en');
  ok('(짝) 영어 규칙은 중국어를 못 자른다 — 그래서 언어별로 가른다', enZh.out.length === 0);

  console.log('\n[A3] 모델 스트림 읽기 — reply 안 글자만');
  const full = '{"reply":"Hello! Do you like cats? ","fix":{"why_ko":"Bad. Worse. "}}';
  const sse = full.match(/.{1,7}/g).map(p => 'data: ' + JSON.stringify({ response: p }) + '\n').join('') + 'data: [DONE]';
  const chunks = sse.match(/[\s\S]{1,11}/g);
  const enc = new TextEncoder();
  const fake = { getReader() { let i = 0; return { read: async () => i < chunks.length ? { value: enc.encode(chunks[i++]), done: false } : { value: undefined, done: true } }; } };
  const got = [];
  const raw = await attempt('readWarmupAiStream', () => M.readWarmupAiStream(fake, 'en', s => got.push(s)));
  ok('문장 두 개를 순서대로 넘긴다', JSON.stringify(got) === '["Hello!","Do you like cats?"]', JSON.stringify(got));
  ok('교정(fix) 안의 글은 흘려보내지 않는다', !got.some(s => /Bad|Worse/.test(s)));
  ok('날것 전체를 돌려준다(교정은 부르는 쪽이 다시 읽는다)', raw === full, String(raw));
  const thrower = [];
  await attempt('콜백이 던져도', () => M.readWarmupAiStream({ getReader() { let i = 0; return { read: async () => i < chunks.length ? { value: enc.encode(chunks[i++]), done: false } : { done: true } }; } }, 'en', s => { thrower.push(s); throw new Error('x'); }));
  ok('미리보기 콜백이 던져도 끝까지 읽는다', thrower.length === 2);

  console.log('\n[A4] 먼저 막는 문(gate)');
  const sent1 = [];
  const L1 = M.createWarmupLive(o => sent1.push(o), { lang: 'en', cap: 0, friend: 'Emma', studentInput: 'I like pizza.' });
  ok('평범한 문장은 내보낸다', L1.push('Wow, pizza!') && L1.push('Do you like cheese?') && sent1.length === 2 && sent1[0].t === 'Wow, pizza!');
  ok('보낸 글·개수를 기억한다', L1.text() === 'Wow, pizza! Do you like cheese?' && L1.sent() === 2 && L1.halted() === '');
  ok('정본이 같으면 replaced 0(공백 차이 무시)', L1.replacedBy('Wow,  pizza!\nDo you like cheese?') === 0);
  ok('(짝) 정본이 다르면 replaced 1', L1.replacedBy('Wow, pizza! Do you like ham?') === 1);
  const L0 = M.createWarmupLive(() => {}, { lang: 'en', cap: 0, friend: 'Emma', studentInput: 'hi' });
  ok('하나도 안 보냈으면 replaced 0(화면이 정본을 처음부터 읽는다)', L0.replacedBy('anything') === 0);
  const sent2 = [];
  const L2 = M.createWarmupLive(o => sent2.push(o), { lang: 'en', cap: 0, friend: 'Emma', studentInput: 'I like toys.' });
  L2.push('Cool!');
  const bad = L2.push('Do you like blue balls?');
  ok('아이에게 안 맞는 문장은 내보내지 않고 멈춘다', !bad && sent2.length === 1 && L2.halted() !== '', L2.halted());
  ok('멈춘 뒤에는 멀쩡한 문장도 안 나간다', !L2.push('Tell me more.') && sent2.length === 1);
  ok('멈춰도 replaced 판정은 정본 기준(대개 1)', L2.replacedBy('Cool! What toy do you like?') === 1);
  const sent3 = [];
  const L3 = M.createWarmupLive(o => sent3.push(o), { lang: 'en', cap: 0, friend: 'Emma', studentInput: 'Hello' });
  ok('다른 이름으로 자기를 소개하면 멈춘다', !L3.push("Hi! I'm Lily.") && L3.halted() === 'name' && sent3.length === 0, L3.halted());
  const L3b = M.createWarmupLive(() => {}, { lang: 'en', cap: 0, friend: 'Emma', studentInput: 'Hello' });
  ok("(짝) 자기 이름이면 통과", L3b.push("Hi! I'm Emma."));
  const negIn = 'I hate English. It is so boring.';
  const sent4 = [];
  const L4 = M.createWarmupLive(o => sent4.push(o), { lang: 'en', cap: 0, friend: 'Emma', studentInput: negIn });
  ok('학생이 «싫다» 고 한 턴은 처음부터 흘려보내지 않는다(공감 가드가 앞머리 칭찬을 떼므로)', !L4.push('Great job!') && L4.halted() === 'empathy' && sent4.length === 0, L4.halted());
  const L5 = M.createWarmupLive(() => {}, { lang: 'en', cap: 3, friend: 'Emma', studentInput: 'hi' });
  ok('단어 상한(cap)을 넘는 문장은 멈춘다', !L5.push('This sentence is really much much much much much much too long for a level one child.') && L5.halted() !== '');
  const L6 = M.createWarmupLive(() => { throw new Error('send'); }, { lang: 'en', cap: 0, friend: 'Emma', studentInput: 'hi' });
  ok('send 가 던져도 push 는 던지지 않는다', attempt('push', () => L6.push('Hello!')) === true);

  console.log('\n[A5] 입구 — 옵트인 안 하면 핸들러 응답을 «그대로»');
  const mkReq = (body) => new Request('https://x/api/warmup/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const plain = new Response(JSON.stringify({ ai_response: 'Hi.' }), { status: 200, headers: { 'X-Same': '1' } });
  let gotSend = 'unset';
  const r0 = await M.warmupChatEntry(mkReq({ student_input: 'hi' }), async (req, send) => { gotSend = send; return plain; });
  ok('(짝) stream 없으면 같은 Response 객체 그대로(바이트 동일)', r0 === plain && gotSend === null);
  const readAll = async (resp) => {
    const t = await resp.text();
    return t.split('\n\n').map(x => x.trim()).filter(Boolean).map(x => JSON.parse(x.replace(/^data:\s*/, '')));
  };
  const r1 = await M.warmupChatEntry(mkReq({ student_input: 'hi', stream: 1 }), async (req, send) => {
    const b = await req.json();          // 원본 본문은 핸들러가 그대로 읽을 수 있어야 한다
    send({ t: 'Hi there.' });
    return new Response(JSON.stringify({ ai_response: 'Hi there. ' + b.student_input }), { status: 200 });
  });
  ok('stream:1 이면 SSE 로 답한다', /text\/event-stream/.test(r1.headers.get('content-type') || ''));
  ok('학생 대화가 실린 응답은 캐시 금지', /no-store/.test(r1.headers.get('cache-control') || ''));
  const ev1 = await readAll(r1);
  ok('문장 → done 순서이고 done 에 정본이 통째로 실린다', ev1.length === 2 && ev1[0].t === 'Hi there.' && ev1[1].done === 1 && ev1[1].ok === true && ev1[1].status === 200 && ev1[1].ai_response === 'Hi there. hi', JSON.stringify(ev1));
  const r2 = await M.warmupChatEntry(mkReq({ stream: 1 }), async () => new Response(JSON.stringify({ detail: 'ai_failed' }), { status: 502 }));
  const ev2 = await readAll(r2);
  ok('핸들러가 502 면 done 에 ok:false · status 502', ev2.length === 1 && ev2[0].ok === false && ev2[0].status === 502, JSON.stringify(ev2));
  const r3 = await M.warmupChatEntry(mkReq({ stream: 1 }), async () => { throw new Error('boom'); });
  const ev3 = await readAll(r3);
  ok('핸들러가 던져도 조용히 닫지 않고 done 으로 말한다', ev3.length === 1 && ev3[0].done === 1 && ev3[0].status === 500 && ev3[0].ok === false, JSON.stringify(ev3));
}

/* ═══════════════ B. index.ts 배선 ═══════════════ */
console.log('\n[B] index.ts 배선');
const I = strip(INDEX);
ok('라우터가 입구를 지나 핸들러를 부른다', /warmupChatEntry\(\s*request\s*,\s*\(req,\s*send\)\s*=>\s*handleWarmupChat\(req,\s*env,\s*send\)\s*\)/.test(I));
const hIdx = I.indexOf('async function handleWarmupChat(');
const hOpen = hIdx >= 0 ? I.indexOf('Promise<Response> {', hIdx) + 'Promise<Response> '.length : -1;
const hSig = hIdx >= 0 && hOpen > hIdx ? I.slice(hIdx, hOpen) : '';
ok('핸들러가 sseSend 를 받고 기본값은 null', /sseSend[\s\S]*=\s*null\s*\)\s*:\s*Promise/.test(hSig), hSig);
const hBody = hSig ? blockAt(I, hOpen) : '';
ok('전제: 핸들러 몸통을 오려 냈다', hBody.length > 2000);
const lm = /const live = ([^;]+);/.exec(hBody);
ok('전제: live 를 만드는 식을 찾았다', !!lm);
if (lm) {
  const ev = (sseSend) => attempt('live 식', () => new Function('sseSend', 'createWarmupLive', 'ctxLang', 'sanityCap', 'ctxFriend', 'studentInput',
    'return ' + lm[1])(sseSend, () => 'LIVE', 'en', 0, 'Emma', 'hi'));
  ok('스트림을 원하면 live 를 만든다', ev(() => {}) === 'LIVE');
  ok('(짝) 원하지 않으면 live 는 null — 예전 경로 그대로', ev(null) === null);
}
ok('첫 모델 호출이 live 를 넘긴다', /runWarmup\(\s*messages\s*,\s*0\.7\s*,\s*live\s*\)/.test(hBody));
ok('흘려보낼 때는 stream:true 로 부른다', /stream:\s*true/.test(hBody) && /readWarmupAiStream\(/.test(hBody));
const fIdx = hBody.indexOf('...(live ? {');
const fObj = fIdx >= 0 ? blockAt(hBody, fIdx + '...(live ? '.length) : '';
const fm = fObj && hBody.slice(fIdx + '...(live ? '.length + fObj.length).startsWith(' : {})') ? [null, fObj] : null;
ok('전제: 응답에 덧붙이는 식을 찾았다', !!fm);
if (fm) {
  const ev = (live) => attempt('응답 식', () => new Function('live', 'aiText', 'return ({...(live ? ' + fm[1] + ' : {})})')(live, 'Hi.'));
  const fakeLive = { replacedBy: () => 1, sent: () => 2, halted: () => '' };
  const a = ev(fakeLive);
  ok('흘려보낸 차례면 replaced·streamed 를 싣는다', a && a.replaced === 1 && a.streamed === 2 && !('halted' in a), JSON.stringify(a));
  const b = ev({ replacedBy: () => 1, sent: () => 0, halted: () => 'unsafe' });
  ok('멈췄으면 이유 코드를 싣는다', b && b.halted === 'unsafe');
  const c = ev(null);
  ok('(짝) 옵트인 안 한 응답에는 칸이 하나도 안 늘어난다', c && Object.keys(c).length === 0);
}
const latCalls = (hBody.match(/await logWarmupLatency\(/g) || []).length;
ok('지연 기록을 실패(502)·성공 두 길에서 남긴다', latCalls >= 2, String(latCalls));
const lw = /const logWarmupLatency = async \([^)]*\)[^{]*=> \{/.exec(hBody);
const lwBody = lw ? blockAt(hBody, lw.index + lw[0].length - 1) : '';
ok("지연 기록은 feature 'warmup' 이고 try 로 감싼다", /feature:\s*'warmup'/.test(lwBody) && /try\s*\{[\s\S]*recordAiLatency\(/.test(lwBody) && /catch/.test(lwBody));
ok('지연 기록에 글(본문)은 안 싣고 길이만', /chars:/.test(lwBody) && !/text:\s*(replyText|aiText|studentInput)/.test(lwBody));

/* ═══════════════ C. 화면 — 오려 내 실제로 돌린다 ═══════════════ */
console.log('\n[C] 화면');
const H = HTML;
const names = ['_stopSpeak', '_stmWanted', '_speakLive', '_stmEnd', '_stmShow', '_stmDrop', '_stmSentence', '_stmRead', '_stmTurn'];
const parts = {};
for (const n of names) { parts[n] = fnSrc(H, n); ok('전제: ' + n + ' 를 오려 냈다', parts[n].length > 20); }

function sandbox() {
  const env = {
    calls: { addMsg: [], speak: [], play: [], hooks: [], fix: 0, chips: 0, stops: 0 },
  };
  const pre = `
    var _speakSeq=0, _ttsCache={}, _ttsEng={}, _mixIdx=0, _warmPaused=false, _warmEpoch=1, _speechOn=true, _latCur=null;
    var _ttsAudio=null, window={ ReadableStream:ReadableStream, TextDecoder:TextDecoder }, _speakLiveNext=null, _stmCur=null, _addMsgQuiet=false, location={search:''};
    var localStorage={getItem:function(){return null;}};
    var ZHMALE=false; function _zhMaleWanted(){ return ZHMALE; }
    function mkEl(){ var e={ children:[], className:'', innerHTML:'', removed:false, remove:function(){ e.removed=true; },
      appendChild:function(c){ e.children.push(c); }, querySelector:function(){ return { set innerHTML(v){ e.text=v; } }; } }; return e; }
    var document={ createElement:function(){ return mkEl(); } };
    var log=mkEl(); log.scrollTop=0; log.scrollHeight=0;
    function escapeHtml(s){ return String(s); } function renderMsg(s){ return String(s); }
    function _speechText(s){ return String(s).trim(); }
    function _friendLabelNow(){ return 'Emma'; }
    function _enMaleGapMs(){ return 0; }
    function _ttsPrefetch(){ return null; }
    function _autoHook(k){ C.hooks.push(k); }
    var DONE=0;
    function _ttsSpeak(c, spk, k, btn, seq, done, play){ play('blob:'+c, '', done, c); }
    function PLAY(u, eng, next, c){ C.play.push(c); C.pending.push(next); }
    function speak(t){ var live=_speakLiveNext; if(live) _speakLiveNext=null; _stopSpeak(); C.speak.push(t);
      if(live){ _mixIdx=(_mixIdx+1)%4; _speakLive(live, 'aura', function(){ DONE++; }, PLAY); } }
    function addMsg(t, who){ C.addMsg.push({ t:t, who:who, quiet:_addMsgQuiet }); if(who==='ai' && !_addMsgQuiet) speak(t); }
    function showFixCard(){ C.fix++; } function showAnswerChips(){ C.chips++; }
  `;
  const body = names.map(n => parts[n]).join('\n');
  const api = `return { get seq(){return _speakSeq;}, get done(){return DONE;}, get mix(){return _mixIdx;}, setMix:function(v){_mixIdx=v;},
    get stmCur(){return _stmCur;}, setZh:function(v){ZHMALE=v;}, setSearch:function(s){location.search=s;},
    setSpeech:function(v){_speechOn=v;},
    _stopSpeak:_stopSpeak, _stmWanted:_stmWanted, _speakLive:_speakLive, _stmEnd:_stmEnd, _stmSentence:_stmSentence, _stmTurn:_stmTurn, PLAY:PLAY };`;
  env.calls.pending = [];
  const f = new Function('C', 'ReadableStream', 'TextDecoder', pre + body + api);
  env.api = f(env.calls, function () {}, TextDecoder);
  return env;
}

const sseResp = (events) => {
  const txt = events.map(e => 'data: ' + JSON.stringify(e) + '\n\n').join('');
  const enc = new TextEncoder(); const pieces = txt.match(/[\s\S]{1,9}/g) || [];
  return { body: { getReader() { let i = 0; return { read: async () => i < pieces.length ? { value: enc.encode(pieces[i++]), done: false } : { value: undefined, done: true }, cancel() {} }; } } };
};
const typingEl = () => ({ removed: false, remove() { this.removed = true; } });

let S = attempt('샌드박스 만들기', () => sandbox());
if (S) {
  const A = S.api, C = S.calls;
  console.log('\n[C1] 옵트인 판정(화면)');
  ok('평소에는 흘려받기를 원한다', A._stmWanted() === true);
  A.setZh(true);
  ok('(짝) 중국어 남자 목소리면 흘려받지 않는다(Azure 호출 횟수)', A._stmWanted() === false);
  A.setZh(false); A.setSearch('?stream=0');
  ok('?stream=0 이면 끈다', A._stmWanted() === false);
  A.setSearch('');

  console.log('\n[C2] 문장 큐 — 오는 대로 이어 읽고, 끝에서 done 한 번');
  const L = { q: [], i: 0, pf: [], n: 0, text: '', epoch: 1, lt0: Date.now(), ls: null };
  const ty = typingEl();
  A._stmSentence(L, 'Hello!', ty);
  ok('첫 문장이 오면 «입력 중» 을 걷고 바로 읽는다', ty.removed && C.speak.length === 1 && C.play.length === 1 && C.play[0] === 'Hello!');
  ok('첫 문장 때 reply 훅을 알린다', C.hooks[0] === 'reply');
  C.pending.shift()();          // 첫 문장 끝
  ok('큐가 비면 기다린다(아직 done 아님)', A.done === 0 && typeof L.wake === 'function');
  A._stmSentence(L, 'Do you like cats?', ty);
  ok('뒤 문장은 큐에서 이어 읽는다(speak 를 또 부르지 않음)', C.speak.length === 1 && C.play.length === 2 && C.play[1] === 'Do you like cats?');
  C.pending.shift()();
  A._stmEnd(L);
  ok('끝(done 이벤트) 뒤 다 읽으면 done 을 한 번 부른다', A.done === 1);
  A._stmEnd(L);
  ok('done 은 두 번 안 부른다', A.done === 1);

  console.log('\n[C3] 중앙 정지가 큐도 끊는다');
  const S2 = sandbox(); const A2 = S2.api, C2 = S2.calls;
  const L2 = { q: [], i: 0, pf: [], n: 0, text: '', epoch: 1, lt0: Date.now(), ls: null };
  A2._stmSentence(L2, 'One.', typingEl());
  C2.pending.shift()();
  ok('전제: 큐가 다음 문장을 기다린다', typeof L2.wake === 'function' && A2.stmCur === L2);
  A2._stopSpeak();
  ok('_stopSpeak 가 기다리는 큐의 깨움 줄을 걷는다', L2.wake == null && A2.stmCur == null);
  A2._stmSentence(L2, 'Two.', typingEl());
  ok('끼어든 뒤 온 문장은 읽지 않는다', C2.play.length === 1 && L2.cut === 1);

  console.log('\n[C4] 한 차례 — 정본(done) 처리');
  const runTurn = async (events, setup) => {
    const s = sandbox(); if (setup) setup(s.api);
    const r = await s.api._stmTurn(sseResp(events), 1, typingEl(), Date.now(), null);
    return { s, r };
  };
  let t = await runTurn([{ t: 'Hello.' }, { t: 'How are you?' }, { done: 1, ok: true, status: 200, ai_response: 'Hello. How are you?', replaced: 0, fix: null }]);
  ok("같으면 정본 말풍선은 «조용히» — 다시 안 읽는다", t.r === 'done' && t.s.calls.addMsg.length === 1 && t.s.calls.addMsg[0].quiet === true && t.s.calls.addMsg[0].t === 'Hello. How are you?' && t.s.calls.speak.length === 1, JSON.stringify(t.s.calls.addMsg));
  ok('교정 카드·대답 보기도 그린다', t.s.calls.fix === 1 && t.s.calls.chips === 1);
  ok('번갈아 모드: 말풍선 뒤 차례 번호를 «읽은 뒤» 값으로 복원', t.s.api.mix === 1);
  t = await runTurn([{ t: 'Do you like balls?' }, { done: 1, ok: true, status: 200, ai_response: 'Do you like dogs?', replaced: 1 }]);
  ok('(짝) 정본이 달라졌으면 멈추고 정본을 처음부터 읽는다', t.s.calls.addMsg.length === 1 && t.s.calls.addMsg[0].quiet === false && t.s.calls.speak.length === 2 && t.s.calls.speak[1] === 'Do you like dogs?', JSON.stringify(t.s.calls.speak));
  t = await runTurn([{ done: 1, ok: true, status: 200, ai_response: 'Hi!', replaced: 0, halted: 'empathy' }]);
  ok('하나도 안 흘렸으면(공감 가드 등) 예전처럼 읽는다', t.s.calls.addMsg.length === 1 && t.s.calls.addMsg[0].quiet === false && t.s.calls.speak[0] === 'Hi!' && t.s.calls.hooks[0] === 'reply');
  t = await runTurn([]);
  ok('아무것도 못 받으면 retry(예전 방식으로 다시)', t.r === 'retry' && t.s.calls.addMsg.length === 0);
  t = await runTurn([{ done: 1, ok: false, status: 502, detail: 'ai_failed' }]);
  ok('502 면 오류 안내만', t.s.calls.addMsg.length === 1 && t.s.calls.addMsg[0].who === 'sys');
  t = await runTurn([{ t: 'Partial answer.' }]);
  ok('문장만 오고 done 이 끊기면 받은 만큼을 보여 주고 «끊겼다» 고 말한다', t.r === 'done' && t.s.calls.addMsg.some(m => m.who === 'ai' && m.t === 'Partial answer.') && t.s.calls.addMsg.some(m => m.who === 'sys'));
  t = await runTurn([{ t: 'Hello.' }, { done: 1, ok: true, status: 200, ai_response: 'Hello.', replaced: 0 }], (a) => a.setSpeech(false));
  ok('소리를 꺼 두었으면 미리보기만 하고 정본 addMsg 가 알린다', t.s.calls.play.length === 0 && t.s.calls.addMsg[0].quiet === false);
}

console.log('\n[C5] sendMsg·speak·addMsg 배선');
const send = strip(fnSrc(H, 'sendMsg'));
ok('전제: sendMsg 를 오려 냈다', send.length > 500);
const sm = /var _stmOn = ([^;]+);\s*if\(_stmOn\) body\.stream = 1;/.exec(send);
ok('옵트인은 _stmWanted() 일 때만 stream:1', !!sm && /_stmWanted\(\)/.test(sm[1]));
const cond = /if\(([^{]*?r\.ok[^{]*)\)\{\s*if\(await _stmTurn\(/.exec(send);   // ⚠️ «모양» 이 아니라 «답» 으로 — 조건을 뒤집어도 찾고, 평가해서 잡는다
ok('전제: 스트림 분기 조건을 찾았다', !!cond);
if (cond) {
  const evc = (stmOn, ct) => attempt('분기 조건', () => new Function('_stmOn', 'r', 'String', 'return (' + cond[1] + ');')(stmOn, { ok: true, body: {}, headers: { get: () => ct } }, String));
  ok('옵트인 + SSE 응답이면 스트림 경로', evc(true, 'text/event-stream; charset=utf-8') === true);
  ok('(짝) 옵트인 안 했으면 예전 경로', evc(false, 'text/event-stream') === false);
  ok('(짝) 옛 서버가 JSON 으로 답하면 예전 경로', evc(true, 'application/json') === false);
}
ok("retry 면 stream 을 빼고 한 번 더 묻는다", /delete body\.stream;[\s\S]{0,200}warmupFetch\(/.test(send));
const sp = strip(fnSrc(H, 'speak'));
const iLive = sp.indexOf('_speakLive(live'), iKey = sp.indexOf('var key'), iZh = sp.indexOf('_zhMaleVoiceReady()');
ok('speak: 큐 모드는 캐시·조각 나누기보다 앞, 중국어 기기 목소리 갈래보다 뒤', iLive > 0 && iLive < iKey && iZh > 0 && iZh < iLive);
ok('speak: 큐 모드는 다시 듣기(btn)에는 안 쓴다', /if\(live && !btn\)/.test(sp));
const am = strip(fnSrc(H, 'addMsg'));
ok('addMsg: 조용히 모드면 speak 대신 다시 듣기 글만 맞춘다', /if\(_addMsgQuiet\)\{[^}]*_lastAiSpeak=/.test(am) && /else speak\(text\)/.test(am));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
