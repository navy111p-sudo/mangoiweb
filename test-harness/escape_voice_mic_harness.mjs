/**
 * 🚪 탈출: 말해야 열린다 — 마이크 대기시간·안내 회귀 하니스 (2026-07-30)
 *
 * 제보: "말하기에서 말해도 안 된다" (사장님, 라이브 화면 캡처 첨부)
 *
 * 실측으로 확인한 진짜 원인 — **말이 들리기 전에도 침묵 감시 타이머가 2.2초였다.**
 *   버튼을 누르고 숨을 고르거나 문장을 떠올리는 사이(실측 2.5초)에 마이크가 스스로 꺼지고
 *   "소리가 잘 안 들렸어요"만 떴다. 학생이 말을 해도 그때는 이미 인식이 닫혀 있었다.
 *   → 첫 말 전에는 넉넉히(SIL_FIRST≥8초), 말이 들린 뒤에만 짧게(SIL_AFTER≈2.4초) 끊는다.
 *
 * 같이 고정하는 것들
 *   ② no-speech 오류로 마이크를 끝내지 않는다(보호막이 다시 듣게 놔둔다).
 *      끝은 침묵 타이머의 stop() 만 만든다.
 *   ③ 권한 거부(not-allowed)면 타이핑 폴백이 열린다 — 게임이 막히지 않게.
 *   ④ 못 들었을 때 "다시 말해보세요"로 끝내지 않고 **말할 문장**을 함께 띄운다.
 *   ⑤ 안내가 쉬워야 한다: 처음 두 단계는 예문을 그대로 보여주고, 가만히 있으면
 *      힌트가 스스로 올라온다(자동 힌트는 사용횟수에 잡히지 않는다).
 *   ⑥ 시작 설명은 1·2·3·4 단계 + 한/영 병기.
 *
 * 실행: node test-harness/escape_voice_mic_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');
const FILE = join(PUB, 'student-game-escape-voice.html');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}

const html = readFileSync(FILE, 'utf8');

/* ══ 1. 시작 설명 — 쉬운 4단계 + 한/영 병기 ══════════════════════════════ */
console.log('\n📖 시작 설명(학생이 읽는 첫 화면)');
const introBlock = (html.match(/<div class="ov" id="startOv">[\s\S]*?<\/div>\s*<!-- 결과/) || [''])[0];
check('설명이 번호 단계(1·2·3·4)로 나뉘어 있다',
  (introBlock.match(/class="num"/g) || []).length >= 4,
  '.num 개수=' + (introBlock.match(/class="num"/g) || []).length);
check('각 단계에 영어 병기가 있다 (강사 다수 필리핀)',
  (introBlock.match(/class="en"/g) || []).length >= 4,
  '.en 개수=' + (introBlock.match(/class="en"/g) || []).length);
check('무엇을 말하면 되는지 예문이 설명에 들어 있다',
  /Look at the desk/.test(introBlock));
check('마이크 안 될 때 타이핑으로도 된다고 알려준다',
  /키보드|타이핑|Typing/.test(introBlock));

/* ══ 2. 가짜 브라우저에서 게임 스크립트를 원문 그대로 실행 ═════════════════ */
/* 인라인 스크립트를 "마커가 든 블록"으로 고른다.
   ⚠️ `<script>…</script>` 를 `</body>` 로 앵커해 한 방에 캡처하면 안 된다 — 라이브는 CDN 이
   자기 스크립트(<script type="module" src="https://static…">)를 끼워 넣기 때문에 비탐욕 캡처가
   첫 `</script>` 를 넘어 다음 블록까지 삼킨다(라이브 파일로 돌렸다가 SyntaxError 로 겪음). */
