// 🎙️🤫 A.i 선생님 수업 — «목소리» 와 «침묵» 자동 회귀 하니스 (2026-10-18)
// 사장님 제보 두 가지를 «실제로 돌려» 봅니다(문자열이 «있는가» 가 아니라 답을 봅니다).
//   ① 대화 중 갑자기 남자 목소리 — 대화 차례(따라 말하기·질문·대답·다시 듣기)는 언제나 Emma('f').
//      남자 역할 목소리('m')는 «이야기 듣기(read)» 차례에서만 나온다(짝: 그 차례에서는 실제로 나온다).
//   ② 따라 말하지 않았는데 다음 쪽으로 넘어감 — 침묵(no-speech)은 «시도» 로 세지 않는다.
//      침묵만으로는 절대 다음 차례로 안 넘어가고, 두 번째 침묵부터는 마이크를 저절로 켜지 않는다(hold).
//      (짝: 말해 본 시도 3번이면 예전처럼 넘어간다 · 맞게 말하면 넘어간다 · 넘어가기 버튼은 넘어간다)
//   ③ 서버 음성이 실패했을 때 기기 목소리 — 여자 차례에 남자 목소리(Microsoft David 등)를 고르지 않는다.
//   ④ 페이지 배선 — hold 면 마이크를 저절로 켜지 않는다(짝: hold 가 아니면 켠다 · 다시 듣기를 누르면 다시 켠다).
// 443레슨 × 여러 씨앗(기본 3, AI_CLASS_FUZZ_SEEDS 로 늘림)을 무작위 대답으로 끝까지 수업합니다. 실패하면 종료코드 1.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const PUB = path.join(ROOT, 'cloudflare-deploy', 'public');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; if (fails.length < 40) fails.push(m); } }

