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

/* 중괄호 짝으로 몸통을 자른다 — «길이» 로 자르면 옆 코드가 딸려 들어온다.
   ⚠️ 여는 중괄호는 sig 뒤의 «첫» 것을 쓴다. 이 저장소의 대상이 전부 HTML/JS 라
      TS 반환 타입(`): Promise<{…}> {`)이 없어서 성립한다 — TS 에 쓰려면
      괄호·꺾쇠 깊이가 0인 것만 골라야 한다. */
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
  G = new Function(tableSrc + '\n return { goals:GAME_GOALS, def:GAME_GOAL_DEFAULT, goalOf:_goalOf };')();
} catch (e) { /* 아래 전제 검사가 잡는다 */ }
ok('[전제] 실제로 돌아간다', !!(G && typeof G.goalOf === 'function'), G ? '' : '평가 실패');

if (G) {
  ok('모르는 게임은 기본값으로 떨어진다', G.goalOf('존재하지않는게임') === G.def, `= ${G.goalOf('존재하지않는게임')}`);
  ok('기본값이 실제 숫자다', typeof G.def === 'number' && G.def > 0, `= ${G.def}`);
  ok('아바타는 0 — 경험치라 «맞힌 개수» 와 단위가 달라 띠를 안 그린다', G.goalOf('avatar') === 0);
  /* 🔴 2026-09-22 — 여기 있던 「우주괴물은 6」·「피자는 4」·「축은 seen」 검사를 버렸다.
     그 숫자들은 게임 HUD 를 베낀 것인데 단위가 달랐다(「1/6」은 문제 수가 아니라 LEVEL,
     seen 은 문제 수가 아니라 API 호출 수라 문장 하나에 2씩 늘었다) → 문장 3개에서
     6/6 「다 했어요!」. 옛 검사는 그 거짓을 «정답» 으로 못 박고 있었다.
     ⛔ 되살리지 말 것. 단위는 «맞힌 개수» 하나다. */
  ok('«푼 개수»(seen) 축이 되살아나지 않았다', !/by\s*:\s*['"]seen['"]/.test(tableSrc), '');
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

// ⛔ 길이(slice)로 자르면 listener 밖 코드가 딸려 들어와 부정 검사가 헛돈다.
const listener = bodyAt(HUB, "addEventListener('message'");
ok('[전제] message 리스너 몸통을 오려 냈다', listener.length > 300, `${listener.length}자`);
ok('허브가 진행 신호를 받는다', /'mangoi-game-progress'/.test(listener), '');
ok('게임이 «직접» 말한 값(self)을 우선한다', /d\.self\s*\?|if\s*\(\s*d\.self\s*\)/.test(listener), '');
ok('완료 신호가 오면 띠를 가득 채운다(먼저 끝나도 중간에서 안 멈춘다)',
  /mangoi-game-complete[\s\S]{0,200}hubProgressComplete\(\)/.test(listener), '');
/* ⛔ d.seen 을 쓰면 안 된다 — game-track.js 의 그 값은 «API 호출 수» 라
   게임에 따라 문장 하나에 둘씩 는다(우주괴물 실측: 문장 3개에 seen 6). */
ok('«푼 개수»(d.seen)를 분자로 쓰지 않는다', !/hubProgressSet\([^)]*d\.seen/.test(strip(listener)), '');

console.log('\n⑥ 수명 — 켤 때 켜고, 나갈 때 치운다');
const openFn = bodyAt(HUB, 'function hubOpenGame(');
ok('[전제] hubOpenGame 을 오려 냈다', openFn.length > 200);
ok('게임을 열면 띠를 초기화한다', /hubProgressStart\(\s*mode\s*\)/.test(openFn), '');
const backFn = bodyAt(HUB, 'function hubBackToMenu(');
ok('메뉴로 돌아가면 띠를 치운다', /hubProgressStop\(\)/.test(backFn), '');
// 인라인 4종은 허브가 진행을 직접 안다
ok('인라인 게임의 정답 수가 띠로 이어진다',
  /game-correct'\)\.textContent\s*=\s*_gameState\.correct;[\s\S]{0,140}hubProgressSet\(\s*_gameState\.correct\s*\)/.test(HUB), '');

console.log('\n⑧ 🔴 통로가 «없는» 게임에 띠를 그리지 않는가 — registry 를 열어 기계로 대조');
/* 왜 이 절이 있나 (2026-09-22 실사고):
   목표표를 «손으로» 적어 두었더니, 진행을 알려 올 통로가 아예 없는 게임 셋
   (english-mastery-suite · speaking-quiz · student-game-scene-quest — 그 셋은
   game-track.js 를 안 싣는다)에 띠가 붙어 있었다. 그러면 게임 내내 0 에 멎어
   있다가 끝에 갑자기 가득 차서, 화면이 «측정한 척» 거짓말을 한다.
   ⛔ 목록을 여기에 베껴 적지 말 것 — 그러면 검사가 «내가 적은 값» 을 볼 뿐이다.
      registry 에서 그 게임의 파일 이름을 읽어, 그 파일을 실제로 열어서 묻는다. */
const REG_I = HUB.indexOf('const HUB_GAMES = [');
ok('[전제] 게임 registry 를 찾았다', REG_I > 0);
const regSrc = REG_I > 0 ? HUB.slice(REG_I, HUB.indexOf('\n];', REG_I)) : '';
// 항목을 `{ mode:'x'` 단위로 자른다
const entries = [];
{
  const re = /\{\s*mode\s*:\s*'([a-z0-9]+)'/g;
  let m, prev = null;
  while ((m = re.exec(regSrc))) {
    if (prev) entries.push({ mode: prev.mode, body: regSrc.slice(prev.at, m.index) });
    prev = { mode: m[1], at: m.index };
  }
  if (prev) entries.push({ mode: prev.mode, body: regSrc.slice(prev.at) });
}
ok('[전제] registry 항목을 읽었다(10개 이상)', entries.length >= 10, `${entries.length}개`);

const noChannel = [], withChannel = [];
for (const e of entries) {
  if (!/kind\s*:\s*'iframe'/.test(e.body)) continue;          // 인라인은 허브가 직접 안다
  const f = (e.body.match(/'\/([a-z0-9-]+\.html)/) || [])[1];  // src 안의 파일 이름
  if (!f) continue;
  const full = path.join(PUB, f);
  if (!fs.existsSync(full)) continue;
  const has = /game-track\.js/.test(fs.readFileSync(full, 'utf8'));
  (has ? withChannel : noChannel).push({ mode: e.mode, file: f });
}
ok('[전제] iframe 게임의 파일을 실제로 열어 봤다', (noChannel.length + withChannel.length) >= 10,
  `통로 있음 ${withChannel.length} · 없음 ${noChannel.length}`);

if (G) {
  const lying = noChannel.filter(x => G.goalOf(x.mode) !== 0);
  ok('진행을 알려 올 통로가 없는 게임은 띠를 안 그린다(목표 0)', lying.length === 0,
    lying.length ? lying.map(x => `${x.mode}(${x.file}) 목표 ${G.goalOf(x.mode)}`).join(' · ')
                 : `통로 없는 ${noChannel.length}종 전부 0: ${noChannel.map(x => x.mode).join(' ') || '(없음)'}`);
  /* ⛔ 짝 — 이것이 없으면 «전부 0으로 만들기»(= 띠를 통째로 없애기) 도 통과한다.
     사장님 지시가 「얼마나 남았는지 보이게」였으므로, 통로가 있는 게임에는 실제로 그려야 한다. */
  const drawn = withChannel.filter(x => G.goalOf(x.mode) > 0);
  ok('짝 — 통로가 있는 게임에는 실제로 띠가 그려진다', drawn.length >= 5,
    `${drawn.length}종 (${drawn.slice(0, 4).map(x => x.mode).join(' ')}…)`);
}

console.log('\n⑨ 🔴 [hidden] 이 실제로 먹는가 — 작성자 CSS 가 브라우저 기본을 이긴다');
/* 왜 이 절이 있나 (2026-09-22 실사고):
   .game-progress 에 display:flex 를 주면 브라우저 기본 [hidden]{display:none} 을
   «작성자 > UA» 순위로 이긴다. 그래서 box.hidden = true 인데도 띠가 계속 보였고,
   그 띠는 채움 폭이 «미설정» 이라 block 자식이 부모 폭을 100% 먹어 «초록 가득» —
   목표가 0인 게임(아바타)에서 시작하자마자 「다 했어요」로 읽혔다. */
const hubCss = (HUB.match(/\.game-progress\s*\{([^}]*)\}/) || [])[1] || '';
ok('[전제] 띠 상자 규칙을 찾았다', hubCss.length > 10);
const setsDisplay = /display\s*:/.test(hubCss);
const hasHiddenRule = /\.game-progress\[hidden\][^{]*\{[^}]*display\s*:\s*none\s*!important/.test(HUB)
                   || /\[hidden\]\s*\{[^}]*display\s*:\s*none\s*!important/.test(HUB);
ok('display 를 정했으면 [hidden]{display:none!important} 가 짝으로 있다',
  !setsDisplay || hasHiddenRule, `display 지정:${setsDisplay} · hidden 규칙:${hasHiddenRule}`);
// ⛔ 두 겹 — hidden 이 한 번 안 먹어도 «초록 가득» 이 안 되게 채움 폭을 0 으로 되돌린다
ok('숨길 때 채움 폭도 0 으로 되돌린다(hidden 이 안 먹어도 «가득» 이 안 보이게)',
  /width\s*=\s*'0%'/.test(startFn) && /width\s*=\s*'0%'/.test(bodyAt(HUB, 'function hubProgressStop(')), '');

console.log('\n⑩ 🌐 를 누르면 띠 글자도 따라온다');
/* JS 가 그린 글자는 i18n 엔진이 못 고친다. ⛔ data-ko/data-en 로 풀면 두 엔진이
   textContent 를 갈아끼워 안쪽 <b> 가 DOM 에서 사라진다(결재함 배지와 같은 자리). */
const toggleFn = bodyAt(HUB, 'function toggleSiteLang(');
ok('[전제] 언어 토글을 오려 냈다', toggleFn.length > 40);
ok('언어를 바꾸면 띠를 다시 그린다', /hubProgressDraw\(\)/.test(toggleFn), '');
ok('띠에 data-ko/data-en 을 달지 않았다(안쪽 <b> 가 날아간다)',
  !/id="hub-gp-txt"[^>]*data-(ko|en)=/.test(HUB), '');

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
