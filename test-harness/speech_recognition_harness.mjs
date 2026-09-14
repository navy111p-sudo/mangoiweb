/**
 * 🎤 음성 인식 회귀 하니스 — "말한 게 계속 쌓임 / 두 번째부터 마이크가 죽음" 재발 방지
 *
 * 2026-07-22 실기기 제보:
 *   "I like dog 이라고 말했는데 that 으로 인식", "세 마디밖에 안 했는데 문장이 많다고 함"
 *   → 원인은 인식 정확도가 아니라 **세션 간 상태가 초기화되지 않는 것**이었다.
 *
 * 이 하니스는 재구현이 아니라 **배포되는 HTML 에서 실제 코드를 그대로 추출**해서,
 * 가짜 SpeechRecognition/DOM 위에서 '마이크를 여러 번 누르는' 시나리오를 돌린다.
 * 따라서 원본 코드가 되돌아가면 즉시 실패한다.
 *
 * 실행: node test-harness/speech_recognition_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
// MANGOI_PUB 로 대상 폴더를 바꿀 수 있다 — 버그를 되살린 사본으로 '하니스가 실제로 잡는지'
// 역검증(negative control)할 때 쓴다. 평소에는 실제 배포 폴더를 본다.
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}

/* ── 가짜 SpeechRecognition ───────────────────────────────────────────────
   실제 브라우저 동작을 흉내: start()→onstart, stop()→onend, emit()→onresult.
   continuous=true 세션에서 결과는 누적 배열이고 resultIndex 는 '이번에 새로 온 것'의 시작. */
function makeFakeSR() {
  class FakeSR {
    constructor() { this.running = false; this._results = []; FakeSR.instances.push(this); }
    start() {
      if (this.running) throw new Error('already started');
      this.running = true;
      this._results = [];                       // 브라우저는 세션마다 results 를 새로 만든다
      if (this.onstart) this.onstart();
    }
    stop() { if (!this.running) return; this.running = false; if (this.onend) this.onend(); }
    /** 🤖 브라우저(안드로이드 크롬 등)가 우리 뜻과 무관하게 세션을 스스로 닫는 상황 */
    browserEnd() { this.running = false; if (this.onend) this.onend(); }
    /** 인식 결과 1건 전달. alts = [{transcript, confidence}] */
    emit(alts, isFinal) {
      const idx = this._results.length;
      const res = alts.slice();
      res.isFinal = !!isFinal;
      res.length = alts.length;
      this._results.push(res);
      const ev = { resultIndex: idx, results: this._results };
      ev.results.length = this._results.length;
      if (this.onresult) this.onresult(ev);
    }
    error(kind) { if (this.onerror) this.onerror({ error: kind }); }
  }
  FakeSR.instances = [];
  return FakeSR;
}

/* ── 가짜 DOM ─────────────────────────────────────────────────────────── */
function makeFakeDoc(ids) {
  const els = {};
  for (const id of ids) {
    els[id] = {
      value: '', textContent: '', innerHTML: '', disabled: false, title: '', style: {},
      classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
                   toggle(c,on){ on ? this._s.add(c) : this._s.delete(c); },
                   contains(c){return this._s.has(c);} },
      addEventListener() {},
    };
  }
  const mk = () => ({ style:{}, classList:{add(){},remove(){},toggle(){}}, appendChild(){}, remove(){},
                      innerHTML:'', textContent:'', dataset:{} });
  return {
    els,
    body: mk(),
    getElementById: (id) => els[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => mk(),
  };
}

/* ── 제어 가능한 타이머 (침묵 감시 타이머를 우리가 직접 발화) ───────────── */
function makeTimers() {
  let seq = 1; const pending = new Map();
  return {
    setTimeout: (cb, ms) => { const id = seq++; pending.set(id, { cb, ms }); return id; },
    clearTimeout: (id) => { pending.delete(id); },
    /** 대기 중인 타이머를 모두 실행 (침묵 → 자동 종료 재현) */
    fire() { const cbs = [...pending.values()]; pending.clear(); cbs.forEach(t => t.cb()); },
    /** 지금 걸려 있는 침묵 감시 타이머의 대기 시간(ms) — 상황별로 달라야 한다 */
    lastDelay() { const v = [...pending.values()]; return v.length ? v[v.length - 1].ms : null; },
    get size() { return pending.size; },
  };
}

