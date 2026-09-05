/* ═══════════════════════════════════════════════════════════════════════════
   🔐 무인증 노출 감시 (2026-08-28 신설)

   [왜 만들었나] 라우팅 허용목록(index.ts)에 경로를 올리는 것은 «인증» 이 아니다.
   그런데 그 둘이 헷갈려서, 인증이 한 줄도 없는 채로 살아 있던 경로가 여럿 있었다 —
   라이브 실측으로 확인한 것만:
     · POST /api/eval/create      → 서버가 학부모 번호를 찾아 «본문에 담긴 문구» 로 문자 발송
     · GET  /api/judgment/growth  → 아이디만 알면 남의 아이 판단력 기록(레이더·취약유형)이 그대로
     · GET  /api/points/leaderboard → 학생 «아이디» 를 이름과 함께 공개
       (학생 로그인은 비밀번호가 «설정된 경우만» 검사하는데 실측상 설정된 학생이 0명이라
        아이디를 아는 것이 곧 로그인이다 — 그래서 아이디 노출은 계정 노출이다)

   [무엇을 검사하나] «그 핸들러 블록 안에 게이트 호출이 있는가» 를 본다.
   ⚠️ 문자열이 파일 어딘가에 있는지가 아니라, **그 핸들러의 중괄호 안**을 잘라서 본다 —
      CLAUDE.md 가 여러 번 경고한 «옆 함수가 딸려 들어와 통과하는» 오검사를 피하기 위해서다.
   ⚠️ 이 검사는 «게이트가 있는가» 까지만 본다. «게이트가 옳은가» 는 사람이 본다.
   ═══════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');
const rd = (p) => readFileSync(p, 'utf8');

let pass = 0, fail = 0;
const ok = (name) => { console.log('  ✅ ' + name); pass++; };
const no = (name, why) => { console.log('  ❌ ' + name + (why ? '\n       ' + why : '')); fail++; };
const check = (name, cond, why) => (cond ? ok(name) : no(name, why));

/** `path === '<p>'` 이 나오는 if 문의 본문을 중괄호 짝을 맞춰 잘라 낸다.
 *  (문자열·정규식 안의 중괄호는 이 저장소의 핸들러에서는 짝이 맞아 실용상 안전하다) */
function handlerBlock(src, needle) {
  const at = src.indexOf(needle);
  if (at < 0) return null;
  const open = src.indexOf('{', at);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(open, i + 1); }
  }
  return null;
}

/** 부정 검사(«이 글자가 없어야 한다»)는 반드시 주석을 벗겨 내고 한다 —
 *  CLAUDE.md 2장 등재 함정: 「왜 그렇게 고쳤는지」 적은 설명 주석에 그 단어가 들어가면
 *  검사가 자기 주석을 잡는다. (이 하니스도 처음 돌릴 때 실제로 그렇게 빨간불이 났다) */
const stripComments = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');

