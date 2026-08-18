// 📈 손익/재무제표 «분기별 조회» 하니스 — 2026-08-18
//
//   왜 필요한가 —
//     손익계산서는 오래 «월 하나» 만 볼 수 있었다. 분기를 보려면 세 달을 각각 열어
//     사람이 손으로 더해야 했고, 그렇게 더한 숫자는 아무 데도 안 남는다.
//     그래서 period 에 «2026-Q1» 형태를 받아 3개월치를 합산하도록 했다.
//
//   이 하니스가 못 박는 것 — 전부 «조용히 되돌아가면 숫자가 틀리는» 것들:
//     ① 분기 합산은 monthPL()/monthCash() 를 3번 돌려 더한다
//        (분기용 SQL 을 따로 쓰기 시작하면 월 화면과 분기 화면의 숫자가 갈린다)
//     ② 잔액성 항목(통장 잔액·미지급 강사급여)은 «더하면 안 되는» 값이라
//        분기 마지막 달 기준으로 본다 — period 를 그대로 바인딩하면 «2026-Q1» 이
//        문자열 비교에 들어가 엉뚱한 잔액이 나온다
//     ③ 표기는 «20XX N분기» (사장님 지시 형식)
//     ④ 생성·PDF·Excel 이 _statementUrl() 하나만 쓴다 — 셋 중 하나만 분기를 따라가면
//        화면과 내려받은 파일의 기간이 달라진다
//
//   실행: node test-harness/statement_quarter_harness.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const acct = readFileSync(join(root, 'cloudflare-deploy', 'src', 'accounting-reports.ts'), 'utf8');
const core = readFileSync(join(root, 'cloudflare-deploy', 'public', 'js', 'adm-core.js'), 'utf8');
const html = readFileSync(join(root, 'cloudflare-deploy', 'public', 'admin.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, label, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + label); }
  else { fail++; console.log('  ❌ ' + label + (detail ? '\n       ' + detail : '')); }
};

console.log('\n📈 손익/재무제표 분기별 조회 하니스\n');

/* ── ① 서버: 기간 해석과 합산 규칙 ───────────────────────────── */
console.log('① 서버 — 분기(YYYY-Qn)를 받아 3개월치를 합산한다');
{
  ok(/STATEMENT_QUARTER_RE\s*=\s*\/\^\(\\d\{4\}\)-\?\[Qq\]\(\[1-4\]\)\$\//.test(acct),
    'period 에 YYYY-Qn 형식을 받는다 (statementPeriod)');
  ok(/function statementPeriod\(/.test(acct) && /statementPeriod\(period\)/.test(acct),
    'statementReport 가 statementPeriod() 로 기간을 푼다');

  const basis = acct.slice(acct.indexOf('async function statementBasis'), acct.indexOf('async function statementReport'));
  ok(basis.length > 200, 'statementBasis() 가 있다');
  ok(/monthPL\(env, m\)/.test(basis) && /monthCash\(env, m\)/.test(basis),
    '합산은 monthPL()/monthCash() 를 달마다 돌려서 한다 (월 화면과 같은 규칙)');
  ok(!/SELECT/i.test(basis),
    '분기 전용 SQL 을 따로 쓰지 않는다 (규칙이 두 벌이 되면 숫자가 갈린다)');

  const body = acct.slice(acct.indexOf('async function statementReport'), acct.indexOf('// 8) 세무'));
  ok(!/plM\./.test(body), '월 하나만 보던 옛 변수(plM)가 남아 있지 않다');
  ok(/const \{ months, label, endLabel, isQuarter \} = statementPeriod\(period\)/.test(body),
    '기간·표기·분기여부를 한 곳에서 받는다');
}

/* ── ② 잔액성 항목은 «기간 마지막 달» 기준 ──────────────────── */
console.log('\n② 잔액은 더하지 않는다 — 분기 마지막 달 기준');
{
  const body = acct.slice(acct.indexOf('async function statementReport'), acct.indexOf('// 8) 세무'));
  const balance = body.slice(body.indexOf('SELECT balance FROM bankacct_transactions'));
  ok(/\.bind\(lastMonth\)/.test(balance.slice(0, 400)),
    '통장 월말 잔액 조회는 lastMonth 를 바인딩한다');
  const unpaid = body.slice(body.indexOf('COALESCE(paid,0)=0'));
  ok(/\.bind\(lastMonth\)/.test(unpaid.slice(0, 400)),
    '미지급 강사급여 조회는 lastMonth 를 바인딩한다');
  ok(!/\.bind\(period\)\.first<\{ balance/.test(body),
    'period(«2026-Q1» 일 수 있음)를 잔액 조회에 그대로 넣지 않는다');
  ok(/const lastMonth = months\[months\.length - 1\]/.test(body), 'lastMonth 는 기간의 마지막 달');
}

/* ── ③ 표기 형식 «20XX N분기» ───────────────────────────────── */
console.log('\n③ 표기 형식 — «2026 1분기»');
{
  ok(/label: `\$\{y\} \$\{n\}분기/.test(acct), '서버 라벨이 «20XX N분기» 로 시작한다');
  ok(/endLabel: `\$\{y\} \$\{n\}분기 말`/.test(acct), '재무상태표는 «분기 말» 기준이라고 밝힌다');
  ok(/y \+ ' ' \+ q \+ '분기'/.test(core), '화면 드롭다운도 «20XX N분기» 로 그린다');
  ok(/o\.setAttribute\('data-ko'/.test(core) && /o\.setAttribute\('data-en'/.test(core),
    'JS 로 그린 분기 옵션에 data-ko/data-en 이 붙는다 (i18n 사전이 못 고치는 자리)');
}

/* ── ④ 화면 — 생성·PDF·Excel 이 같은 URL 을 쓴다 ────────────── */
console.log('\n④ 화면 — 월/분기 토글이 세 기능에 모두 걸린다');
{
  ok(/id="acc-fs-mode"/.test(html) && /id="acc-fs-quarter"/.test(html),
    'admin.html 에 조회단위 선택(acc-fs-mode)과 분기 선택(acc-fs-quarter)이 있다');
  ok(/id="acc-fs-month"[^>]*type="month"/.test(html), '기존 월 선택 드롭다운이 그대로 있다');
  const genUses = /window\.accGenStatement[\s\S]{0,400}?_statementUrl\(\)/.test(core);
  const pdfUses = /window\.accStatementPdf[\s\S]{0,600}?_statementUrl\(\)/.test(core);
  const xlsUses = /window\.accStatementExcel[\s\S]{0,200}?_statementUrl\('csv'\)/.test(core);
  ok(genUses && pdfUses && xlsUses, '생성·PDF·Excel 이 모두 _statementUrl() 하나를 쓴다',
    `gen=${genUses} pdf=${pdfUses} excel=${xlsUses}`);
  ok(/qEl\.style\.display/.test(core) && !/qEl\.hidden/.test(core),
    '보이기/숨기기는 style.display 로 한다 (작성자 CSS 가 [hidden] 을 이기는 함정)');
}

/* ── ⑤ 화면 로직을 실제로 돌려 본다 (DOM 흉내) ──────────────── */
console.log('\n⑤ 화면 로직 실행 — 기간 선택이 URL 로 정확히 간다');
{
  const start = core.indexOf('  let _fsGenerated = false;');
  const end = core.indexOf('  window.accGenStatement = async function(){');
  if (start < 0 || end < 0) {
    ok(false, '분기 조회 블록을 찾을 수 있다', '_fsGenerated ~ accGenStatement 구간이 없음');
  } else {
    class El {
      constructor(tag) { this.tagName = tag; this.options = []; this.value = ''; this.style = {}; this.attrs = {}; this.textContent = ''; }
      appendChild(c) { this.options.push(c); if (!this.value) this.value = c.value; }
      setAttribute(k, v) { this.attrs[k] = v; }
    }
    const els = {
      'acc-fs-mode': Object.assign(new El('select'), { value: 'month' }),
      'acc-fs-month': Object.assign(new El('input'), { value: '2026-05' }),
      'acc-fs-quarter': new El('select'),
      'acc-fs-type': Object.assign(new El('select'), { value: 'pl' }),
    };
    const ctx = vm.createContext({
      document: { getElementById: id => els[id] || null, createElement: t => new El(t) },
      window: {}, Date, URLSearchParams, Array, Number, Math, String, console,
      _today: () => '2026-08-18',
    });
    vm.runInContext(core.slice(start, end) + '\nwindow._statementUrl = _statementUrl;', ctx);
    const W = ctx.window;

    ok(W._statementUrl() === '/api/admin/reports/statement?type=pl&period=2026-05',
      '월별은 예전 그대로 period=YYYY-MM', W._statementUrl());

    els['acc-fs-mode'].value = 'quarter';
    W.accFsModeChange();
    ok(els['acc-fs-month'].style.display === 'none' && els['acc-fs-quarter'].style.display === '',
      '분기 모드에서 월 입력칸이 숨고 분기 선택칸이 나온다');
    const labels = els['acc-fs-quarter'].options.map(o => o.textContent);
    ok(labels.length > 0 && labels.every(l => /^\d{4} [1-4]분기$/.test(l)),
      '분기 목록이 전부 «20XX N분기» 형식', labels.slice(0, 3).join(' | '));
    ok(els['acc-fs-quarter'].value === '2026-Q2',
      '보고 있던 달(2026-05)이 속한 분기가 기본 선택된다', els['acc-fs-quarter'].value);
    ok(W._statementUrl() === '/api/admin/reports/statement?type=pl&period=2026-Q2',
      '분기 선택이 period=YYYY-Qn 으로 간다', W._statementUrl());

    els['acc-fs-type'].value = 'bs';
    els['acc-fs-quarter'].value = '2026-Q1';
    ok(W._statementUrl('csv') === '/api/admin/reports/statement?type=bs&period=2026-Q1&format=csv',
      'Excel(csv) 내려받기도 같은 분기를 본다', W._statementUrl('csv'));

    els['acc-fs-mode'].value = 'month';
    W.accFsModeChange();
    ok(W._statementUrl().includes('period=2026-05'), '월별로 되돌리면 고르던 달이 그대로 남는다');
  }
}

// ⚠️ 요약 형식은 러너(run.mjs)가 «숫자 + 공백 + FAIL» 을 실패로 읽으므로 «/» 로 끊는다
console.log(`\n${fail === 0 ? '✅' : '❌'} PASS ${pass} / FAIL ${fail}\n`);
process.exit(fail === 0 ? 0 : 1);
