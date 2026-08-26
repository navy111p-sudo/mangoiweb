// enroll_class_minutes_harness.mjs — 수강신청 「수업 시간」(20/30/40분) 이 끝까지 이어지는지 (2026-08-26)
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 「수강신청을 하면 수업이 항상 30분으로 잡힌다」 제보. 정책 기본값은 20분인데
// (`class-policy.ts` DEFAULT_CLASS_MINUTES) 등록 화면에 «고르는 칸» 자체가 없었고,
// 주간 스케줄이 쓰는 API 는 시간을 안 보내면 **운영 DB 옛 스키마 DEFAULT 30** 으로 떨어졌다.
//
// 이 값은 «화면 → 저장 → 확정 → class_schedules» 네 곳을 지나며, 그 사이 어디 한 곳만
// 빠져도 **에러 없이** 기본값으로 되돌아간다. 이 저장소가 이미 여러 번 밟은 모양이다 —
//   · 화면 목록과 서버 허용목록이 어긋나면 서버가 조용히 null 로 지운다(⑥ 수업 기간 전례)
//   · 표에 열을 더하고 휴대폰 카드 배치(order)를 안 주면 그 칸이 맨 앞으로 튀어나온다
//
// ── 이 하니스가 못 박는 것 ──────────────────────────────────────────────────
//   ① 화면 목록 ↔ 서버 허용목록 ↔ 정책 상수가 «같은 말» 을 한다
//   ② 표의 머리(th)와 칸(td) 개수가 맞는다
//   ③ 휴대폰 카드 배치에 그 칸 규칙이 있다 (order 를 안 주면 기본 0 = 맨 앞)
//   ④ 값이 화면 → POST → DB 컬럼 → 확정(activate) 까지 끊기지 않는다
//   ⑤ 안 고르면 30 이 아니라 정책 기본값(20)이 된다
//
// 실행: node test-harness/enroll_class_minutes_harness.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CF = join(ROOT, 'cloudflare-deploy');
const PUB = process.env.MANGOI_PUB || join(CF, 'public');

let pass = 0, fail = 0;
const failures = [];
function check(name, cond, detail) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
}

const policy   = readFileSync(join(CF, 'src', 'class-policy.ts'), 'utf8');
const apiAdmin = readFileSync(join(CF, 'src', 'api-admin.ts'), 'utf8');
const activate = readFileSync(join(CF, 'src', 'enroll-activate.ts'), 'utf8');
const core     = readFileSync(join(PUB, 'js', 'adm-core.js'), 'utf8');
const adminHtml= readFileSync(join(PUB, 'admin.html'), 'utf8');
const css      = readFileSync(join(PUB, 'css', 'admin-inline-c.css'), 'utf8');

console.log('\n⏱  수강신청 수업 시간(분) 검사\n');

/* ── ① 세 곳이 같은 말을 하는가 ──────────────────────────────────────────── */
const policyList = (policy.match(/ALLOWED_CLASS_MINUTES[^=]*=\s*ENABLE_25MIN\s*\?\s*\[([^\]]*)\]\s*:\s*\[([^\]]*)\]/) || []);
const policyOff = (policyList[2] || '').split(',').map(x => Number(x.trim())).filter(Boolean);
check('① class-policy.ts 가 고를 수 있는 길이를 정한다', policyOff.length > 0, policyOff.join('/'));

const screenList = (core.match(/classMinOptionsList\s*=\s*\[([^\]]*)\]/) || [])[1];
const screen = (screenList || '').split(',').map(x => Number(x.trim())).filter(Boolean);
check('① 화면(adm-core.js)에 수업 시간 목록이 있다', screen.length > 0, screen.join('/'));
check('① 화면 목록이 정책 상수와 «같은 값» 이다 (한쪽만 넓히면 서버가 에러 없이 null 로 지운다)',
  JSON.stringify(screen) === JSON.stringify(policyOff),
  '화면 [' + screen.join(',') + '] vs 정책 [' + policyOff.join(',') + ']');

check('① 서버는 손으로 적은 목록이 아니라 정책 상수(ALLOWED_CLASS_MINUTES)로 판정한다',
  /ALLOWED_CLASS_MINUTES\.includes\(Number\(b\.duration_min\)\)/.test(apiAdmin));

