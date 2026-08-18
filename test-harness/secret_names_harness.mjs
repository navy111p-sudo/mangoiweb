// -*- coding: utf-8 -*-
/*
 * 🔑 점검 화면의 «시크릿 이름» 이 코드와 맞는지 감시 (2026-08-18)
 *   실행: node test-harness/secret_names_harness.mjs
 *
 * [왜 만들었나]
 *   `/api/admin/health-check` 는 「어떤 시크릿이 등록돼 있나」를 알려 주는 화면이다.
 *   그런데 그 목록의 이름 10개 중 **5개가 코드 어디서도 안 쓰는 «유령 이름»** 이었다
 *   (KAKAO_API_KEY·KAKAO_TEMPLATE_ID·SOLAPI_SENDER·GIFTISHOW_AUTH_CODE·GIFTISHOW_AUTH_TOKEN).
 *
 *   결과가 어땠나 — 2026-08-18, 웹푸시가 안 되는 원인을 찾다가 이 화면을 열었더니
 *   `SOLAPI_SENDER: false` 가 보였다. 「문자 발송도 죽어 있구나」로 읽힌다. 실제로는
 *   그런 변수가 없었을 뿐이고, 진짜 발신번호 변수(SOLAPI_FROM_PHONE)는 이 화면이
 *   아예 묻지도 않고 있었다.
 *
 *   ⚠️ **점검 도구가 거짓을 말하면 없는 문제를 쫓게 된다.** 코드 버그보다 비싸다.
 *
 * [무엇을 보는가]
 *   · health-check 가 묻는 이름이 **전부** 코드에서 실제로 읽히는가
 *     (index.ts 의 그 목록 자신은 «사용» 으로 치지 않는다 — 그러면 자기가 자기를 증명한다)
 *   · 사람이 자주 찾는 핵심 시크릿이 목록에서 빠지지 않았는가
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRCDIR = join(ROOT, 'cloudflare-deploy', 'src');
const rd = (p) => { try { return readFileSync(p, 'utf8'); } catch { return ''; } };

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond, extra) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name + (extra ? ' — ' + extra : '')); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}${cond || !extra ? '' : ' — ' + extra}`);
}

const indexTs = rd(join(SRCDIR, 'index.ts'));

console.log('\n[ ① health-check 의 시크릿 목록을 읽는다 ]');
const block = /const secretKeys\s*=\s*\[([\s\S]*?)\]\s*;/.exec(indexTs);
check('목록을 찾았다 (const secretKeys = [...])', !!block);
const names = block ? [...block[1].matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]) : [];
check(`이름을 뽑았다 (${names.length}개)`, names.length >= 5, names.join(', '));

/* index.ts «말고» 다른 파일 전부를 한 덩어리로 — 여기서 이름이 보이면 «코드가 쓴다» 는 뜻.
   index.ts 를 빼는 것이 핵심이다. 넣으면 목록 자신이 근거가 되어 검사가 무의미해진다. */
const otherSrc = readdirSync(SRCDIR)
  .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
  .map((f) => rd(join(SRCDIR, f)))
  .join('\n');

console.log('\n[ ② 묻는 이름이 코드에서 실제로 읽히는가 (유령 이름 금지) ]');
for (const n of names) {
  check(`${n} — 코드가 실제로 읽는다`,
    otherSrc.includes(n),
    'index.ts 의 이 목록에만 있다 → 화면에 영원히 false 로 나온다');
}

console.log('\n[ ③ 사람이 자주 찾는 시크릿이 목록에 있는가 ]');
/* 빠져 있으면 «등록했는데 화면에 안 보인다» 가 되어, 있는 것도 없는 줄 안다.
   여기 넣는 기준: 없으면 기능이 통째로 멈추고, 사람이 원인을 찾아 헤매게 되는 것. */
const MUST = [
  ['VAPID_PUBLIC_KEY',  '웹푸시 — 없으면 「알림 받기」가 실패한다'],
  ['VAPID_PRIVATE_KEY', '웹푸시 발송'],
  ['SOLAPI_API_KEY',    '문자·알림톡'],
  ['SOLAPI_FROM_PHONE', '문자 발신번호 — 없으면 invalid_from 으로 조용히 실패한다'],
];
for (const [n, why] of MUST) {
  check(`${n} 를 묻는다 (${why})`, names.includes(n));
}

console.log('\n[ ④ 지워진 유령 이름이 되살아나지 않았는가 ]');
const GHOSTS = ['KAKAO_API_KEY', 'KAKAO_TEMPLATE_ID', 'SOLAPI_SENDER', 'GIFTISHOW_AUTH_CODE', 'GIFTISHOW_AUTH_TOKEN'];
for (const g of GHOSTS) {
  check(`⛔ ${g} 는 다시 넣지 않았다 (코드가 안 쓰는 이름)`, !names.includes(g));
}

console.log('\n────────────────────────────────');
console.log(`총 ${PASS + FAIL}건 중 ✅ ${PASS} 통과 / ❌ ${FAIL} 실패`);
if (FAIL) { console.log('실패:'); FAILS.forEach((f) => console.log('  - ' + f)); }
process.exit(FAIL === 0 ? 0 : 1);