const ENGINE = process.env.AI_CLASS_ENGINE || path.join(PUB, 'js', 'ai-class-engine.js');
const html = fs.readFileSync(process.env.AI_CLASS_PAGE || path.join(PUB, 'ai-class.html'), 'utf8');
const E = require(ENGINE);
const cat = JSON.parse(fs.readFileSync(path.join(PUB, 'data', 'ai-class-catalog.json'), 'utf8'));
const KEY = /^\[(.+?)\]\s*(.*?)\s*\/\s*Slide(\d+)\.JPG$/i, FILES = {};
function unitOf(c) {
  const d = FILES[c.file] || (FILES[c.file] = JSON.parse(fs.readFileSync(path.join(PUB, 'data', 'tb-say', c.file + '.json'), 'utf8')));
  const pages = [];
  Object.keys(d).forEach(k => { const m = KEY.exec(k); if (m && m[1] === c.book && m[2] === c.part) pages.push({ slide: +m[3], lines: d[k] }); });
  pages.sort((a, b) => a.slide - b.slide);
  return { pages, title: c.title, book: c.book };
}
function fnSrc(src, name) {
  const i = src.indexOf('function ' + name + '(');
  if (i < 0) return '';
  let d = 0;
  for (let k = src.indexOf('{', i); k < src.length; k++) { const ch = src[k]; if (ch === '{') d++; else if (ch === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  return '';
}
// 씨앗 있는 난수(같은 씨앗이면 같은 수업 — 실패를 다시 재현할 수 있게)
function rng(seed) { let x = seed >>> 0 || 1; return () => { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; return x / 4294967296; }; }

// ───────────── ① ② 엔진 반복 수업 ─────────────
// «넘어가요» 문구는 엔진 소스의 move·skip 표에서 «읽어» 온다(교재 문장 «next one» 과 헷갈리지 않게 — 정확일치)
const ENG_SRC = fs.readFileSync(ENGINE, 'utf8');
const MOVE_LINES = new Set();
for (const m of ENG_SRC.matchAll(/^\s*(?:move|skip): \[(.*)\],?\s*$/gm)) for (const q of m[1].matchAll(/\[\s*'((?:[^'\\]|\\.)*)'/g)) MOVE_LINES.add(q[1].replace(/\\'/g, "'"));
ok(MOVE_LINES.size >= 8, `move/skip lines read from the engine: ${MOVE_LINES.size}`);
const SEEDS = Math.max(1, +(process.env.AI_CLASS_FUZZ_SEEDS || 3));
let runs = 0, ended = 0, mVoices = 0, maleReadSteps = 0, silences = 0, holds = 0;
const v1 = [], v2 = [], v3 = [], v4 = [], v5 = [];   // 위반 모음(처음 몇 개만)
const push = (arr, m) => { if (arr.length < 5) arr.push(m); };
for (const c of cat) {
  const u = unitOf(c); if (!u.pages.length) continue;
  for (let seed = 1; seed <= SEEDS; seed++) {
    const R = rng(seed * 7919 + c.title.length * 31 + c.file.length);
    let st = E.step(E.create(u, { name: 'Minseo', nameKo: '민서' }), { type: 'start' }).state;
    runs++;
    let lastQuiet = false;
    for (let k = 0; k < 6000 && st.phase !== 'done'; k++) {
      const t = st.plan[st.i];
      let ev;
      if (st.phase === 'await') {
        const x = R();
        if (t.t === 'find') ev = { type: 'tap', page: t.page, line: x < 0.7 ? t.line : (t.line + 1) % 9 };
        else if (x < 0.4) ev = { type: 'silence' };
        else if (x < 0.55) ev = { type: 'say', text: 'banana rocket pizza' };
        else if (x < 0.6) ev = { type: 'replay', slow: x < 0.58 };
        else if (x < 0.63) ev = { type: 'skip' };
        else ev = { type: 'say', text: t.free || t.say || 'I am fine.' };
      } else ev = { type: 'spoken' };
      const before = st.i, beforeTries = st.tries, beforeT = t;
      const r = E.step(st, ev);
      // ① 남자 목소리는 «이야기 듣기» 차례에서만
      const touched = []; for (let q = before; q <= r.state.i && q < r.state.plan.length; q++) touched.push(r.state.plan[q]);
      r.out.forEach(o => {
        if (o.voice === 'm') {
          mVoices++;
          if (!touched.some(s => s && s.t === 'read')) push(v1, `${c.title}: '${o.speak && o.speak.en}' in ${beforeT && (beforeT.t + '/' + beforeT.mode)}`);
        }
        if (o.voice != null && o.voice !== 'm' && o.voice !== 'f') push(v1, 'unknown voice ' + o.voice);
      });
      // ② 침묵은 시도로 세지 않고 넘어가지 않는다
      if (ev.type === 'silence' && beforeT && beforeT.t === 'repeat') {
        silences++;
        if (r.state.i !== before) push(v2, `${c.title}: silence moved ${before}→${r.state.i} ('${beforeT.say}')`);
        if (r.state.tries !== beforeTries) push(v2, `${c.title}: silence counted as a try (${beforeTries}→${r.state.tries})`);
        if (r.out.some(o => o.speak && MOVE_LINES.has(o.speak.en))) push(v2, `${c.title}: silence led to «move on» line`);
        lastQuiet = true;
      }
      // hold 는 «말하기 차례가 다시 열릴 때» 실린다 — 두 번째 침묵부터만, 말하고 나면 풀린다
      r.out.forEach(o => {
        if (o.listen != null && o.hold) { holds++; if (!(r.state.quietRun >= 2)) push(v3, `${c.title}: hold after quietRun=${r.state.quietRun}`); }
        if (o.listen != null && !o.hold && r.state.quietRun >= 2 && r.state.plan[r.state.i] && r.state.plan[r.state.i].t === 'repeat' && lastQuiet && st.plan[st.i] === r.state.plan[r.state.i]) push(v3, `${c.title}: no hold after two silences`);
      });
      if (ev.type !== 'silence') lastQuiet = false;
      st = r.state;
    }
    if (st.phase === 'done') ended++; else push(v4, `${c.title} seed ${seed}: not finished (i=${st.i}/${st.plan.length})`);
  }
  // 짝: «이야기 듣기» 의 남자 역할 줄은 지금도 남자 목소리로 읽는다
  const plan = E.create(u, {}).plan;
  plan.forEach(s => { if (s.t === 'read' && s.male) maleReadSteps++; });
}
ok(runs > 1000 || SEEDS < 3, `runs ${runs}`);
ok(v1.length === 0, 'male voice outside story reading: ' + v1.join(' | '));
ok(v2.length === 0, 'silence advanced or counted: ' + v2.join(' | '));
ok(v3.length === 0, 'hold wrong: ' + v3.join(' | '));
ok(v4.length === 0, 'lesson did not finish: ' + v4.join(' | '));
ok(ended === runs, `ended ${ended}/${runs}`);
ok(silences > 1000, `silences tested ${silences}`);
ok(holds > 50, `holds seen ${holds} (두 번째 침묵에서 hold 가 실려야 함)`);
ok(maleReadSteps === 0 || mVoices > 0, `male read steps ${maleReadSteps} but male voice never spoken (짝: 이야기 듣기는 역할 목소리 그대로)`);

