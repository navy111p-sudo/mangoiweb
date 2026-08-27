// -*- coding: utf-8 -*-
// 🔢 D1 바인드 파라미터 100개 한도 하니스 (의존성 없음 · node 로 바로 실행)
//   실행:  node test-harness/d1_bind_limit_harness.mjs
//   대상:  cloudflare-deploy/src/d1-chunk.ts (순수 모듈 — 가짜 D1 로 실제 실행)
//
//   이 파일이 지키는 것 —
//     D1 은 쿼리 하나에 바인드 100개까지만 받는다(101개부터 "too many SQL variables").
//     `IN (...)` 에 목록을 통째로 넣는 코드는 학생·지사가 늘면 어느 날 갑자기 넘는데,
//     대부분 try/catch 안에 있어서 **에러 없이 빈 결과**로만 보인다.
//     (실제로 그렇게 «위험학생 0명» / 이름 빈칸 / 발음점수 누락 이 나고 있었다.)
//
//     A. 청크가 절대 한도를 넘지 않는다 — lead/tail 바인드까지 세어서
//     B. 나눠 던져도 결과 행은 전부 모인다 (누락 없음)
//     C. 바인드 순서가 SQL 의 ? 순서와 같다 (lead → IN → tail)
//     D. swallowErrors 로 «선택적 집계» 의 기존 try/catch 동작이 보존된다
//     E. runInChunks 가 changes 합계를 정확히 돌려준다
//     F. franchiseInClause — 지사 180개(운영 실측)에서도 한도를 안 넘고,
//        따옴표가 섞여도 안전하며, 이상값이면 «넓히지 않고» 막는다
//     G. 회귀 감시 — src 에 손으로 만든 IN 목록이 새로 생기면 알린다

