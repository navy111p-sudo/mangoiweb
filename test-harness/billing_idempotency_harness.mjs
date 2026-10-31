/* ═══════════════════════════════════════════════════════════════════════════
   💳 자동결제 이중청구 감시 (2026-08-31 신설)

   [무엇을 막나] chargeSubscriptionOnce 는 «주문을 새로 만들고 → 토스에 청구» 한다.
   주문번호가 매번 새로 만들어지므로 **토스는 두 요청을 서로 다른 주문으로 보고
   카드를 두 번 긁는다.** 같은 구독이 두 경로에서 동시에 불릴 수 있다 —
   cron 스윕 · 관리자 「지금 청구」 · 학부모 「즉시 결제」 · 관리자 스윕 수동실행 넷이
   전부 같은 함수를 지난다. 예전에는 아무 선점도 없었다.

   [검사 방법] 문자열이 아니라 **진짜 SQLite 에 선점 SQL 을 그대로 돌려서**
   「두 번 시도하면 한 번만 이긴다」를 확인한다. 조건절을 느슨하게 고치면 여기서 걸린다.
   ⚠️ node:sqlite 가 없는 런타임에서는 «건너뜀» 으로 끝난다(실패로 세지 않는다).
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
let PASS = 0, FAIL = 0; const FAILS = [];
const check = (n, c, w) => { if (c) { console.log('  ✅ ' + n); PASS++; } else { console.log('  ❌ ' + n + (w ? ' — ' + w : '')); FAIL++; FAILS.push(n); } };

const txt = readFileSync(join(SRC, 'api-pay.ts'), 'utf8');
/* 부정 검사·조각 추출은 주석을 벗겨 낸 사본으로 — 설명 주석이 자기 검사를 잡는다
   (CLAUDE.md 2장 등재 함정). 블록주석은 줄 단위로 상태를 추적해 지운다:
   정규식 하나로 지우면 짝 없는 «별표+슬래시» 에 코드가 통째로 날아간다. */
let inBlk = false;
const code = txt.split(/\r?\n/).map((raw) => {
  const t = raw.trim();
  if (inBlk) { if (t.includes('*/')) inBlk = false; return ''; }
  if (t.startsWith('/*')) { if (!t.includes('*/')) inBlk = true; return ''; }
  if (t.startsWith('//')) return '';
  return raw.replace(/\s\/\/.*$/, '');
}).join('\n');

console.log('\n  A. 선점이 «청구보다 먼저» 있다');
{
  const iClaim = code.indexOf('charge_lock_at = ? WHERE id = ?');
  const iToss  = code.indexOf('api.tosspayments.com/v1/billing/');
  check('선점 UPDATE 가 있다', iClaim > 0, 'chargeSubscriptionOnce 의 조건부 UPDATE 가 사라졌다');
  check('토스 호출보다 앞에 있다', iClaim > 0 && iToss > 0 && iClaim < iToss,
        '뒤에 있으면 이미 카드를 긁은 뒤라 아무 의미가 없다');
  check('선점 실패 시 청구하지 않는다 (실패 쪽으로 닫는다)',
        /already_charging/.test(code) && /claim_failed/.test(code),
        '돈이 걸린 자리에서는 «안 긁는 것» 이 «두 번 긁는 것» 보다 낫다');
  /* ⛔ 검사 범위를 «길이»(앞 N자)로 자르지 말 것 — 보장은 그대로인데 주석 두 줄만 늘어도
     검사가 빨개진다(CLAUDE.md 2장 등재 함정). 중괄호 짝으로 그 블록만 떼어 낸다. */
  const finallyBlock = (() => {
    const i0 = code.indexOf('} finally {');
    if (i0 < 0) return '';
    const open = code.indexOf('{', i0 + 1);
    let d = 0;
    for (let j = open; j < code.length; j++) {
      if (code[j] === '{') d++;
      else if (code[j] === '}') { d--; if (d === 0) return code.slice(open, j + 1); }
    }
    return '';
  })();
  check('선점은 finally 로 항상 푼다', /charge_lock_at = NULL/.test(finallyBlock),
        '성공했을 때만 풀면 카드 거절·네트워크 오류로 빠져나갈 때 그 구독이 계속 막힌다');
  check('해제는 «내가 잡은 표식» 일 때만 한다',
        /charge_lock_at = NULL WHERE id = \? AND charge_lock_at = \?/.test(finallyBlock),
        '조건이 없으면 리스가 만료돼 남이 정당하게 가져간 표식을 지워 세 번째가 들어온다');
  check('스키마에 charge_lock_at 이 있다', /'charge_lock_at INTEGER'/.test(code),
        '칸이 없으면 선점이 늘 실패해 청구가 통째로 막힌다(멱등 ALTER 목록에 넣을 것)');
}