// ② 정해진 시나리오 — 화면 사진의 바로 그 레슨(BTS 1 001 · «Is she a girl?» 은 남자 역할 줄)
const c001 = cat.find(c => /^BTS 1 001\b/.test(c.book));
ok(!!c001, 'BTS 1 001 lesson missing');
function toFirst(c, pred) {
  let st = E.step(E.create(unitOf(c), { name: 'Minseo' }), { type: 'start' }).state;
  for (let k = 0; k < 4000 && st.phase !== 'done'; k++) {
    const t = st.plan[st.i];
    if (st.phase === 'await' && pred(t)) return st;
    st = E.step(st, st.phase === 'await' ? (t.t === 'find' ? { type: 'tap', page: t.page, line: t.line } : { type: 'say', text: t.free || t.say || 'I am fine.' }) : { type: 'spoken' }).state;
  }
  return null;
}
if (c001) {
  // 대화 차례 중 «남자 역할» 문장을 다루는 첫 차례
  const sm = toFirst(c001, t => t && t.t === 'repeat' && (t.male || t.askMale));
  ok(!!sm, 'no repeat step with a male-role line in BTS 1 001');
  if (sm) {
    const voices = [];
    let s = sm;
    for (const ev of [{ type: 'replay' }, { type: 'replay', slow: true }, { type: 'say', text: 'banana' }, { type: 'silence' }]) {
      const r = E.step(s, ev); r.out.forEach(o => { if (o.voice) voices.push(o.voice + ':' + (o.speak && o.speak.en)); });
      s = r.state; if (s.phase === 'teacher') s = E.step(s, { type: 'spoken' }).state;
    }
    ok(voices.length >= 3 && voices.every(v => v.startsWith('f:')), 'male-role sentence in a conversation turn must be Emma: ' + voices.join(' | '));
  }
  // 침묵만 50번 — 첫 따라 말하기 차례에서 한 발짝도 안 움직인다
  const s0 = toFirst(c001, t => t && t.t === 'repeat');
  ok(!!s0, 'no repeat step');
  if (s0) {
    let s = s0; const i0 = s.i; let holdOn = 0, firstHold = -1;
    for (let k = 0; k < 50; k++) {
      s = E.step(s, { type: 'silence' }).state;
      const r = E.step(s, { type: 'spoken' }); s = r.state;
      const L = r.out.find(o => o.listen != null);
      if (L && L.hold) { holdOn++; if (firstHold < 0) firstHold = k; }
    }
    ok(s.i === i0 && s.phase === 'await', `50 silences moved the lesson (${i0}→${s.i}, ${s.phase})`);
    ok(s.tries === 0, `silences counted as tries (${s.tries})`);
    ok(firstHold === 1 && holdOn === 49, `hold must start at the 2nd silence and stay (first ${firstHold}, on ${holdOn})`);
    // 짝: 말하면 hold 가 풀린다
    let r = E.step(s, { type: 'say', text: 'banana rocket' }); s = r.state;
    r = E.step(s, { type: 'spoken' });
    const L = r.out.find(o => o.listen != null);
    ok(L && !L.hold, 'hold must clear after the student speaks');
    // 짝: 말해 본 시도 3번이면 예전처럼 넘어간다
    let s2 = s0; for (let k = 0; k < E.MAX_TRIES; k++) { s2 = E.step(s2, { type: 'say', text: 'banana rocket pizza' }).state; if (s2.phase === 'teacher' && s2.i === s0.i) s2 = E.step(s2, { type: 'spoken' }).state; }
    ok(s2.i > s0.i, `three real wrong tries must still move on (i ${s0.i}→${s2.i})`);
    // 짝: 맞게 말하면 넘어간다 · 넘어가기는 넘어간다
    const t0 = s0.plan[s0.i];
    ok(E.step(s0, { type: 'say', text: t0.say }).state.i > s0.i, 'correct answer must move on');
    ok(E.step(s0, { type: 'skip' }).state.i > s0.i, 'skip must move on');
    // 침묵 사이에 말한 시도가 섞여도 시도는 «말한 것» 만 센다
    let s3 = s0; s3 = E.step(s3, { type: 'silence' }).state; s3 = E.step(s3, { type: 'spoken' }).state;
    s3 = E.step(s3, { type: 'say', text: 'banana' }).state; s3 = E.step(s3, { type: 'spoken' }).state;
    s3 = E.step(s3, { type: 'silence' }).state; s3 = E.step(s3, { type: 'spoken' }).state;
    ok(s3.tries === 1 && s3.i === s0.i, `mixed: tries ${s3.tries}, i ${s3.i}`);
  }
}

