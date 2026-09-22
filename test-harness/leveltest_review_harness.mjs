#!/usr/bin/env node
/* ═══════════════════════════════════════════════════════════════════════
   📘 leveltest_review_harness — 레벨테스트 «틀린 문제 다시 보기»

   [왜 이 검사가 있나 — 2026-09-22 사장님 지시]
     결과 화면이 점수·레벨·밴드 막대만 주고 «무엇을 왜 틀렸는지» 는 한 줄도 말하지
     않았다 — 진단만 있고 배움이 없었다. 그래서 틀린 문항의 정답·해설을 돌려준다.

   [🔒 이 기능이 여는 창 — 검사의 절반은 그것을 좁히는 계약이다]
     `/api/leveltest/questions` 는 정답(a)을 «일부러» 숨긴다. 그 반대 방향의 기능이라
     아무 제약 없이 실으면 «답을 하나도 안 내고 diagnose 만 호출해 24문항 정답을 통째로
     받는» 길이 열린다(이 경로는 무인증 공개다). 정본이 세 겹으로 좁힌다:
       ① 학생이 실제로 고른 문항만 ② 보기 범위 안의 정수일 때만 ③ 틀린 것만
     셋을 «각각» 못 박는다 — 하나만 풀어도 창이 넓어지는데 화면은 멀쩡해 보인다.

   [문자열로 물으면 못 잡는다]
     함수도 값도 다 «있고» 틀리는 것은 «무엇이 실리는가» 뿐이다. 그래서 정본을 오려 내
     실제로 돌리고, 문항은행도 하니스에 베끼지 않고 소스에서 오려 내 평가한다.

   [짝으로 묻는다]
     「틀린 것을 싣는다」만 두면 «전부 싣기» 도 통과하고, 「안 싣는다」만 두면
     «전부 안 싣기»(= 기능이 죽은 것) 도 통과한다. 늘 둘을 함께 둔다.
   ═══════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/* 절대경로도 받는다 — 변이시험이 «사본» 을 가리킬 수 있어야 한다.
   ⛔ 사본을 public/ 안에 두지 말 것: deploy.ps1 이 그 폴더를 통째로 올린다(CLAUDE.md). */
const SRC = (p) => fs.readFileSync(path.isAbsolute(p) ? p : path.join(ROOT, 'cloudflare-deploy', p), 'utf8');
const REVIEW_SRC = process.env.LT_REVIEW_SRC || 'src/leveltest-review.ts';
const ADMIN_SRC  = process.env.LT_ADMIN_SRC  || 'src/api-admin.ts';
const HTML_SRC   = process.env.LT_HTML_SRC   || 'public/level-test-ai.html';

let pass = 0, fail = 0;
const ok = (c, m, extra) => {
  if (c) { pass++; console.log('  ✅ ' + m); }
  else { fail++; console.log('  ❌ ' + m + (extra ? ' — ' + extra : '')); }
};

/* 주석을 벗겨 낸 사본 — 부정 검사가 «자기 설명 주석» 을 잡지 않게 (CLAUDE.md) */
function strip(t) {
  let out = '', i = 0, inBlock = false, inLine = false, q = '';
  while (i < t.length) {
    const c = t[i], n = t[i + 1];
    if (inBlock) { if (c === '*' && n === '/') { inBlock = false; i += 2; continue; } i++; continue; }
    if (inLine) { if (c === '\n') { inLine = false; out += c; } i++; continue; }
    if (q) { if (c === '\\') { out += c + (n || ''); i += 2; continue; } if (c === q) q = ''; out += c; i++; continue; }
    if (c === '/' && n === '*') { inBlock = true; i += 2; continue; }
    if (c === '/' && n === '/') { inLine = true; i += 2; continue; }
    if (c === '"' || c === "'" || c === '`') { q = c; out += c; i++; continue; }
    out += c; i++;
  }
  return out;
}

/* 중괄호 짝으로 몸통 자르기 — ⚠️ TS 는 인자 목록·반환 타입 «안» 에도 { 가 있다.
   괄호·꺾쇠 깊이가 0인 { 만 몸통으로 인정한다(CLAUDE.md 「중괄호 짝으로 잘랐는데 엉뚱한 조각」). */
