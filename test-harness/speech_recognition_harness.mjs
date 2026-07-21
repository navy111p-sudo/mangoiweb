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
      value: '', textContent: '', innerHTML: '', disabled: false,
      classList: { _s: new Set(), add(c){this._s.add(c);}, remove(c){this._s.delete(c);},
                   toggle(c,on){ on ? this._s.add(c) : this._s.delete(c); },
                   contains(c){return this._s.has(c);} },
      addEventListener() {},
    };
  }
  return {
    els,
    getElementById: (id) => els[id] || null,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: () => {},
    createElement: () => ({ style:{}, classList:{add(){},remove(){}}, appendChild(){}, innerHTML:'' }),
  };
}

/* ── 제어 가능한 타이머 (침묵 감시 타이머를 우리가 직접 발화) ───────────── */
function makeTimers() {
  let seq = 1; const pending = new Map();
  return {
    setTimeout: (cb) => { const id = seq++; pending.set(id, cb); return id; },
    clearTimeout: (id) => { pending.delete(id); },
    /** 대기 중인 타이머를 모두 실행 (침묵 → 자동 종료 재현) */
    fire() { const cbs = [...pending.values()]; pending.clear(); cbs.forEach(cb => cb()); },
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
   TEST 1 — ai-friend.html : 마이크를 여러 번 눌러도 이전 말이 쌓이지 않아야 함
   ══════════════════════════════════════════════════════════════════════ */
function testAiFriend() {
  console.log('\n▶ ai-friend.html — 연속 녹음 시 텍스트 누적');
  const html = readFileSync(join(PUB, 'ai-friend.html'), 'utf8');
  const code = extract(html, 'let _recog = null', '\n    updateSoundBtn();', 'ai-friend');

  const FakeSR = makeFakeSR();
  const doc = makeFakeDoc(['msgInput', 'micBtn']);
  const timers = makeTimers();
  const sent = [];

  const sandbox = {
    document: doc,
    window: { SpeechRecognition: FakeSR, speechSynthesis: { cancel(){} } },
    setTimeout: timers.setTimeout, clearTimeout: timers.clearTimeout,
    alert: () => {},
    isEn: () => false,
    // 실제 sendMsg 와 동일한 핵심 동작: 값을 읽어 보내고 입력창을 비운다
    sendMsg: () => { const v = (doc.els.msgInput.value || '').trim(); if (v) sent.push(v); doc.els.msgInput.value = ''; },
    console,
  };
  sandbox.window.SpeechRecognition = FakeSR;
  vm.createContext(sandbox);
  vm.runInContext(code + '\n;globalThis.__toggleMic = toggleMic;', sandbox);
  const toggleMic = sandbox.__toggleMic;

  /** 한 번의 음성 세션: 마이크 켜기 → 조각들 인식 → 침묵으로 자동 종료 */
  function speakOnce(chunks) {
    toggleMic();
    const sr = FakeSR.instances[FakeSR.instances.length - 1];
    for (const c of chunks) sr.emit([{ transcript: c.t, confidence: 0.9 }], c.final);
    timers.fire();                                   // 침묵 감시 발화 → r.stop() → onend → 자동 전송
  }

  // 제보된 실제 시나리오 그대로: 세 번 연속으로 말한다
  speakOnce([{ t: 'I like', final: false }, { t: 'I like that', final: true }]);
  speakOnce([{ t: 'I like', final: false }, { t: 'I like doll', final: true }]);
  speakOnce([{ t: 'I like dog', final: true }]);

  check('1회차 = "I like that"', sent[0] === 'I like that', `실제="${sent[0]}"`);
  check('2회차에 1회차가 안 붙음', sent[1] === 'I like doll', `실제="${sent[1]}"`);
  check('3회차에 앞 회차가 안 붙음', sent[2] === 'I like dog', `실제="${sent[2]}"`);
  check('총 3건 전송', sent.length === 3, `실제=${sent.length}건`);
  check('제보 증상("II likeI like that") 재현 안 됨',
        !sent.some(s => /II\s*like|thatI|dollI/.test(s)), JSON.stringify(sent));

  // 조각 사이 공백 보장: "I" + "like dogs" 가 "Ilike dogs" 가 되면 안 된다
  sent.length = 0;
  speakOnce([{ t: 'I', final: true }, { t: 'like dogs', final: true }]);
  check('조각 사이 공백 유지', sent[0] === 'I like dogs', `실제="${sent[0]}"`);

  // interim 과 final 이 겹쳐 같은 단어가 두 번 들어오는 경우
  sent.length = 0;
  speakOnce([{ t: 'I I like like cats', final: true }]);
  check('연이은 중복 단어 정리', sent[0] === 'I like cats', `실제="${sent[0]}"`);

  // 오류로 끊긴 뒤 다음 세션에 잔재가 없어야 함
  sent.length = 0;
  toggleMic();
  let sr = FakeSR.instances[FakeSR.instances.length - 1];
  sr.emit([{ transcript: 'broken words', confidence: 0.5 }], true);
  sr.error('network');
  sr.running = false;
  speakOnce([{ t: 'hello', final: true }]);
  check('오류 세션 잔재 없음', sent[sent.length - 1] === 'hello', `실제="${sent[sent.length - 1]}"`);

  // 아무 말도 안 하고 끝나면 전송하지 않는다
  sent.length = 0;
  speakOnce([]);
  check('무음이면 전송 안 함', sent.length === 0, `실제=${sent.length}건`);

  /* 🤖 (2026-07-22 2차 제보) 안드로이드 크롬 누적형: continuous 모드에서
     "지금까지 말한 문장 전체"를 확정 결과로 여러 번 다시 보낸다.
     확정 결과를 버퍼에 이어붙이는 방식이 되살아나면
     "I like I like to I like to eat…" 처럼 겹겹이 쌓여 여기서 실패한다. */
  sent.length = 0;
  speakOnce([
    { t: 'I like', final: true },
    { t: 'I like to', final: true },
    { t: 'I like to eat', final: true },
    { t: 'I like to eat blueberry', final: true },
    { t: 'I like to eat blueberry with yogurt', final: true },
  ]);
  check('안드로이드 누적형 → 한 문장만 전송', sent[0] === 'I like to eat blueberry with yogurt' && sent.length === 1,
        JSON.stringify(sent));

  sent.length = 0;
  speakOnce([
    { t: 'my dog', final: true },
    { t: 'my dog likes', final: true },
    { t: 'my dog likes', final: true },
    { t: 'my dog likes blueberry too', final: true },
  ]);
  check('안드로이드 my dog 스트림 → 한 문장만 전송', sent[0] === 'my dog likes blueberry too' && sent.length === 1,
        JSON.stringify(sent));
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
try {
  testAiFriend();
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
