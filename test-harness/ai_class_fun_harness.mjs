// 🎵 A.i 선생님 수업 — «재미» 묶음 자동 회귀 하니스 (2026-10-10)
// 사장님 지시 7가지 중 코드로 잴 수 있는 것을 «실제로 돌려» 봅니다(문자열이 «있는가» 가 아니라 답을 봅니다).
//   ① 질문·빈칸 퀴즈 — 본수업(3단계)에 선생님이 묻고 학생이 대답하는 차례가 생기는가(레슨마다 3개 이하)
//      · 묻는 질문과 정답이 서로 맞는가(qaFits) · 빈칸 정답 낱말 하나만 말해도 통과하는가
//      · 빈칸을 처음 틀리면 정답을 말하지 않고 첫 글자 힌트만 주는가(짝: 맞히면 문장 전체를 들려준다)
//      · 자기 이야기로 답하면(내 말로 대답) 받아 주는가(짝: 질문과 무관한 말은 안 받는다)
//   ② Hello Song — 각 책의 첫 레슨(001)은 예전처럼 따라 말하기, 그 뒤 레슨은 노래(song) 차례가 생기는가
//   ③ 소리 모듈 — 가짜 AudioContext 로 실제로 돌려 «배경음악이 켜졌다 꺼진다»·«소리 끔이면 아무것도 안 낸다»
//   ④ 교재별 배경 — 페이지의 bgOf 를 오려 내 443레슨 전부가 «실제로 있는» 그림 파일을 가리키는가
//   ⑤ 페이지 배선 — 학생 차례엔 배경음악을 끄고, 질문·빈칸 차례엔 정답 문장을 화면에 안 보이는가
// 실패하면 종료코드 1.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import vm from 'node:vm';
import { createRequire } from 'node:module';

const HERE = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.join(HERE, '..');
const PUB = path.join(ROOT, 'cloudflare-deploy', 'public');
const require = createRequire(import.meta.url);
let pass = 0, fail = 0; const fails = [];
function ok(c, m) { if (c) pass++; else { fail++; fails.push(m); } }

const ENGINE = process.env.AI_CLASS_ENGINE || path.join(PUB, 'js', 'ai-class-engine.js');
const MUSIC = process.env.AI_CLASS_MUSIC || path.join(PUB, 'js', 'ai-class-music.js');
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

// ① ② 엔진 — 443레슨 전부의 수업 계획
let lessons = 0, withQuiz = 0, overQuiz = 0, badPair = [], firstSong = [], laterSong = 0, songAndRepeat = [];
for (const c of cat) {
  const u = unitOf(c); if (!u.pages.length) continue; lessons++;
  const plan = E.buildPlan ? E.create(u, { name: 'Minseo' }).plan : [];
  const quiz = plan.filter(s => s.quiz);
  if (quiz.length) withQuiz++;
  if (quiz.length > 3) overQuiz++;
  quiz.filter(s => s.mode === 'ask').forEach(s => { if (!E.qaFits(s.ask, s.say)) badPair.push(c.book + ': ' + s.ask + ' → ' + s.say); });
  const song = plan.filter(s => s.t === 'song');
  if (E.isFirstLesson(c.book) && song.length) firstSong.push(c.book);
  if (song.length) {
    laterSong++;
    // 노래로 부른 쪽은 따라 말하기에서 빠진다(같은 쪽을 두 번 시키지 않는다)
    const sp = song[0].page;
    if (plan.some(s => s.t === 'repeat' && s.page === sp && s.mode === 'main')) songAndRepeat.push(c.book);
  }
}
ok(lessons > 400, `lessons ${lessons}`);
ok(withQuiz === lessons, `quiz missing in ${lessons - withQuiz} lessons (선생님 질문이 없는 레슨)`);
ok(overQuiz === 0, `${overQuiz} lessons have more than 3 quiz steps`);
ok(badPair.length === 0, 'question/answer pairs that do not fit: ' + badPair.slice(0, 3).join(' | '));
ok(firstSong.length === 0, 'first lesson must keep repeat (no song): ' + firstSong.slice(0, 3).join(', '));
ok(laterSong > 100, `songs in later lessons: ${laterSong} (Hello Song 이 노래로 바뀌어야 함)`);
ok(songAndRepeat.length === 0, 'song page also repeated: ' + songAndRepeat.slice(0, 3).join(', '));
// 짝 — 첫 레슨 판정이 «전부 첫 레슨» 이 아니다
ok(E.isFirstLesson('BTS 1 001 (Welcome to school)') && !E.isFirstLesson('BTS 1 002 (Welcome to school)') && !E.isFirstLesson('BTS 10 010 (x)'), 'isFirstLesson wrong');

