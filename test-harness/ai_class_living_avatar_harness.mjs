// 🎓 A.i 선생님(/ai-class.html) 얼굴 = 공용 아바타(js/mango-avatar.js) — 2026-10-18
//   사장님 「A.i 선생님도 A.i 말하기·A.i 친구의 Emma 와 똑같이 — 입모양과 영어 단어 일치·눈 깜빡임·눈썹·머리 움직임」.
//   ① 모듈 v14 — mouth()(화면이 정한 입), attach() 반환값, __mgAvatarBaseW — 를 «실제로 돌려» 봅니다(가짜 DOM).
//   ② 화면 배선 — setMouth/stopMouth/avBind/speakOnce 를 소스에서 오려 내 실제로 돌려 «무엇을 부르는가» 를 봅니다.
//   「되는가」 옆에 「예전 동작은 그대로인가」를 짝으로 둡니다(짝이 없으면 «언제나 입을 벌림» 같은 변이도 통과합니다).
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), '..');
const PUB = path.join(ROOT, 'cloudflare-deploy', 'public');
const MOD = fs.readFileSync(process.env.AV_SRC || path.join(PUB, 'js', 'mango-avatar.js'), 'utf8');
const HTML = fs.readFileSync(process.env.PAGE_SRC || path.join(PUB, 'ai-class.html'), 'utf8');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  ❌ ' + m); } };

// ── ① 모듈을 가짜 DOM 에서 실제로 돌린다 ──
class Media {
  constructor(){ this.events = {}; this.paused = true; this.ended = false; this.readyState = 4; this.style = {}; this.currentTime = 0; }
  addEventListener(n, f){ (this.events[n] ||= []).push(f); }
  emit(n){ for (const f of this.events[n] || []) f(); }
  pause(){ this.paused = true; } load(){} removeAttribute(){} appendChild(){} play(){ this.paused = false; return Promise.resolve(); }
}
function boot(win){
  const drawn = [];
  const ctx = { clearRect(){}, drawImage(im, ...r){ drawn.push([String(im && im.src || ''), r[0], r[1]]); }, getImageData(){ return { data: new Uint8ClampedArray(4) }; }, putImageData(){}, setTransform(){}, save(){}, restore(){} };
  const video = new Media();
  const canvas = { style: {}, width: 0, height: 0, classList: { toggle(){} }, getContext(){ return ctx; } };
  const ring = { style: {}, getBoundingClientRect(){ return { width: 320 }; } };
  const pending = new Map(); let next = 0;
  class Image { constructor(){ this.complete = true; this.naturalWidth = 512; this.naturalHeight = 640; } set src(v){ this._src = v; queueMicrotask(() => this.onload && this.onload()); } get src(){ return this._src; } }
  vm.runInNewContext(MOD, { window: win, Image, Date, WeakMap, Uint8Array, Uint8ClampedArray, Promise, setTimeout: () => 0, clearTimeout(){}, Math,
    document: { readyState: 'complete', hidden: false, head: { appendChild(){} }, createElement: () => ({ getContext: () => null }), addEventListener(){},
      getElementById(id){ return { 'tavatar-video': video, 'tavatar-canvas': canvas, 'tavatar-wrap': { classList: { toggle(){} } }, 'tavatar-ring': ring }[id]; } },
    requestAnimationFrame(f){ pending.set(++next, f); return next; }, cancelAnimationFrame(id){ pending.delete(id); } });
  const frame = () => { const fs2 = [...pending.values()]; pending.clear(); fs2.forEach(f => f()); };
  return { av: win.MangoAvatar, drawn, frame, canvas, pending };
}
class AudioContext {
  constructor(){ this.state = 'running'; this.destination = {}; }
  createAnalyser(){ return { fftSize: 512, getByteTimeDomainData(a){ a.fill(128); } }; }   // 무음 — 소리 크기로는 입이 안 벌어진다
  createMediaElementSource(){ return { connect(){} }; }
}
const lastFace = d => { for (let i = d.length - 1; i >= 0; i--) if (/emma-v2-(rest|mid|wide)/.test(d[i][0])) return d[i][0]; return ''; };