function inlineScript(src, marker) {
  const re = /<script(\s[^>]*)?>/g;
  let m;
  while ((m = re.exec(src))) {
    if (m[1] && /\ssrc\s*=/.test(m[1])) continue;          // 외부 파일 로드는 건너뛴다
    const start = m.index + m[0].length;
    const end = src.indexOf('</script>', start);
    if (end < 0) continue;
    const body = src.slice(start, end);
    if (body.includes(marker)) return body;
  }
  return null;
}
function boot() {
  const code = inlineScript(html, 'function buildSteps');
  if (!code) throw new Error('게임 인라인 스크립트를 찾지 못했다');

  /* 가짜 시계 — arm() 이 실제로 몇 ms 를 걸었는지 보려면 지연시간을 붙잡아야 한다 */
  const clock = { now: 0, seq: 1, timers: new Map(), delays: [] };
  const setTimeoutFake = (cb, ms) => {
    ms = ms || 0; const id = clock.seq++;
    clock.delays.push(ms);
    clock.timers.set(id, { cb, at: clock.now + ms, ms });
    return id;
  };
  const clearTimeoutFake = id => clock.timers.delete(id);
  clock.tick = ms => {
    const end = clock.now + ms;
    for (let guard = 0; guard < 8000; guard++) {
      let next = null;
      for (const [id, t] of clock.timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t];
      if (!next) break;
      clock.timers.delete(next[0]); clock.now = next[1].at;
      try { next[1].cb(); } catch (_) {}
    }
    clock.now = end;
  };
  clock.hasDelayNear = (target, tol) => clock.delays.some(d => Math.abs(d - target) <= (tol == null ? 400 : tol));

  /* 가짜 DOM — 이 화면은 getElementById 로만 요소를 만진다 */
  const els = {};
  const mkEl = id => ({
    id, textContent: '', innerHTML: '', value: '', style: {}, _cls: new Set(), _on: {},
    classList: {
      add(c) { els[id]._cls.add(c); }, remove(c) { els[id]._cls.delete(c); },
      contains(c) { return els[id]._cls.has(c); },
      toggle(c, on) { if (on === undefined) on = !els[id]._cls.has(c); on ? els[id]._cls.add(c) : els[id]._cls.delete(c); },
    },
    addEventListener(ev, fn) { (els[id]._on[ev] = els[id]._on[ev] || []).push(fn); },
    focus() {}, offsetWidth: 1,
  });
  ['scene','vig','flash','utterN','utterOk','timeVal','goalTxt','goalKo','heard','micBtn','hintBtn',
   'typeBtn','typeRow','typeIn','typeGo','hint','startOv','endOv','endT','endEn','resStat','btnStart','btnAgain',
   'noteCard','noteEn','noteKo','eventMsg']
    .forEach(id => { els[id] = mkEl(id); });
  const click = id => (els[id]._on.click || []).forEach(fn => fn.call(els[id], {}));
  const txt = id => (els[id].innerHTML || els[id].textContent || '').replace(/<[^>]*>/g, '');

  /* 가짜 음성인식 — 페이지가 만든 마지막 인스턴스를 붙잡아 둔다 */
  const sr = { made: 0, last: null };
  function FakeSR() {
    const self = this;
    this.lang = ''; this.interimResults = false; this.maxAlternatives = 1; this.continuous = false;
    this.started = false; this.stopped = false;
    this.start = function () { self.started = true; if (self.onstart) self.onstart({}); };
    this.stop = function () { self.stopped = true; if (self.onend) self.onend({}); };
    this.abort = this.stop;
    this.say = function (text) {
      const alt = { transcript: text, confidence: 0.9 };
      const res = { 0: alt, length: 1, isFinal: true };
      if (self.onresult) self.onresult({ resultIndex: 0, results: { 0: res, length: 1 } });
    };
    sr.made++; sr.last = this;
  }

  const win = {
    SpeechRecognition: FakeSR, webkitSpeechRecognition: FakeSR,
    setTimeout: setTimeoutFake, clearTimeout: clearTimeoutFake,
    setInterval: () => 0, clearInterval: () => {},
    location: { search: '' }, URLSearchParams,
    Image: function () { this.src = ''; },
    Audio: function () { this.play = () => ({ catch() {} }); this.pause = () => {}; },
    fetch: () => Promise.reject(new Error('no network in harness')),
    speechSynthesis: { speak() {}, cancel() {} },
    SpeechSynthesisUtterance: function (t) { this.text = t; },
    AudioContext: function () { this.state = 'running'; this.currentTime = 0; this.destination = {};
      this.createOscillator = () => ({ type: '', frequency: {}, connect() {}, start() {}, stop() {} });
      this.createGain = () => ({ gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} });
      this.resume = () => {}; },
    navigator: { sendBeacon: () => true },
    FileReader: function () { this.readAsDataURL = () => {}; },
    addEventListener() {}, MangoiSTT: undefined,
    document: { getElementById: id => els[id] || (els[id] = mkEl(id)), activeElement: null },
  };
  win.window = win;
  vm.createContext(win);
  vm.runInContext(code, win, { filename: 'student-game-escape-voice.html' });
  return { win, els, click, txt, sr, clock };
}

