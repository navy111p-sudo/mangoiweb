#!/usr/bin/env node
/**
 * 🪙 포인트 정책 7가지 (2026-08-07 사장님 승인)
 *
 *   ① 적립 — 출석 10P · 칭찬 5P · 게임/퀴즈 하루 최대 30P · 숙제 10P
 *   ② 하루 전체 상한 100P
 *   ③ 유효기간 12개월 · 만료 30일 전 1회 안내
 *   ④ 교환 최소 3,000P
 *   ⑤ 환불·취소 시 그 수업 포인트만 회수(이미 교환한 건 회수 안 함)
 *   ⑥ 체험(게스트) 적립 O · 교환 X
 *   ⑦ 관리자 수동 조정 — 사유 필수 · 기록 영구 보관
 *
 * 이 하니스는 «값이 정책과 같은가» 를 글자로 확인할 뿐 아니라,
 * 상한 판정 함수를 **떼어내 실제로 실행**해 경계에서 맞게 막는지 본다.
 * ⚠️ 값을 바꾸려면 point-policy.ts 만 고치면 되고, 그러면 이 하니스가 먼저 알려 준다.
 */
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const POLICY = read('cloudflare-deploy/src/point-policy.ts');
const POINTS = read('cloudflare-deploy/src/api-points.ts');
const INDEX = read('cloudflare-deploy/src/index.ts');

let PASS = 0, FAIL = 0;
const FAILS = [];
const check = (name, ok) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name); }
};

console.log('\n════════ 포인트 정책 7가지 ════════\n');

// ── ① 적립 금액 ────────────────────────────────────────────────
check('① 출석 10P', /attendance:\s*10\b/.test(POLICY));
check('① 칭찬 5P', /praise:\s*5\b/.test(POLICY));
check('① 게임·퀴즈 하루 30P', /game_quiz_daily:\s*30\b/.test(POLICY));
check('① 숙제 10P', /homework:\s*10\b/.test(POLICY));
check('① 승인 금액을 규칙표에 맞추는 코드가 있다', /syncApprovedRuleAmounts/.test(POLICY));
check('① 포인트 표를 만들 때 그 맞춤이 실제로 불린다', /await syncApprovedRuleAmounts\(env\)/.test(POINTS));