import { readFileSync, readdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src');
const M = await import(pathToFileURL(join(SRC, 'd1-chunk.ts')).href);
const { chunkBinds, selectInChunks, runInChunks, franchiseInClause, D1_MAX_BIND } = M;

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ` — ${extra}` : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond ? '' : (extra ? ` — ${extra}` : '')}`);
}

// ── 가짜 D1 — 실제로 bind 된 인자를 모두 기록한다 ──
function fakeDB({ rowsFor = () => [], failOn = () => false } = {}) {
  const calls = [];
  return {
    calls,
    prepare(sql) {
      return {
        bind(...args) {
          const call = { sql, args };
          return {
            all: async () => {
              calls.push(call);
              if (failOn(call)) throw new Error('D1_ERROR: too many SQL variables');
              return { results: rowsFor(call) };
            },
            run: async () => {
              calls.push(call);
              if (failOn(call)) throw new Error('D1_ERROR: too many SQL variables');
              return { meta: { changes: call.args.length } };
            },
          };
        },
      };
    },
  };
}

const range = (n, p = 'u') => Array.from({ length: n }, (_, i) => p + i);

// ═══ A. 청크가 한도를 넘지 않는다 ═══
console.log('\nA. 청크 크기 — lead/tail 까지 세어서 한도 이내');
{
  const sizes = chunkBinds(range(250), 0).map(c => c.length);
  check('바인드 없음: 모든 청크 ≤ 100', sizes.every(n => n <= D1_MAX_BIND), 'sizes=' + sizes.join(','));
  check('250개가 빠짐없이 분배', sizes.reduce((a, b) => a + b, 0) === 250);

  // tail 이 2개면 청크는 98 이하여야 총 100
  const s2 = chunkBinds(range(250), 2).map(c => c.length);
  check('tail 2개: 청크+2 ≤ 100', s2.every(n => n + 2 <= D1_MAX_BIND), 'sizes=' + s2.join(','));

  // 예약이 한도 이상이어도 무한루프 없이 최소 1개
  const s3 = chunkBinds(range(5), 999).map(c => c.length);
  check('예약이 한도 초과여도 진행(최소 1)', s3.length === 5 && s3.every(n => n === 1));
}

// ═══ B·C. 결과 누락 없음 + 바인드 순서 ═══
console.log('\nB·C. 나눠 던져도 전부 모이고, 바인드 순서가 SQL 과 일치');
{
  const ids = range(250);
  const db = fakeDB({ rowsFor: (c) => c.args.filter(a => String(a).startsWith('u')).map(u => ({ user_id: u })) });
  const rows = await selectInChunks(db, ids,
    (ph) => `SELECT user_id FROM t WHERE tid=? AND user_id IN (${ph}) AND at>=?`,
    { lead: ['T1'], tail: [12345] });

  check('행 250개 전부 수집(누락 없음)', rows.length === 250, 'got=' + rows.length);
  check('원소 집합이 정확히 일치',
    new Set(rows.map(r => r.user_id)).size === 250 && rows.every(r => ids.includes(r.user_id)));
  check('여러 번 나눠 던졌다', db.calls.length >= 3, 'calls=' + db.calls.length);

  const bad = db.calls.filter(c => c.args.length > D1_MAX_BIND);
  check('어떤 호출도 바인드 100개 초과 안 함', bad.length === 0,
    bad.length ? 'max=' + Math.max(...db.calls.map(c => c.args.length)) : '');

  const orderOk = db.calls.every(c =>
    c.args[0] === 'T1' && c.args[c.args.length - 1] === 12345 &&
    c.args.slice(1, -1).every(a => String(a).startsWith('u')));
  check('순서 = lead → IN 목록 → tail', orderOk);

  const phOk = db.calls.every(c => (c.sql.match(/\?/g) || []).length === c.args.length);
  check('SQL 의 ? 개수 = 바인드 개수', phOk);
}

// ═══ D. swallowErrors ═══
console.log('\nD. 선택적 집계 — 청크가 실패해도 나머지는 살린다');
{
  let n = 0;
  const db = fakeDB({ rowsFor: () => [{ ok: 1 }], failOn: () => (++n === 1) });
  const rows = await selectInChunks(db, range(250), (ph) => `SELECT 1 WHERE x IN (${ph})`,
    { swallowErrors: true });
  check('첫 청크 실패해도 나머지 수집', rows.length >= 1, 'rows=' + rows.length);

  let threw = false;
  const db2 = fakeDB({ failOn: () => true });
  try { await selectInChunks(db2, range(150), (ph) => `SELECT 1 WHERE x IN (${ph})`); }
  catch { threw = true; }
  check('기본값은 조용히 넘기지 않고 던진다', threw);
}

// ═══ E. runInChunks ═══
console.log('\nE. UPDATE 분할 — changes 합계');
{
  const db = fakeDB();
  const total = await runInChunks(db, range(250, 'i'),
    (ph) => `UPDATE t SET migrated_at=? WHERE id IN (${ph})`, { lead: [999] });
  // 가짜 D1 은 changes = 바인드 개수 → 합계 = 250 + lead 1개씩
  const expected = 250 + db.calls.length;
  check('changes 합계가 정확', total === expected, `got=${total} expected=${expected}`);
  check('UPDATE 도 바인드 100개 이하', db.calls.every(c => c.args.length <= D1_MAX_BIND));
  check('빈 배열이면 쿼리 안 던짐', (await runInChunks(fakeDB(), [], () => 'x')) === 0);
}

// ═══ F. franchiseInClause ═══
console.log('\nF. 지사 목록 조각 — 운영 실측 180개에서도 안전');
{
  const small = franchiseInClause(['서울', '부산']);
  check('소수는 바인드 유지', small.binds.length === 2 && small.clause.includes('?'));

  const big = franchiseInClause(range(180, 'FR'));
  check('180개: 바인드 0개(한도 회피)', big.binds.length === 0, 'binds=' + big.binds.length);
  check('180개: ? 가 남아있지 않다', !big.clause.includes('?'));
  check('180개: 값이 전부 들어있다', range(180, 'FR').every(v => big.clause.includes(`'${v}'`)));

  const quoted = franchiseInClause(range(80, 'FR').concat(["오'브라이언"]));
  check("따옴표가 '' 로 이스케이프", quoted.clause.includes("'오''브라이언'"), quoted.clause.slice(-40));
  check('따옴표 이스케이프 후 홀따옴표 짝이 맞음',
    (quoted.clause.match(/'/g) || []).length % 2 === 0);

  const ctl = franchiseInClause(range(80, 'FR').concat(['bad' + String.fromCharCode(10) + 'val']));
  check('제어문자 섞이면 넓히지 않고 차단(1=0)', ctl.clause === '1=0', ctl.clause.slice(0, 40));

  check('빈 목록은 차단(1=0)', franchiseInClause([]).clause === '1=0');
  check('별칭 접두사 반영', franchiseInClause(['서울'], 's.').clause.startsWith('s.franchise'));
}

// ═══ G. 회귀 감시 — 손으로 만든 IN 목록이 새로 생기면 알린다 ═══
console.log('\nG. 회귀 감시 — src 의 손수 만든 IN 목록');
{
  // 아래는 «상한이 코드로 확실히 묶여 있어» 100개를 넘을 수 없는 곳들.
  // 새 항목을 여기 넣을 땐 왜 안전한지(상한이 어디서 걸리는지)를 반드시 적을 것.
  const ALLOW = {
    'api-admin.ts': '강사 1명의 하루치 room_id / 요일 폼(최대 7) — 하루 수업 수로 상한',
    'api-ai.ts': '바로 위 쿼리가 LIMIT 10',
    'api-mango.ts': '학생 1명의 이름 후보 4개(student_name·korean_name·english_name·username) · 녹화 상태 필터는 허용목록 6개 상한(목록/CSV 두 곳)',
    'index.ts': 'keys.slice(0, 50)',
    'd1-chunk.ts': '이 모듈 자신(주석 및 헬퍼 구현)',
    // 🪙 GAME_QUIZ_RULES 는 코드에 박힌 상수 배열(현재 7개)이라 사용자 입력으로 늘지 않는다.
    //    규칙을 90개 넘게 추가할 일이 생기면 그때 selectInChunks 로 바꿀 것.
    'point-policy.ts': '게임·퀴즈 규칙 코드 상수 배열(고정 7개) — 입력으로 늘지 않음',
    // 🇵🇭 PH_MANAGERS 는 코드에 박힌 상수 배열(현재 3명)이라 사용자 입력으로 늘지 않는다.
    //    필리핀 본사 매니저가 90명을 넘길 일은 없다(사람이 손으로 추가하는 명단이다).
    'auth-admin.ts': '필리핀 매니저 명단 PH_MANAGERS 코드 상수 배열(현재 3명) — 입력으로 늘지 않음',
    // 💬 강사 카카오·문자 전달 — 두 곳 모두 «핸들러 첫머리에서 90개 초과를 400 으로 거절» 한다
    //    (send: profile_ids, mark-sent: log_ids). 화면에서도 90명을 넘기면 보내기가 막힌다.
    'teacher-kakao.ts': 'send/mark-sent 가 입력 90개 초과를 400 으로 반려 — 바인드가 90을 넘을 수 없음',
    // 🎬 DEMO_UIDS 는 코드에 박힌 상수 배열(['lms','type_seed'] 2개)이라 입력으로 늘지 않는다.
    //    class_schedules·attendance 에서 «학생이 안 붙은 자리표시» 계정을 빼는 용도이고,
    //    같은 목록을 api-admin.ts·api-teacher.ts 도 리터럴로 쓴다.
    'learning-insights.ts': '데모 계정 DEMO_UIDS 코드 상수 배열(고정 2개) — 입력으로 늘지 않음',
  };
  const offenders = [];
  for (const f of readdirSync(SRC).filter(x => x.endsWith('.ts'))) {
    const body = readFileSync(join(SRC, f), 'utf8');
    const hits = (body.match(/map\(\(\)\s*=>\s*'\?'\)/g) || []).length;
    if (hits && !ALLOW[f]) offenders.push(`${f}(${hits})`);
  }
  check('허용목록에 없는 새 IN 목록 없음', offenders.length === 0,
    offenders.length ? '새로 생김: ' + offenders.join(', ') + ' → selectInChunks 를 쓰거나 상한 근거를 ALLOW 에 적으세요' : '');

  // 매직넘버 90 청크가 되살아나지 않았는지
  const magic = readdirSync(SRC).filter(x => x.endsWith('.ts'))
    .filter(f => /\+=\s*90\b/.test(readFileSync(join(SRC, f), 'utf8')) && f !== 'd1-chunk.ts');
  check('손수 만든 90개 청크 루프 없음', magic.length === 0, magic.join(','));
}

console.log('\n' + '─'.repeat(56));
console.log(`  ${PASS} PASS · ${FAIL} FAIL`);
if (FAIL) { console.log('\n  실패:'); FAILS.forEach(x => console.log('   - ' + x)); }
process.exit(FAIL ? 1 : 0);
