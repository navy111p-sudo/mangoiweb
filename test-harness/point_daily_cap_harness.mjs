/* ═══════════════════════════════════════════════════════════════════════════
   🪙 포인트 «하루 상한» 을 모든 적립 경로가 지나는지 감시 (2026-09-01 신설)

   [무엇을 막나] 하루 전체 상한(100점)을 거는 정본은 `checkEarnAllowed`(point-policy.ts)
   하나인데, 그것을 부르는 곳이 **적립 경로 5개 중 1개뿐**이었다. 나머지 넷은
   «규칙별 상한» 만 봤고, 그 규칙별 상한은 점수가 아니라 **«횟수»** 다.

   🔴 그래서 칭찬 포인트가 새는 자리였다: 금액이 1점 → 5점으로 바뀌었는데
   (`POINT_POLICY.EARN.praise`, `syncApprovedRuleAmounts` 가 **금액만** 맞춘다)
   횟수 상한 100 은 그대로여서 이 규칙 하나로 **하루 500점**이 나갈 수 있었다.
   1포인트 = 1원이다(gift_catalog 실측: 3,000원 상품권 = 3,000점).

   [잰 것 — 2026-09-01 D1]
     · `point_rules`: teacher_praise_point = 5점 × 횟수 100 ⟹ **하루 500점**
     · **`point_transactions` 기준** 하루 최대 적립 **80점**(2026-06-04 시드 계정 제외)
       ⚠️ «학생이 실제로 받은 하루 총점» 이 아니다 — 아래 D절 참고
     · 거래가 있는 규칙은 전부 소액(attendance·praise·class_rating·speech_master·
       rescue_sentence·ai_friend_*). referral 300·birthday 200·level_up 100 은 **거래 0건**
       ⟹ 전체 상한을 걸어도 «큰 보상이 막히는» 일이 지금은 없다.
   [판단 — 측정 아님] 지금 새고 있는 게 아니라, 금액을 한 번 더 올리면 조용히 배로 나가는 상태였다.

   🔴 [이 상한은 아직 «전체» 가 아니다 — 알고 쓸 것]
     `checkEarnAllowed` 는 `point_transactions` 를 센다. 그 표를 거치지 않는 적립이 아직 있다.
     🔀 (2026-09-01 갱신 — PR #670 이 병합되며 «사실» 이 바뀌었다)
       · api-games.ts 단어장·복습퀴즈 보상 — **원장으로 합쳐졌다**(잔액 직접올림 0곳).
         다만 `CAP_UNCOUNTED_RULES` 에 있어 **총량 상한에는 여전히 안 센다.** 그건 버그가
         아니라 «금액을 바꾸지 않으려고» 둔 의도된 보류이고, 비우는 것은 사장님 결정이다.
         (실효 상한: 단어장 400 + 미션 50 + 복습퀴즈 500 + 총량 100 = **하루 1,050점**)
       · api-admin.ts 이탈관리 🎁 기프트 · 컴백 번들 — **아직 잔액을 직접 올린다**(A 담당 영역).
     그래서 이 하니스가 지키는 것은 **«applyPointTransaction 을 지나고 CAP_UNCOUNTED_RULES 에
     없는 적립 경로»** 뿐이다. ⛔ 「하루 100점이 전부 막힌다」고 읽지 말 것.

   [검사 방법] 문자열만 보지 않는다 — 정본 게이트를 컴파일해 가짜 D1 로 **실제로 돌리고**,
   적립 경로마다 그 게이트를 지나는지 «중괄호 짝» 으로 자른 블록 안에서 확인한다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
let pass = 0, fail = 0;
const ok = (n) => { console.log('  ✅ ' + n); pass++; };
const no = (n, w) => { console.log('  ❌ ' + n + (w ? '\n       ' + w : '')); fail++; };
const check = (n, c, w) => (c ? ok(n) : no(n, w));

/** 줄 단위 주석 제거 — 블록주석을 정규식 하나로 지우면 짝 없는 «별표+슬래시» 하나에
 *  코드가 통째로 함께 사라진다(이 저장소 index.ts 에서 실측 8만자). */
