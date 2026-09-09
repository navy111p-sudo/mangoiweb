/*!
 * ✏️ ai_friend_correction_harness — AI 영어친구 «교정 카드» 회귀 감시 (2026-09-09)
 *
 * 발단 — 사장님 「A.i 친구도 똑같이 만들어줘」(웜업 교정 카드 화면을 보시고).
 *   그때 AI 친구는 답변 «본문 끝» 에 (💡 …) 한국어 팁 한 줄을 붙이는 옛 방식이었다.
 *   실측(사장님 화면): "I go to school yesterday" → 「어제에 가는 것이 더 자연스러워요」.
 *   «고친 문장» 이 없어서 학생은 무엇을 어떻게 고쳐야 하는지 알 수 없었고,
 *   같은 화면의 "I did breakfast yesterday" 는 팁조차 안 나왔다.
 *
 * 왜 문자열 검사로는 모자란가:
 *   이 기능의 결함은 «함수가 있는가» 가 아니라 «무슨 답이 나오는가» 로만 드러난다.
 *   그래서 F절은 정본을 node 타입 제거로 **실제로 돌린다**.
 *
 * ⛔ 판정을 복제하면 안 된다 — 웜업과 «같은 한 벌»(src/warmup-correction.ts)을 쓴다.
 *    B절이 그것을, C절이 «두 화면의 fix 스키마가 글자 그대로 같은가» 를 못 박는다.
 *
 * 실행: node test-harness/ai_friend_correction_harness.mjs
 */
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = process.env.MANGOI_SRC || join(ROOT, 'cloudflare-deploy', 'src');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
const failures = [];
const check = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; failures.push(name + (extra ? ' — ' + extra : '')); console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};

/** 부정 검사(«이 글자가 없어야 한다»)는 주석을 벗긴 사본으로 판정한다 — 내 설명 주석이 걸린다. */
const stripComments = (t) => {
  let out = '', inBlock = false;
  for (const line of t.split('\n')) {
    let l = line;
    if (inBlock) { const e = l.indexOf('*/'); if (e < 0) { out += '\n'; continue; } l = l.slice(e + 2); inBlock = false; }
    for (;;) {
      const b = l.indexOf('/*');
      if (b < 0) break;
      const e = l.indexOf('*/', b + 2);
      if (e < 0) { l = l.slice(0, b); inBlock = true; break; }
      l = l.slice(0, b) + l.slice(e + 2);
    }
    out += l.replace(/^\s*\/\/.*$/, '') + '\n';
  }
  return out;
};

console.log('════════ ✏️ AI 영어친구 교정 카드 ════════');

const AI  = readFileSync(join(SRC, 'api-ai.ts'), 'utf8');
const CORR = readFileSync(join(SRC, 'warmup-correction.ts'), 'utf8');
const IDX = readFileSync(join(SRC, 'index.ts'), 'utf8');
const HTML = readFileSync(join(PUB, 'ai-friend.html'), 'utf8');

