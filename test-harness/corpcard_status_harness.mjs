// corpcard_status_harness.mjs — 💳 법인카드 연동 «상태를 사실대로 말한다» 가드 (2026-08-13)
//
//   [무엇이 있었나] 라이브 D1 실측:
//     corpcard_meta.last_sync_result =
//       {"ok":false,"spans":7,"seen":0,"inserted":0,
//        "errors":["… codef_error CF-00017: 요청 도메인이 올바르지 않습니다.
//                   해당 토큰은 샌드박스용입니다. https://sandbox.codef.io로 요청하세요." × 7]}
//     → 시크릿 3개는 멀쩡하고 OAuth 토큰도 정상 발급된다. **계정이 데모(샌드박스)** 라
//       실거래 조회만 거부된 것이다. 그런데 화면은 «카드사 연동이 아직 되어 있지 않습니다»
//       라고만 말했다 — 사실과 다르고, 키를 다시 등록해도 절대 안 고쳐지는 원인이었다.
//
//   이 하니스가 지키는 것 — 깨지면 «화면이 다시 거짓말을 하게» 되는 지점들:
//     ① 적재분이 0건이라는 이유만으로 «연동 안 됨(codef_not_configured)» 으로 답하지 않는다
//     ② 샌드박스(데모) 응답은 회계 테이블에 단 한 줄도 안 들어간다 — dryRun 이 INSERT 앞을 막는다
//     ③ 화면은 실데이터가 아닐 때 KPI 숫자를 채우지 않는다 (₩0 도 «실제 0원 지출» 로 읽힌다)
//     ④ 새 API(/selftest)가 index.ts 게이트 + api-mango 위임가드에 걸린다 (반쪽 배선 = 라이브 404)

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const CF = join(__dir, '../cloudflare-deploy');
const read = (p) => readFileSync(join(CF, p), 'utf8');

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}

console.log('════════ 💳 법인카드 연동 상태 가드 ════════');

const sync = read('src/corpcard-sync.ts');
const admin = read('src/api-admin.ts');
const index = read('src/index.ts');
const mango = read('src/api-mango.ts');
const core = read('public/js/adm-core.js');
const html = read('public/admin.html');

/* ── ① 비어 있다고 «미연동» 이라 답하지 않는다 ─────────────────────────────── */
const txHandler = (() => {
  const s = admin.indexOf("path === '/api/admin/corpcard/transactions'");
  return s < 0 ? '' : admin.slice(s, admin.indexOf('\n    if (', s + 50));
})();
check('/transactions 핸들러를 찾았다', txHandler.length > 100);
check('① 적재분 0건을 «codef_not_configured» 로 답하지 않는다',
  txHandler.length > 100 && !/error:\s*'codef_not_configured'/.test(txHandler),
  '데이터가 비었을 뿐인데 «연동 안 됨» 으로 답하면 원인이 화면에서 사라진다');