// ① 한 차례를 실제로 돌린다
function runTo(c, pred) {
  const u = unitOf(c); let st = E.step(E.create(u, { name: 'Minseo' }), { type: 'start' }).state;
  for (let k = 0; k < 4000 && st.phase !== 'done'; k++) {
    const t = st.plan[st.i];
    if (st.phase === 'await' && pred(t)) return st;
    let ev;
    if (st.phase === 'await') ev = t.t === 'find' ? { type: 'tap', page: t.page, line: t.line } : { type: 'say', text: t.free || t.say || 'I am fine.' };
    else ev = { type: 'spoken' };
    st = E.step(st, ev).state;
  }
  return null;
}
const blankLesson = cat.find(c => E.create(unitOf(c), {}).plan.some(s => s.mode === 'blank'));
const st0 = runTo(blankLesson, t => t && t.mode === 'blank');
ok(!!st0, 'could not reach a blank step');
if (st0) {
  const t = st0.plan[st0.i];
  // 처음 틀림 → 첫 글자 힌트, 정답 낱말·정답 문장을 말하지 않는다
  const r1 = E.step(st0, { type: 'say', text: 'banana pizza' });
  const spoken = r1.out.filter(o => o.speak).map(o => o.speak.en).join(' | ');
  ok(r1.out.some(o => o.reply === 'blankHint'), 'blank first miss: no hint');
  ok(!new RegExp('\\b' + t.blank + '\\b', 'i').test(spoken), 'blank first miss revealed the answer: ' + spoken);
  ok(r1.out.filter(o => o.show).every(o => !o.show.includes(t.blank) || o.show === t.shown), 'blank first miss shows answer');
  // 정답 낱말 하나만 말해도 통과 + 맞히면 문장 전체를 들려준다(짝)
  const r2 = E.step(st0, { type: 'say', text: t.blank });
  ok(r2.out.some(o => o.result && o.result.pass), 'blank: saying the missing word should pass');
  ok(r2.out.some(o => o.speak && o.speak.en === t.say), 'blank pass: full sentence not replayed');
}
// 자기 이야기로 대답 — 질문과 맞으면 받는다 / 무관한 말은 안 받는다(짝)
const askLesson = cat.find(c => E.create(unitOf(c), {}).plan.some(s => s.mode === 'ask' && /\byou(r)?\b/i.test(s.ask) && /^what\b/i.test(s.ask)));
const st1 = askLesson && runTo(askLesson, t => t && t.mode === 'ask' && /\byou(r)?\b/i.test(t.ask) && /^what\b/i.test(t.ask));
ok(!!st1, 'could not reach a personal ask step');
if (st1) {
  const t = st1.plan[st1.i];
  const content = t.ask.toLowerCase().replace(/[^a-z ]/g, '').split(' ').filter(w => w.length >= 3 && !/^(what|your|you|the|this|that|does|have)$/.test(w));
  const own = 'My ' + (content[0] || 'name') + ' is something special.';
  const a = E.step(st1, { type: 'say', text: own });
  ok(a.out.some(o => o.reply === 'ownTalk' || (o.result && o.result.own)), 'own answer not accepted: ' + t.ask + ' / ' + own);
  const b = E.step(st1, { type: 'say', text: 'banana pizza rocket' });
  ok(!b.out.some(o => o.reply === 'ownTalk'), 'unrelated words accepted as own answer');
}

