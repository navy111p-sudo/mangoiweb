/**
 * 🎤 음성인식 보호막(mangoi-stt.js) 회귀 하니스 — 2026-07-23
 *
 * 안드로이드 크롬은 continuous=true 를 무시하고 첫 확정 결과 뒤 세션을 스스로 닫는다.
 * 화면들은 그 onend 를 "학생이 말을 마쳤다"로 착각해 한두 마디만 듣고 채점/전송했다.
 * MangoiSTT.harden() 은 "우리가 stop() 을 안 불렀으면 끝난 게 아니다" 규칙으로 이를 막는다.
 *
 * 이 하니스는 ① 모듈 자체의 동작 ② 실제 배포 HTML 에서 추출한 게임 코드와의 결합
 * ③ 각 화면이 실제로 보호막을 붙였는지(원문 확인) 를 검증한다.
 *
 * 실행: node test-harness/stt_hardening_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}

/* ── 가짜 SpeechRecognition (브라우저 흉내) ─────────────────────────────── */
function makeFakeSR() {
  class FakeSR {
    constructor() { this.running = false; this._results = []; FakeSR.instances.push(this); }
    start() { if (this.running) throw new Error('already started'); this.running = true; this._results = []; if (this.onstart) this.onstart({}); }
    stop() { if (!this.running) return; this.running = false; if (this.onend) this.onend({}); }
    /** 🤖 브라우저가 우리 뜻과 무관하게 세션을 닫는 상황 (안드로이드 크롬) */
    browserEnd() { this.running = false; if (this.onend) this.onend({}); }
    error(kind) { if (this.onerror) this.onerror({ error: kind }); }
    emit(t, final) {
      const r = [{ transcript: t, confidence: 0.9 }]; r.isFinal = !!final; r.length = 1;
      this._results.push(r);
      if (this.onresult) this.onresult({ resultIndex: this._results.length - 1, results: this._results });
    }
  }
  FakeSR.instances = [];
  FakeSR.last = () => FakeSR.instances[FakeSR.instances.length - 1];
  return FakeSR;
}
function loadModule() {
  const sandbox = { console };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(readFileSync(join(PUB, 'js', 'mangoi-stt.js'), 'utf8'), sandbox);
  return sandbox.MangoiSTT;
}

