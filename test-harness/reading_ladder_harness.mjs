/* ═════════════════════════════════════════════════════════════════
   📚 영어 독서 사다리 감시 — 2026-10-18 신설 (사장님 «적은 단계 + 충분한 글 + 핵심찾기 반복»)
     ① 데이터(js/reading-ladder-data.js): 4단계 · 단계마다 10편 이상 · 칸 모양 · 정답/핵심문장 범위
        · 낱말·핵심어가 «글자 그대로» 들어 있나 · 단계가 올라갈수록 글이 길어지나 · 영어칸에 한글 없음
     ② 정본(RL-CORE)을 소스에서 오려 내 실제로 돌림: 핵심어 채점 · 섞기 · 다음 단계 추천 · 반복 연습 고르기
        («된다» 옆에 «안 된다» 를 짝으로)
     ③ 배선: stories.html 이 두 스크립트를 싣고 언어·책 목록을 넘겨 주는가 · 정답을 맞혀야만 넘어가지 않는가
     ④ 고르기 화면(C안)을 가짜 DOM 에서 «통째로» 돌려 본다: 단계·주제·상태·정렬·고르기·이전/다음·읽기↔목록
        · 드롭다운 닫기(Esc·바깥 누르기·다른 것 열기) · ↑/↓ · EN
     📌 2026-10-18 사장님 C안(«스크롤 없이 한 장에 · 드롭다운») — 옛 «단계 탭 · 보기 방식 · 한눈에 먼저 · 바로가기»
        네 검사는 그 화면이 없어져 새 경계(③·④)로 옮겼다. ⛔ 옛 문자열로 되돌리지 말 것(되살리기가 됩니다).
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
const HTML = readFileSync(process.env.RL_HTML_SRC || join(PUB, 'stories.html'), 'utf8');

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
// 2026-10-20 사장님 지시 — 3단계에 소설 시리즈 «마법학교»(s3-39~42)만 이야기로 둔다. 예외는 이 목록 하나뿐(넓히지 말 것).
const STORY_IN_UPPER = new Set(['s3-39', 's3-40', 's3-41', 's3-42']);
ok(P.filter((p) => p.stage <= 2).every((p) => p.genre === 'story') && P.filter((p) => p.stage >= 3).every((p) => p.genre === (STORY_IN_UPPER.has(p.id) ? 'story' : 'info')), '1·2단계는 이야기, 3·4단계는 지식 글(예외: 3단계 소설 시리즈 마법학교 4편)');
ok([...STORY_IN_UPPER].every((id) => P.some((p) => p.id === id && p.stage === 3)), '(짝) 예외 목록의 글이 실제로 3단계에 있다');
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

  // 📋 고르기 화면(C안 · 2026-10-18) — 글 상태 · 거르기·정렬 · 상세에 띄울 글
  const DONE = { k: 'ok', m: 'ok', s: 'great' };
  ok(C.statusOf(undefined) === 'new' && C.statusOf({}) === 'new', '기록이 없으면 «새 글»');
  ok(C.statusOf({ m: 'shown' }) === 'doing' && C.statusOf({ k: 'ok' }) === 'doing', '한 단계라도 했으면(정답 보기 포함) «하는 중»');
  ok(C.statusOf({ k: 'ok', m: 'retry', s: 'shown' }) === 'done' && C.statusOf(DONE) === 'done', '세 단계를 다 했으면 «완료»');
  bulk('«완료» 판정이 isDone 과 어긋나지 않는다', [{}, { k: 'ok' }, { k: 'ok', m: 'ok' }, DONE, { k: 'shown', m: 'shown', s: 'shown' }, { s: 'try' }],
    (r) => (C.statusOf(r) === 'done') === C.isDone(r) || C.statusOf(r));
  const pg = { [st1[0].id]: DONE, [st1[1].id]: { k: 'ok' } };
  const all1 = C.browse(P, 1, pg, {});
  ok(all1.length === st1.length && all1.every((p, i) => p === st1[i]), '거르기가 없으면 그 단계 글 전부 · 번호순');
  ok(C.browse(P, 1, pg).length === st1.length && C.browse(P, 1, undefined, { status: 'new' }).length === st1.length, '설정·기록이 없어도 던지지 않는다(기록 없음 = 모두 «새 글»)');
  ok(!C.browse(P, 1, pg, {}).some((p) => p.stage !== 1), '다른 단계 글이 섞이지 않는다');
  ok(C.browse(P, 1, pg, { status: 'done' }).map((p) => p.id).join() === st1[0].id, '상태 «완료» → 끝낸 글만');
  ok(C.browse(P, 1, pg, { status: 'doing' }).map((p) => p.id).join() === st1[1].id, '상태 «하는 중» → 하는 중인 글만');
  ok(C.browse(P, 1, pg, { status: 'new' }).length === st1.length - 2, '상태 «새 글» → 나머지');
  ok(C.browse(P, 1, pg, { status: 'zzz' }).length === st1.length, '모르는 상태 값이면 거르지 않는다(짝)');
  ok(C.browse(P, 1, pg, { topic: '없는주제' }).length === st1.length, '모르는 주제면 거르지 않는다');
  const combo = C.browse(P, 1, pg, { topic: big.key, status: 'new' });
  ok(combo.length > 0 && combo.every((p) => p.topic.ko === big.key && C.statusOf(pg[p.id]) === 'new'), '주제·상태를 함께 고르면 둘 다 맞는 글만');
  const shortF = C.browse(P, 1, {}, { sort: 'short' }), longF = C.browse(P, 1, {}, { sort: 'long' });
  const sorted = (l, dir) => l.length === st1.length && l.every((p, i) => i === 0 || (C.wordCount(l[i - 1]) - C.wordCount(p)) * dir < 0 ||
    (C.wordCount(l[i - 1]) === C.wordCount(p) && st1.indexOf(l[i - 1]) < st1.indexOf(p)));
  const ties = st1.length - new Set(st1.map((p) => C.wordCount(p))).size;
  ok(ties > 0, `전제: 1단계에 단어 수가 같은 글이 있다(${ties}쌍 — 없으면 아래 «같으면 번호순» 이 헛돈다)`);
  ok(sorted(shortF, 1), '짧은 글부터 — 단어 수가 줄지 않고, 같으면 번호순');
  ok(sorted(longF, -1), '긴 글부터 — 단어 수가 늘지 않고, 같으면 번호순');
  ok(C.browse(P, 1, {}, { sort: 'zzz' }).every((p, i) => p === st1[i]), '모르는 정렬이면 번호순(짝)');
  ok(C.pickActive(P, 1, pg, st1[5].id) === st1[5], '고른 글이 그 단계에 있으면 그 글을 띄운다');
  const st3first = P.filter((p) => p.stage === 3)[0];
  const other = C.pickActive(P, 1, pg, st3first.id);
  ok(other && other.stage === 1 && other === st1[1], '다른 단계 글 id 는 무시하고 «하는 중» 글을 띄운다(짝)');
  ok(C.pickActive(P, 1, pg, null) === st1[1] && C.pickActive(P, 1, pg, 'no-such') === st1[1], '안 골랐거나 없는 id 면 «하는 중» 글 먼저');
  ok(C.pickActive(P, 1, { [st1[0].id]: DONE }, null) === st1[1], '하는 중이 없으면 첫 «새 글»');
  const allDone = {}; st1.forEach((p) => { allDone[p.id] = DONE; });
  ok(C.pickActive(P, 1, allDone, null) === st1[0], '다 끝냈으면 첫 글');
  ok(C.pickActive(P, 9, {}, null) === null, '글이 없는 단계면 null(상세를 그리지 않음)');
}

console.log('\n③ 배선');
ok(/<script src="\/js\/reading-ladder-data\.js\?v=\d+"><\/script>\s*<script src="\/js\/reading-ladder-art\.js\?v=\d+"><\/script>\s*<script src="\/js\/reading-ladder\.js\?v=\d+"><\/script>/.test(HTML), 'stories.html 이 데이터 → 화풍 → 엔진 순서로 싣는다');
ok(/window\.__storyLang\s*=/.test(HTML) && /window\.__storyBooksHtml\s*=/.test(HTML), 'stories.html 이 언어·그림 동화책 목록을 넘겨 준다');
ok(/dispatchEvent\(new Event\('story:lang'\)\)/.test(HTML) && /addEventListener\('story:lang'/.test(JS_SRC), '언어를 바꾸면 사다리도 다시 그린다');
ok((JS_SRC.match(/data-act="stage" data-stage="/g) || []).length >= 3 && /if \(act === 'stage'\)/.test(JS_SRC), '단계 계단·단계 드롭다운·«올라가기» 가 모두 data-act="stage" 로 눌린다(빠지면 무동작)');
ok(/id="rlApp"/.test(HTML) && /id="booksWrap"/.test(HTML) && /id="rlOverall"/.test(HTML), '사다리 칸·예비 책 목록 칸·전체 진도 칸이 있다');
const noCmt = JS_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
ok(/else renderBrowse\(\);/.test(noCmt) && !/renderOverview|state\.layout|data-act="layout"|data-act="jump"|act === 'layout'|act === 'jump'/.test(noCmt),
  '옛 두 보기(한눈에·한 단계)·바로가기는 고르기 화면 하나로 합쳤다(되살아나지 않음 — 2026-10-18 C안)');
ok(/document\.documentElement\.classList\.toggle\('rl-browse', view\.mode === 'list'\)/.test(noCmt), '«한 장에 꽉 차는» 배치는 고르기 화면에서만 · toggle 에 force(같으면 class 를 다시 안 씀)');
ok(/html\.rl-browse #rlApp\{/.test(HTML) && /@media \(max-width:820px\),\(max-height:560px\)\{[\s\S]{0,120}html\.rl-browse[^{]*\{height:auto\}/.test(HTML), '좁거나 낮은 화면에서는 한 장 고정을 풀고 아래로 쌓는다');
ok(/data-act="topic" data-topic="/.test(JS_SRC) && /if \(act === 'topic'\)/.test(JS_SRC), '주제 드롭다운이 실제로 눌린다');
ok(/window\.__storyBookList\s*=/.test(HTML) && /__storyBookList\(\)/.test(JS_SRC), '그림 동화책 4권이 2단계 툴바 드롭다운에 그려진다(책 목록을 넘겨 받음)');
ok(/WRONG_BEFORE_REVEAL:\s*2/.test(JS_SRC) && (JS_SRC.match(/data-act="(keyreveal|mainreveal|dreveal)"/g) || []).length === 3, '두 번 틀리면 «정답 보기» 가 세 곳(핵심 문장·중심 내용·반복 연습)에 열린다');
ok(/data-act="sumshow"/.test(JS_SRC), '영작은 «모범 문장 보기» 로 넘어갈 수 있다(갇히지 않음)');
const noFetch = JS_SRC.replace(/\/\*[\s\S]*?\*\//g, '');
ok(!/fetch\(|\/api\//.test(noFetch), '서버·포인트 호출이 없다(진행은 이 기기에만)');
ok(/try\s*\{\s*localStorage\.setItem/.test(JS_SRC) && /try\s*\{[\s\S]{0,40}JSON\.parse\(localStorage\.getItem/.test(JS_SRC), '저장·읽기를 try 로 감쌌다');

console.log('\n④ 고르기 화면 실제 실행(가짜 DOM)');
// 엔진을 통째로 돌려 «무엇이 그려지는가» 를 답으로 본다 — 문자열만 보면 if (false) 한 글자에 뚫린다.
function makeEnv(opt) {
  opt = opt || {};
  const store = Object.assign({}, opt.store || {});
  const htmlClass = new Set(), toggleArgs = [];
  const L = { root: {}, doc: {}, win: {} };
  const adder = (m) => (type, fn) => { (m[type] = m[type] || []).push(fn); };
  const itemEls = {};
  const mk = (attrs, extra) => {
    const e = Object.assign({ focused: 0, focus() { e.focused++; } }, extra || {});
    e.getAttribute = (n) => (Object.prototype.hasOwnProperty.call(attrs, n) ? String(attrs[n]) : null);
    e.closest = (s) => (s === '[data-act]' ? (attrs['data-act'] ? e : null) : s === '.rl-item' ? (attrs.__item ? e : null) : null);
    return e;
  };
  const itemEl = (id) => itemEls[id] || (itemEls[id] = mk({ 'data-act': 'sel', 'data-id': id, __item: 1 }));
  const env = { store, htmlClass, toggleArgs, L, open: [], itemEl, mk, lang: opt.lang || 'ko', errors: [] };
  const root = {
    innerHTML: '', addEventListener: adder(L.root), contains: () => true, scrollIntoView() {},
    querySelectorAll(sel) {
      if (sel === 'details.rl-dd[open]') return env.open.filter((d) => d.open);
      if (sel === '.rl-item') return parseItems(root.innerHTML).map((x) => itemEl(x.id));
      return [];
    },
    querySelector(sel) {
      if (sel === 'details.rl-dd[open]') return env.open.filter((d) => d.open)[0] || null;
      const m = /^\.rl-item\[data-id="([^"]+)"\]$/.exec(sel);
      return m ? itemEl(m[1]) : null;
    }
  };
  env.root = root;
  env.overall = { innerHTML: '' };
  const document = {
    activeElement: null, addEventListener: adder(L.doc),
    documentElement: { classList: { toggle(c, f) { toggleArgs.push(arguments.length); if (f) htmlClass.add(c); else htmlClass.delete(c); return !!f; } } },
    getElementById(id) {
      if (id === 'rlApp') return root;
      if (id === 'rlOverall') return env.overall;
      if (id === 'booksWrap') return { hidden: false };
      if (id === 'rlDetail') return root.innerHTML.indexOf('id="rlDetail"') >= 0 ? { scrollIntoView() {} } : null;
      return null;
    }
  };
  const BOOKS = [1, 2, 3, 4].map((i) => ({ id: 's2-0' + i, no: i, title: 'Book ' + i, ko: '책 ' + i, en: 'Book ' + i, n: i === 1 ? 6 : 0 }));
  const sb = {
    document, console,
    localStorage: { getItem: (k) => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); } },
    addEventListener: adder(L.win), matchMedia: () => ({ matches: false }),
    __storyLang: () => env.lang, __storyBookList: () => BOOKS, __storyBooksHtml: '<p>books</p>'
  };
  sb.window = sb;
  try { vm.runInNewContext(DATA_SRC, sb); vm.runInNewContext(JS_SRC, sb); } catch (e) { env.errors.push('load: ' + e.message); }
  env.fire = (where, type, ev) => { for (const fn of (L[where][type] || [])) { try { fn(ev); } catch (e) { env.errors.push(type + ': ' + e.message); } } };
  env.click = (attrs) => { const ev = { target: mk(attrs), preventDefault() {} }; env.fire('root', 'click', ev); env.fire('doc', 'click', ev); };
  env.key = (key, target) => { const ev = { key, target: target || mk({}), prevented: 0, preventDefault() { ev.prevented++; } }; env.fire('root', 'keydown', ev); return ev; };
  env.html = () => root.innerHTML;
  env.items = () => parseItems(root.innerHTML);
  env.detail = () => { const m = /id="rlDetail"[\s\S]*?<h2 lang="en">([^<]*)<\/h2>/.exec(root.innerHTML); return m ? m[1].replace(/&#39;/g, "'").replace(/&amp;/g, '&') : null; };
  env.saved = () => { try { return JSON.parse(store[RL_KEY] || 'null'); } catch (e) { return null; } };
  return env;
}
function parseItems(html) {
  const out = []; const re = /class="rl-item (new|doing|done)( sel)?" data-act="sel" data-id="([^"]+)"/g; let m;
  while ((m = re.exec(html))) out.push({ id: m[3], status: m[1], sel: !!m[2] });
  return out;
}
const FULL = { k: 'ok', m: 'ok', s: 'great' };
const RL_KEY = (C && C.STORE_KEY) || 'reading_ladder_v1';
const titleOf = (id) => { const p = P.find((x) => x.id === id); return p ? p.title.en : '?'; };
const idsOf = (n) => P.filter((p) => p.stage === n).map((p) => p.id);
const sameIds = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

if (C && P.length) {
  // ── 처음 화면 ──
  const e = makeEnv();
  ok(e.errors.length === 0, '엔진이 오류 없이 실행된다' + (e.errors.length ? ' — ' + e.errors[0] : ''));
  ok(e.htmlClass.has('rl-browse') && e.toggleArgs.length > 0 && e.toggleArgs.every((n) => n === 2), '처음엔 고르기 화면(한 장 배치) · toggle 은 늘 force 와 함께');
  ok(/class="rl-app"/.test(e.html()) && /class="rl-split"/.test(e.html()) && /class="rl-tb"/.test(e.html()), '툴바 + 목록/상세 두 칸을 그린다');
  ok(sameIds(e.items().map((x) => x.id), idsOf(1)), `1단계 글 ${idsOf(1).length}편이 번호순으로 목록에 있다`);
  ok(e.detail() === titleOf(idsOf(1)[0]) && e.items().filter((x) => x.sel).length === 1 && e.items()[0].sel, '기록이 없으면 첫 글이 상세에 뜨고 목록에서 한 줄만 «고름»');
  // 📌 2026-10-19 글을 늘리며(단계당 12편 → 1·2단계 48편 등) 총 편수를 데이터에서 센다 — «48» 로 못 박지 않는다.
  ok(new RegExp('전체 진도</span><b>0 / ' + P.length + '</b>').test(e.overall.innerHTML), `머리글에 전체 진도 0 / ${P.length}`);
  ok([1, 2, 3, 4].every((n) => (e.html().match(new RegExp('data-act="stage" data-stage="' + n + '"', 'g')) || []).length >= 2), '단계 1~4 를 계단과 드롭다운 두 곳에서 고를 수 있다');
  ok((e.html().match(/aria-pressed="true"[^>]*title="1단계/g) || []).length === 1 && !/aria-pressed="true"[^>]*title="[234]단계/.test(e.html()), '계단은 지금 단계 하나만 눌림 표시');
  ok(!/rl-dd-item/.test(e.html()), '1단계에는 그림 동화책 드롭다운이 없다(짝)');
  ok(/data-act="open" data-id="s1-01"[^>]*>[\s\S]{0,400}?읽기 시작/.test(e.html()), '새 글이면 큰 버튼이 «읽기 시작»');

  // ── 단계 바꾸기 ──
  e.click({ 'data-act': 'stage', 'data-stage': 3 });
  ok(sameIds(e.items().map((x) => x.id), idsOf(3)) && e.saved() && e.saved().stage === 3, '3단계를 누르면 3단계 글로 바뀌고 이 기기에 저장된다');
  e.click({ 'data-act': 'stage', 'data-stage': 9 });
  ok(sameIds(e.items().map((x) => x.id), idsOf(3)) && e.saved().stage === 3, '없는 단계(9)는 무시한다(짝)');
  // ── 주제 ──
  const tp3 = C.topicsOf(P, 3).sort((x, y) => y.count - x.count)[0];
  e.click({ 'data-act': 'topic', 'data-topic': tp3.key });
  const want3 = P.filter((p) => p.stage === 3 && p.topic.ko === tp3.key).map((p) => p.id);
  ok(sameIds(e.items().map((x) => x.id), want3) && new RegExp('<span class="rl-count"><b>' + want3.length + '</b>').test(e.html()), `주제 «${tp3.key}» → 그 글 ${want3.length}편만 · 개수 표시도 같다`);
  e.click({ 'data-act': 'topic', 'data-topic': '' });
  ok(e.items().length === idsOf(3).length, '주제 «전체» 로 되돌리면 다시 전부(짝)');
  e.click({ 'data-act': 'topic', 'data-topic': tp3.key });
  e.click({ 'data-act': 'stage', 'data-stage': 2 });
  ok(sameIds(e.items().map((x) => x.id), idsOf(2)), '단계를 바꾸면 주제 거르기는 풀린다(주제는 단계마다 다름)');
  const bookOpts = e.html().match(/class="rl-dd-opt rl-dd-item" role="menuitem" href="\/story-s2-0\d\.html"/g) || [];
  ok(bookOpts.length === 4, '2단계에서는 그림 동화책 4권이 드롭다운에 · 각자 /story-<id>.html 로 간다');

  // ── 상태·정렬 (기록 있는 기기) ──
  const s1 = idsOf(1);
  const e2 = makeEnv({ store: { [RL_KEY]: JSON.stringify({ stage: 1, prog: { [s1[0]]: FULL, [s1[1]]: { k: 'ok' } } }) } });
  ok(e2.detail() === titleOf(s1[1]), '기록이 있으면 «하는 중» 글이 먼저 상세에 뜬다');
  ok(/data-act="open" data-id="[^"]+"[^>]*>[\s\S]{0,400}?이어서 하기/.test(e2.html()) && /<li class="done"><span class="rl-hn">/.test(e2.html()), '하는 중이면 «이어서 하기» · 끝낸 단계엔 ✓');
  ok(new RegExp('전체 진도</span><b>1 / ' + P.length + '</b>').test(e2.overall.innerHTML), `전체 진도가 끝낸 글 수를 센다(1 / ${P.length})`);
  e2.click({ 'data-act': 'filter', 'data-key': 'status', 'data-v': 'done' });
  ok(sameIds(e2.items().map((x) => x.id), [s1[0]]) && e2.items()[0].status === 'done', '상태 «완료» → 끝낸 글만');
  e2.click({ 'data-act': 'filter', 'data-key': 'status', 'data-v': 'new' });
  ok(e2.items().length === s1.length - 2 && e2.items().every((x) => x.status === 'new'), '상태 «새 글» → 나머지 전부');
  e2.click({ 'data-act': 'filter', 'data-key': 'status', 'data-v': 'zzz' });
  e2.click({ 'data-act': 'filter', 'data-key': 'evil', 'data-v': 'done' });
  ok(e2.items().length === s1.length - 2, '모르는 값·모르는 칸은 무시한다(거르기가 그대로 — 짝)');
  e2.click({ 'data-act': 'filter', 'data-key': 'status', 'data-v': '' });
  ok(e2.items().length === s1.length, '상태 «전체» 로 되돌리면 다시 전부');
  e2.click({ 'data-act': 'filter', 'data-key': 'sort', 'data-v': 'short' });
  ok(sameIds(e2.items().map((x) => x.id), C.browse(P, 1, {}, { sort: 'short' }).map((p) => p.id)), '정렬 «짧은 글부터» 가 정본 순서 그대로 그려진다');
  e2.click({ 'data-act': 'filter', 'data-key': 'sort', 'data-v': '' });
  ok(sameIds(e2.items().map((x) => x.id), s1), '정렬을 비우면 번호순으로 돌아온다');
  const e3 = makeEnv({ store: { [RL_KEY]: JSON.stringify({ stage: 1, prog: {} }) } });
  e3.click({ 'data-act': 'filter', 'data-key': 'status', 'data-v': 'done' });
  ok(e3.items().length === 0 && /class="rl-empty"/.test(e3.html()) && e3.detail() !== null, '맞는 글이 없으면 «없어요» 안내 · 상세는 그대로(빈 화면이 아님)');

  // ── 고르기 · 이전/다음 ──
  e2.click({ 'data-act': 'sel', 'data-id': s1[4] });
  ok(e2.detail() === titleOf(s1[4]) && e2.items().filter((x) => x.sel).map((x) => x.id).join() === s1[4], '목록에서 고르면 그 글이 상세에 · 목록도 그 줄만 «고름»');
  e2.click({ 'data-act': 'step', 'data-v': 1 });
  ok(e2.detail() === titleOf(s1[5]), '«다음 글» → 번호상 다음 글');
  e2.click({ 'data-act': 'step', 'data-v': -1 }); e2.click({ 'data-act': 'step', 'data-v': -1 });
  ok(e2.detail() === titleOf(s1[3]), '«이전 글» 두 번 → 두 칸 앞');
  e2.click({ 'data-act': 'sel', 'data-id': s1[0] });
  e2.click({ 'data-act': 'step', 'data-v': -1 });
  ok(e2.detail() === titleOf(s1[0]) && /data-act="step" data-v="-1" disabled/.test(e2.html()), '첫 글에서는 «이전 글» 이 꺼져 있고 눌러도 그대로');

  // ── 그림책이 없는 글(book:false) — 그림책 표시·버튼을 그리지 않는다 · 있는 글은 그대로(짝) ──
  const noBook = P.find((p) => p.stage === 1 && p.book === false);
  if (noBook) {
    e2.click({ 'data-act': 'sel', 'data-id': noBook.id });
    ok(e2.detail() === noBook.title.en && !new RegExp('href="/story-' + noBook.id + '\\.html"').test(e2.html()) && !/class="rl-pic"/.test(e2.html()), `그림책 없는 글(${noBook.id})은 상세에 🖼 표시·버튼이 없다`);
    e2.click({ 'data-act': 'open', 'data-id': noBook.id });
    ok(/data-act="key" data-i="/.test(e2.html()) && !/href="\/story-/.test(e2.html()), '그 글의 읽기 화면에도 그림 동화책 버튼이 없다');
    e2.click({ 'data-act': 'list' });
  }
  e2.click({ 'data-act': 'sel', 'data-id': s1[0] });
  ok(new RegExp('href="/story-' + s1[0] + '\\.html"').test(e2.html()) && /class="rl-pic"/.test(e2.html()), '그림책 있는 글은 상세에 🖼 버튼이 그대로 있다(짝)');
  ok(P.filter((p) => p.book !== false).length >= 48 && P.filter((p) => p.book === false).every((p) => !/^s[1-4]-(0\d|1[0-2])$/.test(p.id)), '처음 48편(그림책 있는 글)은 그대로 · book:false 는 새로 더한 글에만');
  // 12편이 넘는 단계는 목록 줄을 내용 높이로 쌓는다(12줄 배치를 그대로 쓰면 줄이 짓눌린다) · 12편 이하 상황은 그대로(짝)
  ok((idsOf(1).length > 12) === /class="rl-list rl-long"/.test(e2.html()), '12편이 넘는 단계면 목록에 rl-long 이 붙는다');
  e2.click({ 'data-act': 'filter', 'data-key': 'status', 'data-v': 'done' });
  ok(/class="rl-list"/.test(e2.html()) && !/rl-long/.test(e2.html()), '거른 결과가 12편 이하면 rl-long 이 없다(짝)');
  e2.click({ 'data-act': 'filter', 'data-key': 'status', 'data-v': '' });
  ok(/\.rl-list\.rl-long\{grid-template-rows:none;grid-auto-rows:/.test(HTML), 'stories.html 에 rl-long 배치 규칙이 있다');

  // ── 읽기 ↔ 목록 ──
  e2.click({ 'data-act': 'open', 'data-id': s1[6] });
  ok(!e2.htmlClass.has('rl-browse') && !/class="rl-split"/.test(e2.html()) && /data-act="key" data-i="/.test(e2.html()), '«읽기 시작» → 읽기 화면(한 장 배치를 풀고 핵심 문장 고르기가 나온다)');
  e2.click({ 'data-act': 'list' });
  ok(e2.htmlClass.has('rl-browse') && e2.detail() === titleOf(s1[6]), '목록으로 돌아오면 읽던 글이 그대로 골라져 있다');

  // ── 드롭다운 닫기 ──
  const sm = e2.mk({}); const dA = { open: true, contains: () => false, querySelector: () => sm };
  e2.open = [dA];
  e2.key('Escape');
  ok(dA.open === false && sm.focused === 1, 'Esc → 열린 드롭다운을 닫고 그 단추로 포커스를 돌려준다');
  e2.open = []; const ok1 = e2.errors.length; e2.key('Escape');
  ok(e2.errors.length === ok1, '열린 게 없으면 Esc 는 아무 일도 안 한다(짝)');
  const keep = e2.mk({});
  const dB = { open: true, contains: () => false }, dC = { open: true, contains: (x) => x === keep };
  e2.open = [dB, dC];
  e2.fire('doc', 'click', { target: keep });
  ok(dB.open === false && dC.open === true, '바깥을 누르면 닫히고, 누른 곳을 품은 드롭다운은 남는다(짝)');
  const dD = { open: true, contains: () => false }, dE = { open: true, contains: (x) => x === dE, classList: { contains: (c) => c === 'rl-dd' } };
  e2.open = [dD, dE];
  e2.fire('root', 'toggle', { target: dE });
  ok(dD.open === false && dE.open === true, '드롭다운 하나를 열면 다른 것은 닫힌다');

  // ── ↑/↓ ──
  e2.click({ 'data-act': 'sel', 'data-id': s1[2] });
  const down = e2.key('ArrowDown', e2.itemEl(s1[2]));
  ok(e2.detail() === titleOf(s1[3]) && down.prevented === 1 && e2.itemEl(s1[3]).focused >= 1, '↓ → 다음 글을 고르고 포커스도 옮긴다');
  e2.click({ 'data-act': 'sel', 'data-id': s1[0] });
  const up = e2.key('ArrowUp', e2.itemEl(s1[0]));
  ok(e2.detail() === titleOf(s1[0]) && up.prevented === 0, '첫 줄에서 ↑ 는 그대로(페이지 스크롤을 막지 않음 — 짝)');

  // ── EN ──
  const en = makeEnv({ lang: 'en' });
  ok(en.errors.length === 0 && /Step 1/.test(en.html()) && !/[가-힣]/.test(en.html().replace(/<[^>]*>/g, ' ')), 'EN 이면 «보이는» 글자가 전부 영어(우리말 제목 줄을 안 그린다 · 속성값 주제 키는 셈에서 뺌)');
  e.lang = 'en'; e.fire('win', 'story:lang');
  ok(/Step 2/.test(e.html()) && !/<span>[^<]*[가-힣][^<]*<\/span><\/span><span class="rl-topic">/.test(e.html()), '🌐 를 누르면 그 자리에서 영어로 다시 그린다');
  ok(e.errors.length === 0 && e2.errors.length === 0 && e3.errors.length === 0, '모든 조작에서 오류가 없었다' + ([].concat(e.errors, e2.errors, e3.errors)[0] ? ' — ' + [].concat(e.errors, e2.errors, e3.errors)[0] : ''));
}

console.log('\n⑤ 큰 PC 화면 zoom 단계(2026-10-19 「글자가 너무 작아」)');
{
  const okd = (c, m, d) => ok(c, c || !d ? m : m + ' — ' + d);
  // 단계를 CSS 에서 읽어 «실제 창 × 그 단계» 를 칸 크기로 바꿔 본다 — 숫자를 하니스에 베끼지 않는다.
  const css = HTML.replace(/\/\*[\s\S]*?\*\//g, '');
  const tiers = (re) => [...css.matchAll(re)].map((m) => ({ w: +m[1], h: m[2] ? +m[2] : 0, z: +m[3] }));
  const B = tiers(/@media \(min-width:(\d+)px\) and \(min-height:(\d+)px\)\{html\.rl-browse \.wrap\{zoom:([\d.]+)\}\}/g);
  const R = tiers(/@media \(min-width:(\d+)px\)()\{html:not\(\.rl-browse\) \.wrap\{zoom:([\d.]+)\}\}/g);
  okd(B.length >= 3 && R.length >= 3, `전제: 고르기 ${B.length}단계 · 읽기 ${R.length}단계를 읽었다`);
  const zoomSel = [...css.matchAll(/([^{}]*)\{[^{}]*\bzoom:/g)].map((m) => m[1].trim());
  okd(zoomSel.length === B.length + R.length && zoomSel.every((s) => s === 'html.rl-browse .wrap' || s === 'html:not(.rl-browse) .wrap'),
    'zoom 은 위 두 갈래에만 있다(읽기 단계가 한 장 고정 화면에 새면 높이를 안 봐 목록이 넘친다)', zoomSel.filter((s) => s !== 'html.rl-browse .wrap' && s !== 'html:not(.rl-browse) .wrap').join(' | '));
  okd(B.every((t) => t.w >= 1600) && R.every((t) => t.w >= 1400), '노트북(1366·1440 폭)에는 안 걸린다 — 노트북 맞춤을 그대로 둔다');
  // 같은 특이도라 «뒤에 적힌 것» 이 이긴다 — 실제 창마다 이기는 단계를 골라 남는 칸을 잰다
  const eff = (list, W, H) => { let z = 1; for (const t of list) if (W >= t.w && H >= t.h) z = t.z; return z; };
  let badB = [], badR = [], lessB = 0;
  for (let W = 1200; W <= 4000; W += 20) for (let H = 560; H <= 2400; H += 20) {
    const z = eff(B, W, H);
    if (z > 1 && (W / z < 1260 || H / z < 700)) badB.push(`${W}x${H} z${z}`);
    const best = Math.max(1, ...B.filter((t) => W >= t.w && H >= t.h).map((t) => t.z));
    if (z < best) lessB++;
  }
  for (let W = 1200; W <= 4000; W += 20) { const z = eff(R, W, 0); if (z > 1 && 980 * z > W * 0.8) badR.push(`${W} z${z}`); }
  okd(badB.length === 0, '고르기 화면: 어느 창에서든 zoom 뒤 남는 칸이 1260×700 이상(48편이 안쪽 스크롤 없이 들어가는 크기 — 2026-10-19 실측)', badB.slice(0, 3).join(' | '));
  okd(lessB === 0, '고르기 화면: 단계가 작은 것부터 적혀 «맞는 것 중 가장 큰 단계» 가 이긴다', lessB);
  okd(badR.length === 0, '읽기 화면: 980px 칸 × zoom 이 창 폭의 80% 안이다(양옆 여백이 남고 가로 스크롤이 없다)', badR.slice(0, 3).join(' | '));
  okd(eff(B, 1920, 920) >= 1.25 && eff(B, 1366, 640) === 1 && eff(B, 1440, 860) === 1, '(짝) 1920×920 창은 커지고 · 노트북 창은 그대로', [eff(B, 1920, 920), eff(B, 1366, 640), eff(B, 1440, 860)].join(','));
}

// 🇰🇷 중심 내용 보기에는 우리말 해석을 붙이지 않는다(2026-10-21 사장님 — 아이들이 영어 대신 해석만 읽음).
//    본문 문장의 «해석 보기» 토글(s.ko)은 그대로 둔다(짝).
{
  const code = JS_SRC.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  ok(!/esc\(o\.ko\)/.test(code), '중심 내용 보기(본 읽기·반복 연습)에 우리말 해석(o.ko)을 그리지 않는다');
  ok(/view\.showKo \? '<span class="rl-ko">' \+ esc\(s\.ko\)/.test(code), '(짝) 본문 문장의 «해석 보기» 는 그대로 남아 있다');
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) process.exit(1);
