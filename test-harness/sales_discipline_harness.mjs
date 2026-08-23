// 🧭 영업담당자 «성과 부진 대응» 하니스 — 2026-08-19
//
//   왜 필요한가 —
//     성과가 낮을 때 무엇을 할 수 있는지를 코드로 못 박은 것이다. 한국에서 성과 부진은
//     «징계 사유» 가 아니다. 잘못이 아니라 능력이 못 미친 것이라, 기본급을 깎는 감봉은
//     근로기준법상 감급 제재 한도 문제에 걸리고 부당징계 다툼이 된다.
//     그래서 돈으로 가는 결과는 «반기 상여 배율» 까지이고, 실제로 하는 일은
//     「면담했다 · 기회를 줬다 · 그래도 안 됐다」 를 **기록으로 남기는 것**이다.
//
//     이 규칙들은 코드를 읽어서는 «왜 이렇게 소극적인가» 가 보이지 않는다.
//     그래서 누군가 「부진하면 감봉하자」 로 고치기 쉽다. 그게 이 하니스의 존재 이유다.
//
//   이 하니스가 못 박는 것:
//     ① 단계 판정 — 1회 C+ 이하 = 면담 / 2회 연속 C 이하 = 개선계획 /
//        개선계획 미달 후에도 D = 재검토. 기준선(연습) 기간 평가는 근거에서 뺀다
//     ② 돈으로 가는 결과는 상여까지 — 기본급을 깎는 코드가 없어야 한다
//     ③ 가드레일 4개가 화면에 그대로 내려간다
//     ④ 기록 표(개선계획·면담)가 있고, 본사만 쓸 수 있다
//     ⑤ advisory 를 «칸» 으로 저장한다 — snapshot(JSON) 만 보면 옛 행이 조용히 «연습 아님» 이 된다
//
//   실행: node test-harness/sales_discipline_harness.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const api = readFileSync(join(root, 'cloudflare-deploy', 'src', 'api-sales-hr.ts'), 'utf8');
const html = readFileSync(join(root, 'cloudflare-deploy', 'public', 'admin', 'sales-hr.html'), 'utf8');

// ⚠️ «이 단어가 없어야 한다» 류 검사는 반드시 주석을 벗겨 낸 사본으로 본다.
//    왜 그렇게 했는지 적어 둔 설명 주석이 자기 검사에 걸린다(CLAUDE.md 함정).
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const apiCode = strip(api);

let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail ? '\n       ' + detail : '')); }
};

console.log('\n🧭 영업담당자 성과 부진 대응 하니스\n');

