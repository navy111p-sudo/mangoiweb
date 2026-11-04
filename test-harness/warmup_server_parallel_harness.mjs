#!/usr/bin/env node
/* ⚡ 웜업 서버 «모델 부르기 전» 조회를 동시에 (2026-11-04 사장님 「처음 들어가면 특히 폰에서 늦다」 → 3번)
 *
 * 지키는 것
 *  A. handleWarmupChat — 조회 넷(교재 문맥·최근 교정·약점 낱말 — 교재 블록 안에 Neo4j 포함)을
 *     세션 기록·시스템 프롬프트 조립 «앞» 에서 시작하고, 원래 자리에서 «같은 순서» 로 sys 에 붙인다.
 *     (짝) 블록 본문은 «자기 문자열» 에만 쓴다 — 바깥 sys 를 건드리면 순서가 무너진다.
 *  B. warmupLessonContext — 질의를 동시에 보내되, 결과를 쓰는 순서·«4개면 멈춤» 은 예전과 같다.
 *     실제로 돌려(가짜 D1) «동시에 나갔는가» 와 «답이 순차판과 같은가» 를 짝으로 본다.
 *  C. handleWarmupContext — 언어 힌트 조회는 교재 조회 «전» 에 시작, 세션 기록은 Neo4j 와 함께 기다린다.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IDX = fs.readFileSync(process.env.WSP_IDX || path.join(ROOT, 'cloudflare-deploy/src/index.ts'), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (x !== undefined ? ' ' + String(typeof x === 'string' ? x : JSON.stringify(x)).slice(0, 300) : '')); } };
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
function bodyOf(src, head) {
  const i = src.indexOf(head); if (i < 0) return '';
  const o = src.indexOf('{', src.indexOf(')', i));
  let d = 0;
  for (let k = o; k < src.length; k++) { if (src[k] === '{') d++; else if (src[k] === '}') { d--; if (!d) return src.slice(i, k + 1); } }
  return '';
}

console.log('[A] handleWarmupChat — 미리 시작하고 같은 순서로 붙인다');
const W = strip(bodyOf(IDX, 'async function handleWarmupChat('));
ok('전제: 핸들러를 잘라 냈다', W.length > 2000);
const names = ['_preLesson', '_preMistake', '_preWeakWord'];
const startAt = names.map((n) => W.indexOf('const ' + n + ' = (async () => {'));
const awaitAt = names.map((n) => W.indexOf('sys += await ' + n + ';'));
const sysDecl = W.indexOf('let sys = ctxLang');
const logAt = W.indexOf('await logWarmupSessionStart(env');
ok('세 조회를 모두 미리 시작한다', startAt.every((x) => x > 0), startAt);
ok('세션 기록을 기다리기 «전» 에 시작한다', startAt.every((x) => x > 0 && x < logAt), { startAt, logAt });
ok('프롬프트 조립(let sys) «전» 에 시작한다', startAt.every((x) => x > 0 && x < sysDecl));
ok('붙이는 순서가 예전 그대로(교재 → 최근 교정 → 약점 낱말)', awaitAt.every((x) => x > 0) && awaitAt[0] < awaitAt[1] && awaitAt[1] < awaitAt[2], awaitAt);
ok('붙이는 자리는 «오늘의 주제» 줄 바로 뒤', (() => { const t = W.indexOf("if (lessonTopic) sys += "); return t > 0 && t < awaitAt[0] && W.slice(t, awaitAt[0]).split('\n').length <= 3; })());
ok('반복 방지 줄보다 앞에서 다 붙인다', awaitAt[2] > 0 && awaitAt[2] < W.indexOf("sys += ' [중요] 이전 대화에서"));
/* 짝: 각 블록이 «자기» sys 를 갖는다 — 바깥 sys 에 바로 쓰면 그 블록이 끝나는 순서대로 섞인다 */
for (const n of names) {
  const s0 = W.indexOf('const ' + n + ' = (async () => {');
  const blk = s0 > 0 ? W.slice(s0, W.indexOf("})().catch(() => '');", s0)) : '';
  ok(n + ': 블록 안에서 자기 sys 를 선언한다', /\(async \(\) => \{ let sys = '';/.test(blk));
  ok(n + ': 블록이 자기 sys 를 돌려준다', /return sys; $/.test(blk.trimEnd() + ' ') || /return sys;\s*$/.test(blk));
}
ok('던지면 빈 문자열(그 줄만 안 붙음)', (W.match(/\}\)\(\)\.catch\(\(\) => ''\);/g) || []).length === 3);
ok('모델 호출보다 «앞» 에서 다 기다린다', awaitAt[2] > 0 && awaitAt[2] < W.indexOf('env.AI.run(WARMUP_MODEL'));