// ③ 소리 모듈 — 가짜 AudioContext 로 실제로 돌린다
function fakeCtx() {
  const made = { osc: 0 };
  const param = () => ({ value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {}, linearRampToValueAtTime(v) { this.value = v; }, cancelScheduledValues() {} });
  class AC { constructor() { this.currentTime = 0; this.state = 'running'; this.destination = {}; }
    createGain() { return { gain: param(), connect() {} }; }
    createOscillator() { made.osc++; return { type: '', frequency: { value: 0 }, connect() {}, start() {}, stop() {} }; }
    resume() {} }
  return { AC, made };
}
const musicSrc = fs.readFileSync(MUSIC, 'utf8');
ok(!/setInterval\(/.test(musicSrc), 'music module must not use setInterval');
{
  const { AC, made } = fakeCtx(); const timers = new Map(); let tid = 0; const store = {};
  const win = { AudioContext: AC, localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } } };
  const sb = { window: win, localStorage: win.localStorage, setTimeout: (f) => { const id = ++tid; timers.set(id, f); return id; }, clearTimeout: id => timers.delete(id), Promise, Audio: function () { this.play = () => Promise.resolve(); this.addEventListener = () => {}; this.pause = () => {}; } };
  try {
    vm.runInNewContext(musicSrc, sb);
    const M = win.AiClassMusic;
    ok(!!M, 'AiClassMusic not exported');
    M.bgm('talk');
    ok(M._state().bgmLv > 0 && M._state().scheduling && made.osc > 0, 'bgm talk did not start ' + JSON.stringify(M._state()));
    M.bgm('off');
    ok(M._state().bgmLv === 0 && !M._state().scheduling, 'bgm off did not stop the scheduler');
    // 짝 — 배경음악 끔(사람이 끈 것) 이면 talk 여도 안 켜진다
    M.setBgm(false); M.bgm('talk');
    ok(M._state().bgmLv === 0 && store.aiClassBgm === '0', 'bgm pref off ignored');
    M.setBgm(true); M.bgm('talk');
    ok(M._state().bgmLv > 0, 'bgm pref back on: not playing');
    // 소리 끔 → 다 멈추고 효과음도 안 낸다
    M.setSound(false);
    ok(M._state().bgmLv === 0 && !M._state().scheduling, 'sound off did not stop bgm');
    const before = made.osc; ok(M.sfx('great') === false && made.osc === before, 'sfx played while sound off');
    M.setSound(true); ok(M.sfx('great') === true && made.osc > before, 'sfx not played (sound on)');
    // 노래 가락 길이 — 음절을 센다
    ok(M.sylls('Hello, teacher!') === 4 && M.sylls('How are you?') === 3, 'syllable count wrong');
  } catch (e) { ok(false, 'music module crashed: ' + e.message); }
}

// ④ 교재별 배경 — bgOf 를 오려 내 443레슨 전부가 실제 파일을 가리키는가
const bgSrc = fnSrc(html, 'bgOf');
ok(!!bgSrc, 'bgOf not found');
let bgOf = () => '';
try { bgOf = new Function(bgSrc + '; return bgOf;')(); } catch (e) { ok(false, 'bgOf eval failed: ' + e.message); }
const missingBg = [], noBg = [];
const used = new Set();
for (const c of cat) {
  const u = bgOf(c.book);
  if (!u) { noBg.push(c.book); continue; }
  used.add(u);
  if (!fs.existsSync(path.join(PUB, u.replace(/^\//, '')))) missingBg.push(c.book + ' → ' + u);
}
ok(noBg.length === 0, 'books without a background: ' + noBg.slice(0, 3).join(', '));
ok(missingBg.length === 0, 'background file missing: ' + missingBg.slice(0, 3).join(', '));
ok(used.size >= 36, `distinct backgrounds ${used.size} (책마다 달라야 함)`);
ok(bgOf('BTS 1 001 (x)') !== bgOf('BTS 2 001 (x)') && bgOf('BTS 10 001 (x)') === '/img/aiclass-bg/bts-10.webp', 'bgOf mapping wrong');
ok(bgOf('Unknown book') === '', 'unknown book must fall back to the default studio');
for (const f of fs.readdirSync(path.join(PUB, 'img', 'aiclass-bg'))) {
  ok(fs.statSync(path.join(PUB, 'img', 'aiclass-bg', f)).size < 60000, 'background too big: ' + f);
}

// ⑤ 페이지 배선
ok(/<script src="\/js\/ai-class-music\.js\?v=\d+"><\/script>/.test(html), 'music script not versioned');
const listenSrc = fnSrc(html, 'listen');
ok(/MU\.bgm\('off'\)/.test(listenSrc), 'bgm must stop on the student turn (listen)');
ok(/cur\.mode === 'ask'[\s\S]*cur\.ask[\s\S]*cur\.shown/.test(listenSrc), 'ask/blank turn must show the question/blank, not the answer');
const runSrc = fnSrc(html, 'run');
ok(/sp\.song[\s\S]*playSong\(/.test(runSrc), 'song not played in run()');
ok(/sp\.show \|\| sp\.speak\.en/.test(runSrc), 'quiz target must show the question (sp.show)');
ok(/MU\.jingle\(\)/.test(fnSrc(html, 'start')), 'opening jingle missing in start()');
ok(/MU\.outro\(\)/.test(fnSrc(html, 'showEnd')), 'ending music missing in showEnd()');
ok(/MU\.stopAll\(\)/.test(fnSrc(html, 'reset')), 'reset must stop music');
ok(/paintBg\(unit\.book\)/.test(fnSrc(html, 'reset')), 'reset must paint the book background');

console.log(fails.map(f => '❌ ' + f).join('\n'));
console.log(`결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