/* ══ 3. 마이크 대기시간 — 이번 결함의 핵심 ════════════════════════════════ */
console.log('\n🎤 마이크 대기시간 (버튼 누르고 말을 꺼내기까지)');
/* ⚠️ 대기시간을 "setTimeout 에 걸린 숫자"로 재면 안 된다.
   listen() 은 침묵 타이머 말고도 12초 감시 타이머를 함께 걸기 때문에, 지연시간 목록에서
   최댓값을 고르면 침묵 타이머가 2.2초로 되돌아가도 12000 이 잡혀 그냥 통과한다(실제로 겪었다).
   → 시간을 흘려보내고 **마이크가 살아 있는지**로 판정한다. */
{
  const g = boot();
  g.click('btnStart');
  const ans0 = g.win.G.steps[0].hints[2];     // 🎲(2026-07-31) 장소가 매번 달라져 정답 문장도 장소마다 다르다
  g.click('micBtn');
  g.clock.tick(4000);                         // 버튼 누르고 4초 동안 뜸들임 (문장을 떠올리는 시간)
  check('4초 뜸들여도 마이크가 살아 있다 (예전엔 2.5초에 스스로 꺼졌다)',
    g.els.micBtn._cls.has('rec') && !g.sr.last.stopped,
    'rec=' + g.els.micBtn._cls.has('rec') + ' stopped=' + g.sr.last.stopped + ' heard=' + g.txt('heard'));
  g.sr.last.say(ans0);                        // 이제서야 말을 꺼냈다
  check('뜸들인 뒤에 말해도 인정된다', g.win.G.utterOk === 1, 'utterOk=' + g.win.G.utterOk);
}
{
  // 반대쪽: 말이 들린 뒤에는 짧게 끊어야 한다 (문장이 끝났는데 계속 기다리면 답답하다)
  const g = boot();
  g.click('btnStart');
  g.click('micBtn');
  g.sr.last.say('umm');                       // 소리는 들렸지만 정답은 아님
  g.clock.tick(3000);
  check('말이 들린 뒤에는 3초 안에 판정한다',
    !g.els.micBtn._cls.has('rec') && /umm/.test(g.txt('heard')), 'heard=' + g.txt('heard'));
}

/* ══ 4. 오류 처리 — no-speech 로 죽지 않고, 권한 거부면 타이핑 ═════════════ */
console.log('\n🛡 마이크 오류 처리');
{
  const g = boot();
  g.click('btnStart'); g.click('micBtn');
  g.sr.last.onerror({ error: 'no-speech' });
  check('no-speech 오류만으로 마이크를 끝내지 않는다',
    !/못 들었어요|잘 안 들/.test(g.txt('heard')) && g.els.micBtn._cls.has('rec'),
    'heard=' + g.txt('heard'));

  const g2 = boot();
  g2.click('btnStart'); g2.click('micBtn');
  g2.sr.last.onerror({ error: 'not-allowed' });
  check('권한 거부면 타이핑 폴백이 열린다', g2.els.typeRow._cls.has('on'));
  check('권한 거부는 마이크 버튼을 원래대로 되돌린다', !g2.els.micBtn._cls.has('rec'));
}

