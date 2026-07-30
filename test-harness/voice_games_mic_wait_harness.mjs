/**
 * 🎤 음성 게임 6종 — "말 꺼내기 전 대기시간" 계약 하니스 (2026-07-30)
 *
 * 사장님 제보 "말하기에서 말해도 안 된다"의 원인은 방탈출뿐이 아니었다.
 * 침묵 감시 타이머를 rec.onstart 에서 곧바로 무장하면서 대기시간이 **말이 들리기 전/후 구분 없이
 * 2.2~2.4초 고정**이었다. 버튼을 누르고 문장을 떠올리는 사이(실측 2,535ms) 마이크가 스스로 꺼져,
 * 학생이 그 뒤에 말해도 인식은 이미 닫혀 있었다. 6개 화면이 모두 같은 코드를 복사해 쓰고 있었다.
 *
 * 【이 하니스가 지키는 계약】
 *   ① arm()/armSilence() 의 지연시간은 **조건식**이어야 한다 — 고정값이면 결함이 되돌아온 것이다.
 *   ② 아직 들은 말이 없을 때  → 8초 이상 기다린다.
 *   ③ 말이 들린 뒤            → 3초 안에 마무리한다(문장 끝났는데 계속 기다리면 답답하다).
 *   ④ no-speech 오류로 마이크를 끝내지 않는다. 단, 무한 대기가 되지 않게
 *      침묵 타이머가 실제로 발동했는지(_silFired/침묵플래그)로 잠금이 풀려야 한다.
 *   ⑤ MangoiSTT 보호막의 재시작에 상한(maxRestarts·maxMs)이 걸려 있다.
 *
 * 【판정 방식】문자열 검사로 끝내지 않는다. 소스에서 지연시간 **식 자체**를 뽑아
 *   "들은 말 없음 / 있음" 두 상태로 **실제로 계산**해 숫자를 확인한다.
 *   (문자열 매칭은 SILENCE_MS 를 상수만 바꿔도 통과해 버린다)
 *
 * 실행: node test-harness/voice_games_mic_wait_harness.mjs
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

/* 대상 — 게임마다 "지금까지 들은 말"을 담는 변수 이름이 다르다 */
const GAMES = [
  { file: 'student-game-escape-voice.html', label: '방탈출',       armFn: 'arm' },
  { file: 'student-game-shooter.html',      label: '슈팅',         armFn: 'armSilence' },
  { file: 'student-game-language-ace.html', label: '랭귀지에이스', armFn: 'arm' },
  { file: 'student-game-tank-battle.html',  label: '탱크배틀',     armFn: 'arm' },
  { file: 'student-game-tetris.html',       label: '테트리스',     armFn: 'arm' },
  { file: 'student-game-wordfighter.html',  label: '워드파이터',   armFn: 'arm' },
];

/* arm 함수 본문에서 setTimeout 의 지연시간 식을 뽑는다 */
function extractDelayExpr(src, armFn) {
  const at = src.indexOf('function ' + armFn + '(');
  if (at < 0) return null;
  const body = src.slice(at, at + 500);
  // setTimeout(function(){ ... }, <식>)  — 마지막 인자만 캡처
  const m = body.match(/setTimeout\(\s*function\s*\(\)\s*\{[\s\S]*?\}\s*,\s*([^;]+?)\)\s*;/);
  return m ? m[1].trim() : null;
}

/* 식을 두 상태로 실제 계산한다 */
function evalDelay(expr, sils, heardVar, heardValue) {
  const sandbox = Object.assign({}, sils);
  sandbox[heardVar] = heardValue;
  try { return vm.runInNewContext(expr, sandbox, { timeout: 500 }); }
  catch (e) { return { err: String(e && e.message || e) }; }
}