/* ══ 1. 모듈 동작 ══ */
console.log('\n▶ mangoi-stt.js — 제멋대로 끊긴 세션을 다시 잇는가');
{
  const STT = loadModule();
  const SR = makeFakeSR();

  // 페이지가 하던 대로: onstart 에서 상태 초기화, onend 에서 채점
  function makePage(hardenOpts) {
    const r = new SR();
    const log = { scored: [], starts: 0 };
    let done = false, heard = '';
    r.onstart = () => { log.starts++; done = false; heard = ''; };
    r.onresult = (ev) => { heard = ev.results[ev.results.length - 1][0].transcript; };
    r.onend = () => { if (!done) { done = true; log.scored.push(heard); } };
    STT.harden(r, Object.assign({ isDone: () => done }, hardenOpts || {}));
    return { r, log, heardNow: () => heard };
  }

  // ① 브라우저가 제멋대로 끊음 → 채점하지 말고 계속 들어야 한다
  let p = makePage();
  p.r.start();
  p.r.emit('I like', true);
  p.r.browserEnd();
  check('제멋대로 끊기면 채점하지 않음', p.log.scored.length === 0, JSON.stringify(p.log.scored));
  check('끊긴 뒤 자동으로 다시 듣는 중', p.r.running === true);
  check('재시작 때 페이지 상태를 지우지 않음(onstart 미호출)', p.log.starts === 1, 'starts=' + p.log.starts);
  p.r.emit('I like blue cars', true);
  p.r.stop();                                   // 침묵 타이머/정답 매칭이 부르는 정상 종료
  check('정상 종료면 그때 채점', p.log.scored.length === 1 && p.log.scored[0] === 'I like blue cars',
        JSON.stringify(p.log.scored));

  // ② 이미 채점이 끝났으면(_done) 재시작하지 않는다
  p = makePage();
  p.r.start();
  p.r.emit('correct answer', true);
  p.r.stop();                                   // 정답 → 페이지가 stop
  const before = p.log.scored.length;
  p.r.browserEnd();                             // 뒤늦게 온 종료
  check('채점 끝난 뒤에는 다시 듣지 않음', p.r.running === false && p.log.scored.length === before);

  // ③ 권한 거부 등 치명적 오류는 재시작 금지
  p = makePage();
  p.r.start();
  p.r.error('not-allowed');
  p.r.browserEnd();
  check('권한 거부는 재시작하지 않음', p.r.running === false);

  // ④ no-speech(아직 말을 못 꺼냄)는 다시 듣는다
  p = makePage();
  p.r.start();
  p.r.error('no-speech');
  p.r.browserEnd();
  check('no-speech 는 다시 들음', p.r.running === true);

  // ⑤ 무한 재시작 방지
  p = makePage({ maxRestarts: 3 });
  p.r.start();
  for (let i = 0; i < 10; i++) p.r.browserEnd();
  check('재시작 횟수 상한이 지켜짐', p.r.running === false);

  // ⑥ 문장 조립형: 재시작 직전 훅으로 앞 세션 내용을 확정할 수 있다
  const r2 = new SR();
  let base = '', sess = '', sent = null;
  r2.onstart = () => { sess = ''; };
  r2.onresult = (ev) => { sess = ev.results[ev.results.length - 1][0].transcript; };
  r2.onend = () => { sent = (base ? base + ' ' : '') + sess; };
  STT.harden(r2, { keepState: false, beforeRestart: () => { base = (base ? base + ' ' : '') + sess; } });
  r2.start();
  r2.emit('I want', true);
  r2.browserEnd();                              // 안드로이드가 끊음
  r2.emit('a big pizza', true);
  r2.stop();
  check('재시작해도 앞에서 말한 내용이 안 날아감', sent === 'I want a big pizza', `실제="${sent}"`);

  // ⑦ 재시작 직후 훅 — 대부분의 화면은 onstart 에서 침묵 감시 타이머를 켜므로 여기서 다시 켜야 한다
  const r4 = new SR();
  let armed = 0, startCalls = 0;
  r4.onstart = () => { startCalls++; };
  r4.onend = () => {};
  STT.harden(r4, { onRestart: () => { armed++; } });
  r4.start();
  r4.browserEnd();
  check('재시작 직후 onRestart 로 침묵 타이머를 다시 켬', armed === 1, 'armed=' + armed);
  check('재시작 때 페이지 onstart 는 안 부름', startCalls === 1, 'starts=' + startCalls);

  // ⑧ 인식 객체를 재사용하며 매 라운드 핸들러를 새로 붙이는 화면(grammar-pizza 등)
  //    — 새 핸들러가 보호막을 덮어쓰므로, 다시 harden() 하면 보호막이 복구되어야 한다
  const r3 = new SR();
  let round1 = 0, round2 = 0, doneFlag = false;
  r3.onend = () => { round1++; };
  STT.harden(r3, { isDone: () => doneFlag });
  r3.start(); r3.browserEnd();
  check('재사용 객체 — 1라운드에서 다시 듣기 동작', r3.running === true);
  r3.stop();
  check('1라운드 정상 종료 처리', round1 === 1, 'round1=' + round1);
  // 2라운드: 페이지가 핸들러를 새로 붙이고 harden 을 다시 부른다
  r3.onend = () => { round2++; };
  STT.harden(r3, { isDone: () => doneFlag });
  r3.start(); r3.browserEnd();
  check('핸들러를 새로 붙여도 보호막이 살아 있음', r3.running === true);
  r3.stop();
  check('2라운드는 새 핸들러로 처리됨', round2 === 1 && round1 === 1, `r1=${round1} r2=${round2}`);
  // 같은 핸들러 상태에서 harden 을 두 번 불러도 중복 래핑되지 않는다
  STT.harden(r3, { isDone: () => doneFlag });
  STT.harden(r3, { isDone: () => doneFlag });
  r3.start(); r3.stop();
  check('중복 harden 해도 한 번만 처리', round2 === 2, 'round2=' + round2);
}