/* ══ 5. 못 들었을 때 — 학생이 멈추지 않게 예문을 함께 준다 ════════════════ */
console.log('\n🙉 못 들었을 때');
{
  const g = boot();
  g.click('btnStart');
  const ans0 = g.win.G.steps[0].hints[2];
  g.click('micBtn');
  g.clock.tick(15000);                        // 아무 말 없이 침묵 → 침묵 타이머가 마무리
  check('침묵이 길면 마이크를 정리한다', !g.els.micBtn._cls.has('rec'));
  check('못 들었다고 알려준다', /못 들었어요/.test(g.txt('heard')), 'heard=' + g.txt('heard'));
  check('말할 문장을 함께 보여준다 (예전엔 "다시 말해보세요"로 끝났다)',
    g.txt('hint').includes(ans0), 'hint=' + g.txt('hint') + ' 기대=' + ans0);
}

/* ══ 6. 안내가 쉬운가 — 예문 자동 노출·자동 힌트 ═════════════════════════ */
console.log('\n💡 게임 중 안내');
{
  const g = boot();
  g.click('btnStart');
  const ans0 = g.win.G.steps[0].hints[2];
  check('시작하자마자 1단계 말할 문장이 보인다',
    g.txt('hint').includes(ans0), 'hint=' + g.txt('hint') + ' 기대=' + ans0);
  check('자동 힌트 타이머가 걸려 있다 (가만히 있어도 도와준다)',
    g.clock.hasDelayNear(18000, 1000) || g.clock.hasDelayNear(14000, 1000),
    'delays=' + g.clock.delays.filter(d => d >= 5000).join(','));

  // 3단계 이후: 가만히 있으면 힌트가 한 칸씩 올라간다
  // (2026-07-31) "힌트가 너무 빨리 나온다·생각할 시간 필요" 피드백으로 첫 자동힌트 8s→14s, 반복 9s→12s로 늦춤
  const g2 = boot();
  g2.click('btnStart');
  g2.win.G.i = 2; g2.win.showStep();
  const ans2 = g2.win.G.steps[2].hints[2];    // 🎲 장소마다 다른 3단계 정답 문장(예: "Move the painting")
  check('3단계는 처음엔 정답을 안 보여준다 (스스로 생각할 시간)',
    !g2.txt('hint').includes(ans2), 'hint=' + g2.txt('hint') + ' 정답=' + ans2);
  g2.clock.tick(14500);
  const h1 = g2.txt('hint');
  g2.clock.tick(12000);
  const h2 = g2.txt('hint');
  g2.clock.tick(12500);
  check('가만히 있으면 힌트가 스스로 올라온다', h1 && h2 && h1 !== h2, '14.5초=' + h1 + ' / 26.5초=' + h2);
  check('끝내는 정답 문장까지 알려준다', g2.txt('hint').includes(ans2), 'hint=' + g2.txt('hint') + ' 기대=' + ans2);
  check('자동 힌트는 사용횟수(감점)에 잡히지 않는다', g2.win.G.hintUsed === 0, 'hintUsed=' + g2.win.G.hintUsed);
}

/* ══ 7. 오답이면 곧바로 한 칸 더 알려준다 ════════════════════════════════ */
console.log('\n🔁 틀렸을 때');
{
  const g = boot();
  g.click('btnStart');
  g.win.G.i = 2; g.win.showStep();
  const lv0Hint = g.win.G.steps[2].hints[0];  // 🎲 장소마다 다른 첫 힌트(예: "지도를 옮기세요")
  g.win.submitSaid('I do not know');
  check('오답 1회로도 힌트가 올라온다 (예전엔 3회 틀려야 나왔다)',
    g.txt('hint').includes(lv0Hint), 'hint=' + g.txt('hint') + ' 기대=' + lv0Hint);
  check('들린 말을 보여준다', /I do not know/.test(g.txt('heard')), 'heard=' + g.txt('heard'));
}

