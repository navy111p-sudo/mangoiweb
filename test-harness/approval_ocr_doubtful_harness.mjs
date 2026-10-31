// -*- coding: utf-8 -*-
// 🧾 엉터리 AI 영수증 판독으로 자동 반려하지 않는가 (2026-10-08 Karl #11 실사고)
//   실행: node test-harness/approval_ocr_doubtful_harness.mjs
//
//   사고: 손글씨 영수증(10-7-26 · TOTAL 5,760)을 무료 비전 모델이 「2015-05-03 · ₱4,400」으로 읽었고,
//         그 4,400 이 «영수증과 금액이 10% 넘게 다름» 🔴 → AI 자동 반려가 됐다. 멀쩡한 건이 막혔다.
//   지키는 것:
//     ① 판정 ocrReadDoubtful — 1년 넘게 과거·하루 넘게 미래면 엉터리, 날짜를 못 읽었으면 «모름»(예전대로)
//     ② 엉터리 판독을 빼면 그 건은 🔴 가 아니다(짝: 정상 날짜의 큰 금액 차이는 여전히 🔴)
//     ③ 배선 — 올리기·올리기 전 신호등·판독 API 세 곳이 그 판정을 실제로 쓰는가
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFileSync } from 'node:fs';

const __dir = dirname(fileURLToPath(import.meta.url));
const SRC = resolve(__dir, '../cloudflare-deploy/src');
const P = await import(pathToFileURL(join(SRC, 'approval-policy.ts')).href);
const { ocrReadDoubtful, ocrDoubtfulFlag, runChecks, signalOf } = P;
const strip = t => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const API = strip(readFileSync(join(SRC, 'api-approval.ts'), 'utf8'));
const WORK = readFileSync(resolve(__dir, '../cloudflare-deploy/public/work.html'), 'utf8');

let PASS = 0, FAIL = 0;
const ok = (name, cond, extra) => { if (cond) { PASS++; console.log('  ✅ ' + name); } else { FAIL++; console.log('  ❌ FAIL ' + name + (extra ? ' — ' + extra : '')); } };

// 2026-10-07 16:10 KST (Karl 이 올린 시각)
const NOW = Date.UTC(2026, 9, 7, 7, 10);

console.log('① 판정');
ok('2015-05-03(실사고 판독) → 엉터리', ocrReadDoubtful('2015-05-03', NOW) === true);
ok('2026-10-07(오늘) → 믿음', ocrReadDoubtful('2026-10-07', NOW) === false);
ok('2026-07-07(석 달 전) → 믿음', ocrReadDoubtful('2026-07-07', NOW) === false);
ok('2025-10-06(1년 하루 전) → 믿음', ocrReadDoubtful('2025-10-06', NOW) === false);
ok('2025-10-05 → 엉터리(366일 넘음)', ocrReadDoubtful('2025-10-05', NOW) === true);
ok('2026-10-08(내일) → 믿음', ocrReadDoubtful('2026-10-08', NOW) === false);
ok('2026-10-10(사흘 뒤) → 엉터리', ocrReadDoubtful('2026-10-10', NOW) === true);
ok('날짜 못 읽음(null) → 모름 = 예전대로', ocrReadDoubtful(null, NOW) === false);
ok('형식 아님 → 모름', ocrReadDoubtful('10-7-26', NOW) === false);
const fl = ocrDoubtfulFlag(4400, '2015-05-03', 'PHP');
ok('표시가 읽은 값을 그대로 말한다', fl.code === 'ocr_doubtful' && fl.ko.includes('2015-05-03') && fl.en.includes('4,400'), fl.en);

console.log('② 신호등');
const base = { reqType: 'purchase', amount: 5760, currency: 'PHP', hasFile: true,
  body: 'PC upgrade parts for the office computer used by Melca.', spentAt: '2026-10-07', now: NOW };
// 옛 동작: 엉터리 판독을 그대로 쓰면 🔴 (사고 재현)
const fOld = runChecks({ ...base, ocrAmount: 4400, ocrSpentAt: '2015-05-03' });
ok('대조: 판독을 그대로 쓰면 🔴 (실사고 재현)', signalOf({ ...base, ocrAmount: 4400, flags: fOld }).signal === 'red');
// 새 동작: 서버가 하는 것 그대로 — 판독을 빼고 표시를 더한다
const doubt = ocrReadDoubtful('2015-05-03', NOW);
const amt2 = doubt ? null : 4400, sp2 = doubt ? null : '2015-05-03';
const fNew = runChecks({ ...base, ocrAmount: amt2, ocrSpentAt: sp2 });
if (doubt) fNew.push(ocrDoubtfulFlag(4400, '2015-05-03', 'PHP'));
const sNew = signalOf({ ...base, ocrAmount: amt2, flags: fNew });
ok('엉터리 판독을 빼면 🔴 가 아니다(🟡 사람 확인)', sNew.signal === 'yellow', sNew.signal);
ok('🟡 사유에 «AI 가 잘못 읽은 것 같다» 가 있다', sNew.reasons.some(r => r.code === 'ocr_doubtful'));
ok('날짜 불일치 표시가 안 붙는다', !fNew.some(f => f.code === 'date_mismatch'));
// 짝: 판독이 그럴듯한데 금액이 크게 다르면 여전히 🔴
const fReal = runChecks({ ...base, ocrAmount: 4400, ocrSpentAt: '2026-10-07' });
ok('짝: 정상 날짜 판독의 큰 금액 차이는 여전히 🔴', !ocrReadDoubtful('2026-10-07', NOW) &&
   signalOf({ ...base, ocrAmount: 4400, flags: fReal }).signal === 'red');

console.log('③ 배선');
const submit = API.slice(API.indexOf("form.get('ocr_vendor')"), API.indexOf('const facts = await gatherCheckFacts(env, actor.username, reqType, amount, currency, ocrVendor)'));
ok('올리기: 판정을 부른다', /ocrReadDoubtful\(ocrSpentAt/.test(submit));
ok('올리기: 엉터리면 금액·날짜를 버린다', /if \(ocrDoubt\) \{ ocrAmount = null; ocrSpentAt = null; \}/.test(submit));
ok('올리기: 표시를 붙인다', /if \(ocrDoubt\) flags\.push\(ocrDoubt\)/.test(API));
ok('올리기 전 신호등: 같은 판정', /const preDoubt = ocrReadDoubtful\(/.test(API) && /const ocrAmount = preDoubt \? null : ocrAmountRaw/.test(API)
   && /if \(preDoubt\) flags\.push\(preDoubt\)/.test(API));
const ocrEp = API.slice(API.indexOf("path === '/api/approval/ocr'"), API.indexOf("path === '/api/approval/voice'"));
ok('판독 API: 엉터리면 금액·날짜를 안 채운다', /if \(ocrReadDoubtful\(got\.spent_at/.test(ocrEp) && /amount: null, spent_at: null, doubtful: true/.test(ocrEp));
ok('화면: doubtful 이면 직접 넣으라고 말한다', /if \(j\.doubtful\)/.test(WORK) && WORK.includes('could not read this receipt reliably'));

console.log(`결과: PASS ${PASS} / FAIL ${FAIL}`);
if (FAIL) process.exit(1);