function strip(src) {
  let inBlk = false;
  return src.split(/\r?\n/).map((raw) => {
    const t = raw.trim();
    if (inBlk) { if (t.includes('*/')) inBlk = false; return ''; }
    if (t.startsWith('/*')) { if (!t.includes('*/')) inBlk = true; return ''; }
    if (t.startsWith('//')) return '';
    return raw;
  }).join('\n');
}

const points = strip(readFileSync(join(SRC, 'api-points.ts'), 'utf8'));
const ai = strip(readFileSync(join(SRC, 'api-ai.ts'), 'utf8'));
const policy = strip(readFileSync(join(SRC, 'point-policy.ts'), 'utf8'));

console.log('\n[ A. applyPointTransaction 을 지나는 적립 경로가 모두 정본 게이트를 지난다 ]');
{
  /* ⚠️ 「파일 어딘가에 checkEarnAllowed 가 있다」로 보면 안 된다 — 다섯 경로 중 한 곳에만
     있어도 통과한다(그게 바로 이번에 고친 상태였다). **적립 호출마다** 그 «앞» 에
     게이트가 있는지 본다.
     ⛔ 그 범위를 «앞 N줄» 로 자르지 말 것 — 실측으로 확인했다: 60줄로 두면 기존 게이트에서
        20줄 뒤에 **게이트 없는 새 적립**을 끼워 넣어도 조용히 통과한다(2026-09-01 trap-check).
        이 하니스가 존재하는 이유가 바로 «게이트 없이 적립 경로가 느는 것» 이므로,
        길이가 아니라 **그 적립을 감싸는 함수 블록**(중괄호 짝)으로 자른다. */
  const sites = [];
  for (const [name, src] of [['api-points.ts', points], ['api-ai.ts', ai]]) {
    const lines = src.split('\n');
    lines.forEach((l, i) => {
      if (!/applyPointTransaction\(/.test(l)) return;
      // 그 호출부터 8줄 안에서 type 을 읽는다(여러 줄로 흩어져 있다)
      const near = lines.slice(i, i + 8).join(' ');
      if (!/type:\s*'earn'/.test(near)) return;
      /* 이 적립을 «감싸는» 블록을 중괄호 짝으로 거슬러 올라간다.
         ⚠️ **가장 안쪽 블록만 보면 안 된다** — 실제로 게이트는 함수 몸통에 있고 적립은 그 안의
            `try {` 한 겹 안쪽이라, 한 겹만 올라가면 «게이트 없음» 으로 오판한다(실측 2곳).
         그래서 «함수/라우트 경계» 를 만날 때까지 계속 올라간다. */
      const BOUND = /(function\b|=>\s*\{|path ===|method ===|async \()/;
      let start = 0, d = 0, level = 0;
      for (let j = i - 1; j >= 0 && level < 8; j--) {
        for (const c of [...lines[j]].reverse()) { if (c === '}') d++; else if (c === '{') d--; }
        if (d < 0) {                       // 이 줄이 한 겹 바깥 블록을 연다
          start = j; level++;
          if (BOUND.test(lines[j])) break; // 함수·라우트 경계면 여기까지
          d = 0;                           // 한 겹 더 올라간다
        }
      }
      const before = lines.slice(start, i).join('\n');
      sites.push({ where: `${name}:${i + 1}`, gated: /checkEarnAllowed\(/.test(before) });
    });
  }
  check(`적립 경로를 ${sites.length}곳 찾았다`, sites.length >= 4,
    '찾은 곳: ' + sites.map((s) => s.where).join(', ') + ' — 구조가 바뀌었나?');
  const ungated = sites.filter((s) => !s.gated).map((s) => s.where);
  check('그 경로들이 모두 checkEarnAllowed 를 지난다', ungated.length === 0,
    '게이트를 안 지나는 곳: ' + ungated.join(', ')
    + '\n       → 그 경로는 하루 100점 상한을 통째로 건너뛴다(1포인트 = 1원이다)');

  /* ⚠️ «불렀는가» 만 보면 결과를 버려도 통과한다 — 실제로 그 상태를 한 번 만들었다.
     게이트 호출마다 그 결과를 조건으로 쓰는지 확인한다. */
  const dropped = [];
  for (const [name, src] of [['api-points.ts', points], ['api-ai.ts', ai]]) {
    src.split('\n').forEach((l, i) => {
      const m = l.match(/(?:const|let)\s+(\w+)\s*=\s*await checkEarnAllowed\(/);
      if (!m) return;
      const after = src.split('\n').slice(i + 1, i + 6).join(' ');
      if (!new RegExp('(?:!' + m[1] + '\\.ok|' + m[1] + '\\.ok)').test(after)) dropped.push(`${name}:${i + 1}`);
    });
  }
  check('게이트 결과를 버리지 않고 조건으로 쓴다', dropped.length === 0,
    '결과를 안 쓰는 곳: ' + dropped.join(', ') + ' — 부르기만 하면 아무것도 안 막는다');
}

console.log('\n[ B. 상한 판정을 한 곳에만 둔다 — 복제하면 반드시 어긋난다 ]');
{
  check('상한 상수는 point-policy.ts 에만 있다',
    /DAILY_TOTAL_CAP:\s*\d+/.test(policy)
    && !/DAILY_TOTAL_CAP\s*[:=]\s*\d+/.test(points) && !/DAILY_TOTAL_CAP\s*[:=]\s*\d+/.test(ai),
    '숫자를 여러 곳에 적으면 한쪽만 고쳐져 조용히 어긋난다');
  check('부르는 쪽은 정본을 import 한다',
    /from '\.\/point-policy'/.test(points) && /from '\.\/point-policy'/.test(ai),
    'import 없이 같은 판정을 새로 쓰면 그게 두 번째 정본이 된다');
}

console.log('\n[ C. 게이트를 실제로 돌려 본다 — 가짜 D1 ]');
{
  /* ⚠️ esbuild 는 bin/ 경로를 node 로 직행하면 OS 마다 깨진다(Win=JS심·Linux=ELF) → JS API 를 쓴다. */
  const { buildSync } = await import(pathToFileURL(
    join(ROOT, 'cloudflare-deploy', 'node_modules', 'esbuild', 'lib', 'main.js')).href);
  const dir = mkdtempSync(join(tmpdir(), 'point-'));
  const out = join(dir, 'p.mjs');
  buildSync({ entryPoints: [join(SRC, 'point-policy.ts')], bundle: true, format: 'esm',
    outfile: out, platform: 'neutral', logLevel: 'silent' });
  const M = await import(pathToFileURL(out).href);

  /** 오늘 이미 얼마 벌었는지를 질의문으로 갈라 답한다.
   *  ⚠️ 두 층(prepare / prepare().bind()) 모두에 first 를 둔다 — 한 층만 두면 정본이
   *     예외로 빠져 «늘 0» 이 되고, 그러면 상한 검사가 헛돌며 통과한다(다른 하니스에서 실측). */
  const mkEnv = (total, games) => {
    const api = (q) => ({ first: async () => ({ s: /rule_code IN/.test(q) ? games : total }) });
    return { DB: { prepare: (q) => ({ ...api(q), bind: () => api(q) }) } };
  };

  const cap = M.POINT_POLICY.DAILY_TOTAL_CAP;
  check(`하루 전체 상한이 ${cap}점이다`, cap === 100, '값: ' + cap);

  const r1 = await M.checkEarnAllowed(mkEnv(0, 0), 'u', 'attendance', 10);
  check('아침에 10점 — 통과', r1.ok === true, JSON.stringify(r1));

  const r2 = await M.checkEarnAllowed(mkEnv(cap - 1, 0), 'u', 'teacher_praise_point', 5);
  check('상한 1점 남았는데 5점 — 막는다(깎아서 주지 않는다)',
    r2.ok === false && r2.error === 'daily_total_cap_reached', JSON.stringify(r2));

  const r3 = await M.checkEarnAllowed(mkEnv(cap, 0), 'u', 'teacher_praise_point', 5);
  check('이미 상한을 채웠으면 막는다', r3.ok === false, JSON.stringify(r3));

  const r4 = await M.checkEarnAllowed(mkEnv(0, M.POINT_POLICY.EARN.game_quiz_daily), 'u',
    M.GAME_QUIZ_RULES[0], 5);
  check('게임·퀴즈 묶음 상한(30점)은 따로 본다', r4.ok === false && r4.error === 'game_daily_cap_reached',
    JSON.stringify(r4));

  const r5 = await M.checkEarnAllowed(mkEnv(0, M.POINT_POLICY.EARN.game_quiz_daily), 'u',
    'attendance', 10);
  check('게임 상한을 채워도 게임이 아닌 적립은 통과한다', r5.ok === true, JSON.stringify(r5));

  /* 이번 사고를 그대로 재현한다: 칭찬 5점을 21번 받으면 105점이라 넘어야 한다.
     그 전에는 «횟수» 100 만 봤으므로 100번(=500점)까지 통과했다. */
  let total = 0, n = 0;
  while ((await M.checkEarnAllowed(mkEnv(total, 0), 'u', 'teacher_praise_point', 5)).ok) { total += 5; n++; }
  check(`칭찬 5점은 하루 ${n}번에서 멈춘다(= ${total}점)`, total <= cap && n === 20,
    `${n}번 ${total}점까지 통과했다 — 규칙표의 daily_cap 은 «횟수» 100 이라 그것만 보면 500점이 나간다`);

  const r6 = await M.checkEarnAllowed({ DB: { prepare: () => { throw new Error('D1 down'); } } },
    'u', 'attendance', 10);
  check('D1 이 죽으면 막지 않는다(적립이 조회 실패로 죽으면 안 된다)', r6.ok === true, JSON.stringify(r6));

  /* 🎖 다시 오지 않는 마디 보상은 상한을 지나지 않는다.
     7일 연속 영작 보너스는 그날 막히면 다음 날 wStreak=8 이라 조건이 거짓 —
     **그 마디가 영영 돌아오지 않는다.** 막는 게 아니라 빼앗는 것이 된다. */
  const r7 = await M.checkEarnAllowed(mkEnv(cap, 0), 'u', 'ai_writing_streak', 50);
  check('상한을 채워도 «다시 오지 않는» 마디 보상은 통과한다', r7.ok === true,
    JSON.stringify(r7) + ' — 7일 연속 보너스는 놓치면 다시 안 온다');
  check('면제 목록이 «반복되는» 적립을 담고 있지 않다',
    M.CAP_EXEMPT_RULES.every((c) => /_streak$/.test(c)) && M.CAP_EXEMPT_RULES.length <= 3,
    '면제: ' + M.CAP_EXEMPT_RULES.join(',') + ' — 반복 적립이 들어오면 그 순간 상한이 뚫린다');

  /* 💸 환불·관리자 지급은 «오늘 벌었다» 가 아니다. 3,000P 기프티콘 환불 한 건이
     그날 적립을 통째로 막으면 안 된다. */
  const sqlSeen = [];
  await M.earnedToday({ DB: { prepare: (q) => { sqlSeen.push(q); return { bind: () => ({ first: async () => ({ s: 0 }) }) }; } } }, 'u');
  check("«오늘 번 점수» 는 type='earn' 만 센다", /type\s*=\s*'earn'/.test(sqlSeen.join(' ')),
    '환불·관리자지급까지 세면 환불 한 건에 그날 적립이 통째로 막힌다');
  check('그 계산에서 면제 규칙도 뺀다', /NOT IN/.test(sqlSeen.join(' ')),
    '면제해 놓고 합계에는 넣으면 그만큼 다른 적립이 막힌다');
}

console.log('\n[ D. 이 상한이 «전체» 가 아니라는 것을 알고 있다 ]');
{
  /* 🔀 (2026-09-01 갱신) 이 절은 원래 「api-games.ts 가 원장 밖에서 적립한다」는 **그때의 사실**을
     못 박고 있었고, 「0곳이 되면 이 검사가 FAIL 하니 그때 이 주석과 머리말을 함께 고치라」고
     적어 두었다. PR #670 이 실제로 0곳으로 만들었으므로 **약속대로 뒤집는다.**
     ⛔ 「빨간불이 났으니 되돌리자」로 가면 안 되는 자리였다 — 사실이 좋아진 것이지 깨진 게 아니다. */
  /* ⚠️ 「UPDATE student_points」로 찾으면 0곳이 나온다 — 실제 형태는
     `INSERT … ON CONFLICT(user_id) DO UPDATE SET balance = balance + ?` 다.
     문장 «모양» 이 아니라 «잔액을 더한다» 는 뜻으로 찾는다. */
  const games = strip(readFileSync(join(SRC, 'api-games.ts'), 'utf8'));
  const admin = strip(readFileSync(join(SRC, 'api-admin.ts'), 'utf8'));
  const RE_DIRECT = /balance\s*=\s*balance\s*\+/g;
  const gOut = (games.match(RE_DIRECT) || []).length;
  const aOut = (admin.match(RE_DIRECT) || []).length;

  check('api-games.ts 는 원장을 지난다(잔액 직접올림 0곳)', gOut === 0,
    '아직 ' + gOut + '곳 — 원장 밖으로 되돌아가면 학생 내역·학부모 화면에서 다시 사라진다');
  check('그 적립이 원장에 실제로 남는다', /applyPointTransaction/.test(games),
    '기록이 없으면 잔액만 늘고 «왜 늘었는지» 가 없다(2026-09-01 실측 원장 밖 2,746점)');

  /* 🔑 이 절의 핵심 — «원장에 남는다» 와 «상한이 본다» 는 **다른 말**이다.
     기록은 남기되 금액은 그대로 두려고 일부러 상한 계산에서 뺐다. 그 사실을 못 박아 두지 않으면
     다음 사람이 「원장으로 합쳤으니 이제 하루 100점이 전부 막힌다」고 잘못 읽는다. */
  check('그래도 총량 상한은 그 둘을 세지 않는다(의도된 보류)',
    /CAP_UNCOUNTED_RULES/.test(policy) && /vocab_review/.test(policy)
      && /review_quiz_done/.test(policy),
    '이 목록을 비우면 보상이 최대 10분의 1로 준다 — 버그 수리가 아니라 «정책 변경»이라 사장님이 정한다');

  check('api-admin.ts 에는 아직 원장 밖 적립이 남아 있다(' + aOut + '곳)', aOut > 0,
    '0곳이 됐다면 그쪽도 합쳐진 것이다 — 머리말의 «전체가 아니다» 를 함께 고칠 것');
  check('그래서 이 하니스는 «전체» 라고 말하지 않는다',
    /전체» 가 아니다/.test(readFileSync(new URL(import.meta.url)).toString()),
    '머리말에서 그 한계를 지우면 다음 사람이 «다 막혔다» 고 읽는다');
}

console.log('\n[ E. 규칙표의 daily_cap 이 «횟수» 라는 것을 코드가 알고 있다 ]');
{
  /* 이 사고의 뿌리는 「daily_cap 을 점수 예산으로 착각」이다. 세는 쿼리가 COUNT(*) 인지
     확인해 둔다 — 나중에 누가 SUM(amount) 로 바꾸면 뜻이 달라지므로 함께 봐야 한다. */
  const counts = (points.match(/COUNT\(\*\) AS c FROM point_rule_log/g) || []).length;
  check('규칙별 상한은 COUNT(*)로 «횟수» 를 센다', counts >= 2,
    '찾은 곳 ' + counts + '곳 — 구조가 바뀌었나?');
  check('점수 상한은 SUM(amount)로 «점수» 를 센다',
    /SUM\(amount\)[\s\S]{0,120}point_transactions/.test(policy),
    '전체 상한까지 횟수로 세면 금액을 올릴 때마다 조용히 배로 나간다');
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n🚨 point_daily_cap_harness 실패'); process.exit(1); }
console.log('🎉 point_daily_cap_harness — 전부 통과');
