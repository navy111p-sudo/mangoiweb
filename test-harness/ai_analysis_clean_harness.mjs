#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════════
// 🧹 학생 AI 학습 분석 — 한국어 아닌 글자 거르기 · 다음 액션 저장 · 출석 원천
// ───────────────────────────────────────────────────────────────────────────
// 2026-09-23 사장님 제보 (parent.html 「AI 추천 학습 경로」):
//   ① 「다음 액션」에 「면談을진행」·「khuyến유」 — 한자·베트남어 섞임
//   ② 다시 들어가면 「다음 액션」이 사라짐 — 캐시 INSERT 에 next_action 칸이 없었음
//   ③ (덤) 「출석 3회로 낮다」 — 수업 기록이 아니라 포인트 로그를 셌음
//
// A절: 정본 src/ai-analysis-clean.ts 를 node --experimental-strip-types 로 «실제로 돌립니다».
//      「뺀다」 옆에 «멀쩡한 것은 남긴다» 를 짝으로 둡니다(짝이 없으면 «전부 빼기» 도 통과).
// B절: 라우트(src/api-admin.ts)를 중괄호 짝으로 잘라 배선을 봅니다(주석을 벗긴 사본).
//
// 변이시험: AAC_SRC=<고친 사본 경로> 로 정본 대신 다른 파일을 돌릴 수 있습니다.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const MOD = process.env.AAC_SRC || join(ROOT, 'cloudflare-deploy/src/ai-analysis-clean.ts');
const API = process.env.AAC_API || join(ROOT, 'cloudflare-deploy/src/api-admin.ts');

let pass = 0, fail = 0;
const check = (name, cond) => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ FAIL ' + name); } };