// ───────────── ③ 기기 목소리 고르기 ─────────────
const rx = (name) => { const m = new RegExp('var ' + name + ' = (\\/.*\\/[a-z]*);').exec(html); return m ? m[1] : 'null'; };
const dvSrc = `${'var FEMALE_V = ' + rx('FEMALE_V')}; ${'var MALE_V = ' + rx('MALE_V')}; ${fnSrc(html, 'voiceGender')} ${fnSrc(html, 'deviceVoice')} return { voiceGender, deviceVoice };`;
let DV = null;
try { DV = new Function('speechSynthesis', dvSrc); } catch (e) { ok(false, 'deviceVoice not extractable: ' + e.message); }
const V = (name, lang) => ({ name, lang });
const POOL = [
  V('Microsoft David - English (United States)', 'en-US'), V('Microsoft Mark - English (United States)', 'en-US'), V('Microsoft Zira - English (United States)', 'en-US'),
  V('Microsoft Heami - Korean (Korean)', 'ko-KR'), V('Google US English', 'en-US'), V('Google UK English Female', 'en-GB'), V('Google UK English Male', 'en-GB'),
  V('Google 한국의', 'ko-KR'), V('Samantha', 'en-US'), V('Alex', 'en-US'), V('Daniel', 'en-GB'), V('Karen', 'en-AU'), V('Fred', 'en-US'),
  V('Microsoft Aria Online (Natural) - English (United States)', 'en-US'), V('Microsoft Guy Online (Natural) - English (United States)', 'en-US'),
  V('Microsoft Jenny Online (Natural) - English (United States)', 'en-US'), V('Microsoft Ryan Online (Natural) - English (United Kingdom)', 'en-GB'),
  V('English United States', 'en-US'), V('English (India)', 'en-IN'),
];
const MALE_NAMES = /david|mark|google uk english male|alex|daniel|fred|guy|ryan/i;
let dvRuns = 0, dvBad = [], dvMaleMiss = [];
try { if (DV) DV({ getVoices: () => [] }).deviceVoice('f'); } catch (e) { ok(false, 'deviceVoice not runnable: ' + e.message); DV = null; }
if (DV) {
  const R = rng(4242);
  for (let k = 0; k < 600; k++) {
    const list = POOL.filter(() => R() < 0.45).sort(() => R() - 0.5);
    const api = DV({ getVoices: () => list });
    const f = api.deviceVoice('f'), m = api.deviceVoice('m'); dvRuns++;
    if (f && MALE_NAMES.test(f.name)) dvBad.push(f.name + ' for Emma');
    if (f && !/^en/i.test(f.lang)) dvBad.push(f.name + ' not English');
    if (list.some(v => /^en/i.test(v.lang) && api.voiceGender(v) === 'm') && !(m && MALE_NAMES.test(m.name))) dvMaleMiss.push(list.map(v => v.name).join(','));
  }
  ok(dvBad.length === 0, 'device voice for Emma is male/non-English: ' + [...new Set(dvBad)].slice(0, 4).join(' | '));
  ok(dvMaleMiss.length === 0, 'male turn did not get a male voice when one exists: ' + dvMaleMiss.slice(0, 2).join(' || '));
  // 실사고 목록 — 한국어 윈도우 기본(David·Mark·Zira·Heami): Emma 는 Zira 여야 한다(첫 목소리 David 가 아니라)
  const win = DV({ getVoices: () => [POOL[0], POOL[1], POOL[2], POOL[3]] });
  ok(win.deviceVoice('f') && /Zira/.test(win.deviceVoice('f').name), 'Korean Windows: Emma must read with Zira, not David');
  ok(win.voiceGender(V('Google UK English Female', 'en-GB')) === 'f', "'Female' must not be read as 'male'");
  // 남자 목소리뿐이면 여자 차례는 브라우저 기본(null)으로 — 남자 이름을 «고르지» 않는다
  const onlyM = DV({ getVoices: () => [POOL[0], POOL[1]] });
  ok(onlyM.deviceVoice('f') === null, 'only male voices: Emma must not pick a male voice');
  // 목록이 비면(아직 로딩 전) null — 예외 없이
  ok(DV({ getVoices: () => [] }).deviceVoice('f') === null, 'empty voice list must return null');
  ok(DV({ getVoices: () => { throw new Error('x'); } }).deviceVoice('f') === null, 'getVoices throwing must return null');
}
// 배선: 기기 목소리 경로가 실제로 그 함수를 부르는가
const so = fnSrc(html, 'speakOnce');
ok(/var dv = deviceVoice\(voice === 'm' \? 'm' : 'f'\); if \(dv\) \{ u\.voice = dv;/.test(so), 'synth() must use deviceVoice for its utterance (when one was found)');

// ───────────── ④ 페이지 배선 — hold 면 마이크를 저절로 켜지 않는다 ─────────────
const at = fnSrc(html, 'armTalk');
let started = 0;
function armWith(holdMic) {
  started = 0;
  const f = new Function('ctx', `var paused=false,talk=true,auto=false,busy=false,askRec=null,askTok=0,SR=function(){},recBlocked=false,holdMic=${holdMic};
    var st={phase:'await',i:0,plan:[{t:'repeat'}]}; function talkNote(){} function startRec(){ ctx.n++; } ${at} armTalk(); return ctx.n;`);
  return f({ n: 0 });
}
try {
  ok(armWith(true) === 0, 'armTalk must not start the mic while holdMic');
  ok(armWith(false) === 1, 'armTalk must start the mic when not holding (짝)');
} catch (e) { ok(false, 'armTalk not runnable: ' + e.message); }
const runSrc = fnSrc(html, 'run');
ok(/listen\(o\.listen, o\.hold\)/.test(runSrc), 'run() must pass o.hold to listen()');
ok(/holdMic = !!hold/.test(fnSrc(html, 'listen')), 'listen() must set holdMic from hold');
ok(/s\.replay; \}\)\) \{ holdMic = false;/.test(runSrc), 'replay (다시 듣기) must clear holdMic before arming the mic');

console.log(`엔진 반복 수업 ${runs}회(레슨 ${cat.length} × 씨앗 ${SEEDS}) · 끝까지 ${ended} · 침묵 ${silences}회 · hold ${holds}회 · 남자 목소리 ${mVoices}회(이야기 듣기 남자 줄 ${maleReadSteps}) · 기기 목소리 ${dvRuns}회`);
if (fails.length) fails.forEach(f => console.log('❌ FAIL ' + f));
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