/* ══ 8. 끝까지 진행되는가 — 7단계 전부 말하면 탈출 ═══════════════════════ */
console.log('\n🚪 처음부터 끝까지');
{
  const g = boot();
  g.click('btnStart');
  // 🎲 hints[2]는 각 단계의 "이렇게 말해보세요" 예문 그 자체이므로, 장소가 무엇이든 항상 정답이다
  const answers = g.win.G.steps.map(s => s.hints[2]);
  for (const a of answers) {
    g.click('micBtn');
    g.sr.last.say(a);
    g.clock.tick(6500);                       // 내레이션(최대 6초 안전장치) 지나가기
  }
  check('7단계를 모두 말하면 탈출한다', !g.els.endOv._cls.has('hide'));
  check('탈출 성공 화면이 뜬다', /탈출 성공/.test(g.txt('endT')), 'endT=' + g.txt('endT'));
  check('발화 횟수 7회가 기록된다', g.win.G.utterOk === 7, 'utterOk=' + g.win.G.utterOk);
}

/* ══ 9. 내레이션 중 마이크 — 무반응으로 두지 않는다 ══════════════════════ */
console.log('\n⏭ 방이 이야기하는 중에 마이크를 누르면');
{
  const g = boot();
  g.click('btnStart');
  const ans0 = g.win.G.steps[0].hints[2];
  g.click('micBtn'); g.sr.last.say(ans0);
  check('내레이션 중이다', g.win.G.busy === true);
  const madeBefore = g.sr.made;
  g.click('micBtn');
  g.clock.tick(200);
  check('내레이션을 건너뛰고 다음 단계로 넘어간다', g.win.G.busy === false && g.win.G.i === 1,
    'busy=' + g.win.G.busy + ' step=' + g.win.G.i);
  check('그리고 바로 다시 듣기 시작한다', g.sr.made > madeBefore, 'made=' + madeBefore + '→' + g.sr.made);
}

/* ══ 10. 암호 무작위화 — 재도전마다 다른 3자리 숫자(2026-07-31, "매번 같은 정답이라 재미없다") ══ */
console.log('\n🔢 암호 무작위화');
{
  const g = boot();
  g.click('btnStart');
  const code = g.win.G.code;
  check('3자리 암호가 생성된다', Array.isArray(code) && code.length === 3, 'code=' + JSON.stringify(code));
  check('암호 숫자가 전부 다르다(0 제외 1~9)', new Set(code).size === 3 && code.every(d => d >= '1' && d <= '9'),
    'code=' + JSON.stringify(code));
  const digitWord = g.win.DIGIT_WORD;
  const spoken = code.map(d => digitWord[d]).join(' ');
  g.win.G.i = 4; g.win.showStep();               // 'code' 단계로 강제 이동
  g.win.submitSaid(spoken);
  g.clock.tick(6500);                             // advance()의 내레이션 안전 타임아웃(6s) 지나가기
  check('실제로 생성된 암호를 말하면 통과한다', g.win.G.i === 5, 'spoken=' + spoken + ' step=' + g.win.G.i);
}
{
  // 완전 결정론적 재현이 안 되는 값이라 "10판 중 최소 한 번은 다르다"로 판정한다
  // (같은 3자리 조합이 10번 연속 우연히 나올 확률은 극히 낮다 — 9*8*7=504 가지)
  const g0 = boot(); g0.click('btnStart');
  const firstCode = g0.win.G.code.join('');
  let sawDifferent = false;
  for (let i = 0; i < 10 && !sawDifferent; i++) {
    const g = boot(); g.click('btnStart');
    if (g.win.G.code.join('') !== firstCode) sawDifferent = true;
  }
  check('재도전마다 암호가 달라질 수 있다(고정값이 아니다)', sawDifferent);
}