function bodyAfter(src, fromIdx) {
  let i = fromIdx, par = 0, ang = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '(') par++; else if (c === ')') par--;
    else if (c === '<') ang++; else if (c === '>') ang--;
    else if (c === '{' && par === 0 && ang <= 0) break;
  }
  if (i >= src.length) return null;
  let d = 0;
  for (let j = i; j < src.length; j++) {
    if (src[j] === '{') d++;
    else if (src[j] === '}') { d--; if (d === 0) return src.slice(i, j + 1); }
  }
  return null;
}

/* ══════════ ① 판정 정본을 «실제로» 돌린다 ══════════ */
console.log('\n① 판정 정본을 오려 내 실제로 돌린다 (leveltest-review.ts)');
const revSrc = SRC(REVIEW_SRC);
let runnable = revSrc
  .replace(/^export type [\s\S]*?^};$/gm, '')          // 타입 선언 블록
  .replace(/:\s*LtReviewItem\[\]/g, '')
  .replace(/:\s*LtBankItem\[\]/g, '')
  .replace(/:\s*LtBankItem\b/g, '')
  .replace(/:\s*number \| null/g, '')
  .replace(/:\s*string\b/g, '')
  .replace(/:\s*number\b/g, '')
  .replace(/:\s*any\b/g, '')
  .replace(/^export /gm, '');

let mod = null;
try {
  mod = new Function(runnable + '\n;return { buildLeveltestReview, filledSentence };')();
  ok(typeof mod.buildLeveltestReview === 'function', '전제: 정본을 오려 내 실행했다');
} catch (e) {
  ok(false, '전제: 정본 실행 실패 — ①②는 헛돈다', e.message);
}

/* ══════════ ② 문항은행을 «소스에서 오려 내» 쓴다 ══════════
   ⛔ 24문항을 하니스에 베껴 적지 않는다 — 문항이 바뀌면 그 복제가 조용히 낡는다. */
console.log('\n② 문항은행을 소스에서 오려 낸다 (api-admin.ts 의 CEFR_BANK)');
const adminSrc = SRC(ADMIN_SRC);
let BANK = null;
try {
  const at = adminSrc.indexOf('const CEFR_BANK');
  const eq = adminSrc.indexOf('= [', at);
  let d = 0, end = -1;
  for (let j = eq + 2; j < adminSrc.length; j++) {
    if (adminSrc[j] === '[') d++;
    else if (adminSrc[j] === ']') { d--; if (d === 0) { end = j; break; } }
  }
  BANK = new Function('return ' + adminSrc.slice(eq + 2, end + 1) + ';')();
  ok(Array.isArray(BANK) && BANK.length > 0, `전제: 문항은행을 오려 냈다 (${BANK ? BANK.length : 0}문항)`);
} catch (e) {
  ok(false, '전제: 문항은행 오려내기 실패 — 이후 검사가 헛돈다', e.message);
}

if (BANK) {
  const ids = BANK.map(x => x.id);
  ok(new Set(ids).size === ids.length, '문항 id 가 겹치지 않는다');
  const noWhy = BANK.filter(x => !x.why || !String(x.why).trim());
  ok(noWhy.length === 0, '모든 문항에 해설(why)이 있다', noWhy.length ? '빠진 것: ' + noWhy.map(x => x.id).join(',') : '');
  const badA = BANK.filter(x => !(Number.isInteger(x.a) && x.a >= 0 && x.a < (x.choices || []).length));
  ok(badA.length === 0, '정답 번호가 보기 범위 안이다', badA.map(x => x.id).join(','));
  // 해설이 «있는 척» 만 하는 한 글자짜리를 막는다
  const tooShort = BANK.filter(x => String(x.why || '').trim().length < 8);
  ok(tooShort.length === 0, '해설이 한 글자짜리 빈 껍데기가 아니다', tooShort.map(x => x.id).join(','));
}

