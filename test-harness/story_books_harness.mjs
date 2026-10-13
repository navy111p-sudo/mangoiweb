/* ═══════════════════════════════════════════════════════════════════════════
   📚 A.i 동화책 2~4권 감시 — 2026-10-13 신설
      «The Missing Birthday Cake» · «Bolt Can Dance» · «The Map in the Library Book»

   세 권은 «The Red Umbrella»(story_red_umbrella_harness — 서버 적립을 SQLite 로 실행)와 같은 틀입니다.
   다른 점은 ⑥ 바꿔 쓰기 «틀» 하나(WRITE_PAT)라, 여기서는 권마다
     ① 정본(StoryCore)을 오려 내 실제로 돌리고 ② 근거 문장이 본문에 «글자 그대로» 있는지
     ③ 바꿔 쓰기가 그 권의 틀 모양으로만 문장을 만드는지 ④ 화면이 정본을 실제로 부르는지(배선)
     ⑤ 그림·사이트 구성표·포인트 금액이 맞는지 를 봅니다.
   ⛔ D1 은 건드리지 않습니다.
   ═══════════════════════════════════════════════════════════════════════════ */
process.env.TZ = 'Asia/Seoul';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
const BOOKS = [
  { file: 'story-birthday-cake.html', id: 'birthday-cake', pre: 'I think', mid: 'because', sep: ' ' },
  { file: 'story-robot-dance.html', id: 'robot-dance', pre: 'I can’t', mid: 'but I can', sep: ', ' },
  { file: 'story-treasure-map.html', id: 'treasure-map', pre: 'Let’s', mid: 'so that', sep: ' ' },
];
let PASS = 0, FAIL = 0, CASES = 0;
const ok = (c, m) => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; console.log('  ❌ ' + m); } };
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
const pts = readFileSync(join(SRC, 'api-points.ts'), 'utf8');
const seed = pts.match(/VALUES \('story_read','[^']+',(\d+),(\d+),(\d+),1,/);
const map = readFileSync(join(PUB, 'admin', 'site-structure-map.html'), 'utf8');
const ids = new Set(['red-umbrella']);
const titles = new Set();

for (const B of BOOKS) {
  console.log(`\n══════ ${B.file} ══════`);
  const PAGE = process.env.STORY_BOOK_SRC && process.env.STORY_BOOK_FILE === B.file ? process.env.STORY_BOOK_SRC : join(PUB, B.file);
  ok(existsSync(PAGE), '페이지가 있다');
  if (!existsSync(PAGE)) continue;
  const html = readFileSync(PAGE, 'utf8');
  const cs = html.indexOf('/* STORY-CORE-START'), ce = html.indexOf('/* STORY-CORE-END */');
  let C = null, P = null, R = null, ID = null, WP = null;
  try { const o = new Function(html.slice(cs, ce) + '\nreturn { C: StoryCore, P: STORY_POINTS, R: STORY_RULE, ID: STORY_ID, WP: WRITE_PAT };')(); ({ C, P, R, ID, WP } = o); } catch (e) { console.log('     ' + e.message); }
  ok(!!(C && C.gradeKey && C.checkWrite && WP), '정본(StoryCore)·바꿔쓰기 틀(WRITE_PAT)을 실제로 실행할 수 있다');
  if (!C) continue;
  ok(ID === B.id && !ids.has(ID), `이야기 id 가 «${B.id}» 이고 다른 권과 겹치지 않는다(도장·투표 저장칸이 갈림)`); ids.add(ID);
  ok(R === 'story_read' && !!seed && Number(seed[1]) === P, `포인트: 같은 규칙 story_read · 금액 ${P} == 서버 ${seed && seed[1]}`);
  const title = (html.match(/<title>([^<]+)<\/title>/) || [])[1];
  ok(!!title && !titles.has(title) && html.includes(`<h1>${title}</h1>`), `제목 «${title}» (다른 권과 다름)`); titles.add(title);
  ok(!/Red Umbrella|Mr\. Park|red-umbrella|Rainy Street/.test(html), '(짝) 1권 «The Red Umbrella» 의 글·그림·음악이 남아 있지 않다');

  const STORY = evl(literalAfter(html, 'var STORY = ')), SUM = evl(literalAfter(html, 'var SUM = ')), WORDS = evl(literalAfter(html, 'var WORDS = ')),
        QS = evl(literalAfter(html, 'var QS = ')), ENDS = evl(literalAfter(html, 'var ENDS = ')), SC = evl(literalAfter(html, 'var SCENES = ')),
        TUNE = evl(literalAfter(html, 'var TUNE = '));
  ok(Array.isArray(STORY) && STORY.length === 12 && Array.isArray(QS) && QS.length === 3 && Array.isArray(ENDS) && ENDS.length === 2, '본문 12문단 · 근거 3문항 · 투표 2개');
  if (!STORY || !QS || !SUM || !WORDS) continue;
  const SENTS = STORY.flat();
  const words = SENTS.map((s) => s[0]).join(' ').replace(/[^A-Za-z' ]/g, ' ').split(/\s+/).filter(Boolean).length;
  ok(words >= 280 && words <= 460, `분량 ${words}단어 (1권 296단어와 비슷한 280~460)`);
  const meta = (html.match(/data-en="about (\d+) words"/) || [])[1];
  ok(meta && Math.abs(Number(meta) - words) <= 30, `화면 «약 ${meta}단어» 가 실제(${words})와 30 안`);

  // ① 핵심문장
  const roles = SENTS.map((s) => s[1]);
  ok(roles.filter((r) => r === 'P').length === 1 && roles.filter((r) => r === 'S').length === 1 && roles.indexOf('P') < roles.indexOf('S'), '«문제» 문장 1개가 «해결» 문장 1개보다 앞에');
  const pairs = []; for (let i = 0; i < roles.length; i++) for (let j = i + 1; j < roles.length; j++) pairs.push([i, j]);
  bulk('핵심문장 두 개 고르기 — P·S 둘 다일 때만 만점', pairs, ([i, j]) => C.gradeKey([roles[i], roles[j]]).full === (new Set([roles[i], roles[j]]).has('P') && new Set([roles[i], roles[j]]).has('S')));

  // ② 요점정리
  const items = SUM.filter((x) => x.ans);
  ok(items.length === 5 && items.every((x) => x.opts.length === 3 && new Set(x.opts).size === 3 && x.opts.includes(x.ans)), '빈칸 5개 · 보기 3개 · 정답이 보기 안에');
  const lower = SENTS.map((s) => s[0]).join(' ').toLowerCase();
  bulk('요점정리 정답 낱말이 본문에 실제로 나온다', items, (x) => lower.includes(x.ans.toLowerCase()) || x.ans);
  const pos = items.map((x) => x.opts.indexOf(x.ans));
  ok(new Set(pos).size >= 2, `정답 자리가 한쪽에 몰리지 않는다 (${pos.join(',')})`);
  const combos = []; const rec = (k, acc) => { if (k === items.length) { combos.push(acc); return; } for (const v of ['', ...items[k].opts]) rec(k + 1, acc.concat(v)); }; rec(0, []);
  const ans = items.map((x) => x.ans);
  bulk('요점정리 4^5 조합 채점', combos, (v) => { const g = C.gradeSum(v, ans); const n = v.filter((x, i) => x && x === ans[i]).length, e = v.filter((x) => !x).length; return g.ok === n && g.empty === e && g.full === (e === 0 && n === 5); });

  // ③ 근거 찾기
  const storyN = SENTS.map((s) => C.normQ(s[0]));
  bulk('정답 근거 문장이 본문에 «글자 그대로» 있다', QS.flatMap((q) => q.ev.map((i) => q.evs[i])), (e) => storyN.includes(C.normQ(e)) || e);
  bulk('오답 근거 후보도 본문 문장이다(엉뚱한 지어낸 문장 아님)', QS.flatMap((q) => q.evs), (e) => storyN.includes(C.normQ(e)) || e);
  bulk('문항: 보기 3·정답 1·근거 후보 4·근거 1~2·한/영', QS, (q) => q.opts.length === 3 && q.ans >= 0 && q.ans < 3 && q.evs.length === 4 && q.ev.length >= 1 && q.ev.length <= 2 && new Set(q.evs).size === 4 && q.type.length === 2 && q.why.length === 2 && q.evq.length === 2 && !!q.qko);
  ok(QS.map((q) => q.type[0]).join() === '원인·결과,문맥상 의미,단서 연결', '세 유형(원인·결과 / 문맥상 의미 / 단서 연결)');
  ok(QS.every((q) => q.evq[0].includes(String(q.ev.length))), '«근거 N개를 고르세요» 의 N 이 실제 근거 수와 같다');
  ok(new Set(QS.map((q) => q.ans)).size >= 2, `정답 보기 자리가 한쪽에 몰리지 않는다 (${QS.map((q) => 'ABC'[q.ans]).join('')})`);
  for (const [qi, q] of QS.entries()) {
    const subs = [[]]; for (let i = 0; i < 4; i++) subs.push([i]); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i !== j) subs.push([i, j]);
    const cases = []; for (const a of [null, 0, 1, 2]) for (const e of subs) cases.push({ a, e });
    bulk(`Q${qi + 1} 답×근거 상태`, cases, ({ a, e }) => {
      const g = C.gradeQ(q, a, e);
      if (a == null) return g.status === 'need_a';
      if (e.length < q.ev.length) return g.status === 'need_e';
      const aOk = a === q.ans, eOk = e.length === q.ev.length && e.every((x) => q.ev.includes(x));
      return g.status === (aOk && eOk ? 'full' : aOk ? 'a_only' : eOk ? 'e_only' : 'none');
    });
  }

  // ④ 바꿔 쓰기 — 그 권의 틀
  ok(WP.pre === B.pre && WP.mid === B.mid && WP.sep === B.sep, `틀: «${B.pre} ___${B.sep === ', ' ? ',' : ''} ${B.mid} ___.»`);
  const chips = [...html.matchAll(/class="chip" data-a="([^"]+)" data-b="([^"]+)"/g)].map((m) => [m[1], m[2]]);
  ok(chips.length === 3, `예시 칩 3개 (${chips.length})`);
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const shape = new RegExp('^' + esc(B.pre) + ' [^ ,].*' + esc(B.sep + B.mid) + ' [^ ].*\\.$');
  bulk('예시 칩은 모두 «완성» 되고 틀 모양 그대로', chips, ([a, b]) => { const r = C.checkWrite(a, b); return (r.ok && shape.test(r.sentence)) || r.sentence; });
  const A = ['play outside', '  eat   lunch. ', B.pre + ' go home', B.pre.replace('’', "'") + ' read a book', 'call Grandma!', 'Sing, '];
  const Bv = ['the sun is out', B.mid + ' it is late', (B.sep === ', ' ? ', ' : '') + B.mid + ' ride a bike', 'Mom is happy.', 'we can rest', 'Dad laughs'];
  const cases = []; for (const a of A) for (const b of Bv) cases.push([a, b]);
  bulk('영어 두 칸이면 완성 · 틀 낱말이 두 번 들어가지 않는다', cases, ([a, b]) => {
    const s = C.checkWrite(a, b).sentence || '';
    const lw = s.toLowerCase();
    return shape.test(s) && lw.split(B.mid.toLowerCase()).length === 2 && lw.split(B.pre.toLowerCase()).length === 2 && !/\s{2}|\.\.|,,|, ,/.test(s) ? true : s;
  });
  bulk('(짝) 빈칸·한글·너무 긴 것은 완성되지 않는다', [['', 'x'], ['x', ''], ['   ', 'it rains'], ['숙제 하기', 'dinner'], ['go', '엄마 오기'], ['a'.repeat(80), 'b'.repeat(60)]], ([a, b]) => C.checkWrite(a, b).ok === false);
  const src = (html.match(/<p class="pat-src">([\s\S]*?)<\/p>/) || [])[1] || '';
  const srcPlain = src.replace(/<[^>]+>/g, '').replace(/[“”"]/g, '').replace(/’/g, "'").replace(/[!.]$/, '');
  ok(SENTS.some((s) => s[0].replace(/"/g, '').replace(/’/g, "'").includes(srcPlain.replace(/[.!]$/, ''))), `본문 문장(틀의 출처)이 이야기에 실제로 있다: «${srcPlain}»`);
  ok(new RegExp('<span class="wfix">' + esc(B.pre) + '</span>').test(html) && html.includes(`<span class="wfix">${B.sep === ', ' ? ', ' : ''}${B.mid}</span>`), '입력칸 앞뒤 고정 글자가 틀과 같다');

  // ⑤ 낱말
  ok(WORDS.length === 6 && WORDS.every((w) => w[1] && w[2].toLowerCase().includes(w[0].toLowerCase())), '낱말 6개 · 뜻 · 예문(낱말 포함)');
  bulk('낱말이 본문에 나온다', WORDS, (w) => lower.includes(w[0].toLowerCase()) || w[0]);
  bulk('뜻 맞히기 시드 200개', Array.from({ length: 200 }, (_, i) => i * 7919 + 1), (sd) => {
    const L = C.wordQuiz(WORDS, sd); return L.length === 6 && L.every((it) => it.opts.length === 3 && new Set(it.opts).size === 3 && it.opts[it.ans] === it.idx);
  });

  // ⑥ 배선
  const main = html.slice(html.indexOf('// role:'), html.indexOf('/* 🏅 도장판'));
  const fun = html.slice(html.indexOf('/* 🏅 도장판'));
  ok(/if \(gk\.full\) \{ storyDone\('key'\)/.test(main) && /var full = gs\.full; if \(full\) storyDone\('sum'\)/.test(main), '핵심·요점 → 정본 + 만점일 때만 도장');
  ok(/QST\.every\(function\(x\)\{ return x\.res && x\.res\.full; \}\)\) storyDone\('infer'\)/.test(main) && /StoryCore\.toggleEvidence\(/.test(main), '근거찾기 → 세 문항 모두 만점일 때 도장');
  const wcheck = main.slice(main.indexOf("getElementById('wcheck')"), main.indexOf("getElementById('wsay')"));
  ok(/StoryCore\.checkWrite\(/.test(wcheck) && wcheck.indexOf("storyDone('write')") > wcheck.indexOf("cw.why === 'hangul'"), '바꿔쓰기 → 정본, 도장은 검사를 지난 뒤');
  ok(/var WKEY = 'story_' \+ STORY_ID \+ '_w'/.test(main) && !/'story_wa'/.test(main), '바꿔쓴 문장 저장칸이 권마다 따로(1권과 섞이지 않음)');
  ok(/WQS\.over = true; storyDone\('words'\)/.test(main) && /storyDone\('read'\)/.test(main), '낱말 게임·읽기 도장');
  ok(/rule_code: STORY_RULE/.test(fun) && /meta: \{ story: STORY_ID/.test(fun) && /StoryCore\.shouldEarn\(/.test(fun), '포인트 → 기존 적립 API · 어느 권인지 meta 에');
  ok(/'story_' \+ STORY_ID \+ '_stamps'/.test(fun) && /story_vote_' \+ STORY_ID/.test(main), '도장판·투표 저장칸이 권마다 따로');
  ok(/id="bgm"/.test(html) && /window\.__bgm/.test(html) && /class="speed"/.test(html) && /id="readAll"/.test(html) && /prefers-reduced-motion/.test(fun) && /confetti/.test(fun), '1권 기능 그대로: 배경음악·말 속도·처음부터 듣기·도장 소리·축하');
  ok(!!TUNE && TUNE.melody.reduce((a, b) => a + b[1], 0) === TUNE.chords.length * TUNE.beats, `배경음악 «${TUNE && TUNE.name}» 멜로디 박자 == 반주 박자 (한 바퀴가 맞물림)`);

  // ⑦ 사이트 규칙
  const imgs = [...html.matchAll(/(img\/story\/[a-z0-9-]+\.webp)/g)].map((m) => m[1]);
  ok(imgs.length === 3 && imgs.every((p) => p.includes(B.id) && existsSync(join(PUB, p)) && statSync(join(PUB, p)).size < 400000), `그림 3장이 이 권 이름으로 실제 파일 (각 400KB 미만) — ${imgs.join(', ')}`);
  ok(SC && Object.keys(SC).every((k) => Number(k) > 0 && Number(k) < 12), '장면 그림이 본문 문단 사이에 들어간다');
  ok(/<html lang="ko">/.test(html) && /\/css\/mangoi-han\.css/.test(html) && /\/js\/back-nav\.js/.test(html) && /\/js\/tts-short-text\.js/.test(html), 'lang·한자 글꼴·뒤로/홈·짧은 낱말 TTS');
  ok(map.includes(`href="/${B.file}"`), '사이트 구성표에 등록');
  const strip = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const kos = [...strip.matchAll(/data-ko="([^"]*)" data-en="([^"]*)"/g)];
  ok(kos.length > 30 && kos.every((m) => m[1] && m[2]), `화면 문구가 한/영 짝 (${kos.length}곳)`);
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}  (조합 ${CASES}개)`);
process.exit(FAIL ? 1 : 0);