console.log('\n  B. 실제로 돌려 본다 (진짜 SQLite · 선점 SQL 그대로)');
let DatabaseSync;
try { ({ DatabaseSync } = await import('node:sqlite')); } catch {}
if (!DatabaseSync) {
  console.log('  ⏭ node:sqlite 없음 — 건너뜀');
} else {
  // 소스에서 선점 SQL 을 «오려 내» 쓴다 — 하니스가 베껴 쓰면 운영 코드가 바뀌어도 통과한다
  const m = code.match(/`(UPDATE subscriptions SET charge_lock_at = \?[^`]*)`/);
  check('선점 SQL 을 소스에서 오려 냈다', !!m, '형태가 바뀌었다면 이 검사를 함께 갱신할 것');
  if (m) {
    const SQL = m[1];
    const LEASE = 10 * 60 * 1000;
    const db = new DatabaseSync(':memory:');
    db.exec(`CREATE TABLE subscriptions (id INTEGER PRIMARY KEY, charge_lock_at INTEGER)`);
    db.exec(`INSERT INTO subscriptions (id, charge_lock_at) VALUES (1, NULL)`);
    const claim = (now) => db.prepare(SQL).run(now, 1, now - LEASE).changes;

    const now = 1788000000000;
    const first = claim(now);
    const second = claim(now + 1000);          // 1초 뒤 다른 경로가 같은 구독을 시도
    check('동시에 두 번 시도하면 한 번만 이긴다', first === 1 && second === 0,
          `첫 시도 ${first} · 둘째 시도 ${second} — 둘 다 1이면 카드가 두 번 긁힌다`);

    // 워커가 청구 도중 죽어 표식이 남은 경우 — 시간이 지나면 스스로 풀려야 한다
    const stuck = claim(now + LEASE + 1);
    check('선점이 오래되면 다음 실행이 가져간다 (스스로 풀림)', stuck === 1,
          '안 풀리면 그 구독은 영영 청구되지 않는다');

    /* 리스가 만료돼 남이 정당하게 가져간 뒤, 늦게 끝난 첫 실행이 «남의 표식» 을 지우면
       그 구독은 다시 무방비가 된다 — 해제도 소유권을 확인해야 한다. */
    {
      const mine = now + LEASE + 1;   // 방금(stuck) 이긴 쪽이 적어 둔 값
      const rel = (v) => db.prepare('UPDATE subscriptions SET charge_lock_at = NULL WHERE id = 1 AND charge_lock_at = ?').run(v).changes;
      check('남이 잡은 표식은 못 푼다', rel(now) === 0, '지우면 세 번째 실행이 들어와 이중청구가 된다');
      check('내가 잡은 표식은 푼다', rel(mine) === 1);
    }
    // 풀린 뒤에는 다시 잡을 수 있어야 한다
    db.prepare(`UPDATE subscriptions SET charge_lock_at = NULL WHERE id = 1`).run();
    check('풀고 나면 곧바로 다시 잡을 수 있다', claim(now + LEASE + 2) === 1);
  }
}

console.log('\n  C. 실패해도 다음이 막히지 않는다');
{
  check('청구 실패는 fail_count 를 올리고 내일 재시도한다',
        /bumpSubscriptionFailure/.test(code) && /fail_count/.test(code),
        '실패 처리가 사라지면 카드 문제인 구독을 매 스윕마다 무한히 긁는다');
  check('3회 실패면 구독을 해지한다', /failCount >= 3/.test(code),
        '막힌 카드를 영원히 긁지 않는다');
}

console.log(`\n  ── PASS ${PASS} · FAIL ${FAIL}`);
if (FAIL) { console.log('\n  실패:'); for (const f of FAILS) console.log('   · ' + f); }
process.exit(FAIL ? 1 : 0);