/** HTML 에서 start~end 사이 원본 코드를 그대로 잘라낸다 */
function extract(html, startMarker, endMarker, label) {
  const s = html.indexOf(startMarker);
  if (s < 0) throw new Error(`[${label}] 시작 표지를 못 찾음: ${startMarker}`);
  const e = html.indexOf(endMarker, s);
  if (e < 0) throw new Error(`[${label}] 끝 표지를 못 찾음: ${endMarker}`);
  return html.slice(s, e);
}

/* ══════════════════════════════════════════════════════════════════════
   TEST 1 — ai-friend.html : (2026-07-26) 브라우저 SpeechRecognition 오인식
   ("I like dog"을 "talk"로 듣는 등) 직원 피드백으로 서버 Whisper 전용으로 교체.
   옛 브라우저 인식기 코드(_recog/mergeSpeech 등)가 되살아나지 않는지 + 새 배선
   (toggleMic → MangoiVoice.record({lang:'en'}) → 결과로 sendMsg)이 맞는지 검증.
   ══════════════════════════════════════════════════════════════════════ */
async function testAiFriend() {
  // vm 샌드박스는 별도 realm 이라 Promise.resolve().then() 마이크로태스크가 호스트 쪽과
  // 엇갈릴 수 있다 — setTimeout(매크로태스크 경계)로 넘기면 realm 과 무관하게 그 시점까지
  // 쌓인 모든 마이크로태스크가 확실히 다 처리된 뒤 이어진다.
  const flush = () => new Promise((r) => setTimeout(r, 0));
  console.log('\n▶ ai-friend.html — Whisper 전용 마이크 배선');
  const html = readFileSync(join(PUB, 'ai-friend.html'), 'utf8');

  // 회귀 가드: 오인식 문제의 원인이던 옛 브라우저 SpeechRecognition 경로가 되살아나지 않았는가
  check('옛 _recog(브라우저 인식기) 제거됨', !/\b_recog\b/.test(html), '재출현하면 오인식 버그 회귀');
  check('옛 initRecog() 제거됨', !html.includes('function initRecog'));
  check('옛 mergeSpeech/tidySpeech 제거됨', !html.includes('function mergeSpeech') && !html.includes('function tidySpeech'));
  check('webkitSpeechRecognition 미사용', !html.includes('webkitSpeechRecognition'));
  check('MangoiVoice(Whisper) 배선 존재', html.includes('MangoiVoice.record'));
  check('영어 언어힌트 전달(lang: \'en\')', /MangoiVoice\.record\(\{[^}]*lang:\s*'en'/.test(html),
        '힌트 없으면 짧은 영어를 한국어로 오인식하는 사고 재발(2026-07-24)');

  const html2 = readFileSync(join(PUB, 'ai-friend.html'), 'utf8');
  const code = extract(html2, 'let _recognizing = false, _pendingVoice = false;', '\n    updateSoundBtn();', 'ai-friend');

  // 실제 네트워크 녹음 없이 배선만 검증: MangoiVoice 를 가짜로 물려 toggleMic 이
  // record({lang, onState}) 를 정확히 부르고, 결과 텍스트로 sendMsg 가 호출되는지 확인.
  const doc = makeFakeDoc(['msgInput', 'micBtn']);
  const sent = [];
  const barge = { stops: 0 };
  let lastRecordOpts = null, resolveRecord = null;
  const FakeMangoiVoice = {
    supported: () => true,
    record: (opts) => { lastRecordOpts = opts; return new Promise(res => { resolveRecord = res; }); },
    stop: () => { if (resolveRecord) { const r = resolveRecord; resolveRecord = null; r('__STOPPED__'); } },
  };
  const sandbox = {
    document: doc,
    window: { MangoiVoice: FakeMangoiVoice, MangoiTTS: { stop(){} }, MangoAvatar: { plainStop(){} }, speechSynthesis: { cancel(){} } },
    MangoiVoice: FakeMangoiVoice,
    setTimeout: (cb) => cb(),   // 이 배선 검증엔 실제 지연이 필요 없음
    clearTimeout: () => {},
    isEn: () => false,
    /* ⏹ B (2026-09-11) — 마이크를 열면 AI 낭독을 멈춥니다. 그 정지가 «정본 한 곳» 으로 모이면서
       이 배선에도 들어왔습니다. 스텁으로 두되 «실제로 불렸는가» 를 아래에서 셉니다. */
    stopSpeakingNow: () => { barge.stops++; },
    sendMsg: () => { const v = (doc.els.msgInput.value || '').trim(); if (v) sent.push(v); doc.els.msgInput.value = ''; },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(code + '\n;globalThis.__toggleMic = toggleMic;', sandbox);
  const toggleMic = sandbox.__toggleMic;

  // 1회차
  toggleMic();
  check('toggleMic → MangoiVoice.record 호출', !!lastRecordOpts, '녹음이 시작되지 않음');

  /* ⏹ B — 말을 걸었으면 AI 낭독이 멈춰야 합니다. ⛔ 안 멈추면 학생 목소리와 AI 목소리가 겹치고,
     A-1 의 문장 큐가 살아 있으면 «멈춘 척» 했다가 다음 문장을 이어서 말합니다. */
  check('마이크를 열면 AI 낭독을 멈춘다 (B)', barge.stops >= 1, '정지 ' + barge.stops + '회');
  check('영어 힌트로 호출됨', lastRecordOpts && lastRecordOpts.lang === 'en', JSON.stringify(lastRecordOpts));
  resolveRecord('I like dogs');
  await flush();
  check('1회차 전송 = "I like dogs"', sent[0] === 'I like dogs', `실제="${sent[0]}"`);

  // 2회차 — 1회차 잔재가 안 섞이는지(누적 버퍼 자체가 없으므로 구조적으로 불가능해야 함)
  lastRecordOpts = null;
  toggleMic();
  resolveRecord('my dog likes blueberry');
  await flush();
  check('2회차에 1회차 내용이 안 섞임', sent[1] === 'my dog likes blueberry', `실제="${sent[1]}"`);
  check('총 2건 전송(누적 없음)', sent.length === 2, `실제=${sent.length}건`);

  // 무음(빈 전사)이면 전송하지 않는다
  sent.length = 0;
  toggleMic();
  resolveRecord('');
  await flush();
  check('무음이면 전송 안 함', sent.length === 0, `실제=${sent.length}건`);
}

/* ══════════════════════════════════════════════════════════════════════
   TEST 1-B — warmup.html : 같은 조기 종료 문제 (AI 웜업도 같이 제보됨)
   ══════════════════════════════════════════════════════════════════════ */
function testWarmupMic() {
  console.log('\n▶ warmup.html — 조기 종료로 말이 잘리지 않는가');
  const html = readFileSync(join(PUB, 'warmup.html'), 'utf8');
  const code = extract(html, 'var _recog=null, _recognizing=false;', '\n/* ── 4. 첫 안내 메시지', 'warmup');

  const FakeSR = makeFakeSR();
  const doc = makeFakeDoc(['inp', 'micBtn', 'listening']);
  const timers = makeTimers();
  const sent = [];

  /* 🀄 2026-09-13 — 웜업에 «대화 언어» 축이 생겨 이 조각이 바깥의 isZh() 를 부른다.
     그 이름이 없으면 조각이 통째로 ReferenceError 로 죽는다(검사가 «못 봤다» 가 된다).
     ⇒ 가짜로 물려 주고, 아래에서 «그 값을 실제로 따라가는가» 를 짝으로 확인한다. */
  let fakeZh = false;
  const sandbox = {
    document: doc,
    window: { SpeechRecognition: FakeSR },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    unlockAudio: () => {}, _stopSpeak: () => {}, addMsg: () => {},
    isZh: () => fakeZh,
    _warmLang: 'en',
    sendMsg: () => { const v = (doc.els.inp.value || '').trim(); if (v) sent.push(v); doc.els.inp.value = ''; },
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext(code + '\n;globalThis.__toggleMic = toggleMic;', sandbox);
  const toggleMic = sandbox.__toggleMic;
  const last = () => FakeSR.instances[FakeSR.instances.length - 1];

  /* 🀄 마이크가 «고른 말» 로 듣는가 — 「막힌다·안 막힌다」가 아니라 «짝» 으로 묻는다.
     한쪽만 두면 「언제나 en-US」·「언제나 zh-CN」 어느 쪽으로 고장 나도 통과한다. */
  fakeZh = false; toggleMic();
  check('영어면 마이크가 en-US 로 듣는다', last().lang === 'en-US', 'lang=' + last().lang);
  toggleMic(); timers.fire();
  fakeZh = true; toggleMic();
  check('🀄 중국어면 마이크가 zh-CN 으로 듣는다 (짝)', last().lang === 'zh-CN', 'lang=' + last().lang);
  toggleMic(); timers.fire();
  fakeZh = false; sent.length = 0; doc.els.inp.value = '';

  // 평소대로 한 문장 말하고 조용해지면 전송
  toggleMic();
  last().emit([{ transcript: 'I like dogs', confidence: 0.9 }], true);
  timers.fire();
  check('정상 한 문장 전송', sent.length === 1 && sent[0] === 'I like dogs', JSON.stringify(sent));

  // 브라우저가 첫 확정 결과 뒤 세션을 닫아도 말이 잘리면 안 된다
  sent.length = 0;
  toggleMic();
  let sr = last();
  sr.emit([{ transcript: 'I', confidence: 0.9 }], true);
  sr.browserEnd();
  check('조각만 들린 채 브라우저가 끊으면 전송 안 함', sent.length === 0, JSON.stringify(sent));
  check('끊긴 뒤 자동으로 다시 듣는 중', sr.running === true, 'running=' + sr.running);
  sr.emit([{ transcript: 'want a big pizza', confidence: 0.9 }], true);
  timers.fire();
  check('이어 말한 내용이 합쳐져 한 번만 전송',
        sent.length === 1 && sent[0] === 'I want a big pizza', JSON.stringify(sent));

  // 안드로이드 누적형 확정 결과 (기존 회귀)
  sent.length = 0;
  toggleMic();
  sr = last();
  ['my dog', 'my dog likes', 'my dog likes blueberry too'].forEach(t =>
    sr.emit([{ transcript: t, confidence: 0.9 }], true));
  timers.fire();
  check('안드로이드 누적형 → 한 문장만 전송',
        sent.length === 1 && sent[0] === 'my dog likes blueberry too', JSON.stringify(sent));

  // 침묵 대기 시간이 상황에 따라 달라야 한다
  sent.length = 0;
  toggleMic();
  sr = last();
  check('첫 마디를 넉넉히 기다림(≥8초)', timers.lastDelay() >= 8000, timers.lastDelay() + 'ms');
  sr.emit([{ transcript: 'I', confidence: 0.9 }], false);
  check('조각만 들렸으면 더 기다림(≥4.5초)', timers.lastDelay() >= 4500, timers.lastDelay() + 'ms');
  sr.emit([{ transcript: 'I like blue cars', confidence: 0.9 }], true);
  check('문장이 완성되면 예전처럼 빠르게(≤3초)', timers.lastDelay() <= 3000, timers.lastDelay() + 'ms');
  timers.fire();

  // ⏹ 로 직접 멈추면 재시작 없이 즉시 전송
  sent.length = 0;
  toggleMic();
  last().emit([{ transcript: 'yes', confidence: 0.9 }], true);
  toggleMic();
  check('⏹ 누르면 재시작 없이 즉시 전송', sent.length === 1 && sent[0] === 'yes', JSON.stringify(sent));
}

/* ══════════════════════════════════════════════════════════════════════
   TEST 2 — speaking-quiz.html : 두 번째 시도부터 마이크가 죽지 않아야 함
   ══════════════════════════════════════════════════════════════════════ */
function testSpeakingQuiz() {
  console.log('\n▶ speaking-quiz.html — 두 번째 시도부터 채점되는가');
  const html = readFileSync(join(PUB, 'speaking-quiz.html'), 'utf8');
  const code = extract(html, '    var r=new SR(); r.lang=IS_ZH', '\n    return r;', 'speaking-quiz');

  const FakeSR = makeFakeSR();
  const doc = makeFakeDoc(['micBtn', 'status']);
  const timers = makeTimers();
  const attempts = [];

  const sandbox = {
    SR: FakeSR, IS_ZH: false,
    $: (sel) => doc.getElementById(sel.replace('#', '')),
    recogActive: false,
    G: { busy: false, cur: { en: 'I like dogs' } },
    matchSpoken: (heard, target) =>
      String(heard).toLowerCase().replace(/[^a-z ]/g, '').trim() ===
      String(target).toLowerCase().replace(/[^a-z ]/g, '').trim(),
    handleAttempt: (heard, conf, matched) => attempts.push({ heard, matched }),
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    console,
  };
  vm.createContext(sandbox);
  vm.runInContext('function setupRecognition(){\n' + code + '\n return r; }\nglobalThis.__setup = setupRecognition;', sandbox);

  // 실제 페이지와 동일하게 '한 번 만들어 재사용'
  const recog = sandbox.__setup();

  function attempt(said) {
    recog.start();
    recog.emit([{ transcript: said, confidence: 0.9 }], true);
    if (recog.running) timers.fire();     // 정답이면 onresult 안에서 이미 stop() 됨
    recog.running = false;
  }

  attempt('I like cats');    // 오답
  attempt('I like dogs');    // 정답
  attempt('I like dogs');    // 정답 (3회차도 살아있어야 함)

  check('1회차 채점됨', attempts.length >= 1 && attempts[0].heard === 'I like cats', JSON.stringify(attempts[0]));
  check('2회차 채점됨 (마이크 안 죽음)', attempts.length >= 2, `실제 채점 ${attempts.length}회`);
  check('2회차 정답 인식', attempts[1] && attempts[1].matched === true, JSON.stringify(attempts[1]));
  check('3회차도 채점됨', attempts.length >= 3, `실제 채점 ${attempts.length}회`);
  check('이전 시도 텍스트가 안 남음',
        attempts[1] && attempts[1].heard === 'I like dogs', JSON.stringify(attempts[1]));
}

/* ══════════════════════════════════════════════════════════════════════
   TEST 3 — 나머지 파일: onstart 에서 세션 상태를 초기화하는지 소스로 확인
   (게임 로직 의존성이 커서 행위 테스트 대신 원문 검사)
   ══════════════════════════════════════════════════════════════════════ */
function testResetPresent() {
  console.log('\n▶ 나머지 페이지 — onstart 초기화 존재 확인');
  const targets = [
    ['student-game-shooter.html', '_done=false'],
    ['english-mastery-suite.html', '_done=false'],
  ];
  for (const [file, needle] of targets) {
    const html = readFileSync(join(PUB, file), 'utf8');
    const m = html.match(/r\.onstart\s*=\s*function\(\)\{[^}]*\}/);
    check(`${file} — onstart 에서 _done 초기화`,
          !!m && m[0].includes(needle), m ? m[0].slice(0, 110) : 'onstart 를 못 찾음');
  }

  /* 🤖 문장 조립형 페이지 — 확정 결과 이어붙이기(+=) 대신 겹침 제거 재조립을 쓰는지.
     (안드로이드 누적형 확정 결과 대응 — ai-friend 는 TEST 1 에서 행위로 검증) */
  const rebuildTargets = [
    ['warmup.html', '_mergeSpeech(full, e.results[i][0].transcript)', 'isFinal) finalText+=t'],
    ['ai-write.html', 'mergeSpeech(full, ev.results[i][0].transcript)', 'txt += ev.results[i][0].transcript'],
  ];
  for (const [file, mustHave, mustNot] of rebuildTargets) {
    const html = readFileSync(join(PUB, file), 'utf8');
    check(`${file} — 겹침 제거 재조립 사용(이어붙이기 없음)`,
          html.includes(mustHave) && !html.includes(mustNot),
          `${mustHave} 포함=${html.includes(mustHave)}, ${mustNot} 잔존=${html.includes(mustNot)}`);
  }
}

/* ── 실행 ─────────────────────────────────────────────────────────────── */
console.log('═'.repeat(64));
console.log(' 🎤 음성 인식 회귀 하니스');
console.log('═'.repeat(64));
(async () => {
  try {
    await testAiFriend();   // (2026-07-26) Whisper 배선이 async 이므로 반드시 기다림
    testWarmupMic();
    testSpeakingQuiz();
    testResetPresent();
  } catch (e) {
    fail++; failures.push('하니스 실행 오류: ' + e.message);
    console.log('\n❌ 하니스 실행 오류:', e.message, '\n', e.stack);
  }
  console.log('\n' + '═'.repeat(64));
  console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
  if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
  console.log('═'.repeat(64));
  process.exit(fail ? 1 : 0);
})();