/** 게이트로 인정하는 호출들 — 어느 하나라도 있으면 «인증을 시도한다» 로 본다 */
const GATE = /(checkAdminSession|resolveOwnerScope|getAdminActor|denyTeacher|gateVocabOwner|authUidGlobal|authUidFromRequest|authUidOrAdminSession)\s*\(/;

const lessons = rd(join(SRC, 'api-lessons.ts'));
const points = rd(join(SRC, 'api-points.ts'));
const games = rd(join(SRC, 'api-games.ts'));

console.log('\n[ A. 학부모에게 문자를 보내는 경로는 인증을 거친다 ]');
for (const [label, needle] of [
  ['POST /api/eval/create',          `path === '/api/eval/create'`],
  ['POST /api/eval/bulk-create',     `path === '/api/eval/bulk-create'`],
  ['POST /api/eval/ai-lesson-report', `path === '/api/eval/ai-lesson-report'`],
]) {
  const blk = handlerBlock(lessons, needle);
  check(label + ' 에 게이트가 있다', !!blk && GATE.test(blk),
    blk ? '이 핸들러 안에 인증 호출이 없다 — 무인증으로 발송·AI 호출이 가능해진다' : '핸들러를 못 찾았다(경로가 바뀌었나?)');
}

console.log('\n[ B. 아이의 판단력 기록은 본인·관리자만 ]');
for (const [label, needle] of [
  ['GET  /api/judgment/growth',   `path === '/api/judgment/growth'`],
  ['POST /api/judgment/scenario', `path === '/api/judgment/scenario'`],
  ['POST /api/judgment/answer',   `path === '/api/judgment/answer'`],
]) {
  const blk = handlerBlock(points, needle);
  check(label + ' 에 소유자 판정이 있다', !!blk && /resolveOwnerScope\s*\(/.test(blk),
    '무인증으로 남의 아이 기록을 읽거나 오답을 밀어 넣을 수 있게 된다');
}
{
  // 화면도 짝이 맞아야 한다 — 토큰을 안 실으면 로그인 학생이 401 을 받는다
  const j = rd(join(PUB, 'judgment.html'));
  check('judgment.html 이 세 호출에 토큰을 싣는다',
    /function authTok\(/.test(j) && (j.match(/authTok\(\)/g) || []).length >= 4,
    '서버만 막고 화면이 토큰을 안 보내면 로그인한 학생이 자기 기록을 못 본다');
}

console.log('\n[ C. 공개 랭킹은 «아이디» 를 내주지 않는다 ]');
{
  /* 🔴 (2026-09-05) 한 곳만 보면 안 된다 — 2026-08-28 에 /api/points/leaderboard 만 고치고
     그 주석에 「단어왕 리더보드도 이미 그 방식」이라고 적었지만 **사실이 아니었다**.
     단어왕 쪽은 user_id 를 그대로 담고, 이름이 없으면 COALESCE 로 «이름 자리에» 아이디를
     넣어 두 겹으로 새고 있었다. 검사가 한 곳만 봐서 1주일 넘게 아무도 몰랐다.
     ⛔ 새 공개 랭킹을 만들면 여기 목록에 «반드시» 더할 것. */
  const BOARDS = [
    ['포인트 랭킹', points, `path === '/api/points/leaderboard'`],
    ['주간 단어왕', games,  `path === '/api/vocab/leaderboard'`],
  ];
  for (const [label, src, needle] of BOARDS) {
    const blk = handlerBlock(src, needle);
    const body = blk ? stripComments(blk) : '';
    check(`[${label}] 응답에 user_id 를 담지 않는다`,
      !!blk && !/user_id\s*:/.test(body) && /\bme\s*:/.test(body),
      '학생은 비밀번호가 없어 «아이디 = 로그인» 이다. 본인 표시는 서버가 판정한 me 로만 준다');
    /* 이름이 없을 때 아이디로 폴백하면 위 검사를 통과하면서 그대로 샌다 */
    check(`[${label}] 이름이 없을 때 아이디로 폴백하지 않는다`,
      !!blk && !/COALESCE\s*\([^)]*student_name[^)]*user_id/i.test(body),
      'COALESCE(student_name, user_id) 는 «이름 자리에» 아이디를 넣는다');
    /* 🔴 2026-09-05 D1 실측 — student_points 94행 중 **18행**의 student_name 이 아이디 그 자체다
       (`jeong`·`lee`·`kang`·`Lee`…). 카페24에 이름이 없는 계정은 명부에 아이디로 찍힌다.
       ⟹ 위 두 검사를 통과해도 «이름» 칸으로 아이디가 그대로 나간다. 이름을 내보내기 «전»
          그 값이 아이디와 같은지 견주는 코드가 있어야 한다. */
    check(`[${label}] 이름이 아이디와 같으면 «이름 없음» 으로 준다`,
      !!blk && /!==\s*(?:uidStr|String\(r\.user_id)/.test(body),
      'user_id 를 빼도 student_name 이 아이디면 그대로 샌다 (실측 18행)');
    /* ⚠️ 대소문자만 다른 «별개 행» 이 실재한다(Kim/kim·Lee/lee) — 무시하면 남의 줄에
       「(나)」가 붙고 my_rank 에 남의 숫자가 실린다. 로그인 네 곳도 「정확일치 먼저」다. */
    check(`[${label}] «(나)» 판정이 대소문자를 무시하지 않는다`,
      !!blk && !/toLowerCase\(\)\s*===\s*\w+\.toLowerCase\(\)/.test(body),
      'Kim/kim·Lee/lee 는 별개 계정이다');
    /* 게스트가 위를 차지하면 진짜 학생의 동기 장치가 죽는다 (맛보기를 열면 유입이 는다).
       ⚠️ 패턴은 `guest%` — 미로그인 uid 기본값이 밑줄 없는 `guest` 라 `guest_%` 는 샌다. */
    check(`[${label}] 게스트를 순위에서 뺀다`,
      !!blk && /NOT LIKE 'guest%'/i.test(body),
      '실측: student_points 94행 중 4행 · vocab_review_log 105행이 게스트');
  }
  const c = rd(join(PUB, 'js', 'idx-daily-checkin.js'));
  check('화면이 user_id 대신 me 로 «(나)» 를 표시한다',
    /x\s*=>\s*x\.me/.test(c) && !/s\.user_id\s*===/.test(c),
    '화면이 아직 user_id 를 기대하면 「(나)」 표시가 사라진다');
  const v = rd(join(PUB, 'vocab.html'));
  check('단어왕 화면이 user_id 를 그리지 않는다',
    !/row\.user_id/.test(v) && /row\.name \|\|/.test(v),
    '이름이 없을 때 화면이 아이디로 메우면 서버에서 막은 것이 도로 샌다');
}

console.log('\n[ D. 포인트가 실제로 찍히는 경로는 소유자 판정을 거친다 ]');
for (const [label, needle] of [
  ['POST /api/vocab/reward', `path === '/api/vocab/reward'`],
  ['POST /api/vocab/review', `path === '/api/vocab/review'`],
]) {
  const blk = handlerBlock(games, needle);
  check(label + ' 에 소유자 판정이 있다', !!blk && /resolveOwnerScope\s*\(/.test(blk),
    '포인트는 기프티콘으로 나간다 — 무인증 적립은 곧 금전 손실이다');
}

{
  /* 화면 짝맞춤 — 서버만 막고 화면이 토큰을 안 실으면 로그인 학생이 401 을 받는다.
     ⚠️ «토큰을 부른다» 만 보면 안 된다. 이 PR 에서 실제로 밟은 사고가 그것이다 —
        헬퍼를 **다른 함수 안에** 선언해 두어 호출부 6곳이 전부 ReferenceError 였는데
        문자열 검사(하니스 229건 포함)는 전부 초록이었다. 그래서 «선언이 최상위인가» 를
        중괄호 깊이로 «세어서» 판정한다. */
  const scopeOk = (file) => {
    const s = rd(join(PUB, file));
    const bodies = [...s.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    const di = bodies.findIndex((b) => /function __mgTok\(/.test(b));
    if (di < 0) return { ok: false, why: '__mgTok 선언이 없다' };
    const b = bodies[di], at = b.indexOf('function __mgTok(');
    let depth = 0, inLine = false, inBlk = false, q = '';
    for (let i = 0; i < at; i++) {
      const c = b[i], n = b[i + 1];
      if (inLine) { if (c === '\n') inLine = false; continue; }
      if (inBlk) { if (c === '*' && n === '/') { inBlk = false; i++; } continue; }
      if (q) { if (c === '\\') { i++; continue; } if (c === q) q = ''; continue; }
      if (c === '/' && n === '/') { inLine = true; i++; continue; }
      if (c === '/' && n === '*') { inBlk = true; i++; continue; }
      if (c === '"' || c === "'" || c === '`') { q = c; continue; }
      if (c === '{') depth++; else if (c === '}') depth--;
    }
    const otherBlock = bodies.some((bb, i) => i !== di && /__mgTok\(\)/.test(bb));
    if (depth !== 0) return { ok: false, why: `선언이 함수 안이다(깊이 ${depth}) — 그 함수 밖 호출은 ReferenceError` };
    if (otherBlock) return { ok: false, why: '다른 <script> 블록에서 부른다 — 선언이 안 보인다' };
    return { ok: true };
  };
  for (const f of ['vocab.html', 'micro-quiz.html']) {
    const r = scopeOk(f);
    check(f + ' 의 토큰 헬퍼가 최상위 스코프다', r.ok, r.why);
  }
}

console.log('\n[ E. 기프티콘 환불 ]');
{
  const blk = handlerBlock(points, `/^\\/api\\/admin\\/gifts\\/redemptions\\/\\d+\\/mark$/`);
  check('수동 상태변경(환불 포함)은 강사를 막는다', !!blk && /denyTeacher\s*\(/.test(blk),
    '같은 파일의 포인트 지급·카탈로그는 이미 막혀 있다 — 환불만 열려 있으면 뜻이 없다');
  check('웹훅 자동환불은 «이미 전달된» 교환을 건드리지 않는다',
    /status IN \('pending','sent','failed'\)/.test(points),
    '서명 검증이 없는 공개 웹훅이라, 전달 끝난 기프티콘까지 환불되면 상품+포인트를 둘 다 준다');
}

console.log('\n[ F. 평점은 강사 이름을 클라이언트에게서 받지 않는다 ]');
{
  const blk = handlerBlock(points, `path === '/api/ratings'`);
  check('teacher_name 을 본문에서 그대로 쓰지 않는다',
    !!blk && !/body\.teacher_name/.test(stripComments(blk)),
    '무인증 경로라, 이름을 믿으면 아무 강사의 평점을 1점으로 무너뜨릴 수 있다');
}

console.log('\n────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('\n🚨 public_api_auth_harness 실패'); process.exit(1); }
console.log('🎉 public_api_auth_harness — 전부 통과');
