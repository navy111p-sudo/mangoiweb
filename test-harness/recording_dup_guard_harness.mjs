// -*- coding: utf-8 -*-
// 🧪 같은 방 «동시 녹화» 방지 — 판정을 실제로 돌려서 확인 (2026-09-08)
//   실행:  node test-harness/recording_dup_guard_harness.mjs
//
//   [무슨 사고였나 — 사장님 「왜 자꾸 동시에 두번씩 녹화가 되는 거지?」]
//     9/8 운영 D1 실측: class-1924 는 「교사 Teacher - Farrah」(강사 기기)와 「ysyt01」(학생 기기)이
//     1분 43초 차로 각각 시작했고, class-2069 는 10분 7초 차였다. 두 파일은 내용이 같다.
//     2026-09-02 에 넣은 화면 쪽 「강사는 자동 녹화 안 함」이 날마다 갈렸다(9/4 0건 · 9/8 4건).
//     ⟹ 서버가 «두 번째» 를 거절한다. 왜 화면 판정이 안 걸렸는지는 아직 못 쟀고, 이 게이트는 묻지 않는다.
//
//   [이 하니스가 실제로 하는 일 — 문자열 검사만 하지 않는다]
//     A. recording-dup-guard.ts 의 recordingDupGate 를 **컴파일 없이 실제로 실행**한다.
//        경계(창 안·창 밖·경계값)와 «모르면 안 막는다»(null·undefined·미래·NaN)를 짝으로 본다.
//        ⛔ «막는다» 만 넣으면 «전부 막기» 도 통과하고, «안 막는다» 만 넣으면 «아무것도 안 막기» 도 통과한다.
//     B. 서버 SQL 이 정본이 «읽겠다» 고 선언한 칸(id·teacher_name·alive_at)을 실제로 뽑는지 대조한다.
//        (CLAUDE.md 「SELECT … AS 별칭만 두면 헬퍼가 읽는 필드가 결과 행에 없다」 — 그 사고의 예방)
//     C. 실패가 «찍는 쪽» 으로 떨어지는지 — 조회 try/catch 가 null 을 넣는지, 200 으로 답하는지.
//     D. 화면(mango-rec.js)이 already_recording 을 알아보고, 본문 글자로 말하고,
//        «영영 포기» 하지 않는지(재시도 대기 + autoRecStarted 되돌리기).
//     E. 변이시험 — 게이트를 되돌리면 실제로 FAIL 이 나는지.