/* ── ① 단계 판정 ─────────────────────────────────────────────── */
console.log('① 단계 판정 — 한 번으로 벌하지 않고, 연습 기간은 세지 않는다');
{
  // judgeDiscipline 을 TS 파일에서 잘라 내 그대로 실행한다(로직이 정본이므로 복제하지 않는다).
  const src = api.slice(api.indexOf('const GRADE_RANK'));
  const end = src.indexOf('export const DISCIPLINE_GUARDRAILS');
  const body = src.slice(0, end)
    .replace(/export\s+interface[\s\S]*?\n}\n/, '')
    .replace(/const GRADE_RANK: Record<string, number>/, 'const GRADE_RANK')
    .replace(/export function judgeDiscipline\(evals: any\[\], failedPlan: boolean\): DisciplineStage/,
             'function judgeDiscipline(evals, failedPlan)')
    .replace(/\(e: any\)/g, '(e)')
    .replace(/e => /g, 'e => ');
  const SALES_BONUS_MULTIPLIER = { 'A+': 1.5, 'A': 1.2, 'B+': 1.0, 'B': 0.8, 'C+': 0.5, 'C': 0.3, 'D': 0 };
  const judge = new Function('SALES_BONUS_MULTIPLIER', body + '\n return judgeDiscipline;')(SALES_BONUS_MULTIPLIER);

  const E = (period, grade, advisory = false) => ({ period, grade, advisory });

  ok(judge([], false).stage === 0, '평가가 하나도 없으면 0단계(판단 보류)');
  ok(judge([E('2026-H2', 'B')], false).stage === 0, 'B 한 번은 정상');
  ok(judge([E('2026-H2', 'C+')], false).stage === 1, 'C+ 한 번 = 1단계 면담');
  ok(judge([E('2026-H2', 'D')], false).stage === 1,
    'D 라도 «한 번» 이면 1단계 — 한 번으로 개선계획까지 가지 않는다', JSON.stringify(judge([E('2026-H2','D')], false).stage));
  ok(judge([E('2026-H2', 'C'), E('2026-H1', 'C')], false).stage === 2, 'C 두 번 연속 = 2단계 개선계획');
  ok(judge([E('2026-H2', 'C'), E('2026-H1', 'C+')], false).stage === 1,
    'C+ 는 «C 이하» 연속에 포함하지 않는다 — 두 번째가 C+ 면 아직 1단계');
  ok(judge([E('2026-H2', 'D')], true).stage === 3, '개선계획 미달 후에도 D = 3단계 재검토');
  ok(judge([E('2026-H2', 'C')], true).stage === 1,
    '개선계획 미달이어도 D 가 아니면 3단계로 올리지 않는다');

  // ⚠️ 핵심 — 기준선(연습) 기간 평가는 근거에서 뺀다. 상여에도 안 쓰는 점수다.
  ok(judge([E('2026-H2', 'C', true), E('2026-H1', 'C', true)], false).stage === 0,
    '연습 기간 평가만 있으면 0단계 — 부진 판정의 근거로 쓰지 않는다');
  ok(judge([E('2026-H2', 'C'), E('2026-H1', 'C', true)], false).stage === 1,
    '연습 기간 평가를 건너뛰고 세므로 «연속» 이 되지 않는다');
}

/* ── ② 돈으로 가는 결과는 상여까지 ───────────────────────────── */
console.log('\n② 돈 — 기본급은 건드리지 않는다');
{
  ok(!/base_salary[_a-z]*\s*(=|-=)\s*[^;]*(0\.\d|\*\s*0\.|-\s)/.test(apiCode),
    '기본급을 깎는(감봉) 코드가 없다');
  ok(/money:/.test(apiCode) && /반기 상여/.test(api),
    '단계별 «돈으로 가는 결과» 는 반기 상여로만 설명한다');
  ok(!/(감봉|급여\s*삭감|기본급\s*삭감)/.test(strip(html)),
    '화면에도 «감봉» 을 실행 수단으로 두지 않는다');
}

/* ── ②-2 말투 — 남이 봐도 불편하지 않아야 한다 ──────────────────
   2026-08-23 사장님: 「다른 직원이나 관리자가 보면 거북하다. 완곡하게.」
   이 화면은 당사자만 보는 것이 아니라 옆자리 사람도 지나가며 본다.
   벌·징계를 연상시키는 말이 남아 있으면 제도 전체가 «벌 주는 장치» 로 읽힌다. */
console.log('\n②-2 말투 — 벌을 연상시키는 말을 화면에 두지 않는다');
{
  const rough = ['징계', '벌을', '불이익', '경고장', '문책', '해고'];
  const hit = rough.filter(w => strip(html).includes(w));
  ok(hit.length === 0, '화면에 벌·징계를 연상시키는 말이 없다', hit.join(', '));
  ok(!/하지 마세요/.test(strip(html)), '지시·금지형(「하지 마세요」)이 아니라 서술형으로 적는다');
}