// ═══════════ A. 서버 배선 (chat-friend 핸들러 «안» 만 잘라서 본다) ═══════════
console.log('\nA. 서버 배선 (api-ai.ts 의 chat-friend 핸들러 «안» 만)');
{
  /* ⚠️ 범위를 «길이» 로 자르지 않는다(CLAUDE.md) — 앵커로 자른다.
     같은 파일에 영작 첨삭 등 «똑같이 생긴 멀쩡한 줄» 이 있어서, 넓게 자르면 남의 AI.run 을 센다. */
  const s = AI.indexOf("path === '/api/ai/chat-friend'");
  const e = AI.indexOf("path === '/api/ai/chat-history'", s);
  check('A-0 chat-friend 핸들러 구간을 앵커로 잘라 냈다 (전제)', s > 0 && e > s, 's=' + s + ' e=' + e);
  const H = s > 0 && e > s ? AI.slice(s, e) : '';
  const Hc = stripComments(H);

  check('A-1 시스템 프롬프트에 교정 계약을 붙인다',
        /\$\{AI_FRIEND_CORRECTION_RULE\}/.test(Hc));

  /* 🔴 옛 방식과 새 카드가 «함께» 살아 있으면 같은 말이 본문과 카드에 두 번 나온다.
     아이는 무엇을 보라는 것인지 알 수 없다. */
  check('A-2 옛 (💡 …) 본문 팁 지시가 프롬프트에서 사라졌다',
        !/add ONE short Korean tip/.test(Hc));

  /* ⚠️ 모델을 부르는 곳이 «runFriend 몸통 안» 하나여야 제약 폴백이 전 경로에 걸린다.
     하나라도 밖에 있으면 그 경로만 JSON 모드를 못 받고 조용히 옛 동작이 된다. */
  const rwStart = Hc.indexOf('const runFriend =');
  const rwEnd = Hc.indexOf('const takeFriendReply', rwStart);
  const rwBody = rwStart > 0 && rwEnd > rwStart ? Hc.slice(rwStart, rwEnd) : '';
  const rawRuns = (Hc.match(/env\.AI\.run\(/g) || []).length;
  const runsInside = (rwBody.match(/env\.AI\.run\(/g) || []).length;
  check('A-3 모델을 부르는 자리는 runFriend 몸통 «안» 뿐 (폴백이 전 경로에 걸린다)',
        rwBody.length > 40 && rawRuns > 0 && rawRuns === runsInside,
        'env.AI.run ' + rawRuns + '회 · 몸통 안 ' + runsInside + '회');

  /* 🔴 응답 추출이 한 곳이라도 파서를 안 지나면 그 경로만 생 JSON 을 학생 화면·TTS 로 보낸다
     (웜업에서 실제로 그 사고가 났다 — "[object Object]", 2026-09-08). */
  const runCalls = (Hc.match(/(?<!const )runFriend\(/g) || []).length;
  const takeCalls = (Hc.match(/takeFriendReply\(/g) || []).length;
  check('A-4 🔴 모델을 부른 만큼 «정본 파서» 를 지난다 (한 곳이라도 빠지면 생 JSON 이 샌다)',
        runCalls > 0 && runCalls === takeCalls,
        'runFriend ' + runCalls + '회 · takeFriendReply ' + takeCalls + '회');

  check('A-5 JSON 모드를 «말로만» 시키지 않는다 (response_format)',
        /response_format\s*=\s*\{\s*type:\s*'json_object'\s*\}/.test(Hc));
  check('A-5b 모델이 그 옵션을 거절하면 한 번 끄고 다시 부른다',
        /friendRF\s*=\s*false/.test(Hc));
  /* ⛔ «거절되면 다시 부른다» 만 보면, 429·타임아웃까지 재시도해 JSON 모드가 조용히
     꺼지는 결함이 그대로 통과한다 — 판정을 실제로 «부르는지» 까지 본다. */
  check('A-5c 🔴 그 판정(isRfRejection)을 실제로 호출한다 (선언만 두면 무의미)',
        /!friendRF\s*\|\|\s*!isRfRejection\(/.test(Hc));

  check('A-6 모델이 준 fix 를 그대로 싣지 않고 «반드시» 검증한다',
        /verifyWarmupFix\(\s*rawFix\s*,\s*msg\s*\)/.test(Hc) && !/fix:\s*rawFix/.test(Hc));
  /* ⚠️ «식 모양» 을 글자 그대로 못 박지 않습니다 — 2026-09-09 에 폴백일 때 카드를 끄는
     (보장이 «더» 센) 수리를 넣자 `fix: showFix, repeat: offerRepeat` 라는 옛 모양이 깨져
     멀쩡한 코드가 FAIL 났습니다(CLAUDE.md 2장 「객체 모양을 정규식으로 못 박아 두어」).
     물어야 할 것은 «어떻게 생겼나» 가 아니라 «검증을 통과한 그 변수를 싣는가» 입니다. */
  check('A-7 응답에는 검증·게이트를 통과한 것만 싣는다',
        /fix:\s*[^,]*\bshowFix\b/.test(Hc) && /repeat:\s*[^,}]*\bofferRepeat\b/.test(Hc));
  check('A-8 게이트가 던져도 대화가 죽지 않는다 (통째로 try/catch)',
        /try\s*\{[\s\S]*verifyWarmupFix[\s\S]*?\}\s*catch/.test(Hc));
  check('A-9 교정 메모는 6시간 — 발화를 저장하는 것이 아니다',
        /'aifriendfix:'\s*\+\s*uid/.test(Hc) && /expirationTtl:\s*6\s*\*\s*3600/.test(Hc));

  /* 🔴 턴 수는 «단조 증가» 해야 한다. history 는 LIMIT 20 이라 곧 상한에 붙고,
     그러면 turnNo - lastShownTurn 이 영영 0 이 되어 «작은 실수는 두 번째부터» 쪽이 멎는다
     (2026-09-09 부터 major 는 간격을 안 보므로 그쪽은 계속 뜬다 — F-12 가 실제로 돌려 증명한다).
     — 화면은 멀쩡해 보이고 에러도 안 난다. */
  check('A-10 🔴 턴 수를 history.length 로 세지 않는다 (상한에 붙으면 교정이 영영 멎는다)',
        /COUNT\(\*\) AS n FROM ai_friend_chats/.test(Hc) && !/turnNo\s*=[^\n]*history\.length/.test(Hc));

  /* 재시도 답장은 거절될 수 있다 — 파싱하자마자 rawFix 를 덮으면 화면의 답장은 옛것인데
     카드만 새 답장의 것이 되어 서로 어긋난다. */
  const commits = (Hc.match(/commitFix\(\)/g) || []).length;
  check('A-11 교정은 «그 답장을 채택했을 때만» 확정한다 (재시도가 거절되면 그 교정도 버린다)',
        commits >= 4, 'commitFix() ' + commits + '회');

  /* 🔴 그 조회가 «계속» 실패하면 turnNo 가 1 에 고정된다. 뜻이 달라지는 교정은 그래도 뜨지만
     (F-13), «작은 실수는 두 번째부터» 쪽은 간격에 걸려 멎는다 — 조용하면 아무도 모른다. */
  check('A-12 🔴 턴 수 조회가 실패하면 로그로 남긴다 (조용하면 교정이 영영 안 뜬다)',
        /if\s*\(!turns\)\s*console\.(warn|error)/.test(Hc));
  /* ⚠️ 읽기가 조용히 실패하면 memo 가 늘 null 이라 «매 턴 교정» 이 된다 — 화면은 멀쩡해 보인다.
     쓰기 쪽에만 로그가 있던 것을 함정 대조가 잡았다. 둘 다 있어야 한다. */
  const warns = (Hc.match(/fix memo (read|save) failed/g) || []).length;
  check('A-13 KV 메모는 «읽기·쓰기 둘 다» 실패를 남긴다', warns === 2, warns + '/2');
}

/* 🟡 대화를 지우면 턴 수는 0 으로 돌아가는데 KV 메모는 6시간 남는다 —
   그동안 교정이 조용히 억제된다(웜업은 세션키라 이 모양이 없다). */
{
  const s2 = AI.indexOf("path === '/api/ai/chat-clear'");
  const e2 = AI.indexOf('// ═══', s2);
  const C = s2 > 0 ? AI.slice(s2, e2 > s2 ? e2 : s2 + 1600) : '';
  check('A-14 「대화 초기화」가 교정 메모도 함께 지운다 (안 지우면 6시간 억제)',
        /SESSION_STATE/.test(C) && /delete\('aifriendfix:'/.test(C));
}

// ═══════════ B. 판정을 복제하지 않았다 ═══════════
console.log('\nB. 판정 정본 재사용 (복제 금지)');
{
  const AIc = stripComments(AI);
  check('B-1 정본에서 불러 쓴다',
        /from '\.\/warmup-correction'/.test(AIc)
        && /verifyWarmupFix/.test(AIc) && /decideWarmupFixShow/.test(AIc));
  /* ⛔ 같은 판정이 두 벌이 되면 한쪽만 고쳐진다 — 이 저장소가 반복해 밟은 함정이다. */
  const redefined = ['parseWarmupOutput', 'verifyWarmupFix', 'decideWarmupFixShow',
                     'warmupShouldOfferRepeat', 'isRfRejection']
    .filter((n) => new RegExp('(function|const)\\s+' + n + '\\s*[=(]').test(AIc));
  check('B-2 🔴 api-ai.ts 안에 판정을 다시 만들지 않았다',
        redefined.length === 0, redefined.join(', '));
}

// ═══════════ C. 두 화면의 fix 스키마가 «글자 그대로 한 벌» ═══════════
console.log('\nC. 두 화면이 같은 fix 모양을 받는다 (규칙을 실제로 평가해서 대조)');
let RULES = null;
{
  /* ⚠️ «그 글자가 있는가» 로 묻지 않는다 — 화면마다 스키마를 따로 적어도 통과한다.
     규칙 두 개를 «실제로 만들어» fix 부분이 한 글자도 다르지 않은지 본다. */
  try {
    const a = CORR.indexOf('function fixJsonLine');
    const b = CORR.indexOf('export function isRfRejection');
    const body = CORR.slice(a, b)
      .replace(/\bexport /g, '')
      .replace(/\(replyDesc: string\): string/, '(replyDesc)');
    const f = new Function('"use strict";' + body
      + ' return { W: WARMUP_CORRECTION_RULE, A: AI_FRIEND_CORRECTION_RULE };');
    RULES = f();
  } catch (e) { RULES = null; }
  check('C-0 규칙 두 개를 소스에서 만들어 냈다 (전제)', !!(RULES && RULES.W && RULES.A));
  if (RULES) {
    const fixPart = (s) => {
      const i = s.indexOf('"fix":{');
      return i < 0 ? '' : s.slice(i, s.indexOf('\n', i) < 0 ? undefined : s.indexOf('\n', i));
    };
    const fw = fixPart(RULES.W), fa = fixPart(RULES.A);
    check('C-1 🔴 fix 스키마가 두 화면에서 «완전히 같다»', fw.length > 40 && fw === fa,
          fw === fa ? String(fw.length) + '자' : '\n    웜업: ' + fw + '\n    친구: ' + fa);
    /* ⚠️ 이 검사의 옛 이름은 「AI 친구 규칙은 영어로 쓴다」였는데 재는 것은 «OUTPUT FORMAT 이
       있는가» 뿐이었다 — 실제로는 10줄 중 5줄이 한국어다(함정 대조가 세어 잡았다).
       이름이 보장보다 넓으면 다음 사람이 그 이름을 믿는다. 재는 것을 그대로 이름에 쓴다. */
    check('C-2 AI 친구 규칙의 «지시문» 은 영어다 (웜업 [교정] 절을 그대로 베끼지 않았다)',
          /OUTPUT FORMAT/.test(RULES.A) && !/^\[교정\]/m.test(RULES.A));
    {
      const koLines = RULES.A.split('\n').filter((l) => /[가-힣]/.test(l)).length;
      const total = RULES.A.split('\n').length;
      /* 한국어가 남는 것은 «fix 스키마를 두 화면이 글자까지 같게 쓰기로 한» 대가다.
         ⛔ 「전부 영어」로 못 박지 않는다 — 그러면 C-1(스키마 동일)과 정면으로 부딪힌다.
         대신 «절반을 넘지 않는가» 로 두어, 지시문까지 한국어로 흘러가면 잡는다. */
      check('C-2b 한국어 줄은 절반 이하다 (스키마를 공유하는 대가만큼만)',
            koLines * 2 <= total, koLines + '/' + total + '줄');
    }
    check('C-3 AI 친구 규칙이 «reply 안에 한국어 팁 금지» 를 말한다',
          /NEVER put a Korean grammar tip inside "reply"/.test(RULES.A));
    check('C-4 why_ko 는 한글만 쓰라고 두 규칙 모두 말한다',
          /한국어 한 문장/.test(RULES.W) && /Hangul only/.test(RULES.A));
  }
}

// ═══════════ D. isRfRejection — 정본과 index.ts 로컬 복사본이 «같은 답» ═══════════
console.log('\nD. response_format 거절 판정 (정본 ↔ index.ts 로컬 복사본 대조)');
{
  /* 📌 index.ts 는 공동 금지구역(CLAUDE.md 4-2)이라 로컬 복사본을 그대로 두었다.
     복제를 «허용» 하는 대신, 둘을 실제로 돌려 답이 같은지 여기서 못 박는다.
     ⛔ 문자열 비교로 하지 말 것 — 한쪽만 조건을 넓혀도 글자는 비슷하게 남는다. */
  const mk = (src, decl) => {
    try {
      const i = src.indexOf(decl);
      if (i < 0) return null;
      // 중괄호 짝으로 몸통을 잘라 낸다(반환 타입의 { } 에 속지 않게 괄호·꺾쇠 깊이도 센다)
      let p = src.indexOf('{', src.indexOf(')', i));
      let d = 0, j = p;
      for (; j < src.length; j++) {
        if (src[j] === '{') d++;
        else if (src[j] === '}') { d--; if (d === 0) break; }
      }
      const body = src.slice(p, j + 1);
      return new Function('e', '"use strict";' + body.slice(1, -1));
    } catch { return null; }
  };
  const canon = mk(CORR, 'export function isRfRejection');
  const local = mk(IDX, 'const isRfRejection =');
  check('D-0 두 판정을 소스에서 오려 내 돌릴 수 있다 (전제)',
        typeof canon === 'function' && typeof local === 'function');
  if (typeof canon === 'function' && typeof local === 'function') {
    const YES = ['response_format is not supported', 'Unrecognized request argument: response_format',
                 'invalid json_object', 'AiError: 400 Bad Request — json schema'];
    /* ⚠️ 앞 넷은 «긍정 목록에 안 걸려서» 저절로 false 가 된다 — 그것만 두면 «먼저 거르는»
       줄을 통째로 지워도 초록이다. 뒤 셋처럼 **두 낱말이 겹치는** 메시지를 반드시 섞는다. */
    const NO = ['429 Too Many Requests', 'Error: request timed out', 'The operation was aborted',
                '500 Internal Server Error', 'AiError: 400 Bad Request — rate limit exceeded, retry later',
                'Error 500: unsupported upstream (capacity exceeded)',
                'timed out while validating response_format'];
    check('D-1 제약 거절이면 다시 부른다', YES.every((m) => canon(new Error(m)) === true),
          YES.filter((m) => canon(new Error(m)) !== true).join(' | ') || YES.length + '/' + YES.length);
    check('D-2 🔴 429·타임아웃·5xx 는 다시 부르지 않는다 (JSON 모드가 조용히 꺼지면 회귀가 되살아난다)',
          NO.every((m) => canon(new Error(m)) === false),
          NO.filter((m) => canon(new Error(m)) !== false).join(' | ') || NO.length + '/' + NO.length);
    /* ⚠️ 반례를 «손으로 적은 목록» 으로만 두면, 한쪽에 새 표현(ECONNRESET 등)을 넣어 넓혀도
       그 낱말이 목록에 없어서 못 잡는다(CLAUDE.md 별칭표의 「반례 자동 생성」과 같은 자리).
       그래서 **두 소스의 정규식에서 갈래를 읽어** 입력을 자동으로 만든다 —
       어느 쪽을 넓히든 그 낱말로 만든 입력에서 둘의 답이 갈린다. */
    const tokensOf = (src) => {
      const out = new Set();
      for (const m of src.matchAll(/\/([^/\n]{4,300})\/[gimsuy]*\.test/g)) {
        for (const raw of m[1].split('|')) {
          const t = raw.replace(/\\b|\\d|\\s|[()\[\]{}?*+^$.]/g, ' ').replace(/\s+/g, ' ').trim();
          if (t.length >= 4) out.add(t);
        }
      }
      return [...out];
    };
    const auto = tokensOf(CORR.slice(CORR.indexOf('export function isRfRejection')))
      .concat(tokensOf(IDX.slice(IDX.indexOf('const isRfRejection ='), IDX.indexOf('const isRfRejection =') + 800)));
    check('D-3a 두 정규식에서 반례를 자동으로 뽑았다 (전제)', auto.length >= 8, auto.length + '개');
    /* 🔴 낱말만 넣으면 둘 다 false 라 «차이가 안 드러납니다» — 실제로 정본에만 econnreset 을
       넣어 봤더니 그대로 통과했습니다(CLAUDE.md 「두 낱말이 겹치는 메시지를 반드시 섞으세요」).
       그래서 «긍정 낱말 + 후보 부정 낱말» 을 겹쳐 만듭니다. 그때만 «어느 쪽이 이기는가» 가
       검사되고, 한쪽만 넓히면 그 자리에서 답이 갈립니다. */
    const all = YES.concat(NO).concat(['', 'boom', 'network error'])
      .concat(auto.map((t) => 'AiError: ' + t + ' while calling model'))
      .concat(auto.map((t) => 'AiError: 400 Bad Request — response_format ' + t));
    const diff = all.filter((m) => canon(new Error(m)) !== local(new Error(m)));
    check('D-3 🔴 정본과 index.ts 복사본이 «같은 답» 을 낸다 (한쪽만 고쳐지는 것을 막는다)',
          diff.length === 0, diff.slice(0, 4).join(' | '));
  }
}

// ═══════════ E. 화면 ═══════════
console.log('\nE. 화면 (ai-friend.html)');
{
  const sTag = HTML.indexOf('<script>', HTML.indexOf('</style>'));
  /* 🔴 함수 선언을 다른 함수 «안» 에 넣으면 밖의 호출부가 전부 ReferenceError 인데
     문자열 검사는 «선언도 있고 호출도 있다» 로 통과한다(CLAUDE.md). 깊이로 본다. */
  const depthAt = (idx) => {
    let d = 0;
    for (let i = 0; i < idx; i++) { const c = HTML[i]; if (c === '{') d++; else if (c === '}') d--; }
    return d;
  };
  const decl = HTML.indexOf('function showFixCard(');
  check('E-0 showFixCard 선언을 찾았다 (전제)', decl > 0);
  if (decl > 0) {
    /* 스크립트 시작점부터의 상대 깊이 — 0 이면 «스크립트 최상위» 다. */
    const dScript = depthAt(sTag), dDecl = depthAt(decl);
    check('E-1 🔴 showFixCard 가 스크립트 «최상위» 에 있다 (함수 안이면 호출부가 전부 죽는다)',
          dDecl === dScript, '스크립트 깊이 ' + dScript + ' · 선언 깊이 ' + dDecl);
  }
  check('E-2 서버가 «교정 없음» 이면 아무것도 안 그린다',
        /if\s*\(!fix\s*\|\|\s*!fix\.was\s*\|\|\s*!fix\.now\)\s*return;/.test(HTML));
  /* ⛔ 카드 상자에 data-ko/data-en 을 달면 i18n 엔진이 textContent 를 통째로 갈아끼워
     그려 넣은 문장이 사라진다(CLAUDE.md 2장). 번역 대상은 «라벨» 뿐이다. */
  check('E-3 🔴 카드 상자가 아니라 «라벨» 에만 번역 속성을 단다',
        /_fixLabel\(el, ko, en\)/.test(HTML)
        && !/card\.setAttribute\('data-(ko|en)'/.test(HTML));
  check('E-4 답변을 그린 «뒤에» 카드를 붙인다 (카드가 답변 아래)',
        HTML.indexOf("appendMsg('ai', d.reply") < HTML.indexOf('showFixCard(d.fix'));
  check('E-5 교정 카드가 뜨면 옛 (💡 …) 팁 칩은 안 그린다 (같은 말이 두 번 나오지 않게)',
        /tip\s*&&\s*!hasFix\s*\?/.test(HTML));
  check('E-6 같은 카드가 두 벌 쌓이지 않는다', /querySelectorAll\('\.fix-card'\)/.test(HTML));
  /* 🔴 showFixCard 안에서만 지우면, 서버 오류·네트워크 실패로 그 함수가 «안 불리는» 경로에서
     옛 카드가 방금 보낸 문장 아래 그대로 남아 그 문장을 고쳐 준 것처럼 보인다.
     웜업은 전송 시점에도 걷는다(warmup.html) — 여기도 같아야 한다. */
  check('E-8 🔴 보낼 때도 옛 교정 카드를 걷는다 (오류 응답에 옛 카드가 남지 않게)',
        HTML.indexOf('fixCardClear();') < HTML.indexOf("appendMsg('user', msg)")
        && (HTML.match(/fixCardClear\(\);/g) || []).length >= 2);
  /* 🪤 CLAUDE.md 2장 — <style> 안 CSS 주석의 홑낫표 한 글자에 한자 폰트(983KB) 검사가 FAIL 난다. */
  const styles = (HTML.match(/<style[^>]*>[\s\S]*?<\/style>/g) || []).join('');
  check('E-7 <style> 안에 CJK 홑낫표가 없다 (한자 폰트 검사 FAIL 방지)',
        !/[「」]/.test(styles));
}

// ═══════════ F. 정본을 «실제로 돌린다» — 사장님 화면의 그 문장으로 ═══════════
console.log('\nF. 정본 실행 (node 타입 제거 — 실제 제보 문장으로)');
{
  const tmp = mkdtempSync(join(tmpdir(), 'afx-'));
  const fixImp = (s) => s.replace(/from '\.\/([\w-]+)'/g, "from './$1.ts'");
  writeFileSync(join(tmp, 'warmup-correction.ts'), fixImp(CORR));
  writeFileSync(join(tmp, 'english-only.ts'), fixImp(readFileSync(join(SRC, 'english-only.ts'), 'utf8')));
  const runner = `
import { parseWarmupOutput, verifyWarmupFix, decideWarmupFixShow } from './warmup-correction.ts';
const out = [];
const t = (n, ok, x) => out.push([n, !!ok, x == null ? '' : String(x)]);

/* 🔴 2026-09-09 사장님 화면에 실제로 찍힌 두 문장. 옛 방식은 ①에 «고친 문장 없는» 팁만 주고
   ②에는 아무것도 안 줬다. 새 방식이 둘 다 «고친 문장» 을 주는지 실제로 확인한다. */
{
  const said1 = 'I go to school yesterday.';
  const f1 = verifyWarmupFix({ was: 'I go to school yesterday', now: 'I went to school yesterday',
    why_ko: '어제 일이니까 go 대신 went 를 써', tag: 'past_tense', severity: 'major' }, said1);
  t('F-1 «I go to school yesterday» → 고친 문장이 나온다', f1 && f1.now === 'I went to school yesterday', f1 && f1.now);

  const said2 = 'I did breakfast yesterday.';
  const f2 = verifyWarmupFix({ was: 'I did breakfast', now: 'I had breakfast',
    why_ko: '밥은 did 말고 had 를 써', tag: 'word_choice', severity: 'major' }, said2);
  t('F-2 «I did breakfast yesterday» → 옛 방식이 놓치던 것도 잡는다', f2 && f2.now === 'I had breakfast', f2 && f2.now);
}

/* ⛔ 지어낸 교정은 «안 고쳐 주는 것» 보다 나쁘다 — 아이가 그대로 따라 말한다. */
{
  const said = 'I like dogs.';
  t('F-3 학생이 말하지 않은 문장은 거절한다',
    verifyWarmupFix({ was: 'I go to school', now: 'I went to school', why_ko: '어제 일이야', tag: 'past_tense', severity: 'minor' }, said) === null);
  t('F-4 why_ko 가 영어면 거절한다',
    verifyWarmupFix({ was: 'I like dogs', now: 'I love dogs', why_ko: 'love is stronger', tag: 'word_choice', severity: 'minor' }, said) === null);
  t('F-5 통째로 새 문장을 지어내면 거절한다',
    verifyWarmupFix({ was: 'I like dogs', now: 'Pizza tastes wonderful in the evening', why_ko: '이게 더 좋아', tag: 'other', severity: 'minor' }, said) === null);
}

/* 🔴 JSON 모드에서는 response 가 «이미 파싱된 객체» 로 오기도 한다 (2026-09-08 실사고).
   AI 친구도 같은 모델·같은 옵션이라 같은 모양을 받는다. */
{
  const o = parseWarmupOutput({ reply: 'Awesome! What did you do there?', fix: { was: 'I go', now: 'I went' } });
  t('F-6 🔴 객체로 와도 reply 를 꺼낸다', o.reply === 'Awesome! What did you do there?' && !!o.fix, o.reply);
  t('F-7 🔴 "[object Object]" 가 학생 화면으로 안 샌다',
    parseWarmupOutput({ reply: '[object Object]' }).reply === '');
}

/* «언제 보여 줄 것인가» — 매 턴 고치면 말문이 막힌다(2026-09-03 원장님 제보와 같은 뿌리). */
{
  const major = { was: 'I go', now: 'I went', why_ko: 'x', tag: 'past_tense', severity: 'major' };
  const minor = { was: 'a apple', now: 'an apple', why_ko: 'x', tag: 'article', severity: 'minor' };
  const d1 = decideWarmupFixShow(major, null, 5);
  t('F-8 뜻이 달라지는 오류는 바로 보여 준다', !!d1.show);
  const d2 = decideWarmupFixShow(minor, null, 5);
  t('F-9 작은 실수는 처음엔 안 보여 준다', d2.show === null);
  const d3 = decideWarmupFixShow(minor, d2.memo, 9);
  t('F-10 같은 실수가 두 번째면 보여 준다', !!d3.show);
  const d4 = decideWarmupFixShow(major, d1.memo, 6);
  /* 🔴 2026-09-09 사장님 「I ate pizza yesterday 인데 아바타가 수정해주지 않았어」 —
     뜻이 달라지는 오류는 연달아 틀려도 «매번» 고쳐 준다(옛 코드는 major 도 2턴을 띄웠다). */
  t('F-11 🔴 뜻이 달라지는 오류는 바로 앞 턴에 고쳐 줬어도 또 고쳐 준다', !!d4.show);
  /* ⚠️ 짝 — 그 예외를 minor 까지 넓히면 관사 하나까지 매 턴 잡혀 말문이 막힌다. */
  const d4b = decideWarmupFixShow(minor, d3.memo, 10);
  t('F-11b 🔴 짝: 작은 실수는 여전히 연달아 고치지 않는다', d4b.show === null);
  /* 🔴 턴 수가 «상한에 붙어» 더 안 늘면 «작은 실수» 교정이 멎는다 — 그래서 서버가 COUNT 로 센다.
     ⚠️ major 는 이제 간격을 안 보므로 이 재현에 쓸 수 없다(쓰면 검사가 헛돈다). */
  const stuck = decideWarmupFixShow(minor, { ...d3.memo, lastShownTurn: 21 }, 21);
  t('F-12 🔴 턴 수가 안 늘면 작은 실수 교정이 멎는다 (COUNT 로 세는 이유)', stuck.show === null);
  /* 🔴 2026-09-09 까지는 turnNo=1 이 «막혔다» — lastShownTurn 이 0 이라 1-0=1 < 2 로 걸려
     학생의 맨 첫 마디는 원리상 못 고쳐 줬다. 지금은 «한 번도 안 보여줬으면 간격 없음» 이다. */
  t('F-13 🔴 turnNo=1 — 학생의 첫 마디도 고쳐 준다',
    !!decideWarmupFixShow(major, null, 1).show);
  t('F-13b 짝 검사: 첫 마디여도 작은 실수는 처음엔 안 고친다',
    decideWarmupFixShow(minor, null, 1).show === null);
}
console.log('__J__' + JSON.stringify(out));
`;
  writeFileSync(join(tmp, 'run.mjs'), runner);
  const { spawnSync } = await import('node:child_process');
  const r = spawnSync(process.execPath, ['--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
  const line = (r.stdout || '').split('\n').find((l) => l.startsWith('__J__'));
  if (!line) {
    check('F-0 정본을 실제로 돌렸다 (전제)', false, (r.stderr || '').split('\n').slice(0, 4).join(' / '));
  } else {
    check('F-0 정본을 실제로 돌렸다 (전제)', true);
    for (const [n, ok, x] of JSON.parse(line.slice(5))) check(n, ok, x);
  }
}

console.log('\n════════════════════════════════════════════');
console.log('  결과: PASS ' + pass + ' · FAIL ' + fail);
if (failures.length) { console.log('  실패 목록:'); for (const f of failures) console.log('   - ' + f); }
console.log('════════════════════════════════════════════');
if (fail > 0) process.exit(1);
