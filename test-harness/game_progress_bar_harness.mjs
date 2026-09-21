/* 📊 게임 진행 띠 — 「얼마나 남았는지」가 22종 공통으로 보이는가 (2026-09-22 신설)
   ────────────────────────────────────────────────────────────────────────────
   왜: 게임 22종을 브라우저로 전수 실측하니 **8종은 「끝」이 화면에 한 글자도 안 보였고**,
       보여 주는 14종도 기준이 여섯 가지였다(0/10 · 1/6 · 1/4 · 0/5 · Round 1/3 · 0/60).
       → 사장님 「무작정 언제까지 해야 끝나는지 모르니 몇 번 하다가 나가게 돼요.」

   무엇을 지키나 — 이 셋이 어긋나면 화면이 거짓말을 한다:
     ① 허브가 그리는 분모 == 게임에게 URL 로 넘기는 goal   (한 값에서 나와야 한다)
     ② 채움이 «인라인» 이 아니다                            (인라인이면 폭·높이가 무시돼 안 보인다)
     ③ 목표를 모르면(0) 띠를 아예 안 그린다                  (모르는 것을 지어내지 않는다)

   ⚠️ 문자열로 「그 함수가 있는가」를 묻지 않는다 — 함수도 값도 다 «있고» 틀리는 것은
      «무슨 답이 나오는가» 뿐이다. 그래서 목표표와 판정 함수를 **소스에서 오려 내 실제로 돌린다.**
   ⚠️ 「그린다」 옆에 **「안 그릴 때는 정말 안 그린다」를 짝으로** 둔다 —
      짝이 없으면 «전부 그리기» 도 «전부 안 그리기» 도 통과한다.
*/
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(HERE, '..', 'cloudflare-deploy', 'public');
const HUB = fs.readFileSync(path.join(PUB, 'student-games.html'), 'utf8');
const TRACK = fs.readFileSync(path.join(PUB, 'js', 'game-track.js'), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + '  ' + extra); }
};

/* 주석을 벗겨 낸 사본 — 부정 검사가 «자기 설명 주석» 을 잡지 않게.
   ⛔ `//` 를 정규식으로 일괄 삭제하면 문자열 안의 https:// 가 잘린다. 글자를 훑으며
      «블록주석 안인가 · 문자열 안인가» 를 함께 추적한다. */