// ── ② 하루 전체 상한 ──────────────────────────────────────────
check('② 하루 전체 상한 100P', /DAILY_TOTAL_CAP:\s*100\b/.test(POLICY));
check('② 적립 창구가 상한을 실제로 확인한다', /await checkEarnAllowed\(env, userId, ruleCode/.test(POINTS));
check('② 상한에 걸리면 한/영 두 벌로 알려 준다',
  /message_ko:[\s\S]{0,400}message_en:/.test(POINTS.slice(POINTS.indexOf('checkEarnAllowed'))));

// 상한 판정을 떼어내 실제로 실행 — 경계에서 맞게 막는가
{
  const src = POLICY.slice(POLICY.indexOf('export async function checkEarnAllowed'));
  const body = src.slice(0, src.indexOf('\n}\n') + 3)
    .replace(/export async function/, 'async function')
    .replace(/:\s*Promise<[^>]*>/, '')
    .replace(/:\s*(any|string|number|boolean)\b/g, '');
  const ctx = {
    console,
    POINT_POLICY: { DAILY_TOTAL_CAP: 100, EARN: { game_quiz_daily: 30 } },
    GAME_QUIZ_RULES: ['rescue_sentence'],
    /* 🎖 (2026-09-01) «다시 오지 않는» 마디 보상은 상한을 지나지 않는다 —
       그 목록도 문맥에 넣어야 오려 낸 함수가 돈다(정본 point-policy.ts 의 CAP_EXEMPT_RULES). */
    CAP_EXEMPT_RULES: ['ai_writing_streak', 'attendance_streak'],
    earnedToday: async () => ctx.__today,
    earnedTodayForGames: async () => ctx.__game,
    __today: 0, __game: 0,
  };
  ctx.window = ctx;              // 🪤 맨 이름 ReferenceError 가 catch 에 먹히지 않도록
  vm.createContext(ctx);
  vm.runInContext(body + '\nglobalThis.__f = checkEarnAllowed;', ctx);
  const run = async (today, game, rule, amt) => {
    ctx.__today = today; ctx.__game = game;
    return await ctx.__f({}, 'u', rule, amt);
  };
  /* 🪤 반드시 **하나씩** 돌린다. Promise.all 로 묶으면 네 경우가 같은 ctx 의
     시험값(__today/__game)을 서로 덮어써서 통과·실패가 뒤바뀐다(실제로 겪음). */
  const r = [];
  r.push(await run(90, 0, 'attendance', 10));     // 정확히 100 → 통과해야
  r.push(await run(95, 0, 'attendance', 10));     // 105 → 막혀야
  r.push(await run(0, 25, 'rescue_sentence', 5)); // 게임 30 → 통과
  r.push(await run(0, 28, 'rescue_sentence', 5)); // 게임 33 → 막혀야
  check('② 실행: 하루 정확히 100점까지는 적립된다', r[0].ok === true);
  check('② 실행: 100점을 넘기면 막는다', r[1].ok === false && r[1].error === 'daily_total_cap_reached');
  check('① 실행: 게임 정확히 30점까지는 적립된다', r[2].ok === true);
  check('① 실행: 게임 30점을 넘기면 막는다', r[3].ok === false && r[3].error === 'game_daily_cap_reached');
}

// ── ③ 유효기간 ────────────────────────────────────────────────
check('③ 유효기간 12개월', /EXPIRY_MONTHS:\s*12\b/.test(POLICY));
check('③ 만료 30일 전 안내', /EXPIRY_NOTICE_DAYS:\s*30\b/.test(POLICY));
check('③ 소멸 처리 함수가 있다', /export async function runPointExpirySweep/.test(POLICY));
check('③ 매일 도는 크론에 실제로 걸려 있다', /runPointExpirySweep\(env as any\)/.test(INDEX));
check('③ 안내·소멸이 각각 한 번만 (멱등 기록표)', /point_expiry_log/.test(POLICY));
check('③ 소멸도 거래로 남긴다 (그냥 0으로 덮지 않는다)',
  /type:\s*'expire'/.test(POLICY) && /applyPointTransaction/.test(POLICY));

// ── ④ 교환 최소 ───────────────────────────────────────────────
check('④ 교환 최소 3,000P', /MIN_REDEEM:\s*3000\b/.test(POLICY));
check('④ 교환 창구가 최소 금액을 확인한다', /below_min_redeem/.test(POINTS));
check('④ 최소 금액은 상품값이 아니라 «잔액» 기준이다',
  /currentBalance < POINT_POLICY\.MIN_REDEEM/.test(POINTS));

// ── ⑤ 회수 ────────────────────────────────────────────────────
check('⑤ 회수 함수가 있다', /export async function clawbackClassPoints/.test(POLICY));
check('⑤ 이미 교환한 포인트는 회수하지 않는다 (잔액까지만)',
  /Math\.min\(earned, Number\(bal\?\.balance \|\| 0\)\)/.test(POLICY));
check('⑤ 잔액을 음수로 만들지 않는다', /Math\.max\(0,\s*Math\.min\(earned/.test(POLICY));

// ── ⑥ 게스트 ──────────────────────────────────────────────────
check('⑥ 게스트 적립 O', /GUEST_CAN_EARN:\s*true/.test(POLICY));
check('⑥ 게스트 교환 X', /GUEST_CAN_REDEEM:\s*false/.test(POLICY));
check('⑥ 교환 창구가 게스트를 막는다', /guest_cannot_redeem/.test(POINTS));
check('⑥ 게스트 판정은 /^guest/i (bare guest 도 포함)', /\/\^guest\/i\.test\(userId\)/.test(POINTS));

// ── ⑦ 관리자 수동 조정 ────────────────────────────────────────
check('⑦ 사유 필수 정책', /ADMIN_ADJUST_REASON_REQUIRED:\s*true/.test(POLICY));
check('⑦ 수동 조정 창구가 사유를 요구한다', /reason_required/.test(POINTS));
check('⑦ 기본 문구로 슬쩍 통과되지 않는다 (원본 body.reason 을 본다)',
  /const rawReason = String\(body\.reason \|\| ''\)\.trim\(\)/.test(POINTS));
check('⑦ 사유 안내도 한/영 두 벌', /수동 조정은 사유를[\s\S]{0,200}A reason is required/.test(POINTS));

console.log('\n─────────────────────────────────────────────');
console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS}    ${FAIL ? '❌' : '⚠'} FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) { console.log('\n  실패:'); FAILS.forEach((f) => console.log('    - ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