for (const g of GAMES) {
  console.log('\n🎮 ' + g.label + ' (' + g.file + ')');
  let src;
  try { src = readFileSync(join(PUB, g.file), 'utf8'); }
  catch (e) { check(g.label + ' 파일을 읽을 수 있다', false, String(e.message)); continue; }

  const expr = extractDelayExpr(src, g.armFn);
  check('침묵 타이머의 지연시간 식을 찾았다', !!expr, 'armFn=' + g.armFn);
  if (!expr) continue;

  check('지연시간이 고정값이 아니다 (조건식이어야 한다)', /\?/.test(expr), '식=' + expr);

  // 선언된 SIL_* 상수 수집
  const sils = {};
  for (const m of src.matchAll(/\b(SIL_FIRST|SIL_AFTER)\s*=\s*(\d+)/g)) sils[m[1]] = Number(m[2]);
  check('SIL_FIRST · SIL_AFTER 가 선언돼 있다',
    typeof sils.SIL_FIRST === 'number' && typeof sils.SIL_AFTER === 'number', JSON.stringify(sils));

  // 조건식의 판정 변수명(= 지금까지 들은 말) 추출
  const heardVar = (expr.match(/^([A-Za-z_$][\w$]*)\s*\?/) || [])[1];
  check('"지금까지 들은 말"로 분기한다', !!heardVar, '식=' + expr);
  if (!heardVar) continue;

  const before = evalDelay(expr, sils, heardVar, '');
  const after  = evalDelay(expr, sils, heardVar, 'hello');
  check('말이 들리기 전에는 8초 이상 기다린다',
    typeof before === 'number' && before >= 8000, '계산값=' + JSON.stringify(before));
  check('말이 들린 뒤에는 3초 안에 마무리한다',
    typeof after === 'number' && after <= 3000, '계산값=' + JSON.stringify(after));

  /* no-speech 처리 — 끝내지 않되, 침묵 타이머 발동 뒤에는 풀려야 한다 */
  const noSpeechGuard = /no-speech['"]\s*&&\s*!\s*_silFired/.test(src) || /no-speech['"]\s*\)\s*return/.test(src);
  check('no-speech 오류만으로 마이크를 끝내지 않는다', noSpeechGuard);
  const unlockable = /_silFired\s*=\s*true/.test(src) || /er===['"]no-speech['"]\)\s*return;/.test(src);
  check('침묵 타이머가 발동하면 잠금이 풀린다 (무한 대기 방지)', unlockable);

  /* 보호막 재시작 상한 */
  check('보호막 재시작에 상한이 걸려 있다 (maxRestarts·maxMs)',
    /maxRestarts\s*:\s*\d+/.test(src) && /maxMs\s*:/.test(src));
}

/* ══════════════════════════════════════════════════════════════════════════
   🔬 슈팅게임 — 소스의 인식 함수를 그대로 실행해 "동작"으로 확인
   슈팅은 게임을 진행해야 마이크가 열려서 브라우저로 버튼을 누를 수 없다. 대신
   setupRecognition() 원문을 꺼내 가짜 시계·가짜 마이크와 함께 실행한다.
   ⚠️ 슈팅만 인식 객체를 **하나 만들어 재사용**한다 → 시도마다 침묵 플래그가 초기화되지
      않으면 두 번째 시도부터 no-speech 보호가 풀린 채로 돈다. 그것까지 여기서 잡는다.
   ══════════════════════════════════════════════════════════════════════════ */
console.log('\n🔬 슈팅게임 — 실제 인식 함수를 실행');
{
  const src = readFileSync(join(PUB, 'student-game-shooter.html'), 'utf8');
  const head = 'function setupRecognition(){';
  const at = src.indexOf(head);
  let body = null;
  if (at >= 0) {                                   // 중괄호 짝을 세어 함수 본문만 떼어낸다
    let depth = 0;
    for (let i = at + head.length - 1; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') { depth--; if (depth === 0) { body = src.slice(at, i + 1); break; } }
    }
  }
  check('setupRecognition() 원문을 떼어냈다', !!body && /return r;/.test(body));

  if (body) {
    const stt = readFileSync(join(PUB, 'js', 'mangoi-stt.js'), 'utf8');   // 보호막은 진짜 파일을 쓴다
    const mkEnv = () => {
      const clock = { now: 0, seq: 1, timers: new Map() };
      const env = {
        attempts: [], status: [], srMade: 0, lastSr: null,
        tick(ms) {
          const end = clock.now + ms;
          for (let guard = 0; guard < 5000; guard++) {
            let next = null;
            for (const [id, t] of clock.timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
            if (!next) break;
            clock.timers.delete(next[0]); clock.now = next[1].at;
            try { next[1].cb(); } catch (_) {}
          }
          clock.now = end;
        },
      };
      const sandbox = {
        setTimeout: (cb, ms) => { const id = clock.seq++; clock.timers.set(id, { cb, at: clock.now + (ms || 0) }); return id; },
        clearTimeout: id => clock.timers.delete(id),
        Date: { now: () => clock.now },
        GLANG: 'en', recogActive: false, speakCount: 0, SPEAK_TARGET: 3,
        micBtn: { innerHTML: '', disabled: false, _c: new Set(),
          classList: { add(c) { sandbox.micBtn._c.add(c); }, remove(c) { sandbox.micBtn._c.delete(c); },
                       contains(c) { return sandbox.micBtn._c.has(c); } } },
        missionStatus: { get innerHTML() { return this._v || ''; }, set innerHTML(v) { this._v = v; env.status.push(v); } },
        missionSentence: () => 'I like apples',
        matchSpoken: (h, t) => String(h).trim().toLowerCase() === String(t).trim().toLowerCase(),
        handleAttempt: (h, c, m) => { env.attempts.push({ heard: h, matched: m }); },
        simRatio: () => 0,
      };
      sandbox.SR_CLS = function FakeSR() {
        const self = this; this.lang = ''; this.interimResults = false; this.maxAlternatives = 1;
        this.continuous = false; this.stopped = false;
        this.start = function () { self.stopped = false; if (self.onstart) self.onstart({}); };
        this.stop = function () { self.stopped = true; if (self.onend) self.onend({}); };
        this.abort = this.stop;
        this.say = function (t) { const alt = { transcript: t, confidence: 0.9 };
          if (self.onresult) self.onresult({ resultIndex: 0, results: { 0: { 0: alt, length: 1, isFinal: true }, length: 1 } }); };
        env.srMade++; env.lastSr = this;
      };
      sandbox.window = sandbox;
      vm.createContext(sandbox);
      vm.runInContext(stt, sandbox);                       // window.MangoiSTT 설치
      vm.runInContext(body + '\n; globalThis.__mk = setupRecognition;', sandbox);
      env.make = () => sandbox.__mk();
      env.sandbox = sandbox;
      return env;
    };

    /* ① 4초 뜸들여도 마이크가 살아 있어야 한다 */
    const e1 = mkEnv();
    const r1 = e1.make(); r1.start();
    e1.tick(4000);
    check('4초 뜸들여도 마이크가 살아 있다',
      !r1.stopped && e1.attempts.length === 0 && e1.sandbox.micBtn.classList.contains('listening'),
      'stopped=' + r1.stopped + ' attempts=' + e1.attempts.length);

    /* ② 그 뒤에 말하면 정상 채점된다 */
    r1.say('I like apples');
    check('뜸들인 뒤에 말해도 정답으로 채점된다',
      e1.attempts.length === 1 && e1.attempts[0].matched === true, JSON.stringify(e1.attempts));

    /* ③ 침묵이 길어지면 결국 정리된다 (무한 대기 아님) */
    const e2 = mkEnv();
    const r2 = e2.make(); r2.start();
    e2.tick(11000);
    check('말이 없으면 11초 안에는 정리된다', r2.stopped || e2.attempts.length > 0,
      'stopped=' + r2.stopped + ' attempts=' + e2.attempts.length);

    /* ④ no-speech 오류가 와도 즉시 끝내지 않는다 */
    const e3 = mkEnv();
    const r3 = e3.make(); r3.start();
    r3.onerror({ error: 'no-speech' });
    check('no-speech 오류만으로 마이크를 끝내지 않는다',
      !e3.attempts.length && e3.sandbox.micBtn.classList.contains('listening'),
      'attempts=' + e3.attempts.length);

    /* ⑤ 권한 거부는 즉시 안내한다 */
    const e4 = mkEnv();
    const r4 = e4.make(); r4.start();
    r4.onerror({ error: 'not-allowed' });
    check('권한 거부는 즉시 안내한다',
      e4.status.some(s => /권한/.test(s)) && !e4.sandbox.micBtn.classList.contains('listening'),
      JSON.stringify(e4.status.slice(-1)));

    /* ⑥ 같은 인식 객체를 재사용하는 두 번째 시도에서도 보호가 유효하다
          (슈팅은 recog 를 한 번만 만들어 계속 쓴다 → onstart 에서 침묵 플래그가 초기화돼야 한다) */
    const e5 = mkEnv();
    const r5 = e5.make();
    r5.start(); e5.tick(11000);                     // 1회차: 침묵으로 종료(플래그 발동)
    r5.start();                                     // 2회차 시작
    e5.tick(4000);
    check('두 번째 시도에서도 4초 뜸들이기가 보호된다', !r5.stopped,
      '2회차 stopped=' + r5.stopped);
    r5.say('I like apples');
    check('두 번째 시도도 정상 채점된다',
      e5.attempts.filter(a => a.matched).length === 1, JSON.stringify(e5.attempts));
  }
}

/* ── 참고본이 흐트러지지 않았는지 (warmup 은 원래부터 올바른 구현) ───────── */
console.log('\n📐 참고본 — warmup.html (처음부터 올바르게 구현돼 있던 화면)');
{
  const w = readFileSync(join(PUB, 'warmup.html'), 'utf8');
  const m = w.match(/SIL_FIRST\s*=\s*(\d+)/);
  check('warmup 의 첫 대기시간도 8초 이상이다', m && Number(m[1]) >= 8000, 'SIL_FIRST=' + (m ? m[1] : '없음'));
}

console.log('\n' + '═'.repeat(60));
if (fail === 0) console.log(`  ✅ PASS ${pass}    ⚠ FAIL 0   (총 ${pass})`);
else {
  console.log(`  ✅ PASS ${pass}    ⚠ FAIL ${fail}   (총 ${pass + fail})`);
  failures.forEach(f => console.log('    - ' + f));
}
console.log('═'.repeat(60));
process.exit(fail === 0 ? 0 : 1);