function strip(src) {
  let out = '', i = 0, n = src.length;
  let inLine = false, inBlock = false, q = '';
  while (i < n) {
    const c = src[i], c2 = src[i + 1];
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (inBlock) { if (c === '*' && c2 === '/') { inBlock = false; i += 2; } else i++; continue; }
    if (q) { if (c === '\\') { out += c + (c2 || ''); i += 2; continue; } if (c === q) q = ''; out += c; i++; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    if (c === '/' && c2 === '/') { inLine = true; i += 2; continue; }
    if (c === '/' && c2 === '*') { inBlock = true; i += 2; continue; }
    out += c; i++;
  }
  return out;
}

/* 중괄호 짝으로 함수 몸통을 자른다. ⚠️ 여는 중괄호를 고를 때 괄호 깊이가 0인 것만 본다
   (인자 목록 안의 중괄호를 몸통으로 오인하지 않게). */
function bodyAt(src, sig) {
  const i = src.indexOf(sig);
  if (i < 0) return '';
  let j = src.indexOf('{', i + sig.length - 1);
  if (j < 0) return '';
  let d = 0;
  for (let k = j; k < src.length; k++) {
    if (src[k] === '{') d++;
    else if (src[k] === '}') { d--; if (d === 0) return src.slice(j, k + 1); }
  }
  return '';
}

console.log('① 목표표 — 소스에서 오려 내 실제로 돌린다');

// 목표표와 두 판정 함수를 소스에서 그대로 꺼내 평가한다(하니스에 숫자를 베껴 적지 않는다)
const tableSrc = (() => {
  const i = HUB.indexOf('var GAME_GOAL_DEFAULT');
  if (i < 0) return '';
  const j = HUB.indexOf('var _gpState', i);
  return j > i ? HUB.slice(i, j) : '';
})();
ok('[전제] 목표표와 판정 함수를 오려 냈다', tableSrc.length > 200, `${tableSrc.length}자`);

let G = null;
try {
  G = new Function(tableSrc + '\n return { goals:GAME_GOALS, def:GAME_GOAL_DEFAULT, goalOf:_goalOf, byOf:_goalByOf };')();
} catch (e) { /* 아래 전제 검사가 잡는다 */ }
ok('[전제] 실제로 돌아간다', !!(G && typeof G.goalOf === 'function'), G ? '' : '평가 실패');

if (G) {
  ok('모르는 게임은 기본값(10)으로 떨어진다', G.goalOf('존재하지않는게임') === G.def, `= ${G.goalOf('존재하지않는게임')}`);
  ok('우주 괴물 사냥은 6 (실측 1/6)', G.goalOf('spacemonster') === 6, `= ${G.goalOf('spacemonster')}`);
  ok('문법 피자는 4 (실측 1/4)', G.goalOf('pizza') === 4, `= ${G.goalOf('pizza')}`);
  ok('용의자 추리는 3 (실측 Round 1/3)', G.goalOf('suspect') === 3, `= ${G.goalOf('suspect')}`);
  ok('낚시는 5 (실측 0/5)', G.goalOf('fish') === 5, `= ${G.goalOf('fish')}`);
  // ⛔ 짝 — «전부 10으로 통일» 을 막는다. 게임이 먼저 끝나면 띠가 중간에서 멈춰 거짓말이 된다.
  const distinct = new Set(['spacemonster', 'pizza', 'suspect', 'fish'].map(m => G.goalOf(m)));
  ok('목표가 게임마다 다르다(10으로 뭉개지 않았다)', distinct.size >= 4, `서로 다른 값 ${distinct.size}개`);
  ok('아바타는 0 — 경험치라 «맞힌 개수» 와 단위가 달라 띠를 안 그린다', G.goalOf('avatar') === 0);
  ok('축: 우주괴물은 «푼 개수»(seen)로 센다', G.byOf('spacemonster') === 'seen');
  ok('축: 기본은 «맞힌 개수»(done)', G.byOf('brick') === 'done' && G.byOf('모르는게임') === 'done');
}

console.log('\n② 허브가 그리는 분모 == 게임에게 넘기는 goal (한 값에서 나와야 한다)');
const srcBuilder = bodyAt(HUB, 'function _hubIframeSrc(');
ok('[전제] URL 조립 함수를 오려 냈다', srcBuilder.length > 100);
ok('goal 을 «표에서» 가져온다', /goal=['"]\s*\+\s*_goalOf\(/.test(srcBuilder), srcBuilder.match(/goal=[^&]{0,28}/)?.[0] || '');
// ⛔ 옛 하드코딩(goal=10)이 되살아나면 표와 URL 이 갈린다
ok('숫자를 URL 에 다시 적지 않았다', !/goal=1?0?\d*&/.test(strip(srcBuilder).replace(/goal='\s*\+\s*_goalOf\([^)]*\)\s*\+\s*'/, 'goal=X&')), '');

console.log('\n③ 채움이 «인라인» 이 아니다 — 인라인이면 폭·높이가 통째로 무시된다');
const cssFill = HUB.match(/\.game-progress\s+\.gp-fill\s*\{([^}]*)\}/);
ok('[전제] 채움 규칙을 찾았다', !!cssFill);
if (cssFill) {
  const decl = cssFill[1];
  const disp = (decl.match(/display\s*:\s*([a-z-]+)/) || [])[1];
  // ⚠️ 「block 이라고 적혀 있는가」가 아니라 「인라인이 아닌가」로 묻는다 —
  //    flex·grid 로 바꾸는 정당한 수리를 빨간불로 만들면 안 된다.
  ok('채움이 인라인이 아니다', !!disp && !/^inline(-block)?$/.test(disp) && disp !== 'inline', `display:${disp || '없음'}`);
  ok('0개일 때도 «측정 안 됨» 으로 안 읽히게 최소 표시가 있다', /min-width\s*:\s*[1-9]/.test(decl), (decl.match(/min-width\s*:[^;]*/) || [''])[0]);
}

console.log('\n④ 목표를 모르면 띠를 안 그린다 — «그린다» 의 짝');
const startFn = bodyAt(HUB, 'function hubProgressStart(');
const drawFn = bodyAt(HUB, 'function hubProgressDraw(');
ok('[전제] 진행 함수 둘을 오려 냈다', startFn.length > 60 && drawFn.length > 60);
ok('goal 이 0이면 숨긴다', /if\s*\(\s*!\s*_gpState\.goal\s*\)\s*\{[^}]*hidden\s*=\s*true/.test(startFn), '');
ok('goal 이 있으면 보여 준다', /hidden\s*=\s*false/.test(startFn), '');
ok('그리기도 goal 이 없으면 손을 뗀다', /!\s*_gpState\.goal\s*\)\s*return/.test(drawFn), '');
// ⚠️ 11/10 은 거짓말이다
ok('목표를 넘으면 목표에 맞춰 자른다', /Math\.min\s*\(\s*_gpState\.done\s*,\s*_gpState\.goal\s*\)/.test(drawFn), '');

console.log('\n⑤ 배선 — 게임이 세면 허브가 받는다');
ok('game-track 이 셀 때마다 부모에게 알린다(두 자리 모두)',
  (strip(TRACK).match(/notifyProgress\(\)/g) || []).length >= 3,
  `호출 ${(strip(TRACK).match(/notifyProgress\(\)/g) || []).length}곳(정의 1 + 호출 2)`);
const notify = bodyAt(TRACK, 'function notifyProgress(');
ok('[전제] 알림 함수를 오려 냈다', notify.length > 80);
// ⛔ 부모가 없는 독립 화면(AI 학습도구 7종도 이 파일을 싣는다)에서는 아무 일도 하면 안 된다
ok('부모가 없으면 즉시 손을 뗀다', /window\.parent\s*===\s*window\s*\)\s*return/.test(notify), '');
ok('같은 오리진으로만 보낸다', /location\.origin/.test(notify), '');
ok('목표를 지어내지 않는다 — URL 의 goal 을 그대로 싣는다', /goal\s*:\s*GOAL/.test(notify), '');

