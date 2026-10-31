/* ═══════════════════════════════════════════════════════════════════════════
   🧊 body class 관찰자가 «자기가 보는 것을 다시 쓰지» 않는지 감시 (2026-09-01 신설)

   [왜 이 검사가 있나] 이 저장소는 **같은 뿌리로 홈이 두 번 멎었습니다.**
     · 2026-07-14 — 관찰자 콜백이 `classList.remove()` 를 불러 자기 자신을 무한 재귀
     · 2026-08-27 — `vc-observe-guard.js` 가 같은 짓을 해 PC·모바일 홈이 통째로 정지
   `classList.remove()` 는 **지울 토큰이 없어도 class 속성을 다시 씁니다.** 그러면
   그 속성을 보고 있던 관찰자가 또 깨어나고, 그 콜백이 또 쓰면 메인스레드가 잠깁니다.

   [잰 것 — 2026-09-01, 실제 브라우저에서 관찰자 발화 횟수를 셈]
     · `remove(없는 토큰)`               → **1회 발화**
     · `add(이미 있는 토큰)`             → **1회 발화**   ← 이 저장소가 여태 안 적어 둔 쪽
     · `toggle(토큰, force)` 상태 그대로 → **0회**
     · `contains` 로 막은 remove         → **0회**
   ⟹ 규칙서·소스 주석은 `remove()` 만 경고했는데 **`add()` 도 똑같습니다.**
   ℹ️ DOM 명세와도 일치합니다 — `add`/`remove` 는 토큰이 안 바뀌어도 update steps 를 돌려
      속성을 다시 set 하고, `toggle(token, force)` 는 상태가 같으면 **그 전에 return** 합니다.
      (`js/mango-worldclock.js` 주석에 같은 사실이 독립적으로 적혀 있습니다 — toggle 쪽은
       «새 발견» 이 아니라 «재확인» 입니다.)

   [잰 것 — 정적 분석, `public/` 전체 재귀]
     · body class 를 «쓰는» 곳 **93군데 / 31파일**(add 32 · remove 35 · toggle 26)
       그중 가드 없는 것 **58군데**
     · body class 변경에 «발화하는» 관찰자 **16개**
     ⟹ 가드 없는 쓰기 한 번이 관찰자 16개를 전부 깨웁니다. 지금은 그 관찰자들이
        클래스를 도로 쓰지 않아 루프가 안 생기지만, **여유가 «한 줄»** 입니다.
     ⚠️ 이 숫자를 인용할 때는 **범위(`public/` 전체 재귀)** 를 함께 적으세요 —
        처음에 `js/*.js` 만 세고 범위 없이 「51군데」라고 적어 실제(93)와 크게 어긋났습니다.

   [이 하니스가 지키는 것] «쓰는 쪽» 93군데를 다 고치는 것은 반경이 큽니다(index.html 포함).
   대신 **루프가 성립하는 유일한 조건** — 「body class 변경에 발화하는 관찰자가 body class 를
   가드 없이 쓴다」 — 를 못 박습니다. 두 사고 모두 이 조건이었습니다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
let pass = 0, fail = 0;
const ok = (n) => { console.log('  ✅ ' + n); pass++; };
const no = (n, w) => { console.log('  ❌ ' + n + (w ? '\n       ' + w : '')); fail++; };
const check = (n, c, w) => (c ? ok(n) : no(n, w));

/* ⚠️ 최상위만 훑으면 `public/admin/`·`public/video-call/` 이 통째로 빠진다 — 재귀로 모은다. */
function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) { if (e !== 'node_modules') walk(p, out); }
    else if (/\.(js|html)$/.test(e)) out.push([p.slice(PUB.length + 1).split('\\').join('/'), p]);
  }
  return out;
}
const FILES = walk(PUB);

/** 여는 중괄호부터 «짝» 까지 자른다. 길이로 자르면 옆 코드가 딸려 온다. */
function blockAt(src, from) {
  const open = src.indexOf('{', from);
  if (open < 0) return '';
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) return src.slice(open, i + 1); }
  }
  return '';
}