// ── A. 정본을 실제로 돌린다 ───────────────────────────────────────────────
console.log('\n[A] 정본 실행 — 거르기·되살리기');
const tmp = mkdtempSync(join(tmpdir(), 'aac-'));
const tsCopy = join(tmp, 'mod.ts');
writeFileSync(tsCopy, readFileSync(MOD, 'utf8'));
const runner = `
  import * as M from ${JSON.stringify(pathToFileURL(tsCopy).href)};
  const out = {};
  try {
    const h = M.hasForeignScript;
    out.hanzi   = h('교사가 학생과 개별적으로 면談을진행하여');
    out.viet    = h('평가서 및 채팅 활동을 khuyến유할 필요가 있음');
    out.kana    = h('ひらがな 섞임');
    out.korean  = h('정기적으로 평가서를 작성하고, 교사와의 채팅 활동을 증가시키기');
    out.english = h('자주 틀리는 단어 apple(사과)을 게임으로 복습하기');
    out.times   = h('주 3×4회 연습');
    out.empty   = h('');

    // 사장님 화면 그대로 + 목록 한 항목만 섞인 경우
    const sample = {
      summary: 'lee 학생은 최근 60일 동안 출석 횟수는 3회로 상대적으로 낮은 편이며, 발음 연습 기록은 어느 정도 있는 것으로 보입니다.',
      strengths: ['발음 점수가 높음', '進行 이 빠름'],
      weaknesses: ['채팅 활동이 적음'],
      recommendations: ['정기적으로 평가서를 작성하기', '학습 게임에 참여하기', '스피치코치 발음 연습을 지속적으로진행하여 발음 능력을 강화하기'],
      next_action: '교사가 학생과 개별적으로 면談을진행하여 학습 참여도를 높이고, 평가서 및 채팅 활동을 khuyến유할 필요가 있음',
    };
    const c = M.cleanAnalysis(sample);
    out.naDropped   = c.next_action === '';
    out.recsKept    = c.recommendations.split(' | ').length === 3;
    out.strDropOne  = c.strengths === '발음 점수가 높음';
    out.summaryKept = c.summary === sample.summary && c.summary_dropped === false;
    out.droppedList = c.dropped.slice().sort().join(',');
    // 저장본 모양(' | ' 문자열)도 받는가
    const c2 = M.cleanAnalysis({ recommendations: '복습하기 | 面談 하기 | 발음 연습', summary: '好', next_action: '다음 수업에서 과거형 연습' });
    out.joinedFilter = c2.recommendations === '복습하기 | 발음 연습';
    out.summaryDrop  = c2.summary === '' && c2.summary_dropped === true;
    out.naKept       = c2.next_action === '다음 수업에서 과거형 연습';
    // 멀쩡한 답은 한 글자도 안 바뀐다
    const good = { summary: '잘하고 있어요.', strengths: ['a'], weaknesses: [], recommendations: ['게임 복습'], next_action: '말하기 연습' };
    const c3 = M.cleanAnalysis(good);
    out.goodUntouched = c3.dropped.length === 0 && c3.next_action === '말하기 연습' && c3.recommendations === '게임 복습';

    out.ffCount = M.foreignFields(sample).slice().sort().join(',');
    out.ffGood  = M.foreignFields(good).length === 0;
    out.ffNull  = M.foreignFields(null).length === 0;

    // 옛 저장본(next_action 칸 없음) — raw_response 에서 되살림
    const raw = 'blah {"summary":"s","next_action":"과거형 문장 말하기를 우선 연습"} tail';
    out.recRaw  = M.recoverNextAction({ next_action: null, raw_response: raw }) === '과거형 문장 말하기를 우선 연습';
    out.recOwn  = M.recoverNextAction({ next_action: '저장된 값', raw_response: raw }) === '저장된 값';
    out.recBad  = M.recoverNextAction({ raw_response: 'not json {oops' }) === '';
    out.recNone = M.recoverNextAction(null) === '';
    out.parseObj = !!M.parseAnalysisJson({ next_action: 'x' });
    out.retryKo  = /한자/.test(M.KOREAN_ONLY_RETRY_NOTE);
  } catch (e) { out.err = String(e && e.stack || e); }
  console.log(JSON.stringify(out));
`;
writeFileSync(join(tmp, 'run.mjs'), runner);
const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
let o = null;
try { o = JSON.parse((r.stdout || '').trim().split('\n').pop()); } catch { /* 아래 FAIL */ }
check('A-0 전제: 정본을 실제로 실행했다', !!o && !o.err);
if (!o || o.err) console.log('    ' + String((o && o.err) || r.stderr || '').split('\n').slice(0, 4).join('\n    '));
else {
  check('A-1 한자(談)를 잡는다', o.hanzi === true);
  check('A-2 베트남어(khuyến)를 잡는다', o.viet === true);
  check('A-3 가나를 잡는다', o.kana === true);
  check('A-4 (짝) 순수 한국어는 안 잡는다', o.korean === false);
  check('A-5 (짝) 영어 교재 낱말은 안 잡는다', o.english === false);
  check('A-6 (짝) × 기호는 안 잡는다', o.times === false);
  check('A-7 (짝) 빈 값은 안 잡는다', o.empty === false);
  check('A-8 사장님 화면의 「다음 액션」은 통째로 뺀다', o.naDropped);
  check('A-9 (짝) 멀쩡한 권장사항 3개는 그대로 남는다', o.recsKept);
  check('A-10 목록은 섞인 «항목만» 뺀다', o.strDropOne);
  check('A-11 (짝) 멀쩡한 요약은 그대로', o.summaryKept);
  check('A-12 뺀 칸 목록이 정확하다', o.droppedList === 'next_action,strengths');
  check('A-13 저장본 모양(" | " 문자열)도 거른다', o.joinedFilter);
  check('A-14 요약이 섞이면 summary_dropped (캐시 안 함 신호)', o.summaryDrop);
  check('A-15 (짝) 멀쩡한 다음 액션은 남는다', o.naKept);
  check('A-16 (짝) 멀쩡한 답은 한 글자도 안 바뀐다', o.goodUntouched);
  check('A-17 foreignFields 가 섞인 칸을 센다(재시도 판정)', o.ffCount === 'next_action,strengths');
  check('A-18 (짝) 멀쩡하면 재시도 안 함(0칸)', o.ffGood && o.ffNull);
  check('A-19 옛 저장본은 raw_response 에서 다음 액션을 되살린다', o.recRaw);
  check('A-20 (짝) 저장된 칸이 있으면 그것을 쓴다', o.recOwn);
  check('A-21 (짝) raw 가 깨졌으면 지어내지 않는다', o.recBad && o.recNone);
  check('A-22 객체 응답도 받는다', o.parseObj);
  check('A-23 재시도 문구가 한자 금지를 말한다', o.retryKo);
}