/* ══ 2. 실제 게임 코드와 결합 — speaking-quiz.html 원문 추출 ══ */
console.log('\n▶ speaking-quiz.html — 말하다 끊겨도 오답 처리되지 않는가');
{
  const html = readFileSync(join(PUB, 'speaking-quiz.html'), 'utf8');
  const s = html.indexOf('    var r=new SR(); r.lang=IS_ZH');
  const e = html.indexOf('\n    return r;', s);
  if (s < 0 || e < 0) {
    check('speaking-quiz 인식기 블록 추출', false, '표지를 못 찾음');
  } else {
    const code = html.slice(s, e);
    const SR = makeFakeSR();
    const attempts = [];
    const els = {};
    const el = () => ({ classList: { add(){}, remove(){} }, innerHTML: '', disabled: false, style: {} });
    const sandbox = {
      SR, IS_ZH: false,
      $: (sel) => (els[sel] || (els[sel] = el())),
      recogActive: false,
      G: { busy: false, cur: { en: 'I like blue cars' } },
      matchSpoken: (heard, target) =>
        String(heard).toLowerCase().replace(/[^a-z ]/g, '').trim() ===
        String(target).toLowerCase().replace(/[^a-z ]/g, '').trim(),
      handleAttempt: (heard, conf, matched) => attempts.push({ heard, matched }),
      setTimeout: () => 1, clearTimeout: () => {},
      console,
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(readFileSync(join(PUB, 'js', 'mangoi-stt.js'), 'utf8'), sandbox);  // 보호막 로드
    vm.runInContext('function setup(){\n' + code + '\n return r; }\nglobalThis.__setup = setup;', sandbox);
    const r = sandbox.__setup();

    check('보호막이 실제로 적용됨', r.__mangoiHardened === true, '적용 안 됨 — harden() 호출 누락');

    r.start();
    r.emit('I like', true);          // 아직 말하는 중
    r.browserEnd();                  // 안드로이드가 세션을 닫음
    check('말하다 끊겨도 채점하지 않음', attempts.length === 0, JSON.stringify(attempts));
    check('끊긴 뒤 계속 듣는 중', r.running === true);
    r.emit('I like blue cars', true);// 이어서 끝까지 말함 → 정답 매칭
    check('이어 말한 답이 정답 처리됨',
          attempts.length === 1 && attempts[0].matched === true, JSON.stringify(attempts));

    // 오답을 말하고 조용해지면(=stop) 정상적으로 오답 채점
    attempts.length = 0;
    r.start();
    r.emit('I like red cars', true);
    r.stop();
    check('오답은 정상적으로 채점됨',
          attempts.length === 1 && attempts[0].matched === false, JSON.stringify(attempts));
  }
}

/* ══ 2-B. 단발 인식이던 화면 2종 — 이제 말이 끝날 때까지 듣고 채점하는가 ══
   (예전에는 continuous 기본값 false + 첫 결과로 즉시 채점이라 가장 심하게 끊겼다) */
function fakeEl() {
  return { textContent: '', innerText: '', innerHTML: '', value: '', disabled: false, style: {},
           classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } } };
}
console.log('\n▶ student-game-grammar-pizza.html — 말이 끝나야 채점하는가');
{
  const html = readFileSync(join(PUB, 'student-game-grammar-pizza.html'), 'utf8');
  const s = html.indexOf("$('btn-speak').onclick = function(){");
  const e = html.indexOf('\nfunction missionComplete(', s);
  if (s < 0 || e < 0) { check('grammar-pizza 블록 추출', false, '표지를 못 찾음'); }
  else {
    const SR = makeFakeSR();
    const els = {}; const $ = (id) => (els[id] || (els[id] = fakeEl()));
    const timers = []; let scored = [];
    const sandbox = {
      $, GLANG: 'en', speakCount: 0, listening: false, recognition: new SR(),
      sentenceText: () => 'I like blue cars',
      matchScore: (said, t) => {
        const a = String(said).toLowerCase().split(/\s+/), b = String(t).toLowerCase().split(/\s+/);
        return b.filter(w => a.includes(w)).length / b.length;
      },
      speak: () => {}, toast: () => {},
      speakSuccess: () => scored.push('success'),
      setTimeout: (cb, ms) => { timers.push({ cb, ms }); return timers.length; },
      clearTimeout: (id) => { if (timers[id - 1]) timers[id - 1] = { cb(){}, ms: 0 }; },
      console,
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(readFileSync(join(PUB, 'js', 'mangoi-stt.js'), 'utf8'), sandbox);
    vm.runInContext(html.slice(s, e), sandbox);

    const rec = sandbox.recognition;
    /* 인식기 설정은 이 블록 밖(전역 초기화)에 있으므로 원문으로 확인한다.
       ⚠️ 객체 속성으로 볼 때는 반드시 === true 로 — !== false 면 설정을 안 해도(undefined) 통과한다.
          실제로 이 함정 때문에 "continuous 를 켰다"고 잘못 통과한 적이 있다(2026-07-23). */
    check('브라우저 자동종료를 끔(continuous=true)', /recognition\.continuous\s*=\s*true/.test(html));
    check('중간 결과도 받음(interimResults=true)', /recognition\.interimResults\s*=\s*true/.test(html));
    $('btn-speak').onclick();
    check('보호막 적용됨', rec.__mangoiHardened === true);
    rec.emit('I like', true);
    check('조각만 들렸을 때는 채점하지 않음', scored.length === 0, JSON.stringify(scored));
    rec.browserEnd();                                  // 안드로이드가 세션을 닫음
    check('끊겨도 계속 듣는 중', rec.running === true);
    rec.emit('blue cars', true);                       // 새 세션에서 이어 말함(앞부분은 브라우저가 안 준다)
    check('세션이 끊겨도 앞에서 말한 것과 합쳐져 정답 처리',
          scored.length === 1 && scored[0] === 'success', JSON.stringify(scored));

    // 틀린 문장을 말하고 조용해지면(=stop) 그때 오답 안내
    scored = []; sandbox.listening = false;
    $('btn-speak').onclick();
    const rec2 = sandbox.recognition;
    rec2.emit('I like red bikes', true);
    check('오답이어도 말하는 중엔 판정 보류', !/들린 말/.test($('speech-result').textContent),
          $('speech-result').textContent);
    rec2.stop();
    check('조용해지면 그때 오답 안내', /들린 말/.test($('speech-result').textContent),
          $('speech-result').textContent);
  }
}

console.log('\n▶ speech-coach-cn.html — 말이 끝나야 채점하는가');
{
  const html = readFileSync(join(PUB, 'speech-coach-cn.html'), 'utf8');
  const s = html.indexOf('function startRecord(){');
  const e = html.indexOf('\nfunction stopRecord(){', s);
  if (s < 0 || e < 0) { check('speech-coach-cn 블록 추출', false, '표지를 못 찾음'); }
  else {
    const SR = makeFakeSR();
    const els = { 'cn-text': fakeEl(), 'btn-rec': fakeEl(), progress: fakeEl() };
    els['cn-text'].textContent = '我喜欢蓝色的车';
    const results = [];
    const timers = [];
    const sandbox = {
      recording: false, recognition: null,
      document: { getElementById: (id) => (els[id] || (els[id] = fakeEl())) },
      stopRecord: () => { sandbox.recording = false; },
      showResult: (score, said) => results.push({ score, said }),
      setTimeout: (cb, ms) => { timers.push({ cb, ms }); return timers.length; },
      clearTimeout: () => {},
      alert: () => {}, console,
    };
    sandbox.SpeechRecognition = SR;
    sandbox.window = sandbox;                          // 모듈은 window 에 붙는다 (= 전역)
    vm.createContext(sandbox);
    vm.runInContext(readFileSync(join(PUB, 'js', 'mangoi-stt.js'), 'utf8'), sandbox);
    vm.runInContext(html.slice(s, e) + '\n;globalThis.__startRecord = startRecord;', sandbox);

    sandbox.__startRecord();
    const rec = sandbox.recognition;
    check('브라우저 자동종료를 끔(continuous)', rec.continuous === true, 'continuous=' + rec.continuous);
    check('보호막 적용됨', rec.__mangoiHardened === true);
    check('중간 결과도 받음(interimResults)', rec.interimResults === true, 'interim=' + rec.interimResults);
    rec.emit('我喜欢', true);
    check('조각만 들렸을 때는 채점하지 않음', results.length === 0, JSON.stringify(results));
    rec.browserEnd();
    check('끊겨도 계속 듣는 중', rec.running === true);
    rec.emit('蓝色的车', true);                          // 새 세션에서 이어 말함
    rec.stop();                                        // 조용해져서 종료
    check('한 번만 채점', results.length === 1, JSON.stringify(results));
    check('세션이 끊겨도 앞 말과 합쳐짐', results[0] && results[0].said === '我喜欢蓝色的车',
          JSON.stringify(results[0]));
    check('점수 100점', results[0] && results[0].score === 100, JSON.stringify(results[0]));

    // 안드로이드 누적형(문장 전체를 매번 다시 보냄)이 겹쳐 쌓이지 않는가
    results.length = 0; sandbox.recording = false;
    sandbox.__startRecord();
    const rec2 = sandbox.recognition;
    ['我喜欢', '我喜欢蓝色', '我喜欢蓝色的车'].forEach(t => rec2.emit(t, true));
    rec2.stop();
    check('누적형이 겹쳐 쌓이지 않음', results.length === 1 && results[0].said === '我喜欢蓝色的车',
          JSON.stringify(results));
  }
}

/* ══ 2-C. index.html 수업 중 "따라 말하기"(gameShadow) — 실제 수업에서 쓰는 경로 ══ */
console.log('\n▶ index.html gameShadow — 말하다 끊겨도 오답 처리되지 않는가');
{
  const html = readFileSync(join(PUB, 'index.html'), 'utf8');
  const s = html.indexOf('function gameShadow(enc){');
  const e = html.indexOf('\n// 🎢 난이도(스테이지)', s);
  if (s < 0 || e < 0) { check('gameShadow 블록 추출', false, '표지를 못 찾음'); }
  else {
    const SR = makeFakeSR();
    const fb = fakeEl();
    const timers = [];
    const scored = [];
    const sandbox = {
      document: { getElementById: (id) => (id === 'game-feedback' ? fb : fakeEl()) },
      _gameState: { _advTimer: null, current: { sentence: { ko: '나는 파란 차를 좋아해' } } },
      _glang: () => 'en',
      // 낭독 — 끝나면 onend 를 부른다(실제 gameSpeak 와 동일 계약)
      gameSpeak: (t, onend) => { sandbox.__ttsOnEnd = onend || null; sandbox.__spoke = true; },
      // 실제와 같은 방식: 목표 문장의 단어가 얼마나 들렸는지 비율
      _shadowScore: (said, target) => {
        const a = String(said).toLowerCase().split(/\s+/).filter(Boolean);
        const b = String(target).toLowerCase().replace(/[^a-z ]/g, '').split(/\s+/).filter(Boolean);
        return b.length ? b.filter(w => a.includes(w)).length / b.length : 0;
      },
      _saveShadowScore: (t, ko, sc) => scored.push(Math.round(sc * 100)),
      gameNextRound: () => {},
      decodeURIComponent, encodeURIComponent, Math, String,
      setTimeout: (cb, ms) => { timers.push({ cb, ms }); return timers.length; },
      clearTimeout: () => {},
      console,
    };
    sandbox.window = sandbox;
    sandbox.SpeechRecognition = SR;
    vm.createContext(sandbox);
    vm.runInContext(readFileSync(join(PUB, 'js', 'mangoi-stt.js'), 'utf8'), sandbox);
    vm.runInContext(html.slice(s, e) + '\n;globalThis.__gameShadow = gameShadow;', sandbox);

    sandbox.__gameShadow(encodeURIComponent('I like blue cars'));
    /* 🔇 AI 낭독 도중에 마이크가 열리면 인식기가 AI 목소리를 학생 발화로 받아 적는다.
       낭독이 끝나기 전에는 인식기가 만들어져 있으면 안 된다. */
    check('AI가 문장을 읽는 중에는 마이크를 켜지 않음', SR.instances.length === 0,
          '인식기 ' + SR.instances.length + '개가 이미 생성됨');
    check('낭독 종료 신호(onend)를 넘겨받음', typeof sandbox.__ttsOnEnd === 'function');
    sandbox.__ttsOnEnd();                         // 낭독 끝
    timers.splice(0).forEach(t => t.cb());        // 250ms 뒤 인식 시작
    const rec = SR.last();
    check('낭독이 끝난 뒤에 마이크를 켬', !!rec);
    check('보호막 적용됨', !!rec && rec.__mangoiHardened === true, '적용 안 됨 — harden() 호출 누락');
    rec.emit('I like', true);
    check('조각만 들렸을 때는 채점하지 않음', scored.length === 0, JSON.stringify(scored));
    rec.browserEnd();                             // 안드로이드가 세션을 닫음
    check('끊겨도 계속 듣는 중', rec.running === true);
    rec.emit('blue cars', true);                  // 새 세션에서 이어 말함
    check('세션이 끊겨도 앞 말과 합쳐져 통과 처리',
          scored.length === 1 && scored[0] === 100, JSON.stringify(scored));
  }
}

/* ══ 3. 각 화면이 보호막을 붙였는가 (원문 확인) ══ */
console.log('\n▶ 화면 배선');
const TARGETS = [
  'ai-write.html', 'speech-coach-cn.html', 'speaking-quiz.html', 'english-mastery-suite.html',
  'student-games.html', 'student-game-shooter.html', 'student-game-language-ace.html',
  'student-game-wordfighter.html', 'student-game-tetris.html', 'student-game-tank-battle.html',
  'student-game-grammar-pizza.html', 'suspect-mystery.html',
  'index.html',                       // 수업 중 따라 말하기(gameShadow)
];
for (const f of TARGETS) {
  const h = readFileSync(join(PUB, f), 'utf8');
  check(`${f} — 보호막 모듈 인클루드`, /mangoi-stt\.js/.test(h));
  check(`${f} — harden() 호출`, /MangoiSTT\.harden\(/.test(h));
}

console.log('\n' + '═'.repeat(64));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('═'.repeat(64));
process.exit(fail ? 1 : 0);