/**
 * 이 코드가 body class 를 «가드 없이» 쓰는가.
 * ⚠️ 가드는 **같은 토큰**이어야 한다 — 「앞 어딘가에 아무 contains 나 있으면 통과」로 두면
 *    옆줄의 무관한 contains 가 봐준다(길이로 자르는 함정의 사촌).
 * ⚠️ `toggle(토큰, force)` 는 상태가 같으면 안 쓰므로 안전하지만, **force 를 그 클래스
 *    자신에서 끌어오면** 매번 뒤집혀 매번 쓴다(= 그대로 무한루프). 그건 면제하지 않는다.
 */
function unguardedWrite(code) {
  const hits = [];
  for (const m of code.matchAll(/(?:document\.body|d\.body)\.classList\.(add|remove|toggle)\(([^)]*)\)/g)) {
    const args = m[2];
    const token = (args.match(/^\s*['"]([^'"]+)['"]/) || [])[1] || '';
    if (m[1] === 'toggle' && args.includes(',')) {
      // force 가 그 클래스 자신에서 나오면 매번 뒤집힌다 → 면제하지 않는다
      if (!(token && new RegExp('contains\\(\\s*[\'"]' + token + '[\'"]').test(args))) continue;
    }
    const before = code.slice(Math.max(0, m.index - 260), m.index);
    if (token && new RegExp('contains\\(\\s*[\'"]' + token + '[\'"]').test(before)) continue;
    hits.push(m[0].slice(0, 60));
  }
  return hits;
}

/** 그 파일 안에서 body class 를 «쓰는» 함수 이름들 — 간접 재귀를 잡기 위해.
 *  ⚠️ `function f(){}` 뿐 아니라 화살표·함수식도 본다(새 코드는 화살표를 쓴다). */