/* ══════════ ③ 「싣는다」와 「안 싣는다」를 짝으로 ══════════ */
if (mod && BANK) {
  console.log('\n③ 정본에 실제 답안을 넣어 돌린다 — 「싣는다」와 「안 싣는다」를 짝으로');
  const wrongOf = (it) => (it.a === 0 ? 1 : 0);   // 그 문항의 «틀린» 보기 하나

  // (가) 전부 틀리게 답함 → 전부 실려야 한다
  const allWrong = {}; BANK.forEach(it => { allWrong[it.id] = wrongOf(it); });
  const rWrong = mod.buildLeveltestReview(BANK, allWrong);
  ok(rWrong.length === BANK.length, `전부 틀리면 ${BANK.length}문항이 실린다 (나온 값 ${rWrong.length})`);
  ok(rWrong.every(r => r.answer === BANK.find(b => b.id === r.id).a), '실린 정답이 문항은행의 정답과 같다');
  ok(rWrong.every(r => r.picked !== r.answer), '실린 것은 전부 «내 답 ≠ 정답» 이다');
  ok(rWrong.map(r => r.id).join(',') === BANK.map(b => b.id).join(','), '문항 순서가 시험 순서 그대로다');

  // (나) 🔴 짝: 전부 맞히면 «한 건도» 안 실린다 — 맞힌 문항의 정답은 새 정보가 아니다
  const allRight = {}; BANK.forEach(it => { allRight[it.id] = it.a; });
  ok(mod.buildLeveltestReview(BANK, allRight).length === 0, '짝: 전부 맞히면 0건 (맞힌 문항은 안 싣는다)');

  // (다) 🔒 답을 «하나도 안 내면» 0건 — 정답을 통째로 훑는 가장 쉬운 길을 막는다
  ok(mod.buildLeveltestReview(BANK, {}).length === 0, '🔒 답이 없으면 0건 (안 푼 문항의 정답은 안 준다)');
  ok(mod.buildLeveltestReview(BANK, null).length === 0, '🔒 answers 가 null 이어도 0건');

  // (라) 🔒 보기 범위 «밖» 값으로 훑어도 0건
  const junk = {}; BANK.forEach(it => { junk[it.id] = 99; });
  ok(mod.buildLeveltestReview(BANK, junk).length === 0, '🔒 범위 밖(99)으로 훑어도 0건');
  const neg = {}; BANK.forEach(it => { neg[it.id] = -1; });
  ok(mod.buildLeveltestReview(BANK, neg).length === 0, '🔒 음수(-1)로 훑어도 0건');
  const frac = {}; BANK.forEach(it => { frac[it.id] = 1.5; });
  ok(mod.buildLeveltestReview(BANK, frac).length === 0, '🔒 정수가 아닌 값(1.5)으로 훑어도 0건');
  const str = {}; BANK.forEach(it => { str[it.id] = 'x'; });
  ok(mod.buildLeveltestReview(BANK, str).length === 0, '🔒 숫자가 아닌 값으로 훑어도 0건');

  // (마) ⚠️ 0(A번)은 «정당한 답» 이다 — falsy 로 거르면 A를 고른 문항이 통째로 사라진다
  const zeroPick = BANK.filter(it => it.a !== 0);
  const ansZero = {}; zeroPick.forEach(it => { ansZero[it.id] = 0; });
  const rZero = mod.buildLeveltestReview(BANK, ansZero);
  ok(rZero.length === zeroPick.length,
     `A번(0)을 고른 오답도 실린다 — ${zeroPick.length}건 기대 · 나온 값 ${rZero.length}`);
  ok(rZero.every(r => r.picked === 0), 'A번을 골랐다는 사실이 그대로 실린다');

  // (바) 일부만 풀고 멈춘 경우 — 푼 것만 실린다
  const half = {}; BANK.slice(0, 3).forEach(it => { half[it.id] = wrongOf(it); });
  const rHalf = mod.buildLeveltestReview(BANK, half);
  ok(rHalf.length === 3, `3문항만 풀면 3건만 실린다 (나온 값 ${rHalf.length})`);

  // (사) 완성 문장 — 빈칸이 있으면 채우고, 없으면 «지어내지 않는다»
  console.log('\n④ 완성 문장은 빈칸이 있을 때만 만든다 (지어내지 않는다)');
  const withBlank = BANK.filter(it => /_{2,}/.test(it.q));
  const noBlank  = BANK.filter(it => !/_{2,}/.test(it.q));
  ok(withBlank.length > 0 && noBlank.length > 0, `전제: 빈칸 있는 문항 ${withBlank.length} · 없는 문항 ${noBlank.length}`);
  ok(withBlank.every(it => {
    const s = mod.filledSentence(it);
    return s && !/_{2,}/.test(s) && s.indexOf(it.choices[it.a]) >= 0;
  }), '빈칸 문항은 정답이 채워진 문장을 만든다');
  ok(noBlank.every(it => mod.filledSentence(it) === ''),
     '짝: 빈칸이 없는 문항은 빈 문자열 (문장을 지어내지 않는다)');
}

