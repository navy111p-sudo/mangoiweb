#!/usr/bin/env node
/**
 * 📜 수업 «종료(end)» 이력 기록 (2026-08-07)
 *
 * 무엇이 문제였나
 *   class_audit_log 에 종료를 쓰는 창구(POST /api/admin/class-audit)는 예전부터 있었는데
 *   **아무도 부르지 않았다.** 그래서 연기·삭제만 쌓이고 «종료» 칸은 영영 비어 있었다.
 *   관리자 「수업 변경 이력」 화면에서 종료는 한 건도 보이지 않는 상태였다.
 *
 * 어디에 붙였나
 *   POST /api/notify/lesson-ended — 실제 «수업이 끝났다» 신호가 지나가는 유일한 서버 지점.
 *   ⛔ 화상수업 DO(video-call-room.ts)에는 붙이지 않는다. «수업이 절대 안 끊김» 이 최우선인
 *      경로라, 기록 하나 때문에 실패 지점을 늘리지 않는다.
 *
 * 이 하니스가 지키는 것
 *   ① 기록이 실제로 연결돼 있을 것 (다시 «창구만 있고 부르는 데 없음» 으로 돌아가지 않게)
 *   ② 기록 실패가 알림을 막지 않을 것 (best-effort)
 *   ③ 같은 종료가 두 번 적히지 않을 것 — 이 요청은 keepalive/sendBeacon 으로 두 번 온다
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

const NOTIFY = read('cloudflare-deploy/src/api-notify.ts');
const AUDIT = read('cloudflare-deploy/src/class-audit.ts');

let PASS = 0, FAIL = 0;
const FAILS = [];
const check = (name, ok) => {
  if (ok) { PASS++; console.log('  ✅ ' + name); }
  else { FAIL++; FAILS.push(name); console.log('  ❌ ' + name); }
};

console.log('\n════════ 수업 종료(end) 이력 기록 ════════\n');

// ── ① 연결돼 있을 것 ──────────────────────────────────────────────
check('① api-notify 가 writeClassAudit 을 들여온다',
  /import\s*\{[^}]*writeClassAudit[^}]*\}\s*from\s*'\.\/class-audit'/.test(NOTIFY));

const endIdx = NOTIFY.indexOf("path === '/api/notify/lesson-ended'");
check('① lesson-ended 핸들러가 있다', endIdx > 0);

// 핸들러 본문(다음 라우트 전까지)만 잘라서 본다 — 다른 곳의 기록과 헷갈리지 않게.
const nextRoute = NOTIFY.indexOf("path === '/api/notify/chat-summary'", endIdx);
const BLOCK = endIdx > 0 ? NOTIFY.slice(endIdx, nextRoute > endIdx ? nextRoute : endIdx + 6000) : '';

check('① 종료 시점에 writeClassAudit 을 부른다', /writeClassAudit\s*\(/.test(BLOCK));
check("① action 이 'end' 다", /action:\s*'end'/.test(BLOCK));
check('① 어느 방인지(room_id) 함께 남긴다', /room_id:\s*roomIdForAudit/.test(BLOCK));
check('① 출처를 남긴다 (나중에 어디서 들어온 기록인지 알 수 있게)',
  /source:\s*'lesson-ended'/.test(BLOCK));

// ── ② 기록 실패가 알림을 막지 않을 것 ────────────────────────────
check('② writeClassAudit 자체가 throw 하지 않는다 (best-effort)',
  /export async function writeClassAudit[\s\S]{0,400}try\s*\{/.test(AUDIT));
check('② 호출부도 try/catch 로 감싼다', /try\s*\{[\s\S]*writeClassAudit[\s\S]*\}\s*catch/.test(BLOCK));
check('② 기록이 응답보다 앞에서 return 하지 않는다 (알림 결과는 그대로 반환)',
  BLOCK.indexOf('writeClassAudit') < BLOCK.indexOf('return json({ ok: true, count'));

// ── ③ 두 번 적히지 않을 것 ──────────────────────────────────────
//    🪤 종료 요청은 keepalive/sendBeacon 으로 중복 도착한다(녹화에서 이미 겪음).
check('③ 같은 방의 최근 end 를 먼저 확인한다',
  /SELECT 1 AS x FROM class_audit_log[\s\S]{0,160}action = 'end'[\s\S]{0,80}room_id = \?/.test(BLOCK));
check('③ 중복이면 새로 쓰지 않는다', /if\s*\(!dup\)/.test(BLOCK));
check('③ 중복 판정 창이 10분이다', /10 \* 60 \* 1000/.test(BLOCK));

// ── ④ 화상수업 흐름은 건드리지 않았을 것 ─────────────────────────
const DO = read('cloudflare-deploy/src/video-call-room.ts');
check('④ 화상수업 DO 에는 이력 기록을 넣지 않았다 (수업이 최우선)',
  !/writeClassAudit/.test(DO));

console.log('\n─────────────────────────────────────────────');
console.log(`  ${FAIL ? '⚠' : '✅'} PASS ${PASS}    ${FAIL ? '❌' : '⚠'} FAIL ${FAIL}   (총 ${PASS + FAIL})`);
if (FAIL) { console.log('\n  실패:'); FAILS.forEach((f) => console.log('    - ' + f)); }
console.log('─────────────────────────────────────────────\n');
process.exit(FAIL ? 1 : 0);