function classWriters(src) {
  const out = new Map();
  const pats = [
    /function\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function/g,
    /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>/g,
  ];
  for (const re of pats) {
    for (const m of src.matchAll(re)) {
      const body = blockAt(src, m.index);
      if (!body) continue;
      if (!out.has(m[1])) out.set(m[1], []);
      out.get(m[1]).push({ idx: m.index, body });
    }
  }
  // 하나라도 body class 를 쓰면 «writer» 로 본다(놓치는 쪽보다 안전)
  const writers = new Map();
  for (const [name, defs] of out) {
    if (defs.some((d) => /(?:document\.body|d\.body)\.classList\.(add|remove|toggle)\(/.test(d.body))) {
      writers.set(name, defs);
    }
  }
  return writers;
}

/** 이름으로 넘긴 콜백의 몸통(정의가 여럿이면 전부). */
function bodiesOfNamed(src, fname) {
  const all = [];
  for (const re of [
    new RegExp('function\\s+' + fname + '\\s*\\(', 'g'),
    new RegExp('(?:var|let|const)\\s+' + fname + '\\s*=\\s*(?:async\\s*)?function', 'g'),
    new RegExp('(?:var|let|const)\\s+' + fname + '\\s*=\\s*(?:async\\s*)?\\([^)]*\\)\\s*=>', 'g'),
  ]) for (const m of src.matchAll(re)) { const b = blockAt(src, m.index); if (b) all.push(b); }
  return all;
}

console.log('\n[ A. body class 변경에 «발화하는» 관찰자를 전부 찾는다 ]');
const observers = [];
const shapeFails = [];
for (const [name, p] of FILES) {
  const src = readFileSync(p, 'utf8');
  const writers = classWriters(src);
  for (const m of src.matchAll(/new MutationObserver\s*\(\s*([A-Za-z_$][\w$]*)?/g)) {
    /* 🔴 콜백은 «인라인 함수» 일 수도, **이름만 넘긴 것**(`new MutationObserver(sync)`)일 수도 있다.
       처음엔 인라인만 봤는데, 하필 2026-08-27 사고를 낸 vc-observe-guard.js 가 이름을 넘기는
       형태라 **그 파일이 검사에서 통째로 빠져 있었다**(가짜 회귀로 확인). 둘 다 본다.
       ⚠️ `new MutationObserver(function(){…})` 의 `function` 을 «이름» 으로 잡으면 안 된다. */
    const named = (m[1] === 'function' || m[1] === 'async') ? undefined : m[1];
    let cbs, afterIdx;
    if (named) { cbs = bodiesOfNamed(src, named); afterIdx = m.index + m[0].length; }
    else { const b = blockAt(src, m.index); cbs = b ? [b] : []; afterIdx = m.index + b.length; }
    const tail = src.slice(afterIdx, afterIdx + 320);
    const t = (tail.match(/observe\(([^;]{0,220}?)\)/) || [])[1] || '';
    if (!/attributes/.test(t) || !/class/.test(t)) continue;
    /* ⚠️ 대상이 body 가 아니어도 **documentElement + subtree:true** 면 body 변경에 발화한다
       (js/mango-worldclock.js:118 이 그 형태 — 처음엔 이걸 놓쳐 «전부 찾는다» 가 거짓이었다). */
    const coversBody = /\bbody\b/.test(t)
      || ((/documentElement/.test(t) || /\bdocument\b/.test(t)) && /subtree\s*:\s*true/.test(t));
    if (!coversBody) continue;
    const line = src.slice(0, m.index).split('\n').length;
    if (!cbs.length) { shapeFails.push(`${name}:${line} (콜백 = ${named || '(모양 불명)'})`); continue; }
    const direct = cbs.flatMap((c) => unguardedWrite(c));
    const indirect = [...writers.keys()].filter((w) =>
      cbs.some((c) => new RegExp('(?:^|[^\\w$.])' + w + '\\s*\\(').test(c)));
    observers.push({ where: `${name}:${line}`, named, direct, indirect, src, writers });
  }
}
check('관찰자 콜백의 «모양» 을 전부 알아봤다', shapeFails.length === 0,
  '몸통을 못 찾은 것: ' + shapeFails.join(', ')
  + '\n       → 모양을 모르면 그 관찰자는 검사에서 통째로 빠진다(= 안전하다고 착각한다)');
/* ⚠️ 하한(`>= N`)으로 두면 **판정식이 좁아져 관찰자가 조용히 빠져도 초록불**이다 —
   실제로 subtree 판정을 빼 16 → 15 가 됐는데 `>= 14` 라 통과했다(가짜 회귀로 실측).
   그래서 «원장» 처럼 **정확한 수**로 못 박는다. 늘거나 줄면 사람이 한 번 보고 이 숫자를
   함께 고치는 것이 맞다 — body class 관찰자는 «그냥 늘려도 되는» 것이 아니다. */
const OBSERVER_COUNT = 16;   // 2026-09-01 실측(범위: public/ 전체 재귀)
check(`관찰자가 ${OBSERVER_COUNT}개 그대로다`, observers.length === OBSERVER_COUNT,
  `찾은 것 ${observers.length}개: ` + observers.map((o) => o.where).join(', ')
  + `\n       → 줄었다면 판정식이 좁아진 것일 수 있다(«전부 찾는다» 가 거짓이 된다).`
  + `\n         늘었다면 새 관찰자가 B·C절을 지나는지 확인하고 이 숫자를 함께 고칠 것.`);

console.log('\n[ B. 🔴 그 관찰자가 body class 를 «가드 없이» 쓰지 않는다 — 루프의 유일한 조건 ]');
{
  const bad = observers.filter((o) => o.direct.length);
  check('관찰자 콜백에 가드 없는 body class 쓰기가 없다', bad.length === 0,
    bad.map((o) => `${o.where} → ${o.direct.join(' / ')}`).join('\n       ')
    + '\n       → 이게 2026-07-14·2026-08-27 두 번의 홈 정지 조건이다.'
    + '\n         remove 는 «없어도» 쓰고 add 는 «있어도» 쓴다(실측). 같은 토큰을 contains 로'
    + '\n         먼저 확인하거나, toggle(토큰, force) 로 «상태를 지정»할 것.');
}

console.log('\n[ C. 간접 경로(관찰자가 «클래스를 쓰는 함수» 를 부름)도 안전한가 ]');
{
  /* 콜백 안에 직접 쓰기가 없어도, 클래스를 쓰는 함수를 부르면 같은 루프가 된다.
     ⚠️ **같은 이름의 함수가 여럿일 수 있다** — index.html 에는 `restore` 가 셋이다.
        `src.match()` 로 첫 번째만 보면 뒤쪽 것에 넣은 위험을 못 잡는다(가짜 회귀로 실측). */
  const risky = [];
  for (const o of observers) {
    for (const w of o.indirect) {
      for (const def of (o.writers.get(w) || [])) {
        const u = unguardedWrite(def.body);
        if (u.length) {
          const ln = o.src.slice(0, def.idx).split('\n').length;
          risky.push(`${o.where} → ${w}()@${ln} → ${u.join(' / ')}`);
        }
      }
    }
  }
  check('관찰자가 부르는 함수도 가드 없이 쓰지 않는다', risky.length === 0,
    risky.join('\n       ') + '\n       → 콜백 안에 직접 쓰기가 없어도 같은 무한루프가 된다');
  /* ⚠️ 이 검사는 «깊이 1» 까지다 — 관찰자 → f() → g() 에서 g 만 쓰면 못 잡는다.
     그 한계를 여기 적어 두어, 다음 사람이 «다 봤다» 고 믿지 않게 한다. */
  ok('한계를 알고 있다: 간접 추적은 깊이 1까지다(관찰자 → 함수 → 함수는 못 본다)');
}

console.log('\n[ D. 근거 보존 — «왜 toggle(토큰, force) 를 봐주는가» 가 적혀 있다 ]');
{
  /* 검증이 아니라 «근거 보존» 장치다. 이 예외는 브라우저 실측 + DOM 명세에 기대고 있고,
     근거가 사라지면 다음 사람이 예외를 지우거나 반대로 force 없는 toggle 까지 허용한다. */
  const me = readFileSync(new URL(import.meta.url), 'utf8');
  check('실측 결과(발화 횟수)를 머리말에 적어 두었다',
    /add\(이미 있는 토큰\)[\s\S]{0,60}1회 발화/.test(me) && /toggle\(토큰, force\)[\s\S]{0,40}0회/.test(me),
    '근거를 지우면 이 예외가 «그냥 봐준 것» 이 된다');
  check('force 를 그 클래스 자신에서 끌어오면 봐주지 않는다는 것도 적혀 있다',
    /force 를 그 클래스\s*\n?\s*\*\s*자신에서 끌어오면|force 를 그 클래스 자신에서 끌어오면/.test(me),
    'toggle(x, !contains(x)) 는 매번 뒤집혀 매번 쓴다 — 그대로 무한루프다');
}

console.log('\n[ E. 저장소가 이 함정을 «글로도» 알고 있다 ]');
{
  const claude = readFileSync(join(ROOT, 'CLAUDE.md'), 'utf8');
  /* ⚠️ 「MutationObserver 라는 낱말이 있나」로 두면 **변경 전 파일로도 통과**한다(실측).
     이 줄이 지키려는 것은 «add() 도 위험하다» 는 새 사실이므로 그것만 판정한다. */
  check('add() 도 «있어도 다시 쓴다» 는 것이 적혀 있다',
    /add\(\)[^\n]{0,120}(있어도|이미 있는)/.test(claude),
    '여태 remove() 만 경고돼 있었다 — 실측으로 add() 도 같다는 것을 확인했다');
  /* ⚠️ 「remove() 는」처럼 «본문 글자» 로 앵커를 잡으면 백틱·강조 표기 하나에 어긋난다.
     2026-08-27 사고를 적은 «그 줄» 을 찾아, 그 줄 안에 add() 경고가 함께 있는지 본다. */
  const oldLine = claude.split('\n').find((l) => /2026-08-27 실사고/.test(l) && /MutationObserver/.test(l));
  check('옛 줄(2026-08-27)에서도 add() 가 같다는 것을 함께 말한다',
    !!oldLine && /add\(\)/.test(oldLine),
    '같은 사고를 다루는 두 줄이 서로 다른 말을 하면, 옛 줄만 읽은 사람은 add() 를 모른다');
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n🚨 body_class_observer_harness 실패'); process.exit(1); }
console.log('🎉 body_class_observer_harness — 전부 통과');
