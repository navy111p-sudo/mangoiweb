/* ═════════════════════════════════════════════════════════════════
   📚 영어 독서 사다리 감시 — 2026-10-18 신설 (사장님 «적은 단계 + 충분한 글 + 핵심찾기 반복»)
     ① 데이터(js/reading-ladder-data.js): 4단계 · 단계마다 10편 이상 · 칸 모양 · 정답/핵심문장 범위
        · 낱말·핵심어가 «글자 그대로» 들어 있나 · 단계가 올라갈수록 글이 길어지나 · 영어칸에 한글 없음
     ② 정본(RL-CORE)을 소스에서 오려 내 실제로 돌림: 핵심어 채점 · 섞기 · 다음 단계 추천 · 반복 연습 고르기
        («된다» 옆에 «안 된다» 를 짝으로)
     ③ 배선: stories.html 이 두 스크립트를 싣고 언어·책 목록을 넘겨 주는가 · 정답을 맞혀야만 넘어가지 않는가
     ⛔ D1·서버는 건드리지 않습니다(포인트 없음).
   ═════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const DATA_SRC = readFileSync(process.env.RL_DATA_SRC || join(PUB, 'js', 'reading-ladder-data.js'), 'utf8');
const JS_SRC = readFileSync(process.env.RL_JS_SRC || join(PUB, 'js', 'reading-ladder.js'), 'utf8');
const HTML = readFileSync(join(PUB, 'stories.html'), 'utf8');

let PASS = 0, FAIL = 0;
const ok = (c, m) => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; console.log('  ❌ ' + m); } };
function bulk(name, items, fn) {
  let bad = 0, first = '';
  for (const it of items) { let r; try { r = fn(it); } catch (e) { r = 'throw ' + e.message; } if (r !== true) { bad++; if (!first) first = (it.id || JSON.stringify(it).slice(0, 60)) + ' → ' + r; } }
  ok(bad === 0 && items.length > 0, `${name} — ${items.length}건` + (bad ? ` 중 ${bad}건 틀림 (예: ${first})` : ''));
}

console.log('\n① 데이터');
const box = { window: {} };
try { vm.runInNewContext(DATA_SRC, box); } catch (e) { console.log('  데이터 실행 실패: ' + e.message); }
const D = box.window.READING_LADDER;
ok(!!D && Array.isArray(D.stages) && Array.isArray(D.passages), '데이터를 읽었다(window.READING_LADDER)');
const P = (D && D.passages) || [];
const S = (D && D.stages) || [];
ok(S.length === 4 && S.every((s, i) => s.n === i + 1 && s.name && s.name.ko && s.name.en && s.grade && s.cefr && /^#[0-9a-f]{6}$/i.test(s.color)), '단계는 정확히 4개(1~4) · 이름·학년·CEFR·색이 있다');
for (let n = 1; n <= 4; n++) ok(P.filter((p) => p.stage === n).length >= 10, `${n}단계 글이 10편 이상 (${P.filter((p) => p.stage === n).length}편)`);
ok(new Set(P.map((p) => p.id)).size === P.length, '글 id 가 겹치지 않는다');
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9' -]+/g, ' ').split(/[\s-]+/).filter(Boolean);
const hasWord = (text, w) => { const ws = words(text); const t = words(w); return t.length > 0 && t.every((x) => ws.includes(x)); };
const wc = (p) => p.sentences.reduce((n, s) => n + words(s.en).length, 0);
const ASCII = /^[\x20-\x7e]*$/;
const KO = /[가-힣]/;
bulk('칸 모양(제목·주제·배경·문장·핵심·보기4·낱말3·요약)', P, (p) =>
  !!(p.title?.en && p.title?.ko && p.topic?.en && p.topic?.ko && p.bg?.en && p.bg?.ko && p.keyWhy?.en && p.keyWhy?.ko
     && Array.isArray(p.sentences) && p.sentences.length >= 5 && p.main?.options?.length === 4 && p.main.why?.ko
     && p.words?.length === 3 && p.summary?.ko && p.summary?.en && p.summary.keywords?.length === 3
     && (p.genre === 'story' || p.genre === 'info')) || 'missing');
bulk('핵심 문장 번호가 글 안에 있다', P, (p) => (Number.isInteger(p.key) && p.key >= 0 && p.key < p.sentences.length) || p.key);
bulk('정답 번호가 보기 안에 있다', P, (p) => (Number.isInteger(p.main.answer) && p.main.answer >= 0 && p.main.answer < 4) || p.main.answer);
bulk('문장마다 영어·우리말이 다 있다', P, (p) => p.sentences.every((s) => s.en && s.ko && KO.test(s.ko)) || 'empty');
bulk('영어 칸은 ASCII 만(한글·둥근따옴표 없음)', P, (p) => [p.title.en, p.bg.en, p.summary.en, ...p.sentences.map((s) => s.en), ...p.main.options.map((o) => o.en), ...p.words.map((w) => w.en)].every((x) => ASCII.test(x)) || 'non-ascii');
bulk('오늘의 낱말 3개가 본문에 글자 그대로 있다', P, (p) => p.words.every((w) => hasWord(p.sentences.map((s) => s.en).join(' '), w.en)) || p.words.map((w) => w.en).join(','));
bulk('핵심어 3개가 모범 문장에 들어 있다', P, (p) => p.summary.keywords.every((k) => hasWord(p.summary.en, k)) || p.summary.keywords.join(','));
bulk('보기 4개가 서로 다르다', P, (p) => new Set(p.main.options.map((o) => o.en.toLowerCase())).size === 4 || 'dup');
const avg = (n) => { const l = P.filter((p) => p.stage === n); return l.reduce((a, p) => a + wc(p), 0) / (l.length || 1); };
const A = [1, 2, 3, 4].map(avg);
console.log('     평균 단어 수: ' + A.map((x, i) => (i + 1) + '단계 ' + Math.round(x)).join(' · '));
ok(A[0] < A[1] && A[1] <= A[2] + 15 && A[2] < A[3], '단계가 올라갈수록 글이 길어진다');
ok(P.filter((p) => p.stage <= 2).every((p) => p.genre === 'story') && P.filter((p) => p.stage >= 3).every((p) => p.genre === 'info'), '1·2단계는 이야기, 3·4단계는 지식 글');
const s4mid = P.filter((p) => p.stage === 4 && p.key > 0).length;
ok(s4mid >= 4, `4단계는 핵심 문장이 첫 문장이 아닌 글이 4편 이상 (${s4mid}편 — 수능형 대의파악)`);

console.log('\n② 정본(RL-CORE) 실제 실행');
const a = JS_SRC.indexOf('/* RL-CORE-START'), b = JS_SRC.indexOf('/* RL-CORE-END */');
ok(a > 0 && b > a, '정본 블록을 오려 냈다');
let C = null;
try { C = new Function(JS_SRC.slice(a, b) + '\nreturn RLCore;')(); } catch (e) { console.log('  실행 실패: ' + e.message); }
ok(!!C, '정본을 실행했다');
if (C) {
  const kw = ['puppy', 'home', 'found'];
  const r1 = C.checkSummary('The puppy found its way home.', kw);
  ok(r1.verdict === 'great' && r1.hit.length === 3, '핵심어 3개 다 → great');
  ok(C.checkSummary('The Puppies FOUND their homes', kw).hit.length === 3, '어미·대소문자가 달라도 같은 낱말로 본다(Puppies/homes)');
  ok(C.checkSummary('A puppy went home today.', kw).verdict === 'good', '2개 → good');
  ok(['homes','boxes','watches','studies','played','running'].map((w) => C.stem(w)).join() === 'home,box,watch,study,play,runn', '어미 떼기: homes→home · boxes→box · watches→watch · studies→study · played→play');
  ok(C.checkSummary('I like cake very much.', kw).verdict === 'try', '0개 → try(통과 아님)');
  ok(C.checkSummary('강아지 home puppy', kw).verdict === 'korean', '한글이 섞이면 → korean');
  ok(C.checkSummary('puppy', kw).verdict === 'short', '세 낱말 미만 → short');
  ok(C.checkSummary('homework is homeless', ['home']).hit.length === 0, '낱말 «안» 에 든 글자는 안 센다(homework ≠ home)');
  bulk('모범 문장을 그대로 쓰면 «great» (채점이 자기 답을 떨어뜨리지 않음)', P, (p) => C.checkSummary(p.summary.en, p.summary.keywords).verdict === 'great' || C.checkSummary(p.summary.en, p.summary.keywords).miss.join(','));
  const o1 = C.seededOrder(4, 's1-01'), o2 = C.seededOrder(4, 's1-01');
  ok(JSON.stringify(o1) === JSON.stringify(o2) && [...o1].sort().join() === '0,1,2,3', '섞기: 같은 글은 같은 순서 · 0~3 하나씩');
  const firstPos = new Set(P.map((p) => C.seededOrder(4, p.id).indexOf(p.main.answer)));
  ok(firstPos.size >= 3, `정답이 늘 같은 자리에 있지 않다(정답 위치 ${[...firstPos].sort().join(',')})`);
  // 다음 단계 추천 — 짝으로
  const st1 = P.filter((p) => p.stage === 1);
  const need = Math.ceil(st1.length * C.NEXT_DONE_RATIO);
  const progGood = {}; st1.slice(0, need).forEach((p) => { progGood[p.id] = { k: 'ok', m: 'ok', s: 'great' }; });
  ok(C.recommendNext(P, 1, progGood, 4) === true, `1단계 ${need}편을 처음에 맞혀 끝내면 2단계를 추천한다`);
  const progFew = {}; st1.slice(0, need - 1).forEach((p) => { progFew[p.id] = { k: 'ok', m: 'ok', s: 'great' }; });
  ok(C.recommendNext(P, 1, progFew, 4) === false, '한 편 모자라면 추천하지 않는다');
  const progShown = {}; st1.slice(0, need).forEach((p) => { progShown[p.id] = { k: 'shown', m: 'shown', s: 'shown' }; });
  ok(C.recommendNext(P, 1, progShown, 4) === false, '정답 보기로만 끝냈으면 추천하지 않는다');
  ok(C.recommendNext(P, 4, progGood, 4) === false, '4단계 위로는 추천하지 않는다');
  // 반복 연습 — 약한 글 먼저, 5편, 그 단계만
  const progMix = {}; st1.slice(0, st1.length - 2).forEach((p) => { progMix[p.id] = { m: 'ok' }; });
  const dr = C.pickDrill(P, 1, progMix, 'seed');
  ok(dr.length === C.DRILL_SIZE && dr.every((p) => p.stage === 1), `반복 연습은 그 단계 글 ${C.DRILL_SIZE}편`);
  ok(st1.slice(-2).every((p) => dr.slice(0, 2).includes(p)), '아직 처음에 못 맞힌 글이 먼저 나온다');
  ok(new Set(dr.map((p) => p.id)).size === dr.length, '반복 연습에 같은 글이 두 번 안 나온다');
  ok(C.isDone({ k: 'ok', m: 'retry', s: 'shown' }) && !C.isDone({ k: 'ok', m: 'ok' }), '완료 = 세 단계 모두(정답 보기 포함)');
  // 📋 단계별 한눈에 · 주제 거르기 (2026-10-18)
  ok([1, 2, 3, 4].every((n) => C.stageAvgWords(P, n) === Math.round(A[n - 1])), '평균 단어 수가 데이터에서 잰 값과 같다(' + [1, 2, 3, 4].map((n) => C.stageAvgWords(P, n)).join('·') + ')');
  ok(C.stageAvgWords(P, 9) === 0, '없는 단계의 평균은 0(나누기 0 아님)');
  const tp1 = C.topicsOf(P, 1);
  ok(tp1.length >= 2 && tp1.reduce((a, t) => a + t.count, 0) === st1.length, '주제 목록의 개수 합 = 그 단계 글 수');
  ok(tp1.every((t) => P.some((p) => p.stage === 1 && p.topic.ko === t.key)) && !tp1.some((t) => P.filter((p) => p.stage !== 1).some((p) => p.topic.ko === t.key) && !st1.some((p) => p.topic.ko === t.key)), '주제 목록은 그 단계 글에서만 나온다');
  const big = tp1.slice().sort((x, y) => y.count - x.count)[0];
  const f1 = C.filterByTopic(st1, big.key);
  ok(f1.length === big.count && f1.every((p) => p.topic.ko === big.key), `주제 «${big.key}» 를 고르면 그 글 ${big.count}편만 남는다`);
  ok(C.filterByTopic(st1, '') === st1, '주제를 안 고르면 그대로(짝)');
  ok(C.filterByTopic(st1, '없는주제') === st1, '모르는 주제면 거르지 않는다(빈 목록을 «글이 없다» 로 보이지 않게)');
}