{
  // ①-1 attach 반환값 + 화면이 정한 입(mouth) — 물린 오디오가 «멈춰» 있어도 그 동안은 다문 입으로 굳히지 않는다
  const T = boot({ __mgAvatarWant: 'emma', AudioContext });
  await new Promise(queueMicrotask); await new Promise(queueMicrotask);
  const a = new Media();
  ok(T.av.attach(a) === true, '①-1 attach() 가 물렸을 때 true 를 돌려준다');
  ok(typeof T.av.mouth === 'function', '①-1 mouth() 가 있다');
  // 짝: mouth 없이 plainStart → 오디오가 멈춰 있으니 다문 입(예전 동작)
  T.drawn.length = 0; T.av.plainStart(); T.frame();
  ok(/rest/.test(lastFace(T.drawn)), '①-2 (예전 동작) 오디오가 멈춘 채 plainStart 면 다문 입 — ' + lastFace(T.drawn));
  T.av.plainStop();
  T.drawn.length = 0; T.av.mouth('wide'); T.frame();
  ok(/wide/.test(lastFace(T.drawn)), '①-3 mouth("wide") 면 오디오가 멈춰 있어도 크게 벌린 입 — ' + lastFace(T.drawn));
  ok(T.pending.size > 0, '①-3 mouth() 가 그리기를 켠다(다음 프레임이 걸려 있다)');
  await new Promise(r => setTimeout(r, 120));   // 입 바꾸는 최소 간격(캐릭터 hold)이 지나야 «살짝» 으로 바뀐다 — 다문 입만 곧바로
  T.drawn.length = 0; T.av.mouth('medium'); T.frame();
  ok(/mid/.test(lastFace(T.drawn)), '①-4 mouth("medium") → 살짝 벌린 입 — ' + lastFace(T.drawn));
  T.drawn.length = 0; T.av.mouth('closed'); T.frame();
  ok(/rest/.test(lastFace(T.drawn)), '①-5 mouth("closed") → 다문 입 — ' + lastFace(T.drawn));
  ok(T.pending.size > 0, '①-5 다문 입이어도 말하는 중이면 그리기를 계속한다');
  T.av.mouth('wide'); T.frame(); T.av.plainStop();
  ok(T.pending.size === 0, '①-6 plainStop() 이 그리기를 끈다');
  // 짝: plainStop 뒤에는 화면이 정한 입이 풀려 예전 동작(멈춘 오디오 = 다문 입)으로 돌아간다
  T.drawn.length = 0; T.av.plainStart(); T.frame();
  ok(/rest/.test(lastFace(T.drawn)), '①-7 plainStop 뒤 plainStart 는 화면이 정한 입을 끌고 오지 않는다 — ' + lastFace(T.drawn));
  T.av.plainStop();
  // mouth(null) 은 손만 뗀다(그리기를 새로 켜지 않는다)
  T.av.mouth(null); ok(T.pending.size === 0, '①-8 mouth(null) 은 그리기를 켜지 않는다');
  ok(T.canvas.width === 320, '①-9 __mgAvatarBaseW 를 안 세우면 캔버스 폭은 예전 그대로 320 — ' + T.canvas.width);
}
{
  // ①-10 입모양 표(정밀 경로)가 준비돼 있어도 화면이 정한 입을 따른다
  const win = { __mgAvatarWant: 'emma', AudioContext, AvatarVisemes: { prepare: () => Promise.resolve([{ start: 0, end: 1, value: 'B' }]), at: () => 'B', frame: () => ({ pose: 'B', tile: -1 }) } };
  const T = boot(win);
  await new Promise(queueMicrotask); await new Promise(queueMicrotask);
  const a = new Media(); a.src = 'blob:x'; T.av.attach(a);
  for (let i = 0; i < 4; i++) await new Promise(queueMicrotask);
  const cell = () => { const m = T.drawn.filter(d => /emma-v2-mouths/.test(d[0])).pop(); return m ? m[1] + ',' + m[2] : ''; };
  T.drawn.length = 0; T.av.mouth('wide'); T.frame(); const wide = cell();
  T.drawn.length = 0; T.av.mouth('closed'); T.frame(); const closed = cell();
  ok(!!wide && !!closed, '①-10 전제: 정밀 경로(입모양 아틀라스)로 그렸다 ' + wide + ' / ' + closed);
  ok(wide && closed && wide !== closed, '①-10 정밀 경로에서도 mouth 가 칸을 바꾼다(wide≠closed)');
  ok(closed === '0,0', '①-10 다문 입 = 아틀라스 첫 칸(X) — ' + closed);
  T.av.plainStop();
}
{
  const T = boot({ __mgAvatarWant: 'emma' });   // Web Audio 가 없는 브라우저
  await new Promise(queueMicrotask);
  ok(T.av.attach(new Media()) === false, '①-11 Web Audio 가 없으면 attach() 가 false — 화면이 글자 박자로 대신 움직인다');
}
{
  const T = boot({ __mgAvatarWant: 'emma', __mgAvatarBaseW: 512, AudioContext });
  ok(T.canvas.width === 512 && T.canvas.height === 640, '①-12 __mgAvatarBaseW=512 → 캔버스 512x640 — ' + T.canvas.width + 'x' + T.canvas.height);
  const U = boot({ __mgAvatarWant: 'emma', __mgAvatarBaseW: 5000, AudioContext });
  ok(U.canvas.width === 320, '①-13 범위 밖 값(5000)은 무시하고 320 — ' + U.canvas.width);
}

