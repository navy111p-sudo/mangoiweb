/* ═══════════════════════════════════════════════════════════════════════════
   📖 A.i 동화책 «The Red Umbrella» (심화1) 감시 — 2026-10-09 신설

   [무엇을 지키나]
     ① 채점 정본(StoryCore)이 옳은가 — 화면에서 오려 내 «모든 조합» 을 실제로 돌립니다
        (핵심문장 쌍 전부 · 요점정리 빈칸 4^5 · 근거찾기 답×근거 전부 · 바꿔쓰기 입력 · 낱말게임 시드 수백 개)
     ② 근거 문장이 본문에 «글자 그대로» 있는가 — 없으면 «본문에서 근거 보기» 가 조용히 아무것도 안 칠합니다
     ③ 화면이 그 정본을 «실제로 부르는가» (배선) — 판정만 옳고 안 부르면 아무것도 안 지켜집니다
     ④ 포인트: 서버 `/api/points/earn-by-rule` 를 esbuild 로 묶어 **진짜 SQLite 위에서 실행**합니다
        - 화면 금액(STORY_POINTS) == 서버 규칙 금액 · 하루 2번 · 게임·퀴즈 30점 묶음 · 전체 100점
        - 남의 계정(토큰 없음)은 401 · 본인 토큰이면 적립 · 원장(point_transactions)에 한 줄
     ⑤ 변이시험: 정본을 일부러 망가뜨려 위 검사가 실제로 FAIL 하는지 (짝 검사가 헛돌지 않는지)
   ⛔ D1 은 건드리지 않습니다 — 전부 메모리 SQLite 입니다.
   ═══════════════════════════════════════════════════════════════════════════ */
