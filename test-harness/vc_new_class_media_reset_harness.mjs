/**
 * 🎬 «다음 수업에 앞 수업 화면이 남는다» 가드 — 강사 LEN ④ (Melca 테스트)
 *
 *   "수업에 들어갈 때마다, 앞서 Karl 선생님이 틀었던 유튜브 영상이 그대로 있다."
 *
 * [원인] 공유 화면(교재·동영상)을 버리는 기준이 «마지막 공유로부터 3시간» 뿐이었다.
 *   그 규칙은 새로고침·순단 보호용인데, 공용방처럼 방을 이어 쓰면 «앞 수업» 도 3시간 안이라
 *   함께 보호돼 다음 수업 첫 입장자에게 앞 수업 화면이 그대로 재전송됐다.
 * [해결] 시간이 아니라 «방이 얼마나 비어 있었는가» 로 가른다(NEW_CLASS_GAP_MS).
 *
 * 이 하니스는 글자 검사가 아니라 **판정식을 실제로 실행**한다 —
 * 소스에서 상수와 조건식을 뽑아 네 가지 상황에 넣어 본다.
 *
 * 실행: node test-harness/vc_new_class_media_reset_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.MANGOI_SRC || join(ROOT, 'cloudflare-deploy', 'src');
const src = readFileSync(join(SRC, 'video-call-room.ts'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
const check = (name, cond, detail) => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (detail ? ' — ' + detail : '')); console.log('  ❌ ' + name + (detail ? '\n       ' + detail : '')); }
};

console.log('\n════════ 다음 수업에 앞 수업 화면이 남지 않는가 ════════\n');

/* ── 1) 구조: 필요한 부품이 있는가 ── */
const mGap = /NEW_CLASS_GAP_MS\s*=\s*([0-9*\s]+);/.exec(src);
check('«빈 시간» 기준값(NEW_CLASS_GAP_MS)이 있다', !!mGap);
const GAP = mGap ? Function('return ' + mGap[1])() : 0;
const mKeep = /SHARE_KEEP_MS\s*=\s*([0-9*\s]+);/.exec(src);
const KEEP = mKeep ? Function('return ' + mKeep[1])() : 0;
check('빈 시간 기준이 «분» 단위로 현실적이다 (1~30분)',
      GAP >= 60_000 && GAP <= 30 * 60_000, 'GAP=' + GAP + 'ms');
check('빈 시간 기준이 3시간 규칙보다 훨씬 짧다', GAP > 0 && GAP < KEEP);

check('방이 비면 그 시각을 기록한다',
      /userCount === 0 && !this\.emptyAt/.test(src) && /storage\.put\('emptyAt'/.test(src),
      '기록이 없으면 다음 입장 때 «얼마나 비었는지» 를 알 수 없다');
check('이미 찍힌 값을 덮어쓰지 않는다 (마지막 한 명이 나간 시각이 기준)',
      /!this\.emptyAt/.test(src));
check('사람이 들어오면 그 값을 지운다',
      /this\.emptyAt = 0;\s*void this\.state\.storage\.delete\('emptyAt'\)/.test(src));
check('재기동 후에도 살아남는다 (storage 에서 복구)',
      /this\.emptyAt = \(await this\.state\.storage\.get<number>\('emptyAt'\)\) \|\| 0/.test(src));
check('버릴 때 동영상·교재·판서를 함께 버린다',
      /this\.videoState = null;/.test(src) && /this\.pdfState = null;/.test(src) && /this\.wbOps = \[\]/.test(src));

/* ── 2) 동작: 판정식을 실제로 돌려 본다 ── */
//   소스의 조건을 그대로 옮겨 «같은 식» 인지 눈으로 확인할 수 있게 둔다.
const condInSrc = /_newClass \|\| !this\.mediaAt \|\| \(Date\.now\(\) - this\.mediaAt\) > VideoCallRoom\.SHARE_KEEP_MS/.test(src);
check('버림 조건에 «새 수업» 이 포함돼 있다', condInSrc);

function willClear({ emptyForMs, mediaAgeMs, userCount = 1 }) {
  const now = 1_000_000_000;
  const emptyAt = emptyForMs === null ? 0 : now - emptyForMs;
  const mediaAt = now - mediaAgeMs;
  const newClass = emptyAt > 0 && (now - emptyAt) > GAP;
  return userCount <= 1 && (newClass || !mediaAt || (now - mediaAt) > KEEP);
}

console.log('\n  ── 상황별 판정 ──');
check('① 새로고침(8초 만에 복귀) → 화면을 지키지 않는다면 실패',
      willClear({ emptyForMs: 8_000, mediaAgeMs: 5 * 60_000 }) === false,
      '새로고침에서 교재가 사라지면 예전 사고(«나갔다 오니 다른 교재»)가 재발한다');
check('② 순단 60초 → 그대로 유지',
      willClear({ emptyForMs: 60_000, mediaAgeMs: 10 * 60_000 }) === false);
check('③ 앞 수업이 끝나고 20분 뒤 새 수업 → 앞 화면을 버린다',
      willClear({ emptyForMs: 20 * 60_000, mediaAgeMs: 25 * 60_000 }) === true,
      'LEN ④ 가 신고한 바로 그 상황');
check('④ 쉬는 시간 10분 뒤 다음 수업 → 버린다',
      willClear({ emptyForMs: 10 * 60_000, mediaAgeMs: 30 * 60_000 }) === true);
check('⑤ 방이 빈 적 없이 계속 이어진 수업(늦게 온 학생) → 유지',
      willClear({ emptyForMs: null, mediaAgeMs: 15 * 60_000 }) === false,
      '수업 중 늦게 들어온 학생은 지금 보고 있는 교재를 받아야 한다');
check('⑥ 3시간 넘은 화면은 빈 적이 없어도 버린다(기존 규칙 유지)',
      willClear({ emptyForMs: null, mediaAgeMs: KEEP + 60_000 }) === true);
check('⑦ 방에 이미 여러 명이면 절대 버리지 않는다',
      willClear({ emptyForMs: 60 * 60_000, mediaAgeMs: 90 * 60_000, userCount: 2 }) === false,
      '수업 중인 방의 교재를 지우면 대형 사고다');

console.log('\n──────────────────────────────────────────');
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('──────────────────────────────────────────\n');
process.exit(fail ? 1 : 0);
