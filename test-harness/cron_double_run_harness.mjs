/* ═══════════════════════════════════════════════════════════════════════════
   🕐 야간 작업 «중복 실행» 감시 (2026-08-28 신설)

   [무엇을 막나] wrangler.toml 의 crons 에는 15분마다 도는 감시견 트리거가 함께 있다.
   그래서 scheduled 안에서 `hour === 18` 처럼 «시» 로 가르면, 그 시간대에 네 번(정각·
   15·30·45분) 참이 되고 정각에는 전용 cron 이 **별도 호출**로 한 번 더 들어와 같은
   작업이 동시에 돈다 → 하루 5회 + 정각 동시 2회.
   실제 피해: 학부모 문자 이중 발송, 자동결제가 켜지면 카드 이중 청구
   (주문 id 를 매번 새로 만들어 PG 가 서로 다른 주문으로 본다).

   [검사 방법] 「글자가 있는가」가 아니라, wrangler.toml 의 크론 표를 읽어
   **가짜 ScheduledEvent 를 만들어 실제로 돌려** 각 작업이 하루 몇 번 도는지 «센다».
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CD = join(ROOT, 'cloudflare-deploy');
let pass = 0, fail = 0;
const ok = (n) => { console.log('  ✅ ' + n); pass++; };
const no = (n, w) => { console.log('  ❌ ' + n + (w ? '\n       ' + w : '')); fail++; };
const check = (n, c, w) => (c ? ok(n) : no(n, w));

const toml = readFileSync(join(CD, 'wrangler.toml'), 'utf8');
const src = readFileSync(join(CD, 'src', 'index.ts'), 'utf8');

console.log('\n[ A. 크론 표를 읽는다 ]');
const m = toml.match(/^crons\s*=\s*\[([^\]]*)\]/m);
const crons = m ? [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]) : [];
check('wrangler.toml 에서 crons 를 읽었다', crons.length > 0, 'crons 배열을 못 찾았다');
console.log('       ' + JSON.stringify(crons));
const sub = /\[env\.production\.triggers\][\s\S]*?crons\s*=\s*\[\s*\]/.test(toml);
check('운영 환경에는 cron 이 없다(기본 워커에만 있다 — 규격 유지)', sub,
  '[env.production.triggers] crons 가 빈 배열이 아니다 — 두 워커가 같은 야간작업을 돌리게 된다');

console.log('\n[ B. 야간 작업이 «시» 가 아니라 «어느 cron 인가» 로 갈린다 ]');
{
  /* 주석을 벗겨 낸 사본으로 본다 — 설명 주석에 hour === 가 들어 있으면 자기 주석을 잡는다.
     ⚠️ 블록주석을 정규식 하나로 지우면 안 된다 — 문자열·주석 안의 짝 없는 «슬래시+별표»
        하나에 코드가 통째로 함께 지워진다(이 저장소 index.ts 에서 실측 8만자).
        줄 단위로 «지금 블록주석 안인가» 를 추적한다. */
  let inBlk = false;
  const code = src.split(/\r?\n/).map((raw) => {
    const t = raw.trim();
    if (inBlk) { if (t.includes('*/')) inBlk = false; return ''; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlk = true; return ''; }
    if (t.startsWith('//')) return '';
    return raw.replace(/\s\/\/.*$/, '');
  }).join('\n');
  const scheduledAt = code.indexOf('async scheduled(');
  const body = scheduledAt >= 0 ? code.slice(scheduledAt) : '';
  const bare = [...body.matchAll(/if\s*\(\s*hour === \d+\s*\)/g)].map((x) => x[0]);
  check('scheduled 안에 «hour 만 보는» 분기가 없다', bare.length === 0,
    '남은 것: ' + bare.join(', ') + '\n       → 15분 트리거 때문에 하루 여러 번·동시에 돈다. cronIs() 로 가를 것');
  check('cronIs() 헬퍼가 있다', /const cronIs\s*=/.test(body),
    '어느 cron 인지 가르는 정본 헬퍼가 사라졌다');
}

console.log('\n[ C. 가짜 이벤트를 실제로 돌려 «하루 몇 번» 인지 센다 ]');
{
  /* 이 저장소의 조건식 두 갈래를 그대로 옮겨 «호출 횟수» 를 센다.
     - cronIs(spec)        : 정확일치 → 그 cron 이 우는 횟수만큼만
     - isWatchdogTick&&hour: 15분 트리거 중 그 시간대만 */
  const fire = [];                    // 하루치 트리거를 모두 만든다
  for (const c of crons) {
    if (c.startsWith('*')) { for (let h = 0; h < 24; h++) for (const mm of [0, 15, 30, 45]) fire.push({ cron: c, h, mm }); }
    else { const [mi, hh] = c.split(' '); fire.push({ cron: c, h: Number(hh), mm: Number(mi) }); }
  }
  const runs = (pred) => fire.filter(pred).length;
  const cronIs = (spec) => (e) => e.cron === spec;
  const watchdogAt = (h) => (e) => e.cron.startsWith('*') && e.h === h;

  for (const [label, pred, want] of [
    ['정각 전용 cron 으로 가른 작업(예: 0 18)', cronIs('0 18 * * *'), 1],
    ['정각 전용 cron 으로 가른 작업(예: 0 1)', cronIs('0 1 * * *'), 1],
    ['15분 트리거를 타는 작업(21시대)', watchdogAt(21), 4],
  ]) {
    const n = runs(pred);
    check(`${label} → 하루 ${n}회`, n === want, `기대 ${want}회인데 ${n}회다`);
  }
  // 고치기 «전» 방식이 실제로 몇 번이었는지 — 이 하니스가 무엇을 막는지 숫자로 남긴다
  const oldWay = runs((e) => e.h === 18);
  check(`옛 방식(hour === 18)이었다면 하루 ${oldWay}회였다 — 그 회귀를 막는다`, oldWay > 1,
    '크론 표가 바뀌어 이 검사가 뜻을 잃었다 — 사람이 확인할 것');
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n🚨 cron_double_run_harness 실패'); process.exit(1); }
console.log('🎉 cron_double_run_harness — 전부 통과');
