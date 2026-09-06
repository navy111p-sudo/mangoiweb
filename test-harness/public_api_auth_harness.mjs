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
import { readFileSync, readdirSync } from 'node:fs';
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
  /* 🔴 게스트 패턴은 «넓은» 쪽이어야 한다 — `guest_%` 로 좁히면 «밑줄 없는» bare `guest` 가 샌다.
     그 값은 실제로 화면이 만든다(js/game-track.js·js/idx-daily-checkin.js 의 기본값,
     js/idx-x8.js 의 폴백)이고 auth-admin.ts 의 resolveOwnerScope 도 `/^guest/i` 로 본다.
     ⚠️ 파일 하나만 보지 말 것 — 같은 필터가 api-ai.ts·game-insights.ts 에도 있고,
        2026-09-05 에 「한 곳만 고쳤다」가 바로 이 작업에서 두 번 나왔다. src 전체를 훑는다. */
  {
    const narrow = [];
    for (const f of readdirSync(SRC).filter(x => x.endsWith('.ts'))) {
      const t = stripComments(rd(join(SRC, f)));
      if (/NOT LIKE 'guest_%'/i.test(t)) narrow.push(f);
    }
    check('게스트 제외 패턴이 bare `guest` 도 덮는다 (src 전체)',
      narrow.length === 0,
      narrow.length ? '좁은 패턴이 남은 파일: ' + narrow.join(', ') : "src/*.ts 전수 · `guest%` 만 씀");
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

console.log('\n[ C-2. 🍯 판단력 훈련 맛보기 — 게스트에게 열되 «비용» 은 정본이 막는다 ]');
{
  const pts = rd(join(SRC, 'api-points.ts'));
  const blk = handlerBlock(pts, `path === '/api/judgment/scenario'`) || '';
  const body = blk ? stripComments(blk) : '';
  check('C-2 시나리오 경로를 찾았다', !!blk, blk ? '(' + blk.length + '자)' : '못 찾음');

  /* 🔴 이 경로는 요청 한 번에 LLM 을 한 번 돌린다. 화면을 게스트에게 여는 순간
     상한이 «정본» 에 있어야 한다 — 화면에 두면 본문 한 줄로 깨진다(CLAUDE.md 「비용이 나가는 API」). */
  check('C-2 게스트에게만 상한을 건다',
    /jScope === 'guest'/.test(body),
    '로그인한 학생의 동작은 그대로여야 한다');
  /* 🔴 CLAUDE.md 「비용이 나가는 API」 — 판정을 라우트 «안» 에만 두면 하니스가 문자열로만
     검사하게 되고, 조건을 뒤집어도 그 글자가 남아 통과한다. 실제로 밟았다(2026-09-05):
     `if (false && n >= CAP)` · `n >= CAP * 1000` · `n > CAP && false` 세 변이가 전부 43/43 통과.
     ⟹ 판정은 순수 함수(judgment-sample-gate.ts)에 두고, 여기서 **실제로 돌린다.** */
  check('C-2 라우트가 판정을 «부르기만» 한다(조건을 직접 쓰지 않는다)',
    /sampleScenarioAllowed\(/.test(body) && !/n\s*[<>]=?\s*SAMPLE_SCENARIO_CAP/.test(body),
    '라우트 안에 조건이 있으면 뒤집어도 문자열 검사가 통과한다');
  {
    const gateSrc = rd(join(SRC, 'judgment-sample-gate.ts'));
    // 타입만 벗겨 그대로 실행한다(의존성 0 인 순수 모듈이라 컴파일이 필요 없다)
    const js = gateSrc
      .replace(/^export\s+/gm, '')
      .replace(/:\s*any\b/g, '').replace(/:\s*number\b/g, '').replace(/:\s*boolean\b/g, '');
    let gate = null, CAP = null;
    try {
      // eslint-disable-next-line no-new-func
      const f = new Function(js + '\nreturn { sampleScenarioAllowed, SAMPLE_SCENARIO_CAP };');
      const m = f(); gate = m.sampleScenarioAllowed; CAP = m.SAMPLE_SCENARIO_CAP;
    } catch (e) { /* 아래 검사가 FAIL 로 드러낸다 */ }
    check('C-2 판정 함수를 실제로 돌릴 수 있다', typeof gate === 'function' && typeof CAP === 'number',
      'CAP=' + String(CAP));
    if (typeof gate === 'function' && typeof CAP === 'number') {
      /* 🔴 여기가 「조건 뒤집기」 변이시험이 물리는 자리다 — 경계 앞뒤를 실제로 넣어 본다 */
      check('C-2 상한 «전» 은 통과한다', gate(0) === true && gate(CAP - 1) === true,
        '0·' + (CAP - 1));
      check('C-2 상한에 «닿으면» 막는다', gate(CAP) === false, String(CAP));
      check('C-2 상한을 «넘으면» 막는다', gate(CAP + 1) === false && gate(CAP * 100) === false,
        String(CAP + 1) + '·' + (CAP * 100));
      /* ⚠️ 못 세면 막지 않는다 — 고장 난 가드가 맛보기를 영구히 막는 쪽이 더 나쁘다 */
      check('C-2 못 세면 막지 않는다(fail-open)',
        gate(NaN) === true && gate(null) === true && gate(-1) === true && gate('x') === true);
      /* 상한 숫자가 한 곳뿐인가 — 화면·서버가 어긋나지 않게 */
      check('C-2 상한 숫자가 정본 한 곳에만 있다',
        /const SAMPLE_SCENARIO_CAP\s*=\s*\d+/.test(stripComments(gateSrc))
          && !/=\s*12\b/.test(stripComments(pts)),
        'CAP=' + CAP);
    }
  }
  /* ⚠️ 세는 자리가 «생성 앞» 이어야 한다 — 뒤면 실패한 요청이 안 세여 재시도로 빠져나간다 */
  /* 🪤 상수 «이름» 의 위치로 재면 안 된다 — 그 이름이 생성 앞뒤 어디에 있어도 통과한다
     (변이시험에서 실제로 놓쳤다). «막고 돌아가는 return» 이 생성보다 앞인지로 묻는다. */
  const iRet = body.indexOf("error: 'sample_limit'");
  const iGen = body.indexOf('generatePersonalizedScenario');
  check('C-2 막고 돌아가는 자리가 LLM 생성보다 앞이다',
    iRet > 0 && iGen > iRet, 'return@' + iRet + ' · gen@' + iGen);
  /* 그리고 «세는 것»(put) 도 생성 앞이어야 한다 — 뒤면 실패한 요청이 안 세여 재시도로 빠져나간다 */
  const iPut = body.indexOf('kvS.put');
  check('C-2 세는 것도 LLM 생성보다 앞이다', iPut > 0 && iGen > iPut, 'put@' + iPut + ' · gen@' + iGen);
  /* ⚠️ KV 가 안 되면 «막지 않는» 쪽으로 실패한다 — 그래야 고치기 전 상태와 같아질 뿐이고
     맛보기가 통째로 죽지 않는다. 같은 파일 judg:ic:rl 가드와 같은 방식. */
  check('C-2 KV 가 안 되면 막지 않는다(fail-open)',
    /catch \{[^}]*\}\s*\n\s*\}/.test(blk) && /try \{[\s\S]*SAMPLE_SCENARIO_CAP/.test(blk),
    '고장 난 가드가 맛보기를 영구히 막으면 안 된다');
  /* ⛔ 인증 게이트를 약화시키지 않았는지 — 맛보기를 연 것이지 게이트를 연 것이 아니다 */
  check('C-2 남의 아이디 차단(deny)은 그대로다',
    /resolveOwnerScope/.test(body) && /auth_required/.test(body));

  /* 화면 — «고장» 이 아니라 «오늘 몫» 이라고 말해야 한다 */
  const jh = rd(join(PUB, 'judgment.html'));
  check('C-2 화면이 게스트 아이디를 guest_ 로 만든다',
    /'guest_' \+ Math\.random/.test(jh),
    'auth-admin 의 resolveOwnerScope 가 /^guest/i 만 통과시킨다');
  check('C-2 저장이 막힌 기기에서도 맛보기가 열린다(fail-open)',
    /function sampleOpen\(\)[\s\S]{0,400}?catch\(e\)\{ return true; \}/.test(jh));
  check('C-2 하루가 지나면 로그인 안내로 돌아간다',
    /if\(sampleOpen\(\)\)\{[\s\S]{0,200}?\} else \{[\s\S]{0,120}?renderNoLogin\(\);/.test(jh));
  check('C-2 화면이 «맛보기» 라고 말한다',
    /id="sampleBar"/.test(jh) && /맛보기로 보고 있어요/.test(jh));
  /* 두 실패 경로(배치·본 경로)가 같은 판정을 써야 한다 — 하나만 고치면 어긋난다 */
  /* 🪤 `isSampleLimit(d)` 로 세면 «선언» 줄까지 함께 잡혀, 호출 한 곳을 지워도 통과한다
     (변이시험에서 실제로 놓쳤다). 조건문 안의 «호출» 만 센다. */
  const jCalls = (jh.match(/if\(isSampleLimit\(d\)\)/g) || []).length;
  check('C-2 한도 판정이 한 곳뿐이고 두 경로가 함께 쓴다',
    (jh.match(/function isSampleLimit\(/g) || []).length === 1 && jCalls >= 2,
    '호출 ' + jCalls + '곳 (배치·본 경로)');
  check('C-2 한도를 «고장» 으로 말하지 않는다',
    /renderSampleLimit/.test(jh) && /여기까지예요/.test(jh));
  /* ⛔ 「다시 시도」를 두면 눌러도 같은 답이 와서 그때는 진짜 고장으로 읽힌다 */
  check('C-2 한도 안내에 「다시 시도」를 두지 않는다',
    !/renderSampleLimit\(n\)\{[\s\S]{0,900}?다시 시도/.test(jh));
  /* 🔴 상한 숫자를 화면에 복제하면 서버와 어긋난다 — 서버가 준 limit 을 쓴다 */
  check('C-2 화면이 상한 숫자를 복제하지 않는다',
    /renderSampleLimit\(d\.limit\)/.test(jh),
    '서버 응답의 limit 을 그대로 그린다');

  /* 🔴 맛보기를 열면 게스트가 judgment_events 에 행을 남긴다. 그 표를 «학생 구분 없이»
     통째로 읽어 Neo4j 로 보내는 ETL 이 있어, 거르지 않으면 `guest_xxxxxxx` 라는
     «있지도 않은 학생» 노드와 취약 스킬 집계가 생기고 그것을 선생님이 본다. */
  /* 🪤 «한 곳만 고쳤다» — 처음에 decision-graph.ts 하나만 막았는데 함정 대조가 **세 곳을 더**
     찾았습니다. judgment_events·judgment_analysis 를 «학생 구분 없이» 읽는 자리를 **목록으로**
     둡니다 — 새 집계가 생기면 여기 한 줄만 더하면 같은 검사를 받습니다.
     ℹ️ 사람별 조회(`WHERE student_uid = ?`)는 안전합니다. 위험한 것은 집계·ETL·내보내기입니다. */
  const GUEST_SAFE = [
    ['Neo4j ETL(판단 그래프)', 'decision-graph.ts', /FROM judgment_events[\s\S]{0,240}?NOT LIKE 'guest%'/i,
     '거르지 않으면 맛보기 방문자가 «학생» 노드로 선생님 리포트에 올라온다'],
    ['밴드별 정답률 통계', 'api-admin.ts', /FROM judgment_analysis[\s\S]{0,260}?NOT LIKE 'guest%'/i,
     '이 수치가 «문장 난이도를 내릴까» 를 정한다 — 대충 눌러 본 사람이 섞이면 안 된다'],
    ['야간 성장 스냅샷(cron)', 'api-judgment.ts', /SELECT DISTINCT student_uid FROM judgment_analysis[\s\S]{0,200}?NOT LIKE 'guest%'/i,
     '게스트마다 스냅샷 행을 만들고 students 숫자를 부풀린다'],
    ['엔벨로프 외부 내보내기', 'api-judgment.ts', /migrated_at IS NULL[\s\S]{0,120}?NOT LIKE 'guest%'/i,
     '상황문과 «학생이 쓴 이유 원문» 이 외부로 나간다'],
  ];
  for (const [label, file, re, why] of GUEST_SAFE) {
    check(`C-2 [${label}] 게스트를 뺀다`, re.test(stripComments(rd(join(SRC, file)))), why);
  }
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
