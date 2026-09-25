#!/usr/bin/env node
/**
 * 🧾 결재 AI 필터 · 알림 단계 하니스 (2026-09-24)
 *
 * 무엇을 지키나
 *   ① 신호등(signalOf) — 🔴 는 «고치면 되는 것» 에만, 🟡 는 사람이 볼 것, 🟢 는 깨끗한 것.
 *      「🔴 가 된다」 옆에 「멀쩡한 건은 🔴 가 아니다」를 짝으로 둔다(짝이 없으면 «전부 🔴» 도 통과).
 *   ② 자동 반려(autoRejectable) — 경영진·긴급·인사급여·취소 결재는 절대 안 되돌린다.
 *      스위치는 모르면 'shadow'(표시만) — 'on' 으로 «조용히» 켜지지 않는다.
 *   ③ 꼼꼼 점검(runChecks) — 설명 없음·미래 날짜·오래된 지출·영수증 날짜 불일치·7일 중복.
 *   ④ 알림 단계(nudgePlan·nudgeLevel) — 4/8/12/24 시간, 긴급은 같은 비율로 짧게. 밤에는 쉰다.
 *   ⑤ 배선 — 푸시 알림이 «기기를 깨우는가»(2026-09-24 실측: 24건 전부 한 번도 안 떴다),
 *      올리기 전 점검 · AI 검토가 🟡 로만 들어가는가 · 사이렌이 304 에도 도는가.
 *
 * ⚠️ 문자열 검사만으로는 «판정» 을 못 본다 — 정본을 실제로 import 해서 돌린다.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dir, '..', 'cloudflare-deploy', 'src');
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');
const P = await import(pathToFileURL(join(SRC, 'approval-policy.ts')).href);
const API = readFileSync(join(SRC, 'api-approval.ts'), 'utf8');
const WORK = readFileSync(process.env.WORK_SRC || join(PUB, 'work.html'), 'utf8');

let pass = 0, fail = 0;
function ok(name, cond, why) {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (why ? ' — ' + why : '')); }
}
const codes = (arr) => (arr || []).map(x => x.code);
const H = 3600_000;

console.log('\n① 신호등');
{
  const clean = P.signalOf({ reqType: 'purchase', amount: 2500, ocrAmount: 2500, hasFile: true, flags: [] });
  ok('깨끗한 물품 구입은 🟢', clean.signal === 'green');
  const noFile = P.signalOf({ reqType: 'purchase', amount: 2500, ocrAmount: null, hasFile: false, flags: [] });
  ok('영수증 없는 물품 구입은 🔴', noFile.signal === 'red' && codes(noFile.reasons).includes('no_file'));
  const docNoFile = P.signalOf({ reqType: 'doc', amount: null, hasFile: false, flags: [] });
  ok('일반 문서는 첨부가 없어도 🔴 가 아니다(짝)', docNoFile.signal === 'green');
  const mis5 = P.signalOf({ reqType: 'expense', amount: 1050, ocrAmount: 1000, hasFile: true, flags: [] });
  ok('영수증과 5% 차이는 🔴 가 아니다(오타 수준)', mis5.signal !== 'red');
  const mis20 = P.signalOf({ reqType: 'expense', amount: 1200, ocrAmount: 1000, hasFile: true, flags: [] });
  ok('영수증과 20% 차이는 🔴', mis20.signal === 'red' && codes(mis20.reasons).includes('amount_mismatch_big'));
  const unread = P.signalOf({ reqType: 'expense', amount: 1200, ocrAmount: null, hasFile: true, flags: [] });
  ok('영수증을 못 읽으면 🟡(눈으로 확인)', unread.signal === 'yellow' && codes(unread.reasons).includes('ocr_unread'));
  const big = P.signalOf({ reqType: 'purchase', amount: 9000, ocrAmount: 9000, hasFile: true,
    flags: [{ code: 'unusual_amount', level: 'info', ko: 'x', en: 'x' }] });
  ok('평소보다 큰 금액은 🟡(🔴 아님 — 정상일 수 있다)', big.signal === 'yellow');
  const ai = P.signalOf({ reqType: 'purchase', amount: 900, ocrAmount: 900, hasFile: true,
    flags: [{ code: 'ai_review', level: 'info', ko: 'AI 검토: x', en: 'AI check: x' }] });
  ok('AI 검토 의견은 🟡 까지만(AI 는 되돌리지 못한다)', ai.signal === 'yellow');
  const dup = P.signalOf({ reqType: 'purchase', amount: 900, ocrAmount: 900, hasFile: true,
    flags: [{ code: 'duplicate_recent', level: 'warn', ko: 'x', en: 'x' }] });
  ok('7일 안 중복은 🔴', dup.signal === 'red');
  const dup30 = P.signalOf({ reqType: 'purchase', amount: 900, ocrAmount: 900, hasFile: true,
    flags: [{ code: 'duplicate', level: 'warn', ko: 'x', en: 'x' }] });
  ok('30일 안 같은 금액(매달 요금일 수 있음)은 🟡(짝)', dup30.signal === 'yellow');
}

console.log('\n② 자동 반려');
{
  ok('스위치를 모르면 shadow', P.autoRejectMode(null) === 'shadow' && P.autoRejectMode('yes') === 'shadow');
  ok('on/off 는 그대로', P.autoRejectMode('ON') === 'on' && P.autoRejectMode('off') === 'off');
  const base = { signal: 'red', reqType: 'purchase', requesterIsExec: false, reversesId: null };
  ok('필리핀 매니저의 🔴 물품 구입은 되돌릴 수 있다', P.autoRejectable(base) === true);
  ok('🟡 는 되돌리지 않는다', P.autoRejectable({ ...base, signal: 'yellow' }) === false);
  ok('경영진이 올린 건은 되돌리지 않는다', P.autoRejectable({ ...base, requesterIsExec: true }) === false);
  ok('긴급은 되돌리지 않는다', P.autoRejectable({ ...base, reqType: 'urgent' }) === false);
  ok('인사·급여는 되돌리지 않는다', P.autoRejectable({ ...base, reqType: 'hr' }) === false);
  ok('취소 결재는 되돌리지 않는다', P.autoRejectable({ ...base, reversesId: 12 }) === false);
}

console.log('\n③ 꼼꼼 점검');
{
  const NOW = Date.UTC(2026, 8, 24, 3, 0, 0);   // 2026-09-24 12:00 KST
  const run = (o) => codes(P.runChecks({ reqType: 'expense', amount: 1000, currency: 'PHP', hasFile: true,
    ocrAmount: 1000, now: NOW, ...o }));
  ok('설명이 없으면 no_reason', run({ body: 'ok' }).includes('no_reason'));
  ok('설명이 있으면 no_reason 없음(짝)', !run({ body: 'Printer ink for the Cebu classroom' }).includes('no_reason'));
  ok('설명을 안 넘기면 점검 안 함(옛 호출 그대로)', !run({}).includes('no_reason'));
  ok('미래 날짜는 spent_future', run({ body: 'Printer ink for class', spentAt: '2026-10-05' }).includes('spent_future'));
  ok('오늘·내일은 미래로 안 본다(시차)', !run({ body: 'Printer ink for class', spentAt: '2026-09-25' }).includes('spent_future'));
  ok('60일 넘은 지출은 spent_old', run({ body: 'Printer ink for class', spentAt: '2026-06-01' }).includes('spent_old'));
  ok('영수증 날짜와 다르면 date_mismatch',
    run({ body: 'Printer ink for class', spentAt: '2026-09-20', ocrSpentAt: '2026-09-01' }).includes('date_mismatch'));
  ok('영수증 날짜와 3일 안이면 불일치 아님(짝)',
    !run({ body: 'Printer ink for class', spentAt: '2026-09-20', ocrSpentAt: '2026-09-18' }).includes('date_mismatch'));
  ok('일반 문서에는 돈 점검을 안 건다',
    !codes(P.runChecks({ reqType: 'doc', hasFile: false, body: 'x', now: NOW })).includes('no_reason'));
  ok('7일 중복은 duplicate_recent, 30일만이면 duplicate',
    run({ duplicateCount: 1, duplicateRecentCount: 1 }).includes('duplicate_recent') &&
    run({ duplicateCount: 1, duplicateRecentCount: 0 }).includes('duplicate'));
  const sNo = P.signalOf({ reqType: 'expense', amount: 1000, ocrAmount: 1000, hasFile: true,
    flags: P.runChecks({ reqType: 'expense', amount: 1000, currency: 'PHP', hasFile: true, ocrAmount: 1000, body: '', now: NOW }) });
  ok('설명 없음은 신호등 🔴(올리기 전에 고치게)', sNo.signal === 'red');
}

console.log('\n④ 알림 단계');
{
  const t0 = Date.UTC(2026, 8, 24, 0, 0, 0);
  const p = P.nudgePlan('purchase', t0);
  ok('물품: 4/8/12/24 시간', p.pushAt - t0 === 4 * H && p.smsAt - t0 === 8 * H && p.sirenAt - t0 === 12 * H && p.escalateAt - t0 === 24 * H);
  const u = P.nudgePlan('urgent', t0);
  ok('긴급은 같은 비율로 짧다(2시간 승격)', u.escalateAt - t0 === 2 * H && u.sirenAt - t0 === 1 * H);
  const d = P.nudgePlan('doc', t0);
  ok('마감이 긴 분류(48h)도 24시간에 승격(늦추지 않는다)', d.escalateAt - t0 === 24 * H);
  ok('단계 판정', P.nudgeLevel(p, t0 + 3 * H) === 0 && P.nudgeLevel(p, t0 + 5 * H) === 1 &&
    P.nudgeLevel(p, t0 + 9 * H) === 2 && P.nudgeLevel(p, t0 + 13 * H) === 3);
  ok('단계 시작은 마감에서 거꾸로 센다', P.stageStartOf('purchase', t0 + 24 * H) === t0 && P.stageStartOf('purchase', null) === null);
  ok('밤 23시 KST 는 쉰다', P.isQuietKst(Date.UTC(2026, 8, 24, 14, 0)) === true);
  ok('낮 12시 KST 는 안 쉰다(짝)', P.isQuietKst(Date.UTC(2026, 8, 24, 3, 0)) === false);
  ok('요약은 9시·17시에만', P.digestSlotKst(Date.UTC(2026, 8, 24, 0, 10)) === '2026-09-24:9' &&
    P.digestSlotKst(Date.UTC(2026, 8, 24, 8, 30)) === '2026-09-24:17' &&
    P.digestSlotKst(Date.UTC(2026, 8, 24, 3, 0)) === null);
}

console.log('\n⑤ 배선');
{
  const notifyFn = API.slice(API.indexOf('async function notify('), API.indexOf('async function smsFallback('));
  ok('푸시 알림이 기기를 깨운다(broadcastWebPush)', /broadcastWebPush\(queued/.test(notifyFn));
  ok('못 깨우면 «못 닿은 사람» 으로 센다(문자 폴백이 돈다)', /else missed\.push\(u\)/.test(notifyFn));
  ok('올리기 전 점검 경로가 있다', /path === '\/api\/approval\/precheck'/.test(API));
  const pre = API.slice(API.indexOf("path === '/api/approval/precheck'"), API.indexOf("path === '/api/approval/ocr'"));
  ok('점검은 저장하지 않는다(INSERT·UPDATE 없음)', !/INSERT|UPDATE/.test(pre));
  ok('AI 검토는 🟡(info) 로만 들어간다', /code: 'ai_review', level: 'info'/.test(API));
  ok('자동 반려는 스위치가 on 일 때만', /arMode === 'on' && autoRejectable\(/.test(API));
  ok('자동 반려는 조건부 UPDATE(대기·1단계일 때만)', /decided_by = 'ai-auto'[\s\S]{0,200}status = 'pending' AND IFNULL\(stage_seq, 1\) = 1/.test(API));
  ok('밤에는 알림 단계를 올리지 않는다', /if \(r\.req_type !== 'urgent' && isQuietKst\(now\)\) target = Math\.min\(target, Math\.max\(cur, 1\)\)/.test(API));
  ok('요약은 KV 로 한 번만(못 쓰면 안 보냄)', /if \(slot && kv\)/.test(API) && /approval_digest:/.test(API));
  ok('화면: 올리기 전에 precheck 를 부른다', /fetch\('\/api\/approval\/precheck'/.test(WORK));
  // 2026-09-25 14단계: 실패 처리가 afterCheck(null) 로 모였다 — «식 모양» 이 아니라 «뜻» 으로 본다.
  //   catch 가 afterCheck(null) 을 부르고, afterCheck 는 점검 결과가 없으면(!j) 그대로 올린다.
  ok('화면: 점검이 실패하면 막지 않는다',
     /\.catch\(function\(\)\{\s*if \(btn\) btn\.disabled = false;\s*if \(pbox\) pbox\.innerHTML = '';\s*(PRE_OK = true; submitReq\(\);|afterCheck\(null\);)/.test(WORK) &&
     (!/afterCheck\(null\)/.test(WORK) || /if \(!j \|\| [^)]*\) \{[^}]*PRE_OK = true; submitReq\(\);/.test(WORK)));
  ok('화면: 사이렌은 304 에도 매 회차 본다', /load\(\)\.then\(sirenCheck, sirenCheck\)/.test(WORK));
  ok('화면: 사이렌은 대신 결재·같은 결재자 건으로 안 운다', /if \(r\.by_proxy \|\| r\.same_decider\) continue;/.test(WORK));
  ok('화면: 반려 버튼 사유는 영/한 둘 다 보낸다', /var wm = WHYS\[i\]\.en \+ ' \/ ' \+ WHYS\[i\]\.ko;/.test(WORK));
}

console.log('\n──────────────');
console.log(fail ? `  ❌ ${fail}건 실패 / ${pass + fail}건` : `  ✅ ${pass}건 전부 통과`);
process.exit(fail ? 1 : 0);
