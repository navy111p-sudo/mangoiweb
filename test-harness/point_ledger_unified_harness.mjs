/* ═══════════════════════════════════════════════════════════════════════════
   🧾 포인트 적립이 «원장(point_transactions)» 을 거치는지 감시 (2026-09-01 신설)

   [무엇이 잘못돼 있었나] 단어장·복습퀴즈 보상이 `student_points.balance` 만 직접 올리고
   원장에는 **한 줄도 안 남겼습니다.** 그래서 그 포인트는 다음 세 화면 어디에도 안 보입니다:
     · 학생 본인의 포인트 내역 (`api-points.ts` — 최근 30건)
     · 학부모 대시보드 (`api-students.ts` — 자녀 최근 10건)
     · 관리자 월간 포인트 합계 (`api-admin.ts`)
   잔액만 늘고 «왜 늘었는지» 가 어디에도 없었습니다.

   ⚠️ 그리고 이 수리로도 원장 밖 적립이 다 없어지지 않습니다 — `api-admin.ts` 의
      이탈관리 🎁 기프트·컴백 번들이 아직 잔액을 직접 올립니다(A 담당 영역).

   [잰 것 — 2026-09-01 D1]
     · `student_points.lifetime_earned` 합계 − 원장의 양수 합계 = **원장 밖 적립 2,746점**
       (9계정 — 대부분 테스트 계정 + jeong)
     · `vocab_rewards` 9행 / `review_quiz_rewards` 10행, 합계 **1,136점**, 8계정
     · 정책의 `GAME_QUIZ_RULES` 에 **`vocab_review`·`review_quiz_done` 이 이미 적혀 있는데**
       실제 적립 경로는 그 이름을 한 번도 안 썼습니다 — 이름만 있고 연결이 없었습니다.

   🔴 [이 하니스가 «고치지 않은 것» 을 분명히 해 둡니다]
     이 수리는 **금액을 한 푼도 바꾸지 않습니다.** 기록만 남깁니다.
     실효 상한은 여전히 **하루 최대 1,050점**입니다
     (단어장 400 + 단어장 미션 50 + 복습퀴즈 500 + 총량 100 — 미션은 400점 상한 «밖» 입니다).
     정책은 하루 100점인데 10배입니다 — 그걸 100점으로 통일하는 것은 **보상 정책 변경**이라
     사장님이 정할 일이고, `CAP_UNCOUNTED_RULES` 를 비우면 그날로 적용됩니다.

   [검사 방법] 문자열만 보지 않는다 — 상한 계산 함수를 컴파일해 **가짜 D1 로 실제로 돌려**
   「원장에 기록이 남아도 상한이 안 조여진다」를 확인한다.
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
function blockAt(src, from) {
  const open = src.indexOf('{', from);
  if (open < 0) return '';
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++; else if (src[i] === '}') { d--; if (d === 0) return src.slice(open, i + 1); }
  }
  return '';
}

const games = strip(readFileSync(join(SRC, 'api-games.ts'), 'utf8'));
const policy = strip(readFileSync(join(SRC, 'point-policy.ts'), 'utf8'));

console.log('\n[ A. 잔액을 «직접» 올리지 않고 원장을 거친다 ]');
{
  /* 🔴 이 부정 검사가 핵심이다 — 직접 올리기가 하나라도 남으면 그 경로는 여전히
     학생 본인 내역·학부모 대시보드에 안 보인다. 주석은 벗긴 사본으로 판정한다. */
  /* ⚠️ **줄 단위로 보면 안 된다** — 같은 뜻을 두 줄로 쓰거나 `UPDATE student_points SET` 로
     쓰면 못 잡는다(실측). 파일 전체에서 «잔액을 더하는 문장» 을 뜻으로 찾는다. */
  const direct = [];
  for (const m of games.matchAll(/(?:INSERT INTO|UPDATE)\s+student_points[\s\S]{0,400}?balance\s*=\s*balance\s*\+/g)) {
    direct.push(games.slice(0, m.index).split('\n').length);
  }
  check('api-games.ts 에 잔액 직접 올리기가 없다', direct.length === 0,
    '남은 줄: ' + direct.join(', ') + ' — 그 적립은 원장에 안 남아 화면 어디에도 안 보인다');
  check('원장 정본(applyPointTransaction)을 부른다',
    /applyPointTransaction\(/.test(games) && /from '\.\/api-points'/.test(games),
    '정본을 안 거치면 기록이 안 남는다');

  /* 정책이 이미 이름 붙여 둔 rule_code 를 쓰는지 — 새 이름을 만들면 GAME_QUIZ_RULES 와 어긋난다. */
  const used = [...games.matchAll(/ruleCode:\s*'([\w-]+)'/g)].map((m) => m[1]);
  for (const want of ['vocab_review', 'review_quiz_done']) {
    check(`rule_code '${want}' 를 쓴다(정책이 이미 이름 붙여 둔 것)`, used.includes(want),
      '쓴 것: ' + used.join(', ') + ' — 새 이름을 만들면 GAME_QUIZ_RULES 와 어긋난다');
    /* ⚠️ 파일 전체에서 그 문자열을 찾으면 **내가 새로 만든 CAP_UNCOUNTED_RULES 가 자기를 잡는다**
       — GAME_QUIZ_RULES 에서 빼도 통과했다(실측). 목록 자체를 잘라서 본다. */
    const gq = (policy.match(/GAME_QUIZ_RULES\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
    check(`  · 그 이름이 GAME_QUIZ_RULES 목록에 있다`, new RegExp("'" + want + "'").test(gq),
      '목록: ' + gq.replace(/\s+/g, ' ').slice(0, 120)
      + '\n       → 없으면 게임 묶음 상한이 그 적립을 못 본다');
  }
}

console.log('\n[ B. 금액이 바뀌지 않는다 — 이 수리는 «기록만» 이다 ]');
{
  /* 원래 상한(단어장 400 · 복습퀴즈 500)이 그대로 있는지. 이게 사라지면 «기록만» 이 거짓이 된다. */
  check('단어장 하루 400점 상한이 그대로다', /400 - \(s\?\.t \|\| 0\)/.test(games),
    '상한이 사라지면 금액이 바뀐 것이다');
  check('복습퀴즈 하루 500점 상한이 그대로다', /500 - \(Number\(used\?\.t\) \|\| 0\)/.test(games),
    '상한이 사라지면 금액이 바뀐 것이다');
  /* 적립 «전» 에 총량 게이트를 새로 걸지 않았는지 — 걸면 금액이 줄어든다(정책 변경). */
  /* ⚠️ 파일 전체에 «그 이름이 없다» 로 두면, 나중에 **다른** 게임 보상이 정당하게 총량 게이트를
     쓸 때 이 두 경로를 안 건드려도 FAIL 난다. 두 적립 호출 부근만 잘라서 본다. */
  const nearGate = [];
  for (const m of games.matchAll(/applyPointTransaction\(/g)) {
    const seg = games.slice(Math.max(0, m.index - 1200), m.index);
    if (/checkEarnAllowed\(/.test(seg)) nearGate.push(games.slice(0, m.index).split('\n').length);
  }
  check('이 두 경로에 총량 게이트(checkEarnAllowed)를 걸지 않았다', nearGate.length === 0,
    '걸린 줄: ' + nearGate.join(', ')
    + '\n       → 걸면 보상이 최대 10분의 1로 줄어든다. 그건 사장님이 정할 일이다');

  /* 🔴 금액 말고 **이름 칸**도 바뀌면 안 된다 — 이게 이번에 가장 위험했던 회귀다.
     정본은 `student_name = COALESCE(?, student_name)` 이라 빈 값 대신 uid 를 넘기면
     **기존에 들어 있던 진짜 이름이 아이디로 바뀐다.** 그 칸은 무인증 공개 리더보드가
     그대로 내보내는데, 이 저장소는 「이름이 없을 때 아이디로 폴백하지 말 것」을 못 박아
     두었다(2026-08-28) — 비밀번호가 설정된 학생이 0명이라 아이디를 아는 것이 곧 로그인이다.
     ⚠️ 옛 코드는 ON CONFLICT 목록에 student_name 이 없어 기존 행을 안 건드렸다.
        즉 «uid 로 폴백» 은 이번 변경이 새로 만드는 위험이다. */
  const nameFallback = [];
  for (const m of games.matchAll(/studentName:\s*([^,\n]+)/g)) {
    const expr = m[1].trim();
    if (/\b(uid|userId)\b/.test(expr)) nameFallback.push(games.slice(0, m.index).split('\n').length + ': ' + expr.slice(0, 50));
  }
  check('이름이 없을 때 아이디로 폴백하지 않는다', nameFallback.length === 0,
    '폴백하는 곳: ' + nameFallback.join(' | ')
    + '\n       → 공개 리더보드의 student_name 칸에 아이디가 실린다(= 로그인 정보 유출).'
    + '\n         진짜 이름이 없으면 undefined 를 넘겨 기존 값을 그대로 두어야 한다.');
}

console.log('\n[ C. 상한 계산을 실제로 돌려 본다 — 기록이 남아도 안 조여지는가 ]');
{
  /* ⚠️ esbuild 는 bin/ 경로를 node 로 직행하면 OS 마다 깨진다(Win=JS심·Linux=ELF) → JS API 를 쓴다. */
  const { buildSync } = await import(pathToFileURL(
    join(ROOT, 'cloudflare-deploy', 'node_modules', 'esbuild', 'lib', 'main.js')).href);
  const dir = mkdtempSync(join(tmpdir(), 'ledger-'));
  const out = join(dir, 'p.mjs');
  buildSync({ entryPoints: [join(SRC, 'point-policy.ts')], bundle: true, format: 'esm',
    outfile: out, platform: 'neutral', logLevel: 'silent' });
  const M = await import(pathToFileURL(out).href);

  /** 질의문에 실린 rule_code 목록을 그대로 돌려주는 가짜 D1.
   *  ⚠️ 두 층(prepare / prepare().bind()) 모두에 first 를 둔다 — 한 층만 두면 정본이
   *     예외로 빠져 «늘 0» 이 되고, 상한 검사가 헛돌며 통과한다(다른 하니스에서 실측). */
  /* ⚠️ 질의문과 무관하게 늘 같은 값을 돌려주면 **시나리오가 한 번도 만들어지지 않는다** —
     처음엔 그래서 「단어장 400점을 받은 날에도…」 검사가 수리를 되돌려도 통과했다(실측).
     제외가 실제로 걸렸는지를 질의문에서 읽어 답을 바꾼다. */
  const seen = [];
  const mkEnv = (sum, uncountedSum = 0) => {
    const api = (q, args) => ({ first: async () => {
      seen.push({ q, args });
      // 제외 조건이 실제로 걸려 있으면 «빼고 센 값», 아니면 «다 센 값» 을 돌려준다
      const excludes = /NOT IN/.test(q) && (args || []).includes('vocab_review');
      return { s: excludes ? sum : sum + uncountedSum };
    } });
    return { DB: { prepare: (q) => ({ ...api(q, []), bind: (...a) => api(q, a) }) } };
  };

  check('CAP_UNCOUNTED_RULES 가 두 규칙을 담고 있다',
    M.CAP_UNCOUNTED_RULES.includes('vocab_review') && M.CAP_UNCOUNTED_RULES.includes('review_quiz_done'),
    '담은 것: ' + JSON.stringify(M.CAP_UNCOUNTED_RULES));

  seen.length = 0;
  await M.earnedToday(mkEnv(0), 'u');
  const q1 = seen[0] || {};
  check('«오늘 번 점수» 계산이 그 두 규칙을 제외한다',
    /NOT IN/.test(q1.q || '') && (q1.args || []).includes('vocab_review'),
    'SQL: ' + String(q1.q).replace(/\s+/g, ' ').slice(0, 140)
    + '\n       → 제외하지 않으면 단어장 400점을 받은 학생이 그날 다른 적립을 통째로 못 받는다');

  seen.length = 0;
  await M.earnedTodayForGames(mkEnv(0), 'u');
  const q2 = seen[0] || {};
  check('«게임 묶음» 계산에서도 그 두 규칙을 뺀다',
    !(q2.args || []).includes('vocab_review') && !(q2.args || []).includes('review_quiz_done'),
    '바인드: ' + JSON.stringify(q2.args)
    + '\n       → GAME_QUIZ_RULES 에 들어 있어서, 안 빼면 게임 30점 상한이 갑자기 조여진다');
  check('  · 그래도 다른 게임 규칙은 그대로 센다', (q2.args || []).includes('rescue_sentence'),
    '바인드: ' + JSON.stringify(q2.args) + ' — 다 빼 버리면 게임 상한이 통째로 죽는다');

  /* 실제 시나리오: 단어장으로 400점을 받은 학생이 그날 출석 10점을 또 받을 수 있어야 한다
     (기록은 남지만 상한에는 안 들어가므로). */
  const r = await M.checkEarnAllowed(mkEnv(0, 400), 'u', 'attendance', 10);
  check('단어장 400점을 받은 날에도 출석 10점이 통과한다(= 금액 무변경)', r.ok === true,
    JSON.stringify(r) + ' — 막히면 이 수리가 «기록만» 이 아니라 보상을 깎은 것이다');
}

console.log('\n[ D. 「아직 안 고친 것」을 분명히 적어 두었다 ]');
{
  /* 이 수리는 «반쪽» 이다. 그 사실을 코드에 남겨야, 다음 사람이 「상한은 이미 통일됐다」고
     오해하지 않는다. 그리고 통일하는 방법(그 목록 비우기)도 함께 적어 둔다. */
  const raw = readFileSync(join(SRC, 'point-policy.ts'), 'utf8');
  /* ⚠️ 숫자를 정규식으로 못 박으면 그 숫자를 바로잡는 순간 FAIL 난다(실제로 1,000 → 1,050 이었다).
     «근거가 적혀 있는가» 로 본다. */
  check('실효 상한의 «근거» 가 적혀 있다(어느 상한이 얼마씩인지)',
    /단어장 400/.test(raw) && /복습퀴즈 500/.test(raw) && /총량 100/.test(raw),
    '「상한이 이미 100점이다」로 읽히면 다음 사람이 이 구멍을 다시 안 본다');
  check('아직 남은 원장 밖 경로도 적어 두었다', /api-admin.ts/.test(raw) && /이탈관리|컴백/.test(raw),
    '이 수리가 «다 고쳤다» 로 읽히면 남은 두 곳을 아무도 안 본다');
  check('통일하는 방법과 «사장님 결정» 이라는 것이 적혀 있다',
    /목록을 비우면/.test(raw) && /사장님/.test(raw),
    '고치는 방법을 안 적으면 그 결정이 영영 안 내려진다');
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n🚨 point_ledger_unified_harness 실패'); process.exit(1); }
console.log('🎉 point_ledger_unified_harness — 전부 통과');