process.env.TZ = 'Asia/Seoul';
import { readFileSync, mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
const PAGE = process.env.STORY_SRC || join(PUB, 'story-red-umbrella.html');
let PASS = 0, FAIL = 0, CASES = 0;
const ok = (c, m) => { if (c) { PASS++; console.log('  ✅ ' + m); } else { FAIL++; console.log('  ❌ ' + m); } };
/** 많은 조합을 돌리는 검사 — 줄마다 찍지 않고 «몇 개 중 몇 개» 로 요약합니다. */
function bulk(name, cases, fn) {
  let bad = 0, firstBad = '';
  for (const c of cases) { CASES++; let r; try { r = fn(c); } catch (e) { r = 'throw ' + e.message; } if (r !== true) { bad++; if (!firstBad) firstBad = JSON.stringify(c).slice(0, 160) + ' → ' + r; } }
  ok(bad === 0 && cases.length > 0, `${name} — ${cases.length}조합` + (bad ? ` 중 ${bad}개 틀림 (예: ${firstBad})` : ''));
}

const html = readFileSync(PAGE, 'utf8');
/** 대괄호·중괄호 짝으로 리터럴을 오려 냅니다(문자열 안 괄호는 건너뜀). */
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

console.log('\n[ ⓪ 전제 — 정본과 데이터를 오려 냈다 ]');
const cs = html.indexOf('/* STORY-CORE-START'), ce = html.indexOf('/* STORY-CORE-END */');
ok(cs > 0 && ce > cs, '정본 블록(STORY-CORE)이 있다');
let C = null, POINTS = null, RULE = null;
try {
  const f = new Function(html.slice(cs, ce) + '\nreturn { C: StoryCore, P: STORY_POINTS, R: STORY_RULE };');
  const o = f(); C = o.C; POINTS = o.P; RULE = o.R;
} catch (e) { console.log('     ' + e.message); }
ok(!!(C && C.gradeKey && C.gradeQ && C.checkWrite && C.earnView), '정본을 실제로 실행할 수 있다');
const ev = (lit) => { try { return new Function('return ' + lit)(); } catch { return null; } };
const STORY = ev(literalAfter(html, 'var STORY = ')), SUM = ev(literalAfter(html, 'var SUM = ')),
      WORDS = ev(literalAfter(html, 'var WORDS = ')), QS = ev(literalAfter(html, 'var QS = ')), ENDS = ev(literalAfter(html, 'var ENDS = '));
ok(Array.isArray(STORY) && STORY.length >= 10, `본문 문단을 읽었다 (${STORY && STORY.length}개)`);
ok(Array.isArray(SUM) && Array.isArray(WORDS) && Array.isArray(QS) && QS.length === 3, '요점·낱말·근거 문항을 읽었다');
ok(Array.isArray(ENDS) && ENDS.length === 2, '보너스 투표(재미요소)가 남아 있다');
if (!C || !STORY || !QS) { console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}`); process.exit(1); }
const SENTS = STORY.flat();

console.log('\n[ ① 핵심문장 — 본문 문장 «모든 쌍» ]');
{
  const roles = SENTS.map((s) => s[1]);
  ok(roles.filter((r) => r === 'P').length === 1 && roles.filter((r) => r === 'S').length === 1, '본문에 «문제»·«해결» 핵심 문장이 하나씩 있다');
  const pairs = [];
  for (let i = 0; i < roles.length; i++) for (let j = i + 1; j < roles.length; j++) pairs.push([i, j]);
  bulk('두 문장을 고르면 P·S 둘 다일 때만 만점', pairs, ([i, j]) => {
    const g = C.gradeKey([roles[i], roles[j]]); const want = new Set([roles[i], roles[j]]).has('P') && new Set([roles[i], roles[j]]).has('S');
    return g.full === want && g.hit === [roles[i], roles[j]].filter((r) => r !== 'd').length ? true : JSON.stringify(g);
  });
  bulk('(짝) 한 개·세 개는 만점이 아니다', [[0], [0, 1, 2], ['P'], ['P', 'S', 'd']], (r) => C.gradeKey(r.map((x) => typeof x === 'number' ? roles[x] : x)).full === false);
}

console.log('\n[ ② 요점정리 — 빈칸 5개 × (빈칸·보기3) = 4^5 ]');
{
  const items = SUM.filter((x) => x.ans);
  ok(items.length === 5 && items.every((x) => x.opts.includes(x.ans) && new Set(x.opts).size === 3), '빈칸 5개 · 보기 3개 · 정답이 보기 안에');
  const combos = [];
  const rec = (k, acc) => { if (k === items.length) { combos.push(acc); return; } for (const v of ['', ...items[k].opts]) rec(k + 1, acc.concat(v)); };
  rec(0, []);
  const ans = items.map((x) => x.ans);
  bulk('맞은 수·빈칸 수·만점 판정', combos, (vals) => {
    const g = C.gradeSum(vals, ans);
    const okN = vals.filter((v, i) => v && v === ans[i]).length, empty = vals.filter((v) => !v).length;
    return g.ok === okN && g.empty === empty && g.full === (empty === 0 && okN === 5) && g.marks.length === 5 ? true : JSON.stringify(g);
  });
  const story = SENTS.map((s) => s[0]).join(' ').toLowerCase();
  bulk('요점정리 정답 낱말이 본문에 실제로 나온다', items, (x) => story.includes(x.ans.toLowerCase()) || x.ans);
}

console.log('\n[ ③ 근거 찾기 — 답 × 근거 조합 전부 ]');
{
  const norm = (s) => C.normQ(s);
  const storyN = SENTS.map((s) => norm(s[0]));
  bulk('정답 근거 문장이 본문에 «글자 그대로» 있다 (근거 보기가 칠할 수 있다)', QS.flatMap((q) => q.ev.map((i) => q.evs[i])), (e) => storyN.includes(norm(e)) || e);
  bulk('문항마다 보기 3개·정답 1개·근거 후보 4개', QS, (q) => q.opts.length === 3 && q.ans >= 0 && q.ans < 3 && q.evs.length === 4 && q.ev.length >= 1 && q.ev.length <= 2);
  bulk('문항마다 한/영 유형·질문·해설이 다 있다 (EN/KO)', QS, (q) => q.type.length === 2 && q.qko && q.why.length === 2 && q.evq.length === 2 && q.why.every(Boolean));
  for (const [qi, q] of QS.entries()) {
    const cases = [];
    const subs = [[]];
    for (let i = 0; i < 4; i++) subs.push([i]);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) if (i !== j) subs.push([i, j]);
    for (const a of [null, 0, 1, 2]) for (const e of subs) cases.push({ a, e });
    let fulls = 0;
    bulk(`Q${qi + 1} 답(4)×근거(${subs.length}) — 상태가 규칙대로`, cases, ({ a, e }) => {
      const g = C.gradeQ(q, a, e);
      if (a == null) return g.status === 'need_a' || g.status;
      if (e.length < q.ev.length) return g.status === 'need_e' || g.status;
      const aOk = a === q.ans, eOk = e.length === q.ev.length && e.every((x) => q.ev.includes(x));
      const want = aOk && eOk ? 'full' : aOk ? 'a_only' : eOk ? 'e_only' : 'none';
      if (g.status === 'full') fulls++;
      return g.status === want || `${g.status}≠${want}`;
    });
    ok(fulls === (q.ev.length === 1 ? 1 : 2), `Q${qi + 1} 만점이 되는 조합은 «정답 + 정답 근거» 뿐 (${fulls}개 — 근거 순서만 다른 것 포함)`);
  }
  bulk('근거 칩: 개수를 넘기면 못 고르고, 다시 누르면 빠진다', QS.flatMap((q) => [0, 1, 2, 3].map((ei) => ({ q, ei }))), ({ q, ei }) => {
    const full = q.ev.length === 1 ? [ (ei + 1) % 4 ] : [ (ei + 1) % 4, (ei + 2) % 4 ];
    return C.toggleEvidence(q, full, ei) === null && JSON.stringify(C.toggleEvidence(q, [ei], ei)) === '[]' && C.toggleEvidence(q, [], ei).length === 1;
  });
}

console.log('\n[ ④ 바꿔 쓰기 — Let’s ___ before ___ ]');
{
  const chips = [...html.matchAll(/class="chip" data-a="([^"]+)" data-b="([^"]+)"/g)].map((m) => [m[1], m[2]]);
  ok(chips.length === 3, `예시 칩 3개 (${chips.length})`);
  bulk('예시 칩은 모두 «완성» 된다', chips, ([a, b]) => C.checkWrite(a, b).ok === true);
  const A = ['finish our homework', ' clean   my room. ', 'Let’s go home', "let's eat lunch", 'read a book!', 'feed the cat', 'call Grandma', 'brush our teeth'];
  const B = ['dinner is ready', 'Mom comes home', 'before it gets dark', 'the bell rings', 'school starts.', 'Dad gets angry', 'the movie begins', 'bedtime'];
  const cases = []; for (const a of A) for (const b of B) cases.push([a, b]);
  bulk('영어 두 칸이면 완성 · 문장 모양이 «Let’s … before ….» 하나', cases, ([a, b]) => {
    const r = C.checkWrite(a, b); const s = r.sentence;
    return r.ok && /^Let’s [^ ].* before [^ ].*\.$/.test(s) && !/before before/i.test(s) && !/Let’s let/i.test(s) && !/\.\.$/.test(s) && !/\s{2}/.test(s) ? true : s;
  });
  const bad = [['', 'x'], ['x', ''], ['   ', 'it rains'], ['숙제 하기', 'dinner'], ['go', '엄마 오기'], ['ㅋㅋ', 'x'], ['a'.repeat(80), 'b'.repeat(60)]];
  bulk('(짝) 빈칸·한글·너무 긴 것은 완성되지 않는다', bad, ([a, b]) => C.checkWrite(a, b).ok === false);
  ok(C.checkWrite('go', 'bed').more === true && C.checkWrite('finish our homework', 'dinner is ready').more === false, '«한 걸음 더» 는 before 뒤가 한 낱말일 때만');
}

console.log('\n[ ⑤ 뜻 맞히기 게임 — 시드 500개 ]');
{
  ok(WORDS.length === 6 && WORDS.every((w) => w[0] && w[1] && w[2].includes(w[0])), '낱말 6개 · 뜻 · 예문(낱말이 들어 있음)');
  const seeds = Array.from({ length: 500 }, (_, i) => i * 7919 + 1);
  bulk('문제 6개 · 보기 3개(중복 없음) · 정답이 그 낱말의 뜻', seeds, (sd) => {
    const L = C.wordQuiz(WORDS, sd);
    if (L.length !== 6 || new Set(L.map((x) => x.idx)).size !== 6) return 'len';
    for (const it of L) { if (it.opts.length !== 3 || new Set(it.opts).size !== 3) return 'opts'; if (it.opts[it.ans] !== it.idx || WORDS[it.idx][0] !== it.en) return 'ans'; }
    return true;
  });
  const same = JSON.stringify(C.wordQuiz(WORDS, 42)) === JSON.stringify(C.wordQuiz(WORDS, 42));
  const diff = new Set(seeds.slice(0, 50).map((s) => C.wordQuiz(WORDS, s).map((x) => x.idx).join())).size;
  ok(same && diff > 10, `같은 시드는 같은 문제, 시드가 다르면 순서가 섞인다 (서로 다른 순서 ${diff}가지)`);
  const pos = [0, 0, 0]; for (const s of seeds) for (const it of C.wordQuiz(WORDS, s)) pos[it.ans]++;
  ok(pos.every((n) => n > 600), `정답 자리가 한쪽에 몰리지 않는다 (A ${pos[0]} · B ${pos[1]} · C ${pos[2]})`);
}

console.log('\n[ ⑥ 도장 · 포인트 판정 ]');
{
  const K = C.STAMPS;
  ok(K.length === 6 && K.join() === 'read,key,sum,words,infer,write', '도장 6개(읽기·핵심·요점·낱말·근거·바꿔쓰기)');
  const all = []; for (let m = 0; m < 64; m++) { const st = {}; K.forEach((k, i) => { if (m & (1 << i)) st[k] = 1; }); all.push(st); }
  bulk('도장 64조합 × (오늘 받음·보내는 중) — 6개 다 + 안 받음 + 안 보내는 중일 때만 요청', all.flatMap((st) => [[st, 0, 0], [st, 1, 0], [st, 0, 1], [st, 1, 1]]),
    ([st, p, f]) => C.shouldEarn(st, !!p, !!f) === (Object.keys(st).length === 6 && !p && !f));
  const R = [
    [{ ok: true, rule: { amount: 10 }, newBalance: 120 }, null, 'ok'],
    [{ ok: true, rule: { amount: 0 } }, null, 'error'],
    [{ ok: false, error: 'daily_cap_reached', cap: 2 }, null, 'cap'],
    [{ ok: false, error: 'game_daily_cap_reached', message_ko: '게임·퀴즈 포인트는 하루 30점까지예요.' }, null, 'cap'],
    [{ ok: false, error: 'daily_total_cap_reached' }, null, 'cap'],
    [{ ok: false, error: 'auth_required' }, null, 'login'],
    [{ ok: false, error: 'rule_not_found_or_disabled' }, null, 'off'],
    [{ ok: false, error: 'http_500' }, null, 'error'],
    [null, new TypeError('Failed to fetch'), 'sample'],
    [null, true, 'sample'],
    ['oops', null, 'sample'],
  ];
  bulk('서버 응답 모양 → 화면이 할 말 (미리보기)', R, ([r, e, k]) => C.earnView(r, e, false).kind === k || C.earnView(r, e, false).kind);
  bulk('(짝) 사이트에서 연결이 끊기면 «미리보기» 가 아니라 «다시 받기»', R.filter((x) => x[2] === 'sample'), ([r, e]) => C.earnView(r, e, true).kind === 'error' || C.earnView(r, e, true).kind);
  bulk('사이트 주소 판정', [['mangoi.ai', 1], ['www.mangoi.ai', 1], ['test.mangoi.co.kr', 1], ['localhost', 1], ['127.0.0.1', 1], ['mangoi.ai.evil.com', 0], ['claude.ai', 0], ['xmangoi.ai', 0], ['', 0]],
    ([h, w]) => C.isSiteHost(h) === !!w);
  ok(C.earnView(R[0][0]).amount === 10 && C.earnView(R[0][0]).balance === 120, '받은 금액·잔액을 서버 값 그대로');
  ok(C.earnView(R[3][0]).ko.includes('30점'), '상한 문구는 서버가 준 말을 그대로');
  ok(C.kstDay(Date.parse('2026-10-09T15:30:00Z')) === '2026-10-10' && C.kstDay(Date.parse('2026-10-09T14:30:00Z')) === '2026-10-09', '«오늘» 은 KST 자정 기준');
}

console.log('\n[ ⑦ 배선 — 화면이 정본을 «실제로» 부르는가 ]');
{
  const main = html.slice(html.indexOf('// role:'), html.indexOf('/* 🏅 도장판'));
  const fun = html.slice(html.indexOf('/* 🏅 도장판'));
  ok(/StoryCore\.gradeKey\(/.test(main) && /if \(gk\.full\) \{ storyDone\('key'\)/.test(main), '핵심문장 채점 → 정본 + 만점일 때만 도장');
  ok(/StoryCore\.gradeSum\(/.test(main) && /var full = gs\.full; if \(full\) storyDone\('sum'\)/.test(main), '요점정리 채점 → 정본 + 만점일 때만 도장');
  ok(/StoryCore\.gradeQ\(/.test(main) && /StoryCore\.toggleEvidence\(/.test(main) && /\bif \(QST\.every\(function\(x\)\{ return x\.res && x\.res\.full; \}\)\) storyDone\('infer'\)/.test(main), '근거찾기 → 정본 + 세 문항 모두 만점일 때 도장');
  ok(/StoryCore\.checkWrite\(/.test(main) && /StoryCore\.buildSentence\(/.test(main), '바꿔쓰기 → 정본');
  const wcheck = main.slice(main.indexOf("getElementById('wcheck')"), main.indexOf("getElementById('wsay')"));
  ok(wcheck.indexOf("storyDone('write')") > wcheck.indexOf("cw.why === 'hangul'"), '(짝) 바꿔쓰기 도장은 빈칸·한글 검사를 «지난 뒤» 에만');
  ok(/WQS\.over = true; storyDone\('words'\)/.test(main) && /WQS\.list\.push\(it\)/.test(main), '낱말 게임: 틀린 낱말은 다시 나오고, 끝까지 맞혀야 도장');
  ok(/storyDone\('read'\)/.test(main) && /classList\.add\('reading'\)/.test(main), '읽기: 따라 읽기 강조 + 끝까지 들으면 도장');
  ok(!/function clean\(/.test(main) && !/var HANGUL = \/\[/.test(main), '(짝) 판정을 화면에 다시 적지 않았다(복제 없음)');
  ok(/rule_code: STORY_RULE/.test(fun) && RULE === 'story_read' && /'\/api\/points\/earn-by-rule'/.test(fun), '포인트 요청 → 기존 적립 API · story_read');
  ok(/earnView\(d, null, ON_SITE\)/.test(fun) && /earnView\(null, e \|\| true, ON_SITE\)/.test(fun), '요청 실패 판정에 «어디서 열었나» 를 넘긴다');
  ok(/StoryCore\.shouldEarn\(/.test(fun) && /if \(StoryCore\.allDone\(st\)\) \{/.test(fun), '요청은 «6개 다» 일 때만, 정본으로 판정');
  ok(!/allDone\(st\) && !paidToday\(\)\) earn\(\)/.test(fun), '(짝) 다시 열었다고 포인트를 보내지 않는다(6번째 도장 순간에만)');
  ok(!/student_name:/.test(fun), '이름 칸에 아이디를 보내지 않는다(서버 COALESCE 가 진짜 이름을 덮는 사고 방지)');
  ok(/mangoi_logged_user/.test(fun) && /uid \|\| a\.user_id \|\| a\.id/.test(fun) && /mangoi_guest_uid/.test(fun), '계정: uid‖user_id‖id → 없으면 고정 게스트 id');
  ok(/Authorization = 'Bearer ' \+ tok/.test(fun) && /token: tok/.test(fun), '로그인 토큰을 함께 보낸다(본인 적립 확인)');
  ok(/kind === 'ok' \|\| v\.kind === 'cap'\) \{ try \{ localStorage\.setItem\(paidKey\(\)/.test(fun), '«오늘 받음» 표시는 받았거나 상한일 때만(실패면 다시 받기 가능)');
  ok(/id="earnRetry"/.test(fun), '실패하면 «다시 받기» 버튼');
  ok(/prefers-reduced-motion/.test(fun) && /confetti/.test(fun) && /chime\(/.test(fun), '재미: 축하 효과·도장 소리 (움직임 줄이기 설정 존중)');
  ok(/id="bgm"/.test(html) && /window\.__bgm/.test(html) && /class="speed"/.test(html), '재미 유지: 배경음악·말 속도');
  ok(/id="ends"/.test(html) && /story_vote_/.test(main), '재미 유지: 다음 이야기 투표(보너스)');
}

console.log('\n[ ⑧ 사이트 규칙 ]');
{
  ok(/<html lang="ko">/.test(html) && /\/css\/mangoi-han\.css/.test(html) && /\/js\/back-nav\.js/.test(html), 'lang·한자 글꼴 정본·뒤로/홈 버튼');
  const imgs = [...html.matchAll(/(img\/story\/[a-z0-9-]+\.webp)/g)].map((m) => m[1]);
  ok(imgs.length === 3 && imgs.every((p) => existsSync(join(PUB, p))), `그림 3장(표지+장면2)이 실제 파일로 있다 (${imgs.length})`);
  ok(!/data:image/.test(html) && html.length < 200000, `그림을 HTML 에 넣지 않았다 (${html.length}B)`);
  const map = readFileSync(join(PUB, 'admin', 'site-structure-map.html'), 'utf8');
  ok(map.includes('href="/story-red-umbrella.html"'), '사이트 구성표에 등록');
  const strip = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  const kos = [...strip.matchAll(/data-ko="([^"]*)" data-en="([^"]*)"/g)];
  ok(kos.length > 30 && kos.every((m) => m[1] && m[2]), `화면 문구가 한/영 짝으로 (${kos.length}곳)`);
}

console.log('\n[ ⑨ 서버 — 진짜 적립 경로를 SQLite 위에서 실행 ]');
let esb = null;
try { esb = await import(pathToFileURL(join(ROOT, 'cloudflare-deploy', 'node_modules', 'esbuild', 'lib', 'main.js')).href); } catch {}
if (!esb) console.log('  ⏭  esbuild 가 없어 서버 실행 검사를 건너뜁니다 (cloudflare-deploy 에서 npm ci)');
else {
  const pts = readFileSync(join(SRC, 'api-points.ts'), 'utf8');
  const seed = pts.match(/VALUES \('story_read','[^']+',(\d+),(\d+),(\d+),1,/);
  ok(!!seed && Number(seed[1]) === POINTS, `서버 규칙 금액(${seed && seed[1]}) == 화면 STORY_POINTS(${POINTS})`);
  ok(!!seed && Number(seed[3]) === 2, '하루 2번까지');
  const pol = readFileSync(join(SRC, 'point-policy.ts'), 'utf8');
  const gq = pol.match(/GAME_QUIZ_RULES\s*=\s*\[([\s\S]*?)\]/);
  ok(!!gq && /'story_read'/.test(gq[1]), '게임·퀴즈 묶음(하루 30점)에 들어 있다');

  const dir = mkdtempSync(join(tmpdir(), 'story-'));
  const entry = join(dir, 'entry.ts');
  writeFileSync(entry, `export { handlePointsApi } from ${JSON.stringify(join(SRC, 'api-points.ts'))};\nexport { signUidToken } from ${JSON.stringify(join(SRC, 'auth-token.ts'))};\n`);
  const out = join(dir, 'b.mjs');
  let M = null;
  try {
    await esb.build({ entryPoints: [entry], bundle: true, format: 'esm', platform: 'neutral', outfile: out, logLevel: 'silent', mainFields: ['module', 'main'], conditions: ['worker', 'browser'] });
    M = await import(pathToFileURL(out).href);
  } catch (e) { console.log('     ' + String(e.message || e).slice(0, 300)); }
  ok(!!(M && M.handlePointsApi), '전제: 서버 적립 코드를 묶어 실행할 수 있다');
  if (M) {
    const { DatabaseSync } = await import('node:sqlite');
    function mkEnv() {
      const db = new DatabaseSync(':memory:');
      const wrap = (q, args) => { const st = () => db.prepare(q); return {
        all: async () => ({ results: st().all(...args) }), first: async (c) => { const r = st().get(...args) ?? null; return c && r ? r[c] : r; },
        run: async () => { const r = st().run(...args); return { meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } }; } }; };
      const env = { DB: { exec: async (q) => db.exec(q), prepare: (q) => ({ ...wrap(q, []), bind: (...a) => wrap(q, a) }),
                          batch: async (arr) => Promise.all(arr.map((x) => x.run())) },
                    ROOM_JWT_SECRET: 'harness-secret-0123456789abcdef', SINGLE_SESSION: 'off',
                    SESSION_STATE: { get: async () => null, put: async () => {}, delete: async () => {} } };
      return { db, env };
    }
    /* ⚠️ 서버 모듈은 «표를 한 번만 만든다» 는 플래그를 모듈 안에 들고 있어서, 새 DB 마다 모듈도 새로 불러야 합니다. */
    let gen = 0;
    const fresh = async (env) => { env.__M = await import(pathToFileURL(out).href + '?n=' + (++gen)); return env; };
    const call = async (env, body, tok) => {
      if (!env.__M) await fresh(env);
      const url = new URL('https://mangoi.ai/api/points/earn-by-rule');
      const req = new Request(url, { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, tok ? { Authorization: 'Bearer ' + tok } : {}), body: JSON.stringify(body) });
      const res = await env.__M.handlePointsApi(req, url, env);
      return { status: res.status, d: await res.json() };
    };
    const B = (uid) => ({ user_id: uid, rule_code: 'story_read', meta: { story: 'red-umbrella', via: 'story' } });
    // 게스트: 하루 2번 · 세 번째는 막힘
    const { db, env } = mkEnv();
    const r1 = await call(env, B('guest_abc123'));
    const r2 = await call(env, B('guest_abc123'));
    const r3 = await call(env, B('guest_abc123'));
    ok(r1.d.ok === true && r1.d.rule.amount === POINTS && r1.d.newBalance === POINTS, `1번째 완주 → +${POINTS}P (잔액 ${r1.d.newBalance})`);
    ok(r2.d.ok === true && r2.d.newBalance === POINTS * 2, '2번째 완주 → 또 적립');
    ok(r3.d.ok === false && r3.d.error === 'daily_cap_reached' && C.earnView(r3.d).kind === 'cap', '(짝) 3번째는 하루 2번 상한으로 막히고 화면은 «상한» 으로 말한다');
    const led = db.prepare(`SELECT COUNT(*) n, SUM(amount) s FROM point_transactions WHERE user_id='guest_abc123' AND rule_code='story_read'`).get();
    ok(led.n === 2 && led.s === POINTS * 2, `원장(point_transactions)에 2줄 · 합 ${led.s}P`);
    const meta = db.prepare(`SELECT meta FROM point_rule_log WHERE user_id='guest_abc123' LIMIT 1`).get();
    ok(meta && JSON.parse(meta.meta).story === 'red-umbrella', '어느 이야기였는지 meta 에 남는다');
    // 게임·퀴즈 묶음 30점 공유: 다른 게임으로 25점 쓴 날은 동화책이 막힘
    {
      const { db: d2, env: e2 } = mkEnv();
      await call(e2, B('guest_warm00'));    // 테이블 생성
      d2.prepare(`DELETE FROM point_transactions`).run(); d2.prepare(`DELETE FROM point_rule_log`).run(); d2.prepare(`UPDATE student_points SET balance=0, lifetime_earned=0`).run();
      const now = Date.now();
      d2.prepare(`INSERT INTO point_transactions (user_id,type,amount,balance_after,rule_code,created_at) VALUES ('guest_warm00','earn',25,25,'rescue_sentence',?)`).run(now);
      const r = await call(e2, B('guest_warm00'));
      ok(r.d.ok === false && r.d.error === 'game_daily_cap_reached' && C.earnView(r.d).kind === 'cap' && /30/.test(r.d.message_ko || ''), '게임·퀴즈 30점 묶음을 다른 게임과 나눠 쓴다(25점 쓴 날은 막힘)');
      d2.prepare(`DELETE FROM point_transactions`).run();
      d2.prepare(`INSERT INTO point_transactions (user_id,type,amount,balance_after,rule_code,created_at) VALUES ('guest_warm00','earn',15,15,'rescue_sentence',?)`).run(now);
      const r2b = await call(e2, B('guest_warm00'));
      ok(r2b.d.ok === true, '(짝) 15점만 쓴 날은 동화책 10점이 들어간다');
    }
    // 실계정: 토큰 없으면 401, 본인 토큰이면 적립, 남의 토큰이면 401
    {
      const { env: e3 } = mkEnv();
      const no = await call(e3, B('kim01'));
      ok(no.status === 401 && C.earnView(no.d).kind === 'login', '실계정인데 토큰이 없으면 401 → 화면은 «로그인하면 쌓여요»');
      const tok = await M.signUidToken('kim01', e3);
      const yes = await call(e3, B('kim01'), tok);
      ok(yes.d.ok === true && yes.d.rule.amount === POINTS, '본인 토큰이면 적립');
      const other = await M.signUidToken('lee02', e3);
      const steal = await call(e3, B('kim01'), other);
      ok(steal.status === 401, '(짝) 남의 토큰으로는 그 계정에 적립 못 한다');
    }
    // 수백 번: 서로 다른 게스트 200명이 각각 3번씩 → 정확히 2번만
    {
      const { db: d4, env: e4 } = mkEnv();
      let okN = 0, capN = 0, other = 0;
      for (let u = 0; u < 200; u++) for (let k = 0; k < 3; k++) {
        const r = await call(e4, B('guest_u' + String(u).padStart(4, '0')));
        CASES++; if (r.d.ok) okN++; else if (r.d.error === 'daily_cap_reached') capN++; else other++;
      }
      const tot = d4.prepare(`SELECT COUNT(*) n, SUM(amount) s FROM point_transactions WHERE rule_code='story_read'`).get();
      ok(okN === 400 && capN === 200 && other === 0 && tot.n === 400 && tot.s === 400 * POINTS, `게스트 200명 × 3번 = 600회 요청 → 적립 ${okN} · 상한 ${capN} · 원장 ${tot.n}줄`);
      const bad = d4.prepare(`SELECT COUNT(*) n FROM student_points WHERE balance <> ?`).get(POINTS * 2);
      ok(bad.n === 0, '200명 모두 잔액이 정확히 ' + POINTS * 2 + 'P');
    }
  }
}

console.log(`\n결과: PASS ${PASS} / FAIL ${FAIL}  (조합 ${CASES}개를 실제로 돌림)`);
process.exit(FAIL ? 1 : 0);