/* ── ② 표 머리와 칸 개수가 맞는가 ────────────────────────────────────────── */
const thead = (adminHtml.match(/<table id="en-multi-table"[\s\S]*?<\/thead>/) || [''])[0];
const thCount = (thead.match(/<th\b/g) || []).length;
const rowFn = (core.match(/function _addEnrollmentRow\([\s\S]*?\n\}/) || [''])[0];
const tdCount = (rowFn.match(/'<td class="en-c/g) || []).length;
check('② 표 머리(th) 와 행의 칸(td) 개수가 같다', thCount > 0 && thCount === tdCount,
  'th ' + thCount + '개 vs td ' + tdCount + '개');
check('② 「수업 시간」 머리 칸이 있다', /data-ko="수업 시간"/.test(thead));

/* ── ③ 휴대폰 카드 배치 ──────────────────────────────────────────────────── */
check('③ 휴대폰 카드 배치에 en-c-classmin 규칙이 있다 (order 를 안 주면 기본 0 이라 맨 앞으로 튀어나온다)',
  /td\.en-c-classmin\s*\{\s*order:\s*\d+/.test(css));
{
  // 한 줄에 담기는 칸 합이 12 를 넘으면 빈칸이 생긴다 — 실제 값으로 확인한다
  const rules = [...css.matchAll(/td\.en-c-([a-z]+)\s*\{\s*order:\s*(\d+);\s*grid-column:\s*span\s*(\d+)/g)]
    .map(m => ({ k: m[1], order: Number(m[2]), span: Number(m[3]) }))
    .sort((a, b) => a.order - b.order);
  let line = 0, ok = true, lines = [];
  for (const r of rules) {
    if (line + r.span > 12) { lines.push(line); line = r.span; }
    else line += r.span;
    if (r.span > 12) ok = false;
  }
  lines.push(line);
  check('③ 카드 줄마다 칸 합이 12 를 넘지 않는다', ok && rules.length >= 9,
    '칸 ' + rules.length + '개 · 줄별 합 [' + lines.join(',') + ']');
  check('③ order 가 중복되지 않는다 (같은 값이면 브라우저가 DOM 순서로 되돌린다)',
    new Set(rules.map(r => r.order)).size === rules.length);
}

/* ── ④ 값이 끊기지 않고 이어지는가 ──────────────────────────────────────── */
check('④ 화면이 select 값을 읽는다', /\.en-row-classmin/.test(core));
check('④ 읽은 값을 서버로 보낸다 (POST 본문에 duration_min)',
  (core.match(/duration_min:\s*r\.duration_min/g) || []).length >= 2,
  '등록·재시도 두 경로 모두 실어야 한다');
check('④ enrollments 표에 duration_min 칸을 만든다',
  /_addEnrCol2\('duration_min',\s*'INTEGER'\)/.test(apiAdmin));
check('④ INSERT 문에 duration_min 이 들어 있다',
  /INSERT INTO enrollments[^`]*duration_min[^`]*VALUES/.test(apiAdmin));
{
  const ins = (apiAdmin.match(/INSERT INTO enrollments \(([^)]*)\) VALUES \(([^)]*)\)/) || []);
  const cols = (ins[1] || '').split(',').length;
  const marks = (ins[2] || '').split(',').length;
  check('④ INSERT 의 «칸 수» 와 «물음표 수» 가 같다 (하나만 늘리면 런타임에 통째로 실패한다)',
    cols > 0 && cols === marks, '칸 ' + cols + '개 vs ? ' + marks + '개');
}
check('④ 확정(activate) 단계가 등록 때 고른 값을 읽는다',
  /Number\(e\.duration_min\)/.test(activate));
check('④ 확정 단계가 정책 상수로 다시 확인한다 (모르는 값이 그대로 새어 나가지 않게)',
  /ALLOWED_CLASS_MINUTES\.includes\(Number\(e\.duration_min\)\)/.test(activate));

/* ── ⑤ 안 고르면 30 이 아니라 20 ────────────────────────────────────────── */
check('⑤ 확정 단계 기본값이 DEFAULT_CLASS_MINUTES 다', /:\s*DEFAULT_CLASS_MINUTES;/.test(activate));
{
  // 주간 스케줄이 쓰는 POST /api/admin/class-schedules — 여기가 30 으로 되돌아가면 제보가 재발한다
  const line = (apiAdmin.match(/const durationMin = [^;]*;/) || [''])[0];
  check('⑤ 주간 스케줄 API 기본값이 30 이 아니다 (운영 DB 옛 스키마 DEFAULT 30 이 새어 들어오던 자리)',
    !!line && !/:\s*30\b/.test(line) && /DEFAULT_CLASS_MINUTES/.test(line), line || '못 찾음');
}

console.log('\n' + '─'.repeat(56));
console.log(`  ✅ PASS ${pass}   ❌ FAIL ${fail}`);
if (fail) { console.log('\n실패:'); failures.forEach(f => console.log('  · ' + f)); }
process.exit(fail ? 1 : 0);
