// vc_turn_quality_harness.mjs — 「끊긴다」를 «조용히» 만드는 두 구멍을 막는다 (2026-08-26)
//
// ── 왜 ──────────────────────────────────────────────────────────────────────
// 2026-08-26 사장님 제보 「무거우면 자꾸 튕겨나가」 → 원인은 무게가 아니었다.
// `https://mangoi.ai/api/turn-config` 의 `X-Turn-Source` 가 **public-fallback** 이었다.
// = TURN_KEY_ID / TURN_KEY_API_TOKEN 이 워커에 없어서 **모든 화상수업이 무료 공개
//   TURN(openrelay.metered.ca)으로 릴레이**되고 있었다. src/index.ts 의 그 폴백 주석이
//   직접 경고한다 — 「50명을 받을 수 있는 서버가 아니라서, 아무 에러 없이 «영상만 안
//   나오는» 상태가 된다」. 실측 RTT 389~629ms(손실은 0.7~4.2%로 낮음), 강사 재입장률 61.9%.
//
// 진짜 문제는 «틀렸다» 가 아니라 **아무도 말해 주지 않았다** 는 것이다. 구멍이 둘이었다.
//
//   ① 배포도 감시견도 TURN 을 안 봤다.
//      deploy.yml 의 «Check required secrets» 는 CLOUDFLARE_API_TOKEN/ACCOUNT_ID 둘만 본다.
//      2층 감시견(ops/mangoi-watchdog.sh)의 판정 네 가지(http·domain·db·cron)에도 안 걸린다
//      — 사이트는 200, D1 도 cron 도 정상이기 때문이다. 언제부터였는지조차 알 수 없었다.
//
//   ② 진단 로그가 정작 필요한 사람을 안 찍었다.
//      적응 루프(js/idx-main.js)의 `if (dSent + dLost < 25) return;` 이 vcQualityAcc() «앞»
//      이라, **영상 표본이 없는 사람은 기록이 통째로 안 남았다.** 카메라를 껐거나 영상이
//      죽은 사람 = 「왜 안 보이나」를 알아야 할 바로 그 사람들이다.
//      8/26 하루 예상 ~2,900건 중 실제 기록 25건(약 1%).
//
// ── 이 하니스가 못 박는 것 ──────────────────────────────────────────────────
//   · TURN 경로를 «재고 · 알리되 · 배포를 막지는 않는» 세 가지가 함께 유지되는가
//   · 「모름」을 「나쁨」으로 단정하지 않는가 (거짓 경보는 감시를 죽인다)
//   · 표본이 없는 틱이 «0% 손실» 로 둔갑하지 않는가 (영상이 죽은 사람이 회선 1등이 된다)
//   · 표본이 하나도 없어도 요약이 나가는가  ← 이게 사각지대의 핵심이다
//
// ⚠️ 문자열 검사만으로는 못 잡는다는 것이 이 저장소의 반복 실측이다(CLAUDE.md 2장 —
//    「헬퍼에 행을 넘겼는데 아무 일도 안 일어남」·「단계를 넣었는데 한 번도 안 쓰임」).
//    그래서 3부는 **js/idx-vc-qlog.js 를 진짜로 실행해** 나가는 payload 를 읽는다.
//
// 실행: node test-harness/vc_turn_quality_harness.mjs

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '..');
const PUB = join(ROOT, 'cloudflare-deploy/public');

