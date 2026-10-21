/* ═══════════════════════════════════════════════════════════════════════════
   📚 영어 독서 사다리 그림 동화책 감시 — 2026-10-18 신설(48편) · 2026-10-19 176편 전부로 늘림
      public/story-s1-01.html … story-s4-42.html (생성기 scripts/ladder-storybooks/build.mjs)

   story_books_harness(2~4권)와 같은 방식으로 권마다
     ① 생성기 결과가 지금 데이터와 같은가(손으로 고친 페이지·안 돌린 생성기를 잡음)
     ② 정본(StoryCore)을 오려 내 실제로 돌려 채점이 맞는가
     ③ 근거 문장이 본문에 «글자 그대로» 있는가 · 본문이 사다리 글 «그대로» 인가
     ④ 바꿔 쓰기가 그 권의 틀 모양으로만 문장을 만드는가
     ⑤ 그림 3장이 실제 파일인가 · 배경음악이 권마다 다른가 · 한/영 짝 · 사다리 배선
   를 봅니다. ⛔ D1 은 건드리지 않습니다.
   ═══════════════════════════════════════════════════════════════════════════ */
process.env.TZ = 'Asia/Seoul';
import { readFileSync, existsSync, statSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLadder, validate, DATA_DIR } from '../scripts/ladder-storybooks/validate.mjs';
import { buildPage } from '../scripts/ladder-storybooks/build.mjs';
import { STYLES } from '../scripts/ladder-storybooks/styles.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
let PASS = 0, FAIL = 0, CASES = 0;
const fails = [];
const ok = (c, m) => { if (c) PASS++; else { FAIL++; fails.push(m); console.log('  ❌ ' + m); } };
function bulk(name, cases, fn) {
  let bad = 0, firstBad = '';
  for (const c of cases) { CASES++; let r; try { r = fn(c); } catch (e) { r = 'throw ' + e.message; } if (r !== true) { bad++; if (!firstBad) firstBad = JSON.stringify(c).slice(0, 160) + ' → ' + r; } }
  ok(bad === 0 && cases.length > 0, `${name} — ${cases.length}조합` + (bad ? ` 중 ${bad}개 틀림 (예: ${firstBad})` : ''));
}
function literalAfter(src, marker) {
  const at = src.indexOf(marker); if (at < 0) return null;
  let i = src.indexOf('=', at) + 1; while (/\s/.test(src[i])) i++;
  const open = src[i], close = open === '[' ? ']' : '}';
  let d = 0, q = null;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (q) { if (ch === '\\') { j++; continue; } if (ch === q) q = null; continue; }
    if (ch === '"' || ch === "'") { q = ch; continue; }
    if (ch === open) d++; else if (ch === close) { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}
const evl = (lit) => { try { return new Function('return ' + lit)(); } catch { return null; } };
const reEsc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const plain = (s) => String(s).replace(/<[^>]+>/g, '').replace(/[“”"]/g, '').replace(/’/g, "'").trim();

const L = loadLadder();
const tpl = readFileSync(join(PUB, 'story-birthday-cake.html'), 'utf8');
const pts = readFileSync(join(SRC, 'api-points.ts'), 'utf8');
const seed = pts.match(/VALUES \('story_read','[^']+',(\d+),(\d+),(\d+),1,/);
const map = readFileSync(join(PUB, 'admin', 'site-structure-map.html'), 'utf8');
const ladderJs = readFileSync(join(PUB, 'js', 'reading-ladder.js'), 'utf8');
const artWindow = {};
new Function('window', readFileSync(join(PUB, 'js', 'reading-ladder-art.js'), 'utf8'))(artWindow);
const artCatalog = artWindow.READING_LADDER_ART;
ok(Object.keys(artCatalog.books).length === L.passages.filter(p => p.book !== false).length, '화풍 목록이 모든 그림책과 일치한다');
for (const [key, style] of Object.entries(STYLES)) {
  ok(artCatalog.styles[key]?.ko === style.ko && artCatalog.styles[key]?.en === style.en, key + ' 한/영 화풍 표시가 정본과 같다');
}

const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
console.log('\n══════ 전제 ══════');
// 📌 2026-10-19 사다리 글을 176편으로 늘렸고, 같은 날 176편 «전부» 에 그림 동화책을 만들었다(book:false 0편).
//    그림책이 없는 글이 다시 생기면 그 글에 book:false 를 달면 된다 — 아래 짝 검사가 «표시와 실제» 를 맞춰 본다.
//    ⛔ 숫자(176)를 못 박지 마세요 — 사다리 글이 늘면 정당하게 늘어납니다. 물어야 할 것은 «데이터 = 그림책 있는 글» 입니다.
const BOOKED = L.passages.filter((p) => p.book !== false);
ok(files.length === BOOKED.length && BOOKED.length > 48, `그림책 데이터 ${files.length}개 == 그림책 있는 사다리 글 ${BOOKED.length}편 (48편보다 많다)`);
ok(BOOKED.every((p) => files.includes(p.id)), '그림책이 있다고 된 글에는 모두 그림책 데이터가 있다');
ok(L.passages.filter((p) => p.book === false).every((p) => !files.includes(p.id) && !existsSync(join(ROOT, 'cloudflare-deploy', 'public', 'story-' + p.id + '.html'))), 'book:false 인 글에는 그림책 데이터·페이지가 없다(짝 — 표시와 실제가 어긋나지 않게)');

const tuneKeys = new Map(), titles = new Set(), ids = new Set();
const allAns = [0, 0, 0], allSum = [0, 0, 0];
for (const id of files) {
  const p = L.passages.find((x) => x.id === id);
  const d = JSON.parse(readFileSync(join(DATA_DIR, id + '.json'), 'utf8'));
  const tag = id + ' ';
  const errs = validate(d, p);
  ok(artCatalog.books[id] === d.img.style, tag + '목록과 그림책의 화풍이 같다');
  if (p.stage >= 3) {
    const babyStyle = structuredClone(d); babyStyle.img.style = 'clay';
    ok(validate(babyStyle, p).some(e => e.includes('화풍')), tag + '청소년 단계의 유아 화풍을 거부한다');
  }
  ok(errs.length === 0, tag + '데이터 검사(validate.mjs)' + (errs.length ? ': ' + errs.slice(0, 3).join(' / ') : ''));
  if (!p || errs.length) continue;
  const file = join(PUB, `story-${id}.html`);
  ok(existsSync(file), tag + '페이지가 있다');
  if (!existsSync(file)) continue;
  const html = readFileSync(file, 'utf8');
  ok(html.includes('data-style="' + d.img.style + '"'), tag + '화풍 배지가 있다');
  for (const key of ['cover', ...Object.keys(d.img.scenes)]) {
    const asset = id + '-' + (key === 'cover' ? key : 's' + key) + '.webp?v=' + d.img.ver[key];
    ok(Number.isInteger(d.img.ver[key]) && html.includes(asset), tag + key + ' 그림 캐시 버전이 데이터와 같다');
  }
  const no = L.passages.filter((x) => x.stage === p.stage).indexOf(p) + 1;
  // ① 생성기 결과 == 지금 파일 (BUILD 스탬프 줄은 배포가 박으므로 뺀다)
  const unstamp = (h) => h.replace(/\n?<!-- BUILD:[^>]*-->/g, '');
  let fresh = false; try { fresh = unstamp(buildPage(tpl, p, d, no)) === unstamp(html); } catch (e) { fresh = false; }
  ok(fresh, tag + '페이지가 생성기 결과와 같다 (손으로 고치지 말고 node scripts/ladder-storybooks/build.mjs)');

  // ② 정본 실행
  const cs = html.indexOf('/* STORY-CORE-START'), ce = html.indexOf('/* STORY-CORE-END */');
  let C = null, P = null, R = null, ID = null, WP = null;
  try { ({ C, P, R, ID, WP } = new Function(html.slice(cs, ce) + '\nreturn { C: StoryCore, P: STORY_POINTS, R: STORY_RULE, ID: STORY_ID, WP: WRITE_PAT };')()); } catch (e) { /* 아래에서 FAIL */ }
  ok(!!(C && C.gradeKey && C.checkWrite && WP), tag + '정본(StoryCore)·WRITE_PAT 실행');
  if (!C) continue;
  ok(ID === id && !ids.has(ID), tag + 'STORY_ID 가 글 id 와 같고 겹치지 않는다'); ids.add(ID);
  ok(R === 'story_read' && !!seed && Number(seed[1]) === P, tag + `포인트 규칙 story_read · ${P}P == 서버 ${seed && seed[1]}`);
  const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1];
  ok(!!title && !titles.has(title), tag + `제목 «${title}» 이 다른 권과 다름`); titles.add(title);

  const STORY = evl(literalAfter(html, 'var STORY = ')), SUM = evl(literalAfter(html, 'var SUM = ')), WORDS = evl(literalAfter(html, 'var WORDS = ')),
        QS = evl(literalAfter(html, 'var QS = ')), SC = evl(literalAfter(html, 'var SCENES = ')), TUNE = evl(literalAfter(html, 'var TUNE = '));
  ok(Array.isArray(STORY) && STORY.length === d.breaks.length && Array.isArray(QS) && QS.length === 3, tag + `본문 ${d.breaks.length}문단 · 근거 3문항`);
  if (!STORY || !QS || !SUM || !WORDS) continue;
  const SENTS = STORY.flat();
  // ③ 본문 = 사다리 글 그대로 (수준 유지)
  ok(SENTS.length === p.sentences.length && SENTS.every((s, i) => plain(s[0]) === plain(p.sentences[i].en)), tag + '본문이 사다리 글과 문장마다 같다');
  const roles = SENTS.map((s) => s[1]);
  ok(roles.indexOf('P') === d.key.P && roles.indexOf('S') === d.key.S && roles.filter((r) => r === 'P').length === 1 && roles.filter((r) => r === 'S').length === 1, tag + '핵심문장 두 칸이 데이터의 key 자리');
  const pairs = []; for (let i = 0; i < roles.length; i++) for (let j = i + 1; j < roles.length; j++) pairs.push([i, j]);
  bulk(tag + '핵심문장 두 개 — P·S 둘 다일 때만 만점', pairs, ([i, j]) => C.gradeKey([roles[i], roles[j]]).full === (new Set([roles[i], roles[j]]).has('P') && new Set([roles[i], roles[j]]).has('S')));

  const items = SUM.filter((x) => x.ans);
  const ans = items.map((x) => x.ans);
  const combos = []; const rec = (k, acc) => { if (k === items.length) { combos.push(acc); return; } for (const v of ['', ...items[k].opts]) rec(k + 1, acc.concat(v)); }; rec(0, []);
  bulk(tag + '요점정리 4^5 조합 채점', combos, (v) => { const g = C.gradeSum(v, ans); const n = v.filter((x, i) => x && x === ans[i]).length, e = v.filter((x) => !x).length; return g.ok === n && g.empty === e && g.full === (e === 0 && n === 5); });

  const storyN = SENTS.map((s) => C.normQ(s[0]));
  bulk(tag + '근거 후보 문장이 본문에 «글자 그대로»', QS.flatMap((q) => q.evs), (e) => storyN.includes(C.normQ(e)) || e);
  ok(QS.map((q) => q.type[0]).join() === '원인·결과,문맥상 의미,단서 연결', tag + '세 유형');
  // 정답 자리가 한쪽에 몰리면 «A 만 찍어도» 맞는다 (2026-10-18 데이터는 정답을 첫 칸에 적어 두고 생성기가 섞음)
  const sumPos = SUM.filter((x) => x.ans).map((x) => x.opts.indexOf(x.ans));
  ok(new Set(sumPos).size >= 2, tag + `요점정리 정답 자리가 고르다 (${sumPos.join(',')})`);
  ok(new Set(QS.map((q) => q.ans)).size >= 2, tag + `근거 문항 정답 자리가 고르다 (${QS.map((q) => 'ABC'[q.ans]).join('')})`);
  ok(!QS.every((q) => q.ev.includes(0)), tag + '근거 정답이 언제나 첫 후보에 있지 않다');
  for (const q of QS) { allAns[q.ans]++; }
  for (const x of sumPos) allSum[x]++;
  for (const [qi, q] of QS.entries()) {
    const subs = [[]]; for (let i = 0; i < 4; i++) subs.push([i]); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i !== j) subs.push([i, j]);
    const cases = []; for (const a of [null, 0, 1, 2]) for (const e of subs) cases.push({ a, e });
    bulk(tag + `Q${qi + 1} 답×근거 상태`, cases, ({ a, e }) => {
      const g = C.gradeQ(q, a, e);
      if (a == null) return g.status === 'need_a';
      if (e.length < q.ev.length) return g.status === 'need_e';
      const aOk = a === q.ans, eOk = e.length === q.ev.length && e.every((x) => q.ev.includes(x));
      return g.status === (aOk && eOk ? 'full' : aOk ? 'a_only' : eOk ? 'e_only' : 'none');
    });
  }

  // ④ 바꿔 쓰기
  ok(WP.pre === d.write.pre && WP.mid === d.write.mid && WP.sep === d.write.sep, tag + `틀 «${WP.pre} ___${WP.sep === ', ' ? ',' : ''} ${WP.mid} ___.»`);
  const chips = JSON.parse((html.match(/var WRITE_EX = (\[.*?\]);\n/) || [0, '[]'])[1])   // 2026-10-20 버튼 줄을 뺀 뒤 예시 문장은 이 목록에만(철자 점검 «아는 낱말»);
  const shape = new RegExp('^' + reEsc(WP.pre) + ' [^ ,].*' + reEsc(WP.sep + WP.mid) + ' [^ ].*\\.$');
  ok(chips.length === 3, tag + '예시 문장 3개(WRITE_EX)');
  bulk(tag + '예시 문장이 틀 모양으로 완성', chips, ([a, b]) => { const r = C.checkWrite(a, b); return (r.ok && shape.test(r.sentence)) || r.sentence; });
  bulk(tag + '(짝) 빈칸·한글은 완성 안 됨', [['', 'x'], ['x', ''], ['숙제 하기', 'dinner'], ['go', '엄마 오기']], ([a, b]) => C.checkWrite(a, b).ok === false);

  // ⑤ 낱말·그림·음악
  bulk(tag + '뜻 맞히기 시드 60개', Array.from({ length: 60 }, (_, i) => i * 7919 + 1), (sd) => {
    const W = C.wordQuiz(WORDS, sd); return W.length === 6 && W.every((it) => it.opts.length === 3 && new Set(it.opts).size === 3 && it.opts[it.ans] === it.idx);
  });
  const imgs = [...new Set([...html.matchAll(/(img\/story\/[a-z0-9-]+\.webp)/g)].map((m) => m[1]))];
  ok(imgs.length === 3 && imgs.every((f) => f.includes(id + '-') && existsSync(join(PUB, f)) && statSync(join(PUB, f)).size < 400000),
    tag + `그림 3장이 실제 파일 (각 400KB 미만) — ${imgs.map((f) => f + (existsSync(join(PUB, f)) ? '' : '(없음)')).join(', ')}`);
  ok(SC && Object.keys(SC).every((k) => Number(k) > 0 && Number(k) < STORY.length), tag + '장면 그림이 문단 사이');
  ok(!!TUNE && TUNE.melody.reduce((a, b) => a + b[1], 0) === TUNE.chords.length * TUNE.beats, tag + '배경음악 멜로디 박자 == 반주 박자');
  if (TUNE) { const k = JSON.stringify([TUNE.chords, TUNE.melody]); ok(!tuneKeys.has(k), tag + `배경음악이 다른 권과 다르다${tuneKeys.has(k) ? ' (' + tuneKeys.get(k) + ' 와 같음)' : ''}`); tuneKeys.set(k, id); }
  // 틀 흔적은 «틀 제목 전체» 로 본다 — 낱말 «Birthday» 하나면 생일 이야기 본문(s1-15·s3-17)에 걸린다(2026-10-19).
  ok(!/Missing Birthday Cake|Biscuit|Grandma Rose|birthday-cake|Party Kitchen|Red Umbrella/.test(html), tag + '틀(2권)·1권 흔적이 없다');
  ok(map.includes(`href="/story-${id}.html"`), tag + '사이트 구성표에 등록');
  const strip = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const kos = [...strip.matchAll(/data-ko="([^"]*)" data-en="([^"]*)"/g)];
  ok(kos.length > 30 && kos.every((m) => m[1] && m[2]), tag + `화면 문구 한/영 짝 (${kos.length}곳)`);
}

console.log('\n══════ 사다리 배선 ══════');
ok(/href="\/story-' \+ esc\(p\.id\) \+ '\.html"/.test(ladderJs), '사다리 읽기 화면에 «그림 동화책으로 읽기» 링크가 글 id 로');
ok(/'story_' \+ id \+ '_stamps'/.test(ladderJs) && /bookTag\(p\)/.test(ladderJs) && /function hasBook\(p\) \{ return !!p && p\.book !== false; \}/.test(ladderJs), '목록이 그림책 도장 수를 같은 저장칸에서 읽어 보여 준다');
ok(Math.min(...allAns) >= 30 && Math.min(...allSum) >= 50, `전체 정답 자리 분포가 고르다 (근거 ${allAns.join('/')} · 요점 ${allSum.join('/')})`);
const lv = (readFileSync(join(PUB, 'stories.html'), 'utf8').match(/reading-ladder\.js\?v=(\d+)/) || [])[1];
ok(Number(lv) >= 3, `stories.html 이 reading-ladder.js 새 버전을 부른다 (v=${lv})`);
const stageImg = files.map((id) => Number(id[1]));
const want12 = BOOKED.filter((p) => p.stage <= 2).length, want34 = BOOKED.filter((p) => p.stage >= 3).length;
ok(stageImg.filter((s) => s <= 2).length === want12 && stageImg.filter((s) => s >= 3).length === want34 && want12 > 24 && want34 > 24,
  `1~2단계 ${want12}권 · 3~4단계 ${want34}권 — 단계별로 빠진 권이 없다`);

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}  (조합 ${CASES}개)`);
process.exit(FAIL ? 1 : 0);
