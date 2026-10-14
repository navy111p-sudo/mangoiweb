/* ═══════════════════════════════════════════════════════════════════════════
   📚 동화책 원장님 의견 1단계 감시 — 2026-10-13
   ① 바꿔 쓰기 «규칙 점검»(js/story-kit.js StoryKit.review) 을 실제로 돌립니다
      · 틀린 문장은 잡고 고친다  ↔ (짝) 맞는 문장(예시 칩·본문 문장 틀)은 한 글자도 안 건드린다
      · 고친 문장을 다시 점검하면 «문법 0» (고친 걸 또 고치라고 하지 않음)
   ② 뜻 맞히기 «다른 책 오답 보기» — 풀(STORY_WORD_POOL)이 4편 WORDS 와 같은 글자인가, 보기가 늘 3개·정답 하나인가
   ③ 4편 화면 배선 — 질문 번역 줄을 그리지 않는다 · 해설은 한국어 고정 · EN/한국어 버튼 없음 ·
      뜻은 게임 끝까지 가림 · 요점정리 글 카드는 «다 맞힌 뒤» 에만 · 문법이 틀리면 도장보다 먼저 막는다
   ⛔ D1 은 건드리지 않습니다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const KIT_SRC = process.env.STORY_KIT_SRC || join(PUB, 'js', 'story-kit.js');
const BOOKS = [
  { file: 'story-red-umbrella.html', id: 'red-umbrella', slots: ['vp', 'cl'] },
  { file: 'story-birthday-cake.html', id: 'birthday-cake', slots: ['cl', 'cl'] },
  { file: 'story-robot-dance.html', id: 'robot-dance', slots: ['vp', 'vp'] },
  { file: 'story-treasure-map.html', id: 'treasure-map', slots: ['vp', 'cl'] },
];
let PASS = 0, FAIL = 0;
const ok = (c, m) => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; console.log('  ❌ ' + m); } };
function bulk(name, cases, fn) {
  let bad = 0, first = '';
  for (const c of cases) { let r; try { r = fn(c); } catch (e) { r = 'throw ' + e.message; } if (r !== true) { bad++; if (!first) first = JSON.stringify(c).slice(0, 140) + ' → ' + JSON.stringify(r).slice(0, 160); } }
  ok(bad === 0 && cases.length > 0, `${name} — ${cases.length}건` + (bad ? ` 중 ${bad}건 틀림 (예: ${first})` : ''));
}

// ── 정본을 실제로 불러옵니다(사전 + 엔진)
const G = {};
try {
  new Function('window', readFileSync(join(PUB, 'js', 'story-dict.js'), 'utf8'))(G);
  new Function('window', 'globalThis', readFileSync(KIT_SRC, 'utf8').replace(/\(typeof window !== 'undefined' \? window : globalThis\)/, '(window)'))(G, G);
} catch (e) { console.log('  ' + e.message); }
const K = G.StoryKit;
console.log('\n══════ ① 바꿔 쓰기 규칙 점검 ══════');
ok(!!(K && K.review && G.StoryDict), '전제: StoryKit·사전을 실제로 실행할 수 있다');
if (!K || !K.review) { console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL + 1}`); process.exit(1); }

const R = (a, b, s) => K.review(a, b, s, []);
// [a, b, slots, 고친 a, 고친 b]
const WRONG = [
  ['goes home', 'it raining', ['vp', 'cl'], 'go home', 'it is raining'],
  ['to go inside', 'it gets dark', ['vp', 'cl'], 'go inside', 'it gets dark'],
  ['we go home', 'Mom come home', ['vp', 'cl'], 'go home', 'Mom comes home'],
  ['clean our room', 'they goes out', ['vp', 'cl'], 'clean our room', 'they go out'],
  ['finished our homework', 'dinner is ready', ['vp', 'cl'], 'finish our homework', 'dinner is ready'],
  ['my brother is hungry', 'he looking in the fridge', ['cl', 'cl'], 'my brother is hungry', 'he is looking in the fridge'],
  ['Mom is happy', 'she sing', ['cl', 'cl'], 'Mom is happy', 'she sings'],
  ['it rain', 'the sky is dark', ['cl', 'cl'], 'it rains', 'the sky is dark'],
  ['swimming fast', 'rides a bike', ['vp', 'vp'], 'swim fast', 'ride a bike'],
  ['eat dinner', 'the kids is hungry', ['vp', 'cl'], 'eat dinner', 'the kids are hungry'],
  ['talk quietly', 'he are sleeping', ['vp', 'cl'], 'talk quietly', 'he is sleeping'],
  ['finsh our homwork', 'dinner is redy', ['vp', 'cl'], 'finish our homework', 'dinner is ready'],
  ['play socer', 'my freinds are tired', ['vp', 'cl'], 'play soccer', 'my friends are tired'],
];
bulk('틀린 문장은 잡아서 이렇게 고친다', WRONG, ([a, b, s, fa, fb]) => { const r = R(a, b, s); return (r.a === fa && r.b === fb && r.changed) || [r.a, r.b]; });
bulk('문법 실수는 «grammar» 로 센다 (도장 막기 근거)', WRONG.filter((x) => !/finsh|socer/.test(x[0])), ([a, b, s]) => R(a, b, s).grammar > 0 || 'grammar 0');
bulk('철자만 틀리면 grammar 0 (도장은 주고 확인만 권함)', WRONG.filter((x) => /finsh|socer/.test(x[0])), ([a, b, s]) => (R(a, b, s).grammar === 0 && R(a, b, s).issues.length > 0) || 'bad');
bulk('고친 문장을 다시 점검하면 고칠 곳이 없다', WRONG, ([a, b, s]) => { const r = R(a, b, s); const r2 = R(r.a, r.b, s); return (!r2.changed && r2.issues.length === 0) || r2.issues; });

// (짝) 맞는 문장은 안 건드린다 — 4편의 예시 칩 + 본문 틀 문장의 밑줄 부분 + 손으로 고른 흔한 문장
const RIGHT = [];
for (const B of BOOKS) {
  const html = readFileSync(join(PUB, B.file), 'utf8');
  for (const m of html.matchAll(/class="chip" data-a="([^"]+)" data-b="([^"]+)"/g)) RIGHT.push([m[1], m[2], B.slots, B.id]);
  const src = html.match(/class="pat-src">[^<]*<u>([^<]+)<\/u>[^<]*<u>([^<]+)<\/u>/);
  if (src) RIGHT.push([src[1], src[2], B.slots, B.id]);
}
const COMMON = [
  ['go home', 'it rains', ['vp', 'cl']], ['take it to him', 'the rain gets heavy', ['vp', 'cl']],
  ['read a book', 'rain comes', ['vp', 'cl']], ['it will rain', 'the sky is dark', ['cl', 'cl']],
  ['go to the park', 'I am free', ['cl', 'cl']], ['play soccer', 'we have time', ['vp', 'cl']],
  ['brush my teeth', 'go to bed', ['vp', 'vp']], ['he is tired', 'he played all day', ['cl', 'cl']],
  ['the dog is happy', 'his tail is moving', ['cl', 'cl']], ['feed the cat', 'it is hungry', ['vp', 'cl']], ['eat lunch', 'the bell rings', ['vp', 'cl']],
  ['make a cake', 'Grandma can smile', ['vp', 'cl']], ['run fast', 'jump very high', ['vp', 'vp']],
  ['clean the classroom', 'our teacher comes back', ['vp', 'cl']], ['we are late', 'the bus did not come', ['cl', 'cl']],
  // 교재 2,887문장 거짓경보 실측에서 남았던 둘 — that+조동사, 과거형=원형(read)
  ['that would be fun', 'she read a book', ['cl', 'cl']], ['he put it down', 'it is late', ['cl', 'cl']],
];
ok(RIGHT.length >= 16, `전제: 4편에서 맞는 예시 문장을 실제로 읽었다 (${RIGHT.length}쌍)`);
bulk('(짝) 맞는 문장은 한 글자도 안 바꾸고 지적도 없다', RIGHT.concat(COMMON), ([a, b, s]) => { const r = R(a, b, s); return (!r.changed && r.issues.length === 0) || r.issues.map((x) => x.from + '>' + x.to); });
bulk('(짝) 대문자 이름·처음 보는 낱말은 고치지 않는다', [['Biscuit ate the cake', 'Zorbix is my robot', ['cl', 'cl']], ['visit Jeju', 'Hana comes back', ['vp', 'cl']]], ([a, b, s]) => (!R(a, b, s).changed) || 'changed');
ok(JSON.stringify(R('goes home', 'it raining', ['vp', 'cl'])) === JSON.stringify(R('goes home', 'it raining', ['vp', 'cl'])), '같은 입력이면 언제나 같은 답 (AI 가 아니라 규칙)');
ok(R('goes home', 'it raining', ['vp', 'cl']).issues.every((x) => x.ko && x.en), '지적마다 한국어·영어 이유가 함께 있다');

console.log('\n══════ ② 뜻 맞히기 «다른 책 오답» ══════');
const POOL = K.STORY_WORD_POOL || {};
for (const B of BOOKS) {
  const html = readFileSync(join(PUB, B.file), 'utf8');
  const lit = html.match(/var WORDS = (\[[\s\S]*?\n  \]);/);
  let W = null; try { W = new Function('return ' + lit[1])(); } catch { W = null; }
  ok(!!W && JSON.stringify(W.map((x) => x[1])) === JSON.stringify(POOL[B.id]), `${B.id}: 풀의 한국어 뜻이 페이지 WORDS 와 같은 글자다`);
  const cs = html.indexOf('/* STORY-CORE-START'), ce = html.indexOf('/* STORY-CORE-END */');
  let C = null; try { C = new Function(html.slice(cs, ce) + '\nreturn StoryCore;')(); } catch (e) { console.log('   ' + e.message); }
  if (!C || !W) { ok(false, `${B.id}: 정본을 실행하지 못함`); continue; }
  const pool = K.poolFor(B.id);
  ok(pool.length === 18 && pool.every((p) => !POOL[B.id].includes(p)), `${B.id}: 오답 풀은 «다른 세 권» 의 뜻 18개`);
  const seeds = Array.from({ length: 300 }, (_, i) => i * 7919 + 3);
  bulk(`${B.id}: 풀을 주면 보기 3개·정답 하나·다른 책 오답 1개`, seeds, (sd) => {
    const L = C.wordQuiz(W, sd, pool);
    return (L.length === 6 && L.every((it) => it.opts.length === 3 && new Set(it.opts).size === 3 && it.opts[it.ans] === it.idx && it.opts.filter((o) => typeof o === 'string').length === 1 && it.opts.filter((o) => typeof o === 'string').every((o) => pool.includes(o) && o !== W[it.idx][1]))) || 'bad';
  });
  ok(JSON.stringify(C.wordQuiz(W, 42)) === JSON.stringify(C.wordQuiz(W, 42, null)), `${B.id}: (짝) 풀이 없으면 예전과 똑같이 낸다`);
}

