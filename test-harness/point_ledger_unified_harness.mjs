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

   ✅ [2026-09-01 후속 — 사장님 결정으로 상한을 100점으로 통일했습니다]
     원장 통합(이 하니스가 처음 지키던 것)은 **금액을 한 푼도 안 바꾸는** 수리였고,
     그때 실효 상한은 **하루 1,050점**이었습니다(단어장 400 + 미션 50 + 복습퀴즈 500 + 총량 100).
     정책이 「하루 100점」이라고 적혀 있는데 열 배가 나가고 있었습니다.
     이제 `CAP_UNCOUNTED_RULES` 는 **비어 있고**, 적립하는 쪽도 `dailyAllowance()` 로
     남은 예산만큼만 줍니다. ⛔ 그 목록을 다시 채우면 그 경로만 상한 밖으로 빠져나갑니다.

   ⚠️ 실측 영향(2026-09-01, D1): 지금까지 학생-일 14건 중 **7건이 100점을 넘었고**,
     누적 1,956점 → 상한 후 **1,150점**(−41%). 하루 최대는 500점이었습니다.

   [검사 방법] 문자열만 보지 않는다 — 상한 계산 함수를 컴파일해 **가짜 D1 로 실제로 돌려**
   「상한이 진짜로 걸리는가」·「경계에서 맞는가」를 확인한다.
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