console.log('\n③ 배선');
ok(/<script src="\/js\/reading-ladder-data\.js\?v=\d+"><\/script>\s*<script src="\/js\/reading-ladder\.js\?v=\d+"><\/script>/.test(HTML), 'stories.html 이 데이터 → 엔진 순서로 싣는다');
ok(/window\.__storyLang\s*=/.test(HTML) && /window\.__storyBooksHtml\s*=/.test(HTML), 'stories.html 이 언어·그림 동화책 목록을 넘겨 준다');
ok(/dispatchEvent\(new Event\('story:lang'\)\)/.test(HTML) && /addEventListener\('story:lang'/.test(JS_SRC), '언어를 바꾸면 사다리도 다시 그린다');
ok(/class="rl-tab[^\n]*data-act="stage" data-stage=/.test(JS_SRC), '단계 탭이 실제로 눌린다(data-act="stage" — 빠지면 탭이 무동작)');
ok(/id="rlApp"/.test(HTML) && /id="booksWrap"/.test(HTML), '사다리 칸과 예비 책 목록 칸이 있다');
ok(/data-act="layout" data-layout="/.test(JS_SRC) && /if \(act === 'layout'\)/.test(JS_SRC), '보기 방식(단계별 한눈에/한 단계) 버튼이 실제로 눌린다');
ok(/if \(state\.layout === 'all'\) return renderOverview\(\);/.test(JS_SRC) && /layout: 'all'/.test(JS_SRC), '처음 오면 «단계별 한눈에» 가 보인다');
ok(/data-act="jump" data-stage="/.test(JS_SRC) && /if \(act === 'jump'\)/.test(JS_SRC) && /closest\('\.rl-sec'\)/.test(JS_SRC), '«단계 바로가기» 가 그 단계 구역으로 옮겨 간다');
ok(/data-act="topic" data-topic="/.test(JS_SRC) && /if \(act === 'topic'\)/.test(JS_SRC), '주제 칩이 실제로 눌린다');
ok(/window\.__storyBookList\s*=/.test(HTML) && /__storyBookList\(\)/.test(JS_SRC), '그림책이 «한눈에» 2단계 안에도 그려진다(책 목록을 넘겨 받음)');
ok(/WRONG_BEFORE_REVEAL:\s*2/.test(JS_SRC) && (JS_SRC.match(/data-act="(keyreveal|mainreveal|dreveal)"/g) || []).length === 3, '두 번 틀리면 «정답 보기» 가 세 곳(핵심 문장·중심 내용·반복 연습)에 열린다');
ok(/data-act="sumshow"/.test(JS_SRC), '영작은 «모범 문장 보기» 로 넘어갈 수 있다(갇히지 않음)');
const noFetch = JS_SRC.replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/fetch\(|\/api\//.test(noFetch), '서버·포인트 호출이 없다(진행은 이 기기에만)');
ok(/try\s*\{\s*localStorage\.setItem/.test(JS_SRC) && /try\s*\{[\s\S]{0,40}JSON\.parse\(localStorage\.getItem/.test(JS_SRC), '저장·읽기를 try 로 감쌌다');

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) process.exit(1);