/* ── ③ 가드레일 ──────────────────────────────────────────────── */
console.log('\n③ 가드레일 — 잊으면 사고가 나는 것들이 매번 같이 보인다');
{
  ok(/export const DISCIPLINE_GUARDRAILS/.test(api), 'DISCIPLINE_GUARDRAILS 가 있다');
  const g = api.slice(api.indexOf('DISCIPLINE_GUARDRAILS'), api.indexOf('DISCIPLINE_GUARDRAILS') + 1200);
  // ⚠️ 2026-08-23 사장님 지시로 문구를 «부정문 → 긍정문» 으로 바꿨다
  //    (「깎지 마세요」가 거슬린다 → 「그대로 지킵니다」).
  //    지키는 «규칙» 은 그대로다. 그래서 검사도 뜻으로 맞춘다 — 문장을 통째로 박아 두면
  //    말투만 다듬어도 FAIL 나서, 다음 사람이 규칙까지 지워 버리는 쪽으로 «고치게» 된다.
  ok(/기본급은 그대로/.test(g),          '① 기본급은 건드리지 않는다');
  ok(/영업차량도? 그대로/.test(g),        '② 영업차량은 그대로 쓴다 (업무 도구다)');
  ok(/연습 기간 점수는 세지 않습니다/.test(g), '③ 연습 기간 점수는 판정에 쓰지 않는다');
  ok(/그날 짧게 남깁니다/.test(g),        '④ 나눈 이야기를 그날 기록으로 남긴다');
  ok(/guardrails:\s*DISCIPLINE_GUARDRAILS/.test(api), 'API 응답에 그대로 실어 보낸다');
  ok(/j\.guardrails/.test(html) && /어떤 경우에도 그대로입니다/.test(html), '화면이 그대로 그린다');
  ok(/노무사/.test(api), '3단계는 노무사 상담을 명시한다');
}

/* ── ④ 기록 표 + 권한 ────────────────────────────────────────── */
console.log('\n④ 기록 — 남아 있지 않으면 나중에 회사가 불리하다');
{
  ok(/CREATE TABLE IF NOT EXISTS sales_improvement_plans/.test(api), '개선계획 표가 있다');
  ok(/CREATE TABLE IF NOT EXISTS sales_meetings/.test(api), '면담 기록 표가 있다');

  for (const p of ['/api/admin/sales/discipline', '/api/admin/sales/improvement-plan', '/api/admin/sales/meeting']) {
    const i = apiCode.indexOf(`path === '${p}'`);
    ok(i > 0, `${p} 라우트가 있다`);
    // 라우트 바로 다음 줄에 본사 게이트가 있어야 한다
    ok(/if \(!hq\) return json\(\{ ok: false, error: 'forbidden'/.test(apiCode.slice(i, i + 260)),
      `${p} 는 본사만 (당사자가 「직무 재검토」 를 먼저 읽게 두지 않는다)`);
  }

  ok(/error: 'goals_required'/.test(apiCode), '목표 없는 개선계획은 저장하지 않는다');
  ok(/error: 'note_required'/.test(apiCode), '근거 없이 개선계획을 닫을 수 없다');
  ok(/error: 'already_open'/.test(apiCode), '개선계획을 두 개 열지 못한다 — 어느 쪽이 진짜인지 모르게 된다');
  ok(/error: 'summary_required'/.test(apiCode), '내용 없는 면담 기록은 저장하지 않는다');
  ok(/result !== 'achieved' && result !== 'failed'/.test(apiCode),
    '달성/미달 판정은 사람이 고른다 — 자동으로 닫지 않는다');
}

/* ── ⑤ advisory 를 칸으로 저장 ───────────────────────────────── */
console.log('\n⑤ advisory — SQL 로 읽을 수 있어야 판정에서 뺄 수 있다');
{
  ok(/advisory INTEGER DEFAULT 0/.test(api), 'sales_evaluations 에 advisory 칸이 있다');
  ok(/ALTER TABLE sales_evaluations ADD COLUMN advisory/.test(api), '이미 만들어진 표에도 칸을 덧붙인다');
  const ins = apiCode.slice(apiCode.indexOf('INSERT INTO sales_evaluations'), apiCode.indexOf('INSERT INTO sales_evaluations') + 1400);
  ok(/evaluated_at, advisory\)/.test(ins), '평가 저장 때 advisory 를 칸에도 넣는다');
  ok(/advisory=excluded\.advisory/.test(ins), '다시 저장해도 advisory 가 갱신된다');
  ok(/advisory: !!Number\(e\.advisory\)/.test(apiCode), '읽을 때 0/1 을 불리언으로 되돌린다');
}

// ⚠️ 요약 형식은 러너(run.mjs)가 «숫자 + 공백 + FAIL» 을 실패로 읽으므로 «/» 로 끊는다
console.log(`\n${fail === 0 ? '✅' : '❌'} PASS ${pass} / FAIL ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