// ── ② 화면 배선 — 소스에서 함수를 오려 내 실제로 돌린다 ──
const strip = s => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"\\])\/\/[^\n]*/g, '$1');
function fnSrc(name){
  const i = HTML.indexOf('function ' + name + '('); if (i < 0) return '';
  const j = HTML.indexOf('{', i); let d = 0;
  for (let k = j; k < HTML.length; k++){ const c = HTML[k]; if (c === '{') d++; else if (c === '}') { d--; if (!d) return HTML.slice(i, k + 1); } }
  return '';
}
const NEED = ['mouthPlan', 'mouthTick', 'mouthAtWord', 'startMouth', 'stopMouth', 'setMouth', 'AV', 'avBind', 'speakOnce', 'wordIndexAt'];
const srcs = NEED.map(fnSrc);
NEED.forEach((n, i) => ok(!!srcs[i], '② 전제: 화면에서 ' + n + '() 를 오려 냈다'));
const code = strip(HTML);
ok(/window\.__mgAvatarWant = 'emma'; window\.__mgAvatarBaseW = 512;/.test(code), '② 화면이 emma · 캔버스 512 를 고른다');
ok(/document\.addEventListener\(ev, function\(\)\{ avBind\(\); \}/.test(code), '② 첫 터치·키에서 avBind() 로 소리 엔진을 물린다');
ok(!/id="faceMid"|faceMid'|faceWide'/.test(code), '② 옛 3장 겹치기 입(faceMid/faceWide)이 남아 있지 않다');

function makeEnv(avImpl){
  const log = [];
  const tile = { cls: new Set(), classList: { add(c){ tile.cls.add(c); }, remove(c){ tile.cls.delete(c); }, toggle(){} } };
  const audios = [];
  class FakeAudio { constructor(){ this.src = ''; this.playbackRate = 1; audios.push(this); } play(){ log.push('play'); return Promise.resolve(); } pause(){} }
  const win = { MangoAvatar: avImpl, Audio: FakeAudio, fetch: () => {} };
  const f = new Function('window', 'log', '$', 'Audio', 'ttsUrlImpl', `
    var mouthTO = 0, mouthPlanNow = null, mouthPos = 0, mouthBoundary = false;
    var ttsAudio = null, ttsFin = null, avBound = false;
    var sound = true, FAST = false, SPEEDS = [[1]], spd = 0;
    function ttsUrl(t, v){ return ttsUrlImpl(t, v); }
    function setTimeout(fn, ms){ return 0; } function clearTimeout(){}
    ${srcs.join('\n')}
    return { setMouth, stopMouth, startMouth, avBind, speakOnce, get avBound(){ return avBound; }, get ttsAudio(){ return ttsAudio; } };`);
  const api = f(win, log, () => tile, FakeAudio, () => Promise.resolve('blob:u'));
  return { api, log, tile, audios };
}
function fakeAv(attachResult, log){
  return { mouth(t){ log.push('mouth:' + t); }, plainStop(){ log.push('stop'); }, plainStart(){ log.push('start'); },
    attach(){ log.push('attach'); return attachResult; }, prepare(){ log.push('prepare'); return Promise.resolve(null); } };
}
{
  const L = []; const E = makeEnv(fakeAv(true, L));
  E.api.setMouth(2); E.api.setMouth(1); E.api.setMouth(0);
  ok(L.join() === 'mouth:wide,mouth:medium,mouth:closed', '②-1 setMouth(2/1/0) → mouth(wide/medium/closed) — ' + L.join());
  L.length = 0; E.api.stopMouth();
  ok(L.join() === 'mouth:null,stop', '②-2 stopMouth → mouth(null) 다음 plainStop — ' + L.join());
  L.length = 0;
  ok(E.api.avBind() === true && E.api.avBind() === true, '②-3 avBind() 가 물리면 true');
  ok(L.filter(x => x === 'attach').length === 1, '②-3 물리기는 한 번만(두 번째는 바로 true) — ' + L.join());
  ok(!!E.api.ttsAudio, '②-3 물릴 오디오 요소를 그 자리에서 만든다');
}
{
  const L = []; const E = makeEnv(fakeAv(false, L));
  ok(E.api.avBind() === false, '②-4 attach 가 false 면 avBind 도 false(글자 박자 경로로)');
  const E2 = makeEnv({ attach(){ return true; } });   // mouth 가 없는 옛 모듈·스텁
  ok(E2.api.avBind() === false, '②-5 mouth() 가 없는 모듈(스텁)이면 물리지 않는다');
}
// ②-6 서버 음성: 물렸으면 입은 모듈이 «소리» 를 따라가고(글자 박자 계획 안 씀), 못 물렸으면 글자 박자로 움직인다 — 짝
async function speakRun(attachResult){
  const L = []; const E = makeEnv(fakeAv(attachResult, L));
  let done = false; E.api.speakOnce('Hello my friend.', 'f', 1).then(() => { done = true; });
  for (let i = 0; i < 12; i++) await new Promise(r => setImmediate(r));
  return { L, E, done };
}
{
  const R = await speakRun(true);
  ok(R.L.includes('prepare'), '②-6 물렸으면 재생 전에 입모양 표를 준비(prepare) — ' + R.L.join());
  ok(R.E.log.includes('play'), '②-6 그리고 재생한다');
  ok(!R.L.some(x => /^mouth:(wide|medium)$/.test(x)), '②-6 물렸으면 글자 박자 계획으로 입을 벌리지 않는다(소리를 따른다) — ' + R.L.join());
  ok(R.E.tile.cls.has('speaking'), '②-6 물렸어도 칸에 «말하는 중» 표시');
  const S = await speakRun(false);
  ok(S.E.log.includes('play'), '②-7 (짝) 못 물려도 소리는 재생한다');
  ok(S.L.some(x => /^mouth:(wide|medium)$/.test(x)), '②-7 (짝) 못 물렸으면 글자 박자로 입을 움직인다 — ' + S.L.join());
}

console.log(`결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