/* ══ 11. 중간 긴장 이벤트 — 시간이 절반 남으면 한 번, 조용한 디밍과 다른 "사건" ══════ */
console.log('\n⚡ 중간 긴장 이벤트');
{
  const g = boot();
  g.click('btnStart');
  // 🎭(2026-07-31) 이제 이벤트가 풀에서 무작위로 뽑히므로, 풀을 1개(조명 플리커)로 줄여서
  // 이 케이스에서는 결정론적으로 검증한다(vm 컨텍스트 밖에서 Math.random을 직접 바꿀 수 없다)
  g.win.MID_EVENTS.length = 1;
  const half = Math.floor(300 * 0.5);
  for (let i = 0; i < half - 1; i++) g.win.tickOnce();
  check('절반 시점 직전까지는 이벤트가 안 터진다', g.win.G.eventFired === false, 'eventFired=' + g.win.G.eventFired);
  g.win.tickOnce();
  check('시간이 절반 남으면 이벤트가 터진다', g.win.G.eventFired === true);
  check('이벤트 메시지가 화면에 뜬다', g.els.eventMsg._cls.has('show'));
  check('장면에 플리커 효과가 걸린다', g.els.scene._cls.has('flicker'));
  for (let i = 0; i < 30; i++) g.win.tickOnce();
  check('이벤트는 한 판에 한 번만 터진다(중복 없음)', g.win.G.eventFired === true);
}
/* ══ 11b. 긴장 이벤트 풀 — 발자국·피아노·TV·물방울·책·커튼 중 매번 다르게(2026-07-31) ══════ */
console.log('\n🎭 긴장 이벤트 다양화');
{
  const g = boot();
  g.click('btnStart');
  check('이벤트 풀이 5가지 이상이다(매번 같은 연출이면 지루하다)',
    g.win.MID_EVENTS.length >= 5, 'count=' + g.win.MID_EVENTS.length);
  check('모든 이벤트에 효과음과 한/영 메시지가 있다',
    g.win.MID_EVENTS.every(e => typeof e.sfx === 'function' && e.en && e.ko));
}
{
  // fireMidEvent()를 직접 반복 호출해 실제로 여러 연출이 나오는지 확인한다(자체 무작위 선택 로직)
  const g = boot();
  g.click('btnStart');
  const seen = new Set();
  for (let i = 0; i < 20; i++) { g.win.fireMidEvent(); seen.add(g.txt('eventMsg')); }
  check('이벤트가 매번 같은 것만 뽑히지 않는다', seen.size > 1, 'variants seen=' + seen.size);
}

/* ══ 12. 장소 다양화 — 매번 6곳 중 하나를 무작위로("같은 방만 나오면 지루하다" 피드백, 2026-07-31) ══ */
console.log('\n🎲 장소 다양화');
{
  const g = boot();
  g.click('btnStart');
  const validIds = ['study','classroom','restroom','storage','rooftop','playground'];
  check('등록된 6곳 중 하나가 뽑힌다', validIds.includes(g.win.G.loc.id), 'loc=' + g.win.G.loc.id);
  check('그 장소의 퍼즐 7단계가 만들어진다', g.win.G.steps.length === 7, 'steps=' + g.win.G.steps.length);
  check('상단에 장소 이름표가 뜬다', g.els.locTag.textContent.includes(g.win.G.loc.nameKo),
    'locTag=' + g.els.locTag.textContent);
}
{
  // 완전 결정론적 재현이 안 되는 값이라 "20판 중 최소 한 번은 다르다"로 판정한다
  const g0 = boot(); g0.click('btnStart');
  const firstLoc = g0.win.G.loc.id;
  let sawDifferent = false;
  for (let i = 0; i < 20 && !sawDifferent; i++) {
    const g = boot(); g.click('btnStart');
    if (g.win.G.loc.id !== firstLoc) sawDifferent = true;
  }
  check('재도전마다 다른 장소가 나올 수 있다(고정 장소가 아니다)', sawDifferent);
}
{
  // study가 아닌 장소는 사진 1장을 그대로 쓴다 — CLOSEUP/FOCUS(study 전용) 오적용으로 잘못된
  // 이미지 키를 찾는 사고가 없는지 6곳 전부 순서대로 강제해 확인한다
  const LOCS = ['study','classroom','restroom','storage','rooftop','playground'];
  for (const id of LOCS) {
    const g = boot();
    g.click('btnStart');
    g.win.G.loc = g.win.LOCATIONS.find(l => l.id === id);
    g.win.G.steps = g.win.G.loc.build(g.win.G.code);
    g.win.G.i = 0; g.win.showStep();
    const bg = g.els.scene.style.backgroundImage || '';
    check(`[${id}] 장면 사진이 정상적으로 설정된다(빈 값 아님)`, bg.length > 0, 'backgroundImage=' + bg);
  }
}