console.log('\n══════ ③ 4편 화면 배선 ══════');
const stripC = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
function block(src, start) { const i = src.indexOf(start); if (i < 0) return ''; let d = 0, j = src.indexOf('{', i); for (let k = j; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (d === 0) return src.slice(i, k + 1); } } return ''; }
for (const B of BOOKS) {
  console.log(`  ── ${B.file}`);
  const html = readFileSync(join(PUB, B.file), 'utf8');
  const code = stripC(html);
  const kitAt = html.indexOf('/js/story-kit.js'), coreAt = html.indexOf('/* STORY-CORE-START');
  ok(kitAt > 0 && kitAt < coreAt && /<script src="\/js\/story-kit\.js\?v=\d+"><\/script>/.test(html), 'story-kit.js 를 본문 스크립트보다 «먼저» 싣는다(defer 아님)');
  ok(/<script defer src="\/js\/story-dict\.js\?v=\d+"><\/script>/.test(html), '사전(story-dict.js)은 defer');
  ok(new RegExp("var WRITE_SLOTS = \\['" + B.slots[0] + "','" + B.slots[1] + "'\\];").test(html), `바꿔 쓰기 칸 종류가 이 책의 틀과 맞다 (${B.slots.join(', ')})`);
  ok(!/id="lang"/.test(html), '원장님 의견 2: EN/한국어 버튼이 없다');
  ok(!/localStorage\.getItem\('story_lang'\)/.test(code), '(짝) 예전에 EN 을 골라 둔 기기도 한국어 안내로 연다');
  const rq = block(code, 'function renderQs(');
  ok(rq.length > 200 && !/qko/.test(rq), '원장님 의견 2: 근거 찾기 질문 아래 한국어 번역 줄을 그리지 않는다');
  ok(/q\.why\[0\]/.test(rq) && !/q\.why\[1\]/.test(rq), '원장님 의견 3: 근거 설명은 한국어(why[0]) 고정');
  const rw = block(code, 'function renderWords(');
  // 2026-10-14 사장님 «1번은 가»: 엿보기 버튼을 없앴다 — 뜻은 이번 게임을 다 풀었을 때만.
  ok(/wordsOpen \? '<span class="ko">'/.test(rw) && !/ko-peek|WPEEK|data-peek/.test(code), '뜻은 게임을 끝내야만 보인다(눌러서 미리 보기 없음)');
  ok(!/localStorage\.setItem\([^)]*wordsopen|setItem\(WOPENKEY/i.test(code) && /var wordsOpen = false;/.test(code), '(짝) «열림» 을 기기에 저장하지 않는다 — 다시 할 때 답이 안 보임');
  ok(/WQS\.over = true; storyDone\('words'\); wordsOpen = true;/.test(code), '게임을 다 풀면 뜻이 열린다');
  ok(/over: false \}; wordsOpen = false; renderWords\(\); renderWQ\(\); return; \}/.test(code), '(짝) «한 번 더 하기» 를 누르면 뜻을 다시 가린다');
  const W4 = eval(html.match(/var WORDS = (\[[\s\S]*?\n  \]);/)[1]);
  ok(W4.length === 6 && W4.every((x) => typeof x[3] === 'string' && x[3].length > 10 && /^[a-z][a-z ,;'()]+$/i.test(x[3]) && !x[3].toLowerCase().split(/[^a-z]+/).includes(x[0])), '3번(나): 낱말마다 영영풀이 — 영어만, 그 낱말 자신은 안 씀');
  ok(/<span class="def">/.test(rw) && rw.indexOf('class="def"') < rw.indexOf('class="ex"'), '(짝) 영영풀이가 예문보다 위');
  const pk = block(code, 'function pickNote(');
  ok(/n\.hidden = !picking;/.test(pk) && /고르기 끝내기/.test(pk), '2·4번: 고르기 모드가 켜져 있으면 본문 위에 알림과 끄기 버튼');
  ok(/rb\.addEventListener\('click', function\(\)\{ reset\(\); try \{ if \(window\.__storyPickOff\) window\.__storyPickOff\(\); if \(window\.__storyWordsReset\) window\.__storyWordsReset\(\);/.test(code), '(짝) «처음부터 다시» 가 고르기 모드를 끄고 낱말 게임·뜻 가리기를 처음으로');
  ok((code.match(/StoryCore\.wordQuiz\(WORDS, \(Date\.now\(\) & 0xffff\) \|\| \d, WQ_POOL\)/g) || []).length >= 2 && (code.match(/StoryCore\.wordQuiz\(/g) || []).length === (code.match(/StoryCore\.wordQuiz\(WORDS, \(Date\.now\(\) & 0xffff\) \|\| \d, WQ_POOL\)/g) || []).length, '뜻 맞히기를 만드는 곳(처음·한 번 더·처음부터 다시) 모두 다른 책 오답 풀을 쓴다');
  ok(/typeof oi !== 'number' \? oi/.test(code), '다른 책 오답(글자)도 보기로 그린다');
  const cs = block(code, "document.getElementById('checkSum').addEventListener(");
  ok(/if \(full\) \{ try \{ localStorage\.setItem\(SUMKEY, '1'\); \} catch\(e\)\{\} renderSumCard\(\); \}/.test(cs), '원장님 의견 5: 요점정리 글 카드는 «다 맞혔을 때» 그린다');
  ok((code.match(/(?<!function )renderSumCard\(\)/g) || []).length === 2 && /if \(localStorage\.getItem\(SUMKEY\)\) renderSumCard\(\)/.test(code), '(짝) 그 밖에는 «예전에 다 맞힌 기기» 에서만 그린다(빈칸 답이 미리 안 보임)');
  ok(/id="sumCard"/.test(html) && /sumFullText\(\)/.test(code), '요점정리 글은 SUM 정본에서 만든다');
  const wc = block(code, "document.getElementById('wcheck').addEventListener(");
  const g = wc.indexOf('kitR.grammar > 0'), st = wc.indexOf("storyDone('write')"), hg = wc.indexOf("cw.why === 'hangul'");
  ok(g > hg && g < st && /if \(kitR && kitR\.grammar > 0\) \{.*showFix\(kitR, false\); return; \}/.test(wc), '원장님 의견 1: 문법이 틀리면 도장보다 «먼저» 고친 문장을 보이고 멈춘다');
  ok(/if \(kitR && kitR\.issues\.length\) showFix\(kitR, true\)/.test(wc), '(짝) 철자만 다르면 도장은 주고 확인만 권한다');
  ok(/if \(!window\.StoryKit \|\| !StoryKit\.review\) return null;/.test(code), '(짝) StoryKit 을 못 불러오면 예전처럼 그대로 완성');
  const ws = block(code, "document.getElementById('wsay').addEventListener(");
  ok(/if \(WLISTEN && s === WLISTEN\) \{[\s\S]*storyDone\('write'\)/.test(ws), '고친 문장으로 바꾼 뒤 «내 문장 듣기» 를 하면 도장');
  ok(/WFIX = null; WLISTEN = null; (?:WSEQ\+\+; )?paintWrite\(\)/.test(code), '(짝) 직접 고치기 시작하면 «바꾸기·듣기 도장» 대기를 지운다');
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
process.exit(FAIL ? 1 : 0);