/* ══════════ ⑤ 정답이 시험 «전» 에 새지 않는가 ══════════ */
console.log('\n⑤ /api/leveltest/questions 는 정답·해설을 숨긴다 (기존 보장 유지)');
{
  const at = adminSrc.indexOf("path === '/api/leveltest/questions'");
  const seg = adminSrc.slice(at, at + 900);
  const m = seg.match(/CEFR_BANK\.map\(\s*x\s*=>\s*\(\{([^}]*)\}\)/);
  ok(!!m, '전제: questions 응답을 만드는 자리를 찾았다');
  if (m) {
    const keys = m[1].split(',').map(s => s.split(':')[0].trim()).filter(Boolean);
    ok(!keys.includes('a'), '정답(a)을 안 싣는다', '실린 칸: ' + keys.join(','));
    ok(!keys.includes('why'), '해설(why)도 안 싣는다 — 시험 전에 답이 새면 안 된다', '실린 칸: ' + keys.join(','));
    ok(keys.includes('q') && keys.includes('choices'), '짝: 문제·보기는 그대로 싣는다(시험이 돌아야 한다)');
  }
}

/* ══════════ ⑥ 배선 — «정본을 실제로 부르고 그 값을 싣는가» ══════════ */
console.log('\n⑥ 배선: 서버가 정본을 부르고 그 결과를 응답에 싣는다');
{
  const clean = strip(adminSrc);
  ok(/import\s*\{[^}]*buildLeveltestReview[^}]*\}\s*from\s*'\.\/leveltest-review'/.test(clean),
     '정본을 import 한다');
  const callM = clean.match(/(\w+)\s*=\s*buildLeveltestReview\(\s*CEFR_BANK\s*,\s*answers\s*\)/);
  ok(!!callM, '정본에 «문항은행 + 학생 답안» 을 넘겨 부른다');
  const retAt = clean.indexOf('ok: true, ai_score, level, correct: correctCount');
  const retSeg = retAt >= 0 ? clean.slice(retAt, clean.indexOf('}', retAt)) : '';
  ok(retAt >= 0, '전제: diagnose 응답 객체를 찾았다');
  // 🔴 «그 변수» 를 싣는가로 묻는다 — 이름만 같은 다른 값을 실어도 통과하면 안 된다
  const varName = callM ? callM[1] : 'review';
  ok(new RegExp('(^|[,{\\s])' + varName + '\\s*[,}]').test(retSeg),
     `응답에 정본이 채운 그 변수(${varName})를 싣는다`, '응답: ' + retSeg.slice(0, 120));
  // ⛔ 문항은행을 통째로 응답에 싣지 않는다 (그러면 24문항 정답이 전부 나간다)
  ok(!/CEFR_BANK\s*[,}]/.test(retSeg) && !/bank:/.test(retSeg),
     '🔒 문항은행을 응답에 통째로 싣지 않는다');
  /* 해설을 못 만들어도 채점 결과는 나가야 한다.
     🔴 「근처에 try 가 있나」로 물으면 헛돈다(CLAUDE.md) — 첫 buildLeveltestReview 는
        import 줄이고, 앞쪽 아무 try 나 잡으면 언제나 참이 된다.
        «그 호출의 위치가 try 블록의 범위 «안» 인가» 로 묻는다. */
  const callAt = clean.search(/=\s*buildLeveltestReview\(/);
  ok(callAt > 0, '전제: 정본을 부르는 «호출» 자리를 찾았다(import 줄이 아니라)');
  let inTry = false;
  for (let i = 0; i >= 0 && i < callAt; ) {
    const t = clean.indexOf('try {', i);
    if (t < 0 || t > callAt) break;
    const blk = bodyAfter(clean, t + 3);
    if (blk && callAt > t && callAt < t + 4 + blk.length) { inTry = true; break; }
    i = t + 5;
  }
  ok(inTry, '해설 만들기가 실패해도 채점 결과는 돌려준다 (그 호출이 try 블록 안이다)');
}