/* 실제로 돌려 «동시» 와 «순서» 를 짝으로 — 바깥 조립 부분만 흉내 낸다 */
{
  const seg = W.slice(startAt[0], W.indexOf('sys += await _preWeakWord;') + 'sys += await _preWeakWord;'.length);
  const starts = [];
  const tasks = { lesson: [60, ' L'], mistake: [10, ' M'], weak: [30, ' W'] };
  const delay = (k) => { starts.push(k); return new Promise((r) => setTimeout(() => r(tasks[k][1]), tasks[k][0])); };
  /* 블록 본문을 «한 단계 조회 + 한 줄 붙이기» 로 갈아 끼운 사본 — 감싸는 틀(시작·기다림·순서)만 재는 것 */
  const re = (n, k) => new RegExp('const ' + n + " = \\(async \\(\\) => \\{ let sys = '';[\\s\\S]*?return sys; \\}\\)\\(\\)\\.catch\\(\\(\\) => ''\\);");
  let sim = seg;
  [['_preLesson', 'lesson'], ['_preMistake', 'mistake'], ['_preWeakWord', 'weak']].forEach(([n, k]) => {
    sim = sim.replace(re(n), `const ${n} = (async () => { let sys = ''; sys += await delay('${k}'); return sys; })().catch(() => '');`);
  });
  sim = sim.replace(/if \(history\.length === 0\) \{[\s\S]*?\n    if \(warmupShouldMarkFirstReply[^\n]*\n/, "await new Promise((r) => setTimeout(r, 20)); starts.push('log');\n");
  sim = sim.replace(/let sys = ctxLang[\s\S]*?(sys \+= await _preLesson;)/, "let sys = 'S'; $1");
  let fn = null;
  try { fn = new Function('delay', 'starts', 'return (async () => { ' + stripTypeScriptTypes(sim) + ' return sys; })();'); } catch (e) { ok('흉내 실행 준비', false, e.message); }
  if (fn) {
    const t0 = Date.now(); let out = '';
    try { out = await fn(delay, starts); } catch (e) { ok('흉내 실행', false, e.message); }
    const ms = Date.now() - t0;
    ok('세 조회가 기록보다 «먼저» 시작됐다', starts.slice(0, 3).sort().join() === 'lesson,mistake,weak' && starts[3] === 'log', starts);
    ok('붙인 순서는 예전 그대로(완료 순서와 무관)', out === 'S L M W', out);
    ok('걸린 시간 ≈ 가장 긴 하나(차례로면 20+60+10+30=120ms)', ms < 100, ms + 'ms');
  }
}

console.log('\n[B] warmupLessonContext — 동시에 보내되 답은 순차판과 같다');
const fnSrc = bodyOf(IDX, 'async function warmupLessonContext(');
ok('전제: 함수를 잘라 냈다', fnSrc.length > 500);
ok('질의를 Promise.all 로 동시에 보낸다', /const rsAll = await Promise\.all\(tries\.map\(/.test(fnSrc));
ok('하나가 실패해도 나머지는 쓴다(질의마다 catch)', /\.all\(\)\.catch\(\(\) => null\)/.test(fnSrc));
let mk = null;
try {
  mk = new Function('isEnglishQuestion', 'isEnglishText', 'zhWarmupSentences', stripTypeScriptTypes(fnSrc) + '\nreturn warmupLessonContext;');
} catch (e) { ok('함수 실행 준비', false, e.message); }
const enQ = (q) => !/[぀-ヿ一-鿿]/.test(JSON.stringify(q));
const enT = (s) => !!s && /^[\x20-\x7e]+$/.test(s) && s.length <= 80;
function fakeDb(rows, opt = {}) {
  let inFlight = 0, peak = 0, calls = 0;
  return {
    stats: () => ({ peak, calls }),
    prepare(sql) {
      return {
        bind(...b) {
          return {
            async first() { return opt.student || null; },
            async all() {
              calls++; inFlight++; peak = Math.max(peak, inFlight);
              await new Promise((r) => setTimeout(r, 15));
              inFlight--;
              if (opt.fail && opt.fail(sql)) throw new Error('d1 down');
              const key = /lesson_no=\?/.test(sql) ? 'lesson' : /textbook\)=LOWER/.test(sql) ? 'book' : 'level';
              return { results: rows[key] || [] };
            },
          };
        },
      };
    },
  };
}
const Q = (...ss) => ({ questions: JSON.stringify(ss.map((s) => ({ audio_text: s }))) });
if (mk) {
  const wl = mk(enQ, enT, async () => []);
  /* 순차판(예전 코드)을 그대로 흉내 — 같은 입력에 같은 답이어야 한다 */
  async function seqRef(rows, o, failKey) {
    const out = []; const order = [];
    if (o.textbook && o.lessonNo) order.push('lesson');
    if (o.textbook) order.push('book');
    if (o.level) order.push('level');
    for (const k of order) {
      if (failKey === k) continue;
      for (const row of rows[k] || []) for (const q of JSON.parse(row.questions)) { const s = String(q.audio_text || '').trim(); if (enT(s) && !out.includes(s)) out.push(s); }
      if (out.length >= 4) break;
    }
    return out.slice(0, 8);
  }
  const rows = { lesson: [Q('Hello there.', 'I like apples.')], book: [Q('I like apples.', 'This is my bag.', 'Where is it?')], level: [Q('Level one line.')] };
  const cases = [
    { o: { textbook: 'BTS 1', level: 'Lv 1', lessonNo: 3 } },
    { o: { textbook: 'BTS 1', level: 'Lv 1' } },
    { o: { level: 'Lv 1' } },
    { o: { textbook: 'BTS 1', level: 'Lv 1', lessonNo: 3 }, rows: { lesson: [Q('A one.', 'A two.', 'A three.', 'A four.')], book: [Q('B one.')], level: [Q('C one.')] } },
  ];
  for (const c of cases) {
    const r = c.rows || rows;
    const db = fakeDb(r);
    const got = await wl({ DB: db }, c.o);
    const want = await seqRef(r, c.o);
    ok('같은 답: ' + JSON.stringify(c.o) + (c.rows ? ' (첫 질의에서 4개)' : ''), JSON.stringify(got.sentences) === JSON.stringify(want), { got: got.sentences, want });
    const n = (c.o.textbook && c.o.lessonNo ? 1 : 0) + (c.o.textbook ? 1 : 0) + (c.o.level ? 1 : 0);
    if (n > 1) ok('질의 ' + n + '개가 «동시에» 나갔다', db.stats().peak === n, db.stats());
  }
  /* 짝: 하나가 죽어도 나머지는 쓴다(예전에는 그 자리에서 전부 멈췄다 — 더 나아진 방향만 허용) */
  const db2 = fakeDb(rows, { fail: (sql) => /lesson_no=\?/.test(sql) });
  const got2 = await wl({ DB: db2 }, { textbook: 'BTS 1', level: 'Lv 1', lessonNo: 3 });
  ok('첫 질의가 실패해도 다음 질의 결과는 쓴다', JSON.stringify(got2.sentences) === JSON.stringify(await seqRef(rows, { textbook: 'BTS 1', level: 'Lv 1', lessonNo: 3 }, 'lesson')), got2.sentences);
  /* 학생 명부에서 교재·레벨을 채우는 길은 그대로 */
  const db3 = fakeDb(rows, { student: { english_name: 'Amy', level: 'Lv 1', textbook: 'BTS 1' } });
  const got3 = await wl({ DB: db3 }, { userId: 'kim01' });
  ok('명부에서 교재·레벨·이름을 채운다(예전 그대로)', got3.textbook === 'BTS 1' && got3.level === 'Lv 1' && got3.student_name === 'Amy' && got3.sentences.length > 0, got3);
}

console.log('\n[C] handleWarmupContext — 힌트 조회를 먼저 시작, 기록은 Neo4j 와 함께');
const C = strip(bodyOf(IDX, 'async function handleWarmupContext('));
ok('전제: 함수를 잘라 냈다', C.length > 500);
const zhStart = C.indexOf('const _zhP = zhStudentByTeacher(');
const ctxAt = C.indexOf('const ctx = await warmupLessonContext(');
ok('언어 힌트 조회를 교재 조회 «전» 에 시작한다', zhStart > 0 && zhStart < ctxAt);
ok('그 조회는 힌트 갈래(hint=1) «뒤» 다(그 갈래에서는 헛조회 안 함)', zhStart > C.indexOf("searchParams.get('hint')"));
ok('결과는 그 약속으로 읽는다(두 번 묻지 않음)', /await _zhP/.test(C) && (C.match(/zhStudentByTeacher\(/g) || []).length === 2);
const logS = C.indexOf('const _logP = logWarmupSessionStart(env, {');
const weakAt = C.indexOf('getWeakSentences(');
const logW = C.indexOf('await _logP;');
ok('세션 기록을 시작만 하고 Neo4j 조회와 겹친다', logS > 0 && logS < weakAt && weakAt < logW);
ok('응답 «전» 에 기록을 기다린다(일이 잘리지 않게)', logW > 0 && logW < C.indexOf('return new Response(JSON.stringify({ ok: true, ...ctx'));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