const rd = (p) => readFileSync(join(ROOT, p), 'utf8');
const deployYml = rd('.github/workflows/deploy.yml');
const watchdog = rd('ops/mangoi-watchdog.sh');
const idxMain = readFileSync(join(PUB, 'js/idx-main.js'), 'utf8');
const qlogSrc = readFileSync(join(PUB, 'js/idx-vc-qlog.js'), 'utf8');
const indexHtml = readFileSync(join(PUB, 'index.html'), 'utf8');
const apiMango = rd('cloudflare-deploy/src/api-mango.ts');

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}${detail ? '  — ' + detail : ''}`); }
};

/* 부정 검사는 «주석을 벗겨 낸 사본» 으로 한다 — 왜 그렇게 했는지 적은 설명 주석이
   자기 검사에 걸리는 사고가 이 저장소에 이미 있었다(CLAUDE.md 2장). */
const strip = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
const qlogCode = strip(qlogSrc);
const mainCode = strip(idxMain);

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[ 1부. 📶 TURN 경로를 «누가 알려 주는가» ]');
// ═══════════════════════════════════════════════════════════════════════════

// ── 배포 게이트 ──
ok('deploy.yml 이 /api/turn-config 를 실제로 부른다', deployYml.includes('/api/turn-config'));
ok('deploy.yml 이 X-Turn-Source 헤더를 읽는다', /[Xx]-[Tt](urn|URN)-[Ss](ource|OURCE)/.test(deployYml));

/* ⚠️ 워커가 «두 벌» 이다. 하나만 보면 한쪽 도메인 사용자는 계속 무료 TURN 을 쓴다
   (CLAUDE.md 0장 — test.mangoi.co.kr = 기본 워커, mangoi.ai = -prod). */
ok('deploy.yml 이 워커 «두 벌» 을 모두 본다',
   deployYml.includes('webrtc-unified-platform.navy111p.workers.dev/api/turn-config') ||
   (deployYml.includes('webrtc-unified-platform.navy111p.workers.dev') &&
    deployYml.includes('webrtc-unified-platform-prod.navy111p.workers.dev') &&
    /for\s+W\s+in/.test(deployYml)));

ok('public-fallback 이면 ::error:: 로 크게 남긴다',
   /public-fallback[\s\S]{0,600}::error::/.test(deployYml));

/* ⛔ 그러나 배포를 «실패» 시키면 안 된다 — TURN 이 없어도 수업은 (느리게) 되고,
   여기서 막으면 이 문제와 무관한 수정까지 못 나간다. */
const turnStep = deployYml.slice(deployYml.indexOf('TURN 경로 점검'));
ok('그래도 배포를 실패시키지는 않는다 (exit 0)', /exit 0/.test(turnStep.slice(0, 4000)));

/* 알림은 «무엇을 하라» 까지 말해야 한다. 안 그러면 경보가 그냥 소음이 된다. */
ok('고치는 법(wrangler secret put TURN_KEY_ID)을 함께 남긴다',
   deployYml.includes('wrangler secret put TURN_KEY_ID'));
ok('고치는 법이 --env production 까지 짚는다 (한 벌만 넣는 사고 방지)',
   /wrangler secret put TURN_KEY_API_TOKEN\s+--env production/.test(deployYml));

// ── 2층 감시견 ──
ok('감시견이 /api/turn-config 를 잰다', watchdog.includes('/api/turn-config'));
ok("감시견은 'public-fallback' 만 나쁨으로 본다",
   /TURN_SRC"?\s*=\s*"public-fallback"/.test(watchdog) || watchdog.includes('"$TURN_SRC" = "public-fallback"'));

/* 🔴 «모름» 을 «나쁨» 으로 단정하면 감시가 스스로 스팸이 된다.
   측정 실패(빈 값)는 어느 쪽으로도 상태를 바꾸지 않아야 한다. */
ok('측정 실패(빈 값)로는 «정상» 이라고도 단정하지 않는다', /-n "\$TURN_SRC"/.test(watchdog));
ok('사이트가 이미 이상하면(REASON 있음) TURN 은 재지 않는다 (이중 경보 방지)',
   /if \[ -z "\$REASON" \][\s\S]{0,400}api\/turn-config/.test(watchdog));

/* TURN 은 «죽음» 이 아니라 «설정» 이다 — 장애 상태와 섞으면 복구 문자가 서로를 가린다. */
ok('TURN 상태를 장애 상태와 «따로» 저장한다 (PREV_TURN)', /PREV_TURN=%s/.test(watchdog));
ok('TURN 도 «상태가 바뀔 때만» 1회 보낸다', /\$CUR_TURN" != "\$PREV_TURN/.test(watchdog));
ok('TURN 문자 발송이 실패하면 상태를 저장하지 않는다 (다음 회차 재시도)',
   /TURN 알림 발송 실패[\s\S]{0,200}CUR_TURN="\$PREV_TURN"/.test(watchdog));
ok('TURN 임계값이 장애 임계값보다 느긋하다 (설정 문제라 급하지 않다)',
   /TURN_FAIL_THRESHOLD=(\d+)/.test(watchdog) &&
   Number(watchdog.match(/TURN_FAIL_THRESHOLD=(\d+)/)[1]) > Number(watchdog.match(/^FAIL_THRESHOLD=(\d+)/m)[1]));

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[ 2부. 🔍 진단 사각지대 — 영상 표본이 없는 사람도 기록에 남는가 ]');
// ═══════════════════════════════════════════════════════════════════════════

/* 🔴 이 한 줄이 사각지대의 전부였다. return «앞» 에서 기록을 남겨야 한다. */
const guard = mainCode.match(/if \(dSent \+ dLost < 25\)[^\n]*/);
ok('표본 부족 틱에서도 vcQualityAcc 를 부른다', !!guard && /vcQualityAcc\(\s*-1\s*,/.test(guard[0]),
   guard ? guard[0].trim().slice(0, 140) : '그 줄을 못 찾음');
/* ⚠️ indexOf 만 비교하면 «호출이 아예 없을 때»(-1) 도 통과한다 — 있는지부터 본다. */
ok('그 호출이 return «앞» 에 있다',
   !!guard && guard[0].includes('vcQualityAcc') &&
   guard[0].indexOf('vcQualityAcc') < guard[0].indexOf('return'));
ok('그 호출도 try/catch 안이다 (로깅이 수업을 깨면 안 된다)',
   !!guard && /try \{ vcQualityAcc\(-1, rtt\); \} catch/.test(guard[0]));

/* 첫 화면 예산 — vcQualityAcc 는 defer 파일로 나갔다. idx-main.js 로 되돌아오면 안 된다. */
ok('vcQualityAcc 본체가 idx-main.js 에 없다 (defer 로 나갔다)',
   !/function vcQualityAcc\s*\(/.test(idxMain));
ok('index.html 이 idx-vc-qlog.js 를 defer 로 싣는다',
   /<script[^>]*\bdefer\b[^>]*src="\/js\/idx-vc-qlog\.js/.test(indexHtml));

/* ⚠️ window.vcRoomId 는 영원히 undefined 다 — idx-main.js 의 `let vcRoomId` 라서.
   한 달간 방 번호가 99.7% 비어 있던 사고의 원인이다(CLAUDE.md 2장). */
ok('qlog 가 window.vcRoomId 를 쓰지 않는다 (bare 식별자여야 한다)',
   !/window\.vcRoomId/.test(qlogCode) && /room:\s*\(vcRoomId/.test(qlogCode));

/* 서버가 그 값을 실제로 저장하는가 — 화면만 고치면 숫자는 그대로 안 남는다. */
ok('서버 INSERT 에 novideo 칸이 있다',
   /INSERT INTO vc_quality \([^)]*novideo[^)]*\)/.test(apiMango));
ok('이미 만들어진 표에도 ALTER 로 칸을 덧붙인다',
   /ALTER TABLE vc_quality ADD COLUMN novideo/.test(apiMango));
ok('스키마 작업이 매 요청마다 돌지 않는다 (ensureSchemaOnce)',
   /ensureSchemaOnce\('vc_quality'/.test(apiMango));

// ═══════════════════════════════════════════════════════════════════════════
console.log('\n[ 3부. ▶ 진짜로 돌려 본다 — 문자열 검사로는 «순서·값» 을 못 본다 ]');
// ═══════════════════════════════════════════════════════════════════════════

/* js/idx-vc-qlog.js 를 그대로 실행하고 sendBeacon 을 가로채 payload 를 읽는다.
   ⚠️ 시계를 앞으로 돌려야 60초 요약이 나간다 — Date.now 를 갈아 끼운다. */
function runQlog(ticks, { room = 'class-1-20260826', now0 = 1_000_000 } = {}) {
  let clock = now0;
  const sent = [];
  const ctx = {
    window: {},
    navigator: { sendBeacon: (url, blob) => { sent.push({ url, body: blob.__body }); return true; } },
    Blob: class { constructor(parts) { this.__body = String(parts[0]); } },
    Date: { now: () => clock },
    Math, JSON, isFinite,
    fetch: () => ({ catch() {} }),
    vcRoomId: room,
    getCurrentUser: () => ({ uid: 'u1', name: '홍길동', role: 'student' }),
    vcIsTeacherRole: () => false,
    console,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(qlogSrc, ctx);
  for (const t of ticks) { clock += t.dt ?? 4000; ctx.vcQualityAcc(t.loss, t.rtt); }
  return sent.map((s) => JSON.parse(s.body));
}

/* ① 평소 경로는 그대로여야 한다 — 고치다가 멀쩡한 로깅을 깨면 더 나쁘다. */
const normal = runQlog([
  ...Array.from({ length: 15 }, () => ({ loss: 2, rtt: 400 })),
  { loss: 2, rtt: 400 },
]);
ok('평소(영상 있음): 60초 뒤 요약이 1건 나간다', normal.length === 1, `보낸 건수 ${normal.length}`);
ok('평소: 손실 평균이 그대로 실린다', normal[0] && normal[0].avg_loss === 2, JSON.stringify(normal[0]));
ok('평소: 방 번호가 실린다 (window.vcRoomId 함정)', normal[0] && normal[0].room === 'class-1-20260826');
ok('평소: novideo 는 0 이다', normal[0] && normal[0].novideo === 0);

/* ② 🔴 사각지대 본체 — 영상 표본이 한 번도 없던 사람. 예전엔 «0건» 이었다. */
const blind = runQlog(Array.from({ length: 16 }, () => ({ loss: -1, rtt: 520 })));
ok('🔴 영상 표본이 0 이어도 요약이 나간다 (예전엔 영영 안 나갔다)', blind.length === 1,
   `보낸 건수 ${blind.length}`);
ok('그 요약이 novideo 로 «몇 틱이나 영상이 없었나» 를 말한다',
   blind[0] && blind[0].novideo >= 15, JSON.stringify(blind[0]));
ok('samples 는 0 이다 (영상 표본이 없었다는 사실 그대로)', blind[0] && blind[0].samples === 0);
ok('RTT 는 살아 있다 (오디오는 흘렀으므로 회선 판단의 유일한 단서)',
   blind[0] && blind[0].avg_rtt === 520);

/* 🔴 여기가 핵심이다. 표본 없음을 «손실 0%» 로 적으면 영상이 죽은 사람이
   «회선이 제일 좋은 사람» 으로 둔갑해, 원인을 찾는 사람을 정반대로 이끈다. */
ok('🔴 표본 없음이 «손실 0%» 로 둔갑하지 않는다 (max_loss 가 0 이어도 samples 0 으로 구분된다)',
   blind[0] && blind[0].samples === 0 && blind[0].novideo > 0);
ok('max_loss 가 -Infinity/null 로 새지 않는다 (빈 배열 Math.max 함정)',
   blind[0] && Number.isFinite(blind[0].max_loss), JSON.stringify(blind[0]));

/* ③ 섞여 있을 때 — 평균은 «있는 표본만» 으로 내야 한다. */
const mixed = runQlog([
  { loss: 10, rtt: 500 }, { loss: -1, rtt: 500 }, { loss: -1, rtt: 500 }, { loss: 20, rtt: 500 },
  ...Array.from({ length: 12 }, () => ({ loss: -1, rtt: 500 })),
]);
ok('섞였을 때: 손실 평균에 -1 이 섞이지 않는다', mixed[0] && mixed[0].avg_loss === 15,
   JSON.stringify(mixed[0]));
ok('섞였을 때: samples 와 novideo 가 각각 세어진다',
   mixed[0] && mixed[0].samples === 2 && mixed[0].novideo === 14, JSON.stringify(mixed[0]));

/* ④ 60초 전에는 안 보낸다 — 비용(D1 쓰기)이 걸려 있다. */
const early = runQlog([{ loss: 3, rtt: 100 }, { loss: 3, rtt: 100 }]);
ok('60초가 안 됐으면 보내지 않는다 (D1 쓰기 비용)', early.length === 0, `보낸 건수 ${early.length}`);

/* ⑤ 보낸 뒤 누적이 초기화되는가 — 안 그러면 다음 요약에 옛 값이 계속 얹힌다. */
const twice = runQlog(Array.from({ length: 32 }, () => ({ loss: -1, rtt: 300 })));
ok('보낸 뒤 novideo 가 0 부터 다시 센다',
   twice.length === 2 && twice[1].novideo <= 16, JSON.stringify(twice.map((x) => x.novideo)));

console.log(`\n  ${fail ? '❌' : '🎉'} ${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