console.log('\n[ B. 적립하는 옆에 상한이 둘 — 자기 표 상한과 총량 예산 ]');
{
  /* 자기 표 상한(단어장 400 · 복습퀴즈 500)은 **그대로 둔다.**
     2026-09-01 에 총량 100점이 앞에 걸렸으니 이제 이 둘은 거의 안 닿는다. 그래도 지우지 않는다 —
     한 판에 수백 점이 걸리는 경로라, 총량 계산이 어떤 이유로든 «막지 않는 쪽» 으로 실패했을 때
     받아 주는 두 번째 그물이다. */
  check('단어장 하루 400점 상한이 그대로다', /400 - \(s\?\.t \|\| 0\)/.test(games),
    '상한이 사라지면 금액이 바뀐 것이다');
  check('복습퀴즈 하루 500점 상한이 그대로다', /500 - \(Number\(used\?\.t\) \|\| 0\)/.test(games),
    '상한이 사라지면 금액이 바뀐 것이다');
  /* 🔀 (2026-09-01 사장님 결정) 여기가 뒤집힌 자리다. 원래 이 검사는
     「이 두 경로에 총량 게이트를 **걸지 않았다**」였다 — 그때는 «금액을 안 바꾸는» 수리였고,
     100점으로 통일하는 것은 정책 변경이라 사장님이 정할 일이라고 적어 두었다. 결정이 났으므로
     이제 **반대로** 「총량 예산을 지나는가」를 지킨다.
     ⚠️ `checkEarnAllowed`(0 아니면 전부)가 아니라 `dailyAllowance`(남은 만큼 깎아서)를 쓴다 —
        한 판을 다 풀고 0점을 받는 쪽이 더 나쁘고, 이 경로는 원래부터 깎아서 주던 곳이다. */
  const gated = [];
  for (const m of games.matchAll(/applyPointTransaction\(/g)) {
    const seg = games.slice(Math.max(0, m.index - 1600), m.index);
    if (/dailyAllowance\(/.test(seg)) gated.push(games.slice(0, m.index).split('\n').length);
  }
  check('이 두 경로가 총량 예산(dailyAllowance)을 지난다', gated.length >= 2,
    '지나는 곳 ' + gated.length + '군데(줄: ' + gated.join(', ') + ')'
    + '\n       → 안 지나면 남의 예산만 깎아먹고 자기는 안 막히는 최악의 상태가 된다');
  check('  · «막기» 가 아니라 «깎기» 로 건다(Math.min)',
    /amount = Math\.min\(amount, allow\)/.test(games)
      && /Math\.min\(amount, await dailyAllowance\(/.test(games),
    '0 아니면 전부로 바꾸면 한 판을 다 풀고 0점을 받는다');

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

console.log('\n[ C. 상한 계산을 실제로 돌려 본다 — 100점에서 진짜 막히는가 ]');
{
  /* ⚠️ esbuild 는 bin/ 경로를 node 로 직행하면 OS 마다 깨진다(Win=JS심·Linux=ELF) → JS API 를 쓴다. */
  const { buildSync } = await import(pathToFileURL(
    join(ROOT, 'cloudflare-deploy', 'node_modules', 'esbuild', 'lib', 'main.js')).href);
  const out = join(mkdtempSync(join(tmpdir(), 'pol-')), 'pol.mjs');
  buildSync({ entryPoints: [join(SRC, 'point-policy.ts')], bundle: true, format: 'esm',
    outfile: out, platform: 'neutral', logLevel: 'silent' });
  const M = await import(pathToFileURL(out).href);

  /** 오늘 이미 번 점수를 `used` 로 고정해 돌려주는 가짜 D1.
   *  ⚠️ 두 층(prepare / prepare().bind()) 모두에 first 를 둔다 — 한 층만 두면 정본이
   *     예외로 빠져 «늘 0» 이 되고, 상한 검사가 헛돌며 통과한다(다른 하니스에서 실측). */
  const seen = [];
  const mkEnv = (used) => {
    const api = (q, args) => ({ first: async () => { seen.push({ q, args }); return { s: used }; } });
    return { DB: { prepare: (q) => ({ ...api(q, []), bind: (...a) => api(q, a) }) } };
  };

  /* 🔴 이 검사가 이 하니스의 핵심이다 — «목록이 비었는가» 를 문자열로 보면 안 된다.
     주석에 규칙 이름이 남아 있으면 그대로 초록불이 난다(2026-09-01 실제로 겪었다:
     point_daily_cap_harness 가 목록을 비운 뒤에도 24/24 로 통과했다). 값을 직접 본다. */
  check('CAP_UNCOUNTED_RULES 가 비어 있다(상한 100점 통일)',
    Array.isArray(M.CAP_UNCOUNTED_RULES) && M.CAP_UNCOUNTED_RULES.length === 0,
    '담긴 것: ' + JSON.stringify(M.CAP_UNCOUNTED_RULES)
    + '\n       → 여기에 규칙이 있으면 그 경로만 상한 밖으로 빠져나간다');

  seen.length = 0;
  await M.earnedToday(mkEnv(0), 'u');
  const q1 = seen[0] || {};
  check('«오늘 번 점수» 가 단어장·복습퀴즈를 «센다»',
    !(q1.args || []).includes('vocab_review') && !(q1.args || []).includes('review_quiz_done'),
    '제외 목록: ' + JSON.stringify(q1.args)
    + '\n       → 여기서 빼면 그 둘은 하루 수백 점을 받고도 상한에 안 걸린다');
  check('  · 그래도 «다시 오지 않는» 마디 보상은 여전히 뺀다',
    (q1.args || []).includes('ai_writing_streak'),
    '제외 목록: ' + JSON.stringify(q1.args)
    + '\n       → 7일 스트릭은 그날 막히면 영영 안 돌아온다(CAP_EXEMPT_RULES)');

  /* 실제 시나리오 — 경계에서 맞는지 «양쪽» 을 다 본다. 한쪽만 보면 늘 막거나 늘 통과해도 통과한다. */
  const r90 = await M.checkEarnAllowed(mkEnv(90), 'u', 'attendance', 10);
  const r100 = await M.checkEarnAllowed(mkEnv(100), 'u', 'attendance', 10);
  check('90점 받은 날 출석 10점은 통과(정확히 100까지)', r90.ok === true, JSON.stringify(r90));
  check('100점을 채운 날 출석 10점은 막힌다', r100.ok === false && r100.error === 'daily_total_cap_reached',
    JSON.stringify(r100) + '\n       → 막히지 않으면 «통일했다» 는 말이 거짓이 된다');

  /* 🧢 dailyAllowance — 단어장·복습퀴즈가 쓰는 «남은 만큼» 계산.
     ⚠️ 「0 아니면 전부」가 아니라 «깎아서 준다» 는 것이 이 함수의 존재 이유다. */
  check('남은 예산을 «남은 만큼» 돌려준다(70점 썼으면 30)',
    (await M.dailyAllowance(mkEnv(70), 'u', 'vocab_review')) === 30,
    '값: ' + (await M.dailyAllowance(mkEnv(70), 'u', 'vocab_review')));
  check('  · 다 쓴 날은 0', (await M.dailyAllowance(mkEnv(100), 'u', 'vocab_review')) === 0);
  check('  · 넘겨 쓴 날도 음수가 아니라 0',
    (await M.dailyAllowance(mkEnv(500), 'u', 'vocab_review')) === 0,
    '음수가 나가면 Math.min 이 금액을 음수로 만든다');
  check('  · 마디 보상은 상한을 안 지난다',
    (await M.dailyAllowance(mkEnv(100), 'u', 'ai_writing_streak')) > 0,
    '0이면 7일 스트릭이 상한에 걸려 영영 사라진다');

  /* ⚠️ 조회가 실패할 때 «막는 쪽» 으로 실패하면, 통신 한 번 흔들린 학생이 점수를 잃는다. */
  const boom = { DB: { prepare: () => { throw new Error('db down'); } } };
  check('상한 조회가 실패하면 «막지 않는다»(전액 허용)',
    (await M.dailyAllowance(boom, 'u', 'vocab_review')) === 100,
    '조회 실패로 학생이 점수를 잃는 쪽이 더 나쁘다');

  /* 적립하는 쪽이 실제로 그 함수를 지나는지 — 안 지나면 위 계산은 아무 데도 안 쓰인다. */
  const games = readFileSync(join(SRC, 'api-games.ts'), 'utf8');
  check('단어장 적립이 dailyAllowance 를 지난다',
    /dailyAllowance\(env as any, uid, 'vocab_review'\)/.test(games),
    '안 지나면 남의 예산만 깎아먹고 자기는 안 막히는 최악이 된다');
  check('복습퀴즈 적립이 dailyAllowance 를 지난다',
    /dailyAllowance\(env as any, userId, 'review_quiz_done'\)/.test(games),
    '안 지나면 남의 예산만 깎아먹고 자기는 안 막히는 최악이 된다');
}

console.log('\n[ D. 「아직 안 고친 것」을 분명히 적어 두었다 ]');
{
  /* 이 수리는 «반쪽» 이다. 그 사실을 코드에 남겨야, 다음 사람이 「상한은 이미 통일됐다」고
     오해하지 않는다. 그리고 통일하는 방법(그 목록 비우기)도 함께 적어 둔다. */
  const raw = readFileSync(join(SRC, 'point-policy.ts'), 'utf8');
  /* ⚠️ 숫자를 정규식으로 못 박으면 그 숫자를 바로잡는 순간 FAIL 난다(실제로 1,000 → 1,050 이었다).
     «근거가 적혀 있는가» 로 본다. */
  check('«전에는 1,050점이었다» 는 내력이 남아 있다',
    /단어장 400/.test(raw) && /복습퀴즈 500/.test(raw) && /1,050/.test(raw),
    '내력을 지우면 「원래 100점이었다」로 읽혀, 왜 이 계산이 여기 있는지 알 수 없게 된다');
  check('아직 남은 원장 밖 경로도 적어 두었다', /api-admin.ts/.test(raw) && /이탈관리|컴백/.test(raw),
    '이 수리가 «다 고쳤다» 로 읽히면 남은 두 곳을 아무도 안 본다');
  check('⛔ 목록을 다시 채우지 말라고 적어 두었다',
    /다시 넣지 마세요|다시 채우지/.test(raw),
    '비워 둔 이유를 안 적으면 다음 사람이 「이 경로만 예외로」 하며 되돌린다');
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n🚨 point_ledger_unified_harness 실패'); process.exit(1); }
console.log('🎉 point_ledger_unified_harness — 전부 통과');