// ── B. 라우트 배선 ────────────────────────────────────────────────────────
console.log('\n[B] 라우트 배선 (src/api-admin.ts)');
const api = readFileSync(API, 'utf8');
const bare = api.split('\n').filter(l => !/^\s*\/\//.test(l)).map(l => l.replace(/\s\/\/ .*$/, '')).join('\n');
const anchor = "path === '/api/admin/ai-analyze/student'";
const ai = bare.indexOf(anchor);
let body = '';
if (ai >= 0) {
  const open = bare.indexOf('{', ai);
  let d = 0, i = open;
  for (; i < bare.length; i++) { if (bare[i] === '{') d++; else if (bare[i] === '}') { d--; if (d === 0) break; } }
  body = bare.slice(open, i + 1);
}
check('B-0 전제: 라우트 몸통을 잘라 냈다', body.length > 3000);
const insertRe = /INSERT INTO ai_student_analysis \(([^)]*)\)/g;
const inserts = [...body.matchAll(insertRe)].map(m => m[1]);
check('B-1 저장 INSERT 에 next_action 칸이 있다', inserts.some(c => /\bnext_action\b/.test(c)));
check('B-2 그 INSERT 가 analysis.next_action 을 바인딩한다', /analysis\.risk_level,\s*analysis\.next_action,/.test(body));
check('B-3 표에 next_action 칸을 멱등으로 만든다', /ALTER TABLE ai_student_analysis ADD COLUMN next_action/.test(bare));
check('B-4 캐시 응답이 옛 저장본의 다음 액션을 되살린다', /recoverNextAction\(cached\)/.test(body));
check('B-5 캐시 응답도 거른다', /cleanAnalysis\(\{\s*\.\.\.cached/.test(body));
check('B-6 새 답을 거른다(cleanAnalysis(parsed))', /cleanAnalysis\(parsed\)/.test(body));
check('B-7 화면에 보내는 next_action 이 «거른 값» 이다', /next_action:\s*cl\.next_action/.test(body));
check('B-8 (옛 코드 미복귀) 파싱 값을 그대로 보내지 않는다', !/next_action:\s*parsed\?\.next_action/.test(body));
check('B-9 섞였으면 한 번 다시 만든다', /foreignFields\(parseAnalysisJson\(aiResponse\)\)/.test(body) && /runAnalysis\(KOREAN_ONLY_RETRY_NOTE\)/.test(body));
check('B-10 재시도 결과는 «덜 섞였을 때만» 채택', /foreignFields\(p2\)\.length\s*<\s*bad1\.length/.test(body));
const guardAt = body.indexOf('if (!cl.summary_dropped)');
const insAt = body.indexOf('INSERT INTO ai_student_analysis');
check('B-11 요약을 못 살렸으면 캐시에 저장하지 않는다(가드가 INSERT 앞)', guardAt > 0 && insAt > guardAt);
check('B-12 출석을 포인트 로그로 세지 않는다', !/point_rule_log/.test(body));
check('B-13 출석은 attendance 정본 조건으로 센다', /FROM attendance[\s\S]{0,60}\$\{ATTENDANCE_BY_UID\}/.test(body) && /attUidBinds\(uid\)/.test(body));
check('B-14 카페24 미래 예약(씨앗)은 뺀다', /joined_at <= \?/.test(body));
check('B-15 출석을 못 세면 «모름» 이라 알린다(0 으로 지어내지 않음)', /attendanceDays == null \?/.test(body));

// ── C. 재시도 블록을 오려 내 «실제로» 돌린다 ─────────────────────────────
//   「그 글자가 있는가」로 물으면 `if (false && bad1.length)` 한 글자에 뚫립니다(실측).
console.log('\n[C] 재시도 블록 실행');
const b1 = body.indexOf('const bad1');
let retryBlk = '';
if (b1 > 0) {
  const open = body.lastIndexOf('{', b1);
  let d = 0, i = open;
  for (; i < body.length; i++) { if (body[i] === '{') d++; else if (body[i] === '}') { d--; if (d === 0) break; } }
  retryBlk = body.slice(open, i + 1);
}
check('C-0 전제: 재시도 블록을 잘라 냈다', retryBlk.includes('runAnalysis'));
const runRetry = async (first, second) => {
  const calls = [];
  const bad = s => (String(s).match(/[一-鿿Ḁ-ỿ]/g) || []).length;
  const src = retryBlk.replace(/\(e: any\)/g, '(e)');
  let fn;
  try { fn = new Function('first', 'second', 'calls', 'bad', `return (async () => {
    let aiResponse = first;
    const KOREAN_ONLY_RETRY_NOTE = 'NOTE';
    const parseAnalysisJson = s => ({ s });
    const foreignFields = p => Array.from({ length: bad(p.s) });
    const runAnalysis = async n => { calls.push(n); if (second instanceof Error) throw second; return second; };
    ${src}
    return aiResponse;
  })();`); } catch (e) { return { err: 'compile: ' + String(e), calls }; }
  try { return { out: await fn(first, second, calls, bad), calls }; } catch (e) { return { err: String(e), calls }; }
};
{
  const a = await runRetry('면談 khuyến', '면담 권유');
  check('C-1 섞였으면 다시 부르고 깨끗한 답을 채택한다', !a.err && a.calls.length === 1 && a.calls[0] === 'NOTE' && a.out === '면담 권유');
  const b = await runRetry('면담 권유', 'XX');
  check('C-2 (짝) 멀쩡하면 다시 부르지 않는다', !b.err && b.calls.length === 0 && b.out === '면담 권유');
  const c = await runRetry('面', '面談 進行');
  check('C-3 (짝) 더 나빠진 재시도는 버린다', !c.err && c.out === '面');
  const e = await runRetry('面', new Error('429'));
  check('C-4 재시도가 실패해도 던지지 않고 첫 답을 쓴다', !e.err && e.out === '面');
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