const listener = HUB.slice(HUB.indexOf("addEventListener('message'"), HUB.indexOf("addEventListener('message'") + 1400);
ok('허브가 진행 신호를 받는다', /'mangoi-game-progress'/.test(listener), '');
ok('게임이 «직접» 말한 값(self)을 우선한다', /d\.self\s*\?|if\s*\(\s*d\.self\s*\)/.test(listener), '');
ok('완료 신호가 오면 띠를 가득 채운다(먼저 끝나도 중간에서 안 멈춘다)',
  /mangoi-game-complete[\s\S]{0,200}hubProgressComplete\(\)/.test(listener), '');

console.log('\n⑥ 수명 — 켤 때 켜고, 나갈 때 치운다');
const openFn = bodyAt(HUB, 'function hubOpenGame(');
ok('[전제] hubOpenGame 을 오려 냈다', openFn.length > 200);
ok('게임을 열면 띠를 초기화한다', /hubProgressStart\(\s*mode\s*\)/.test(openFn), '');
const backFn = bodyAt(HUB, 'function hubBackToMenu(');
ok('메뉴로 돌아가면 띠를 치운다', /hubProgressStop\(\)/.test(backFn), '');
// 인라인 4종은 허브가 진행을 직접 안다
ok('인라인 게임의 정답 수가 띠로 이어진다',
  /game-correct'\)\.textContent\s*=\s*_gameState\.correct;[\s\S]{0,140}hubProgressSet\(\s*_gameState\.correct\s*\)/.test(HUB), '');

console.log('\n⑦ 캐시 — 고친 js 를 부르는 HTML 의 ?v= 가 함께 올라갔나');
const htmls = fs.readdirSync(PUB).filter(f => f.endsWith('.html'));
const vers = new Set();
for (const f of htmls) {
  const t = fs.readFileSync(path.join(PUB, f), 'utf8');
  const m = t.match(/game-track\.js\?v=(\d+)/g) || [];
  m.forEach(x => vers.add(x));
}
ok('game-track.js 를 부르는 ?v= 가 한 가지로 통일돼 있다', vers.size === 1, [...vers].join(' · '));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