import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC_DIR = join(ROOT, 'cloudflare-deploy/src');
const GUARD_SRC = readFileSync(join(SRC_DIR, 'recording-dup-guard.ts'), 'utf8');
const MANGO = readFileSync(join(SRC_DIR, 'api-mango.ts'), 'utf8');
const REC_JS = readFileSync(join(ROOT, 'cloudflare-deploy/public/js/mango-rec.js'), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

/** 주석을 벗긴 사본 — 부정 검사는 «내가 쓴 설명 주석» 을 잡으면 안 된다 */
function strip(t) {
  let out = '', inBlock = false;
  for (const line of t.split('\n')) {
    let s = line;
    if (inBlock) { const e = s.indexOf('*/'); if (e < 0) { out += '\n'; continue; } s = s.slice(e + 2); inBlock = false; }
    for (;;) {
      const b = s.indexOf('/*');
      if (b < 0) break;
      const e = s.indexOf('*/', b + 2);
      if (e < 0) { s = s.slice(0, b); inBlock = true; break; }
      s = s.slice(0, b) + s.slice(e + 2);
    }
    out += s.replace(/^[ \t]*\/\/.*$/, '') + '\n';
  }
  return out;
}

console.log('🧪 같은 방 «동시 녹화» 방지 — recording-dup-guard');

// ═══════════════ A. 정본을 실제로 돌린다 ═══════════════
console.log('\nA. recordingDupGate — 실제 실행 (node 타입 제거)');
function runGuard(srcOverride) {
  const tmp = mkdtempSync(join(tmpdir(), 'rdg-'));
  writeFileSync(join(tmp, 'recording-dup-guard.ts'), srcOverride || GUARD_SRC);
  const runner = `
    import { recordingDupGate, REC_DUP_LIVE_WINDOW_MS as W } from './recording-dup-guard.ts';
    const NOW = 1_800_000_000_000;
    const row = (alive, extra) => Object.assign({ id: 7, teacher_name: '교사 Teacher Kaye', alive_at: alive }, extra || {});
    const out = [];
    const t = (name, input, wantBlock) => {
      const g = recordingDupGate(input);
      out.push([name, g.block === wantBlock, JSON.stringify(g)]);
    };
    // ── «막는다» 쪽 ────────────────────────────────────────────────
    t('A-1 30초 전 파트 → 막는다', { rows: [row(NOW - 30_000)], now: NOW }, true);
    t('A-2 방금 시작(파트 없음, alive=started_at) → 막는다', { rows: [row(NOW - 1_000)], now: NOW }, true);
    t('A-3 창 «안» 경계(정확히 W 전) → 막는다', { rows: [row(NOW - W)], now: NOW }, true);
    t('A-4 여러 행 중 하나만 살아 있어도 막는다', { rows: [row(NOW - 99 * 60_000), row(NOW - 10_000)], now: NOW }, true);
    t('A-5 10초 «미래»(서버 시각 오차) → 막는다 — 되던 것을 깨지 않는다', { rows: [row(NOW + 10_000)], now: NOW }, true);
    // ── «안 막는다» 쪽 (전부 «찍는 쪽» 으로 실패한다) ──────────────
    t('A-6 조회 실패(null) → 안 막는다', { rows: null, now: NOW }, false);
    t('A-7 조회 실패(undefined) → 안 막는다', { rows: undefined, now: NOW }, false);
    t('A-8 진행 중 녹화 없음(빈 배열) → 안 막는다', { rows: [], now: NOW }, false);
    t('A-9 창 «밖»(W+1ms 전, 유령) → 안 막는다', { rows: [row(NOW - W - 1)], now: NOW }, false);
    t('A-10 alive_at 이 null(모름) → 안 막는다', { rows: [row(null)], now: NOW }, false);
    t('A-11 alive_at 이 문자열 쓰레기 → 안 막는다', { rows: [row('x')], now: NOW }, false);
    t('A-12 alive_at 이 0 → 안 막는다', { rows: [row(0)], now: NOW }, false);
    t('A-13 alive_at 이 «한 시간 미래»(잘못 적힌 행) → 안 막는다 — 방을 영구히 잠그지 않는다', { rows: [row(NOW + 3_600_000)], now: NOW }, false);
    t('A-14 now 가 NaN → 안 막는다', { rows: [row(NOW)], now: NaN }, false);
    t('A-15 rows 에 null 이 섞여도 던지지 않는다', { rows: [null, row(NOW - 5_000)], now: NOW }, true);
    // ── 부수 정보 ──────────────────────────────────────────────────
    const g = recordingDupGate({ rows: [row(NOW - 5_000)], now: NOW });
    out.push(['A-16 막을 때 «누가 찍는지» 를 함께 준다', g.by === '교사 Teacher Kaye' && g.holderId === 7, JSON.stringify(g)]);
    const g2 = recordingDupGate({ rows: null, now: NOW });
    out.push(['A-17 조회 실패 사유가 lookup_failed 로 구분된다', g2.reason === 'lookup_failed', JSON.stringify(g2)]);
    console.log(JSON.stringify(out));
  `;
  writeFileSync(join(tmp, 'run.mjs'), runner);
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
  rmSync(tmp, { recursive: true, force: true });
  const last = (r.stdout || '').trim().split('\n').pop() || '';
  try { return JSON.parse(last); } catch { return { err: (r.stderr || r.stdout || '실행 실패').slice(0, 400) }; }
}
{
  const res = runGuard(null);
  if (Array.isArray(res)) for (const [name, ok, got] of res) check(name + (ok ? '' : ` — 실제: ${got}`), ok);
  else check('A. 정본 실행 자체가 실패: ' + res.err, false);
}

// ═══════════════ B. 서버 SQL 이 정본이 읽는 칸을 실제로 뽑는가 ═══════════════
console.log('\nB. 서버 조회 ↔ 정본 인터페이스 대조');
{
  /* ⚠️ 앵커를 «FROM recordings r» 로 잡으면 안 된다 — 이 파일에 4곳 있어서 첫 번째(무관한 조회)를
     잘라 놓고 「SQL 이 틀렸다」는 거짓 FAIL 을 낸다(실제로 한 번 그렇게 났다).
     게이트가 만든 지역변수를 앵커로 삼아 **그 블록 안에서만** 찾는다. */
  const gate0 = MANGO.indexOf("dupRows: any[] | null = null");
  const i = gate0 > 0 ? MANGO.indexOf("FROM recordings r", gate0) : -1;
  check('B-1 start 핸들러에 «진행 중 녹화» 조회가 있다', i > 0);
  const sqlStart = i > 0 ? MANGO.lastIndexOf('`', i) : -1;
  const sqlEnd = i > 0 ? MANGO.indexOf('`', i) : -1;
  const sql = i > 0 ? MANGO.slice(sqlStart, sqlEnd + 1) : '';
  check('B-1b 잘라 낸 것이 그 게이트의 SQL 이다(엉뚱한 조회를 재지 않는다)',
    sql.length > 80 && sql.length < 900 && /recording_parts/.test(sql));
  // 정본이 «읽겠다» 고 선언한 칸을 소스에서 읽어 온다 — 손으로 적지 않는다
  const iface = /export interface LiveRecordingRow \{([\s\S]*?)\n\}/.exec(GUARD_SRC);
  const wanted = iface ? [...iface[1].matchAll(/^\s*([A-Za-z_][\w]*)\??\s*:/gm)].map(m => m[1]) : [];
  check('B-2 정본 인터페이스에서 읽을 칸을 뽑았다(손으로 적지 않았다)', wanted.length >= 3);
  for (const col of wanted) {
    check(`B-3 SQL 이 «${col}» 을 그 이름으로 내려준다`, new RegExp(`\\bAS\\s+${col}\\b`, 'i').test(sql));
  }
  check('B-4 status = \'recording\' 인 행만 본다(끝난 녹화는 안 막는다)', /status\s*=\s*'recording'/.test(sql));
  check('B-5 room_id 로 좁힌다(다른 방 녹화가 걸리지 않는다)', /r\.room_id\s*=\s*\?/.test(sql));
  check('B-6 살아있음은 recording_parts.created_at 의 MAX 로 잰다',
    /MAX\(p\.created_at\)/.test(sql) && /FROM recording_parts p/.test(sql));
  check('B-7 파트는 «서브쿼리» 로 붙인다 — LEFT JOIN 이면 파트 수만큼 행이 늘어 같은 녹화가 여러 번 걸린다',
    !/LEFT\s+JOIN/i.test(sql));
  check('B-8 파트가 아직 없으면 started_at 으로 떨어진다(첫 5MiB 구간)', /COALESCE\(\(SELECT MAX/.test(sql));
}

// ═══════════════ C. 실패는 «찍는 쪽» 으로 떨어진다 ═══════════════
console.log('\nC. 실패 방향 — 막는 쪽으로 실패하지 않는다');
{
  const gi = MANGO.indexOf("dupRows: any[] | null = null");
  check('C-1 게이트가 start 핸들러 안에 있다', gi > 0);
  const block = gi > 0 ? MANGO.slice(gi, gi + 2600) : '';
  check('C-2 조회 예외를 잡아 «모른다»(null) 로 떨어뜨린다 — 표가 없어도 녹화는 시작된다',
    /catch[\s\S]{0,200}dupRows\s*=\s*null/.test(block));
  check('C-3 판정 결과를 «조건으로» 쓴다(부르기만 하지 않는다)', /if\s*\(gate\.block\)/.test(block));
  check('C-4 거절은 HTTP 200 + ok:false — 화면이 «실패» 로 오인해 재시도 폭주하지 않게',
    /error:\s*'already_recording'[\s\S]{0,400}\}\s*,\s*200\s*\)/.test(block));
  check('C-5 거절할 때 «누가 찍고 있는지» 를 함께 내려준다(화면이 사람에게 말한다)', /by:\s*gate\.by/.test(block));
  // 게이트 전체가 try 로 감싸여 있는가 — 판정이 던져도 녹화는 시작돼야 한다
  const outerTry = MANGO.lastIndexOf('try {', gi);
  check('C-6 게이트 전체가 try 로 감싸여 있다(판정이 던져도 녹화는 시작된다)',
    outerTry > 0 && /catch[\s\S]{0,160}통과시킴/.test(MANGO.slice(gi, gi + 3000)));
  check('C-7 INSERT 보다 «앞» 에서 판정한다', gi < MANGO.indexOf('INSERT INTO recordings'));
}

// ═══════════════ D. 화면 — 사유를 말하고, 영영 포기하지 않는다 ═══════════════
console.log('\nD. 화면(mango-rec.js)');
{
  const js = strip(REC_JS);
  check('D-1 already_recording 을 알아본다', /dupBlocked\s*=\s*\(startRes\?\.error === 'already_recording'\)/.test(js));
  check('D-2 사유를 «본문 글자» 로 말한다 — 툴팁은 폰에서 안 보인다',
    /timeEl\.textContent[\s\S]{0,400}다른 기기가 녹화 중/.test(js));
  check('D-3 성공하면 플래그를 푼다', /dupBlocked = false;\s*dupBlockedBy = '';\s*startRetryAt = 0;/.test(js));
  check('D-4 실패하면 다음 시도를 미룬다(3초 폴링이 서버를 두드리지 않게)',
    /startRetryAt = Date\.now\(\) \+ START_RETRY_MS/.test(js));
  check('D-5 자동 시작 조건이 그 대기시간을 실제로 본다', /Date\.now\(\) >= startRetryAt/.test(js));
  check('D-6 «영영 포기» 하지 않는다 — 시작 못 했으면 autoRecStarted 를 되돌린다',
    /if \(!isRecording\) autoRecStarted = false;/.test(js));
  check('D-7 사람이 배지를 누르면 대기시간을 건너뛴다', /startRetryAt = 0;\s*\/\/[^\n]*|startRetryAt = 0;[\s\S]{0,120}Starting…/.test(js));
  check('D-8 방을 나가면 플래그를 푼다(다음 수업까지 끌고 가지 않는다)',
    /!inCall && \(dupBlocked \|\| startRetryAt\)/.test(js));
  check('D-9 «다른 기기가 찍는 중» 에 경고창을 띄우지 않는다(정상적으로 양보한 상태다)',
    /!auto && dupBlocked[\s\S]{0,200}console\.log/.test(js));
  // 재시도 간격이 살아있음 창보다 짧아야 «상대가 죽으면 이어받는다» 가 성립한다
  const mRetry = /const START_RETRY_MS = (\d+) \* (\d+);/.exec(js);
  const retryMs = mRetry ? Number(mRetry[1]) * Number(mRetry[2]) : NaN;
  const mWin = /export const REC_DUP_LIVE_WINDOW_MS = (\d+) \* (\d+) \* (\d+);/.exec(GUARD_SRC);
  const winMs = mWin ? Number(mWin[1]) * Number(mWin[2]) * Number(mWin[3]) : NaN;
  check(`D-10 재시도 간격(${retryMs}ms)이 살아있음 창(${winMs}ms)보다 짧다 — 상대가 죽으면 이어받는다`,
    Number.isFinite(retryMs) && Number.isFinite(winMs) && retryMs < winMs);
}

// ═══════════════ E. 변이시험 — 되돌리면 실제로 FAIL 이 나는가 ═══════════════
console.log('\nE. 변이시험 (되돌려 보고 진짜 잡히는지)');
{
  const mutants = [
    ['E-1 «창 밖 유령» 도 막게 바꾸면', GUARD_SRC.replace('if (alive < now - windowMs) continue;', '')],
    ['E-2 조회 실패(null)에도 막게 바꾸면', GUARD_SRC.replace(
      "if (!input || !Array.isArray(input.rows)) return pass('lookup_failed');",
      "if (!input || !Array.isArray(input.rows)) return { block: true, by: '', holderId: null, reason: 'live' };")],
    ['E-3 미래 시각을 «살아 있음» 으로 세면', GUARD_SRC.replace('if (alive > now + FUTURE_SLACK_MS) continue;', '')],
    ['E-4 아무것도 안 막게 바꾸면', GUARD_SRC.replace("return {\n      block: true,", "return {\n      block: false,")],
  ];
  for (const [name, src] of mutants) {
    if (src === GUARD_SRC) { check(`${name} — 변이가 소스에 적용되지 않았다(검사가 헛돈다)`, false); continue; }
    const res = runGuard(src);
    const broke = Array.isArray(res) ? res.some(([, ok]) => !ok) : true;
    check(`${name} 실제로 FAIL 난다`, broke);
  }
}

console.log(`\n${'='.repeat(60)}\n결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) { console.log('실패:'); for (const f of FAILS) console.log('  - ' + f); }
process.exit(FAIL ? 1 : 0);