/* ══════════ ⑦ 화면이 그 값을 «실제로» 그리는가 ══════════ */
console.log('\n⑦ 화면 배선 (level-test-ai.html)');
const html = SRC(HTML_SRC);
{
  const cleanHtml = strip(html);
  /* 🔴 「renderReview(d) 가 파일에 있는가」로 물으면 **함수 «선언» 이 잡혀** 호출을 통째로
     지워도 통과한다(2026-09-22 변이 Ⓛ 실측). CLAUDE.md 「«renderReview(p)» 로 찾으면
     «선언» 이 잡혀 호출을 통째로 지워도 통과」 그대로다.
     ✅ showResult 몸통을 잘라 «그 안에서» 부르는지 묻고, 선언은 정확히 하나인지 짝으로 본다. */
  ok((cleanHtml.match(/function renderReview\(/g) || []).length === 1, 'renderReview 선언이 정확히 하나다');
  const srAt = cleanHtml.indexOf('function showResult(');
  const srBody = (function () {
    if (srAt < 0) return '';
    const open = cleanHtml.indexOf('{', srAt);
    let d = 0;
    for (let j = open; j < cleanHtml.length; j++) {
      if (cleanHtml[j] === '{') d++;
      else if (cleanHtml[j] === '}') { d--; if (d === 0) return cleanHtml.slice(open, j + 1); }
    }
    return '';
  })();
  ok(srBody.length > 200, '전제: showResult 몸통을 오려 냈다');
  ok(/(^|[^\w.])renderReview\s*\(\s*d\s*\)/.test(srBody.replace(/function renderReview\(/g, 'DECL(')),
     'showResult 가 renderReview 를 실제로 부른다');
  ok(/d\s*&&\s*d\.review/.test(cleanHtml) || /d\.review/.test(cleanHtml), '서버가 준 review 를 읽는다');
  ok(html.indexOf('id="ai-review-wrap"') > 0 && html.indexOf('id="ai-review"') > 0, '해설을 그릴 자리가 화면에 있다');
  // 🔴 CTA 보다 «아래» — 위에 끼우면 발음 평가·돌아가기 버튼이 스크롤 밖으로 밀린다
  const ctaAt = html.indexOf('🎤 발음 평가 하러가기');
  const rvAt  = html.indexOf('id="ai-review-wrap"');
  ok(ctaAt > 0 && rvAt > ctaAt, '해설 섹션이 CTA «아래» 에 있다 (버튼을 밀어내지 않는다)');
  // ⛔ 화면이 정답을 다시 계산하지 않는다 — 정답은 questions 응답에 애초에 없다
  ok(!/answers\[[^\]]+\]\s*===?\s*\w+\.a\b/.test(cleanHtml), '🔒 화면에서 정답을 다시 계산하지 않는다');

  /* renderReview 를 오려 내 «가짜 DOM» 으로 실제로 돌린다 —
     「그 글자가 있는가」로 물으면 `if (false && …)` 한 글자에 뚫린다. */
  console.log('\n⑧ renderReview 를 가짜 DOM 으로 실제로 돌린다');
  /* ⚠️ bodyAfter 의 꺾쇠 세기를 여기 쓰면 안 된다 — 이 함수는 HTML 문자열('<div …>')을
     조립해서 `<`/`>` 가 짝이 안 맞고, 그러면 엉뚱한 { 를 몸통으로 잡아 «r is not defined»
     같은 거짓 실패가 난다(2026-09-22 실제로 밟음). JS 선언에는 반환 타입이 없으니
     «선언 뒤 첫 중괄호» 부터 짝만 맞추면 된다. */
  const fnAt = cleanHtml.indexOf('function renderReview(');
  const body = (function () {
    if (fnAt < 0) return null;
    const open = cleanHtml.indexOf('{', fnAt);
    if (open < 0) return null;
    let d = 0;
    for (let j = open; j < cleanHtml.length; j++) {
      if (cleanHtml[j] === '{') d++;
      else if (cleanHtml[j] === '}') { d--; if (d === 0) return cleanHtml.slice(open, j + 1); }
    }
    return null;
  })();
  ok(!!body, '전제: renderReview 몸통을 오려 냈다');
  if (body) {
    const mkEl = () => ({ innerHTML: '', textContent: '', _cls: new Set(['hidden']),
      classList: { add(c){ this._o._cls.add(c); }, remove(c){ this._o._cls.delete(c); },
                   contains(c){ return this._o._cls.has(c); } } });
    const el = () => { const e = mkEl(); e.classList._o = e; return e; };
    const run = (d, qs) => {
      const nodes = { 'ai-review-wrap': el(), 'ai-review': el(), 'ai-review-n': el(), 'ai-review-tip': el() };
      const $ = (id) => nodes[id] || null;
      const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
      const questions = qs || [];
      try {
        new Function('$', 'esc', 'questions', 'd', 'return (function renderReview(d)' + body + ')(d);')($, esc, questions, d);
      } catch (e) { return { threw: e.message, nodes }; }
      return { nodes };
    };
    const bankQs = BANK ? BANK.map(b => ({ id: b.id, cefr: b.cefr, q: b.q, choices: b.choices })) : [];
    const sample = [{ id: 'a1_1', cefr: 'A1', q: 'She ___ a student.', choices: ['be','am','is','are'],
                      picked: 1, answer: 2, why: '주어가 3인칭 단수라 is 예요.', sentence: 'She is a student.' }];

    const r1 = run({ ok: true, correct: 23, total: 24, review: sample }, bankQs);
    const h1 = r1.nodes['ai-review'].innerHTML;
    ok(!r1.threw, '틀린 문항이 있을 때 안 던진다', r1.threw);
    ok(/is/.test(h1) && /정답/.test(h1), '정답 보기를 «정답» 으로 표시해 그린다');
    ok(/내 답/.test(h1), '내가 고른 답도 함께 표시한다');
    ok(/주어가 3인칭 단수/.test(h1), '해설을 그린다');
    ok(/She is a student\./.test(h1), '완성 문장을 그린다');
    ok(!r1.nodes['ai-review-wrap'].classList.contains('hidden'), '해설 상자가 실제로 보인다');
    ok(/1문항/.test(r1.nodes['ai-review-n'].textContent), '틀린 개수를 말한다');
    ok(!r1.nodes['ai-review-tip'].classList.contains('hidden'), '위쪽 안내가 «아래에 해설이 있다» 고 알려 준다');

    // 🔴 짝: 0건인데 만점이 아니면 «전부 맞혔다» 고 말하면 안 된다 (중간에 멈춘 학생)
    const r2 = run({ ok: true, correct: 24, total: 24, review: [] }, bankQs);
    ok(/전부 맞혔/.test(r2.nodes['ai-review'].innerHTML), '만점이면 «전부 맞혔어요» 라고 말한다');
    const r3 = run({ ok: true, correct: 3, total: 24, review: [] }, bankQs);
    ok(!/전부 맞혔/.test(r3.nodes['ai-review'].innerHTML),
       '짝: 만점이 아닌데 0건이면 «전부 맞혔다» 고 말하지 않는다', r3.nodes['ai-review'].innerHTML.slice(0, 80));

    // 🔴 짝: 서버가 review 를 «안 보낸» 응답(옛 서버·배포 중)에는 아무것도 그리지 않는다
    const r4 = run({ ok: true, correct: 3, total: 24 }, bankQs);
    ok(r4.nodes['ai-review-wrap'].classList.contains('hidden'),
       '짝: review 가 없는 응답이면 해설 상자를 안 연다 (0건을 «만점» 으로 읽지 않는다)');
    ok(r4.nodes['ai-review'].innerHTML === '', '짝: 그때는 아무것도 안 그린다');
  }
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail > 0) process.exit(1);