/* 13. PR #1016 실제 클릭·재시도·이전 세션 콜백 회귀 */
{
  const g = boot(); g.click('btnStart'); g.click('scene');
  check('그림 클릭으로 듣기가 시작된다', g.sr.made === 1 && g.win.recActive);
  g.click('scene');
  check('듣는 중 그림 연타는 인식을 중복 생성하지 않는다', g.sr.made === 1);
  g.sr.last.say(g.win.G.steps[0].hints[2]);
  g.click('scene'); g.clock.tick(300);
  check('내레이션 중 그림 클릭도 다음 단계에서 듣기를 시작한다', g.win.G.i === 1 && g.win.recActive);
}
{
  const g = boot(); g.click('btnStart'); g.click('scene');
  g.clock.tick(15000);
  check('침묵 뒤 그림 클릭 안내가 복구된다', g.els.scene._cls.has('readyToSpeak'));
}
{
  const g = boot(); g.click('btnStart'); g.click('micBtn');
  const old = g.sr.last;
  g.win.lose();
  check('시간 종료 시 음성인식을 정리한다', old.stopped && !g.win.recActive);
  g.click('btnAgain');
  old.say(g.win.G.steps[0].hints[2]);
  check('이전 판의 늦은 인식 결과는 새 판에 적용되지 않는다', g.win.G.utter === 0 && !g.win.G.busy);
  g.click('scene');
  check('재시작 후 새 마이크를 바로 열 수 있다', g.sr.made === 2 && g.win.recActive);
}
{
  const g = boot(); g.click('btnStart');
  g.win.submitSaid(g.win.G.steps[0].hints[2]);
  g.win.lose(); g.click('btnAgain'); g.clock.tick(6500);
  check('이전 판의 단계 이동 타이머가 새 판을 건너뛰지 않는다', g.win.G.i === 0);
}
{
  const g = boot(); g.click('btnStart');
  for (let i = 1; i <= 3; i++) {
    g.win.submitSaid('banana');
    check('실패 '+i+'회 안내', i < 3 ? /Almost!/.test(g.txt('heard')) : /example below/.test(g.txt('heard')));
  }
  g.win.submitSaid(g.win.G.steps[0].hints[2]); g.clock.tick(6500);
  g.win.submitSaid('banana');
  check('다음 단계에서 재시도 횟수가 초기화된다', /Almost!/.test(g.txt('heard')) && g.win.G.stepWrong === 1);
  const step = { accept: [['open', 'drawer']] };
  check('한 글자 조각으로 정답을 통과하지 않는다', !g.win.matchStep('o d', step));
  check('허용한 STT 오인식은 계속 통과한다', g.win.matchStep('open the draw', step));
  check('정상 어형 변화도 통과한다', g.win.matchStep('opening the boxes', {accept:[['open','box']]}));
}

{
  const g = boot(); let spoken = 0;
  g.win.speechSynthesis.speak = () => { spoken++; };
  g.click('btnStart'); g.click('scene');
  await new Promise(resolve => setImmediate(resolve));
  check('듣기 시작 후 늦게 실패한 TTS 요청이 예문을 재생하지 않는다', spoken === 0 && g.win.recActive);
}
{
  const g = boot(); g.click('btnStart');
  let all = true;
  for (const loc of g.win.LOCATIONS) {
    for (const step of loc.build(g.win.G.code)) {
      if (!g.win.matchStep(step.hints[2], step)) all = false;
    }
  }
  check('6개 장소의 모든 예문은 정답으로 인정된다', all);
}

/* ══ 결과 ═══════════════════════════════════════════════════════════════ */
console.log('\n' + '═'.repeat(60));
if (fail === 0) console.log(`  ✅ PASS ${pass}    ⚠ FAIL 0   (총 ${pass})`);
else {
  console.log(`  ✅ PASS ${pass}    ⚠ FAIL ${fail}   (총 ${pass + fail})`);
  failures.forEach(f => console.log('    - ' + f));
}
console.log('═'.repeat(60));
process.exit(fail === 0 ? 0 : 1);