check('① /transactions 가 status 를 함께 내려준다', /corpcardStatus\(env/.test(txHandler));

/* ── ② 샌드박스(데모) 데이터는 회계 테이블에 안 들어간다 ─────────────────────── */
const runBody = (() => {
  const s = sync.indexOf('export async function runCorpCardSync');
  return s < 0 ? '' : sync.slice(s, sync.indexOf('\nexport ', s + 50));
})();
check('runCorpCardSync 본문을 찾았다', runBody.length > 500);
const dryPos = runBody.indexOf('if (dryRun)');
const insPos = runBody.indexOf('INSERT OR IGNORE INTO corpcard_transactions');
check('② dryRun 가드가 INSERT 보다 앞에 있다', dryPos > 0 && insPos > 0 && dryPos < insPos,
  `dryRun@${dryPos} / INSERT@${insPos}`);
check('② dryRun 분기가 적재 없이 빠져나간다(continue)',
  /if \(dryRun\)[\s\S]{0,400}?continue;/.test(runBody));
check('② 샌드박스 호스트면 dryRun 이 기본값이다',
  /dryRun\s*=\s*opts\.dryRun\s*\?\?\s*hostSandbox/.test(runBody),
  '샌드박스로 조회하면 CODEF 의 가짜 거래가 온다 — 기본이 «적재 안 함» 이어야 한다');
check('② 자가진단은 «마지막 동기화» 기록을 덮지 않는다',
  /if \(!dryRun\)\s*\{[\s\S]{0,200}?last_sync_at/.test(runBody));
check('② /selftest 는 샌드박스 + dryRun 으로만 부른다',
  /corpcard\/selftest'[\s\S]{0,600}?runCorpCardSync\(env,\s*\{\s*base:\s*CODEF_SANDBOX_BASE,\s*dryRun:\s*true\s*\}/.test(admin));

/* ── 호스트 판정: 데모 호스트의 옛 이름(development)도 새 이름으로 ───────────── */
check('sandbox.codef.io 상수가 있다', /CODEF_SANDBOX_BASE\s*=\s*'https:\/\/sandbox\.codef\.io'/.test(sync));
check('구 이름 development.codef.io 를 sandbox 로 바꿔 준다',
  // 소스에는 정규식 리터럴이라 «development\.codef\.io» 처럼 역슬래시가 끼어 있다
  /development\\?\.codef\\?\.io[\s\S]{0,120}?CODEF_SANDBOX_BASE/.test(sync));
check('CF-00017(샌드박스 토큰)을 코드로 판정한다', /CF-00017/.test(sync) && /isSandboxTokenError/.test(sync));
check('상태에 sandbox_account 가 있다', /'sandbox_account'/.test(sync) && /sandbox_account:/.test(sync));

/* ── ③ 실데이터가 아니면 화면에 숫자를 안 채운다 ──────────────────────────── */
const loadFn = (() => {
  const s = core.indexOf('window.cardLoad = async function');
  return s < 0 ? '' : core.slice(s, core.indexOf('\n  };', s) + 5);
})();
check('cardLoad 를 찾았다', loadFn.length > 100);
check('③ 실데이터가 아니면 renderCardKpis 전에 빠져나간다',
  /if \(!_cardSynced\)\s*\{\s*renderCardNotConnected\(\);\s*return;/.test(loadFn),
  '₩0 도 «실제 0원 지출» 로 읽힌다');
check('③ _cardSynced 는 status 로 판정한다(응답 200 만으로 참이 되지 않는다)',
  /_cardSynced\s*=\s*_cardHasReal\(\)/.test(loadFn) && /_cardHasReal[\s\S]{0,300}?'no_data'/.test(core));
check('③ 미연동 화면이 KPI 타일을 «—» 로 되돌린다',
  /renderCardNotConnected[\s\S]{0,1800}?kpi-cur-month'?,\s*'₩—'/.test(core));
check('③ 실패 alert 이 서버 사유(status)를 그대로 쓴다',
  /_cardStatus && \(en0 \? _cardStatus\.message_en : _cardStatus\.message_ko\)/.test(core),
  '«키가 등록되지 않았습니다» 로 뭉개면 데모계정 문제를 영영 못 찾는다');
check('③ 상태 표시 자리와 자가진단 버튼이 화면에 있다',
  /id="acc-card-status"/.test(html) && /cardSelfTest\(\)/.test(html));
check('③ 상태 문구는 한/영 두 벌이다(회계 담당 필리핀 스태프)',
  /message_ko/.test(sync) && /message_en/.test(sync) && /message_en \|\| _cardStatus\.message_ko/.test(core));

/* ── ④ 새 API 배선 3종 세트 (게이트 · 위임가드 · 강사차단) ───────────────────── */
check('④ index.ts 인증 게이트가 corpcard 전체를 덮는다',
  /path\.startsWith\('\/api\/admin\/corpcard\/'\)/.test(index));
check('④ api-mango 위임 가드가 corpcard 전체를 덮는다',
  /path\.startsWith\('\/api\/admin\/corpcard\/'\)/.test(mango));
check('④ 강사 차단 목록에 corpcard 가 있다(재무 데이터)',
  /'\/api\/admin\/corpcard\/'/.test(index));

/* ── 캐시 무효화: adm-core.js 를 고쳤으면 ?v= 도 올라가 있어야 한다 ──────────── */
check('adm-core.js 참조에 ?v= 가 붙어 있다', /adm-core\.js\?v=\d+/.test(html));

console.log('──────────────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
process.exit(fail ? 1 : 0);
