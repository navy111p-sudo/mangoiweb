/*!
 * ✏️ warmup_correction_harness — A.i 웜업 «교정 카드» 회귀 감시 (2026-09-08)
 *
 * 왜 문자열 검사로는 모자란가:
 *   이 기능의 결함은 «함수가 있는가» 가 아니라 «무슨 답이 나오는가» 로만 드러난다.
 *   was 검증을 지워도, 세는 줄을 게이트 뒤로 옮겨도, 코드는 멀쩡히 «있습니다».
 *   그래서 B절은 정본을 node 타입 제거로 **실제로 돌린다**.
 *
 * ⚠️ A절의 배선 검사는 «길이» 가 아니라 «앵커» 로 범위를 자른다(CLAUDE.md 2장).
 */
import { readFileSync, mkdtempSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
const PUB = join(ROOT, 'cloudflare-deploy', 'public');

let pass = 0, fail = 0;
const check = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};

console.log('════════ ✏️ 웜업 교정 카드 ════════');

// ═══════════ A. 배선 — /api/warmup/chat 핸들러 안 ═══════════
console.log('\nA. 서버 배선 (index.ts 의 웜업 핸들러 «안» 만 잘라서 본다)');
const INDEX = readFileSync(join(SRC, 'index.ts'), 'utf8');
const CORR = readFileSync(join(SRC, 'warmup-correction.ts'), 'utf8');
{
  /* ⚠️ 앵커는 «라우터 분기» 가 아니라 «핸들러 함수» 여야 한다.
     path === '/api/warmup/chat' 은 위쪽 라우터에도 있어서, 그것을 집으면 무관한 3,600줄이
     딸려 들어와 남의 AI.run 까지 세게 된다(만들면서 실제로 밟았다).
     끝은 «다음 함수 선언» 으로 잡는다 — 응답 조립까지 포함해야 fix 필드를 볼 수 있다. */
  const start = INDEX.indexOf('async function handleWarmupChat(');
  const end = INDEX.indexOf('async function handleWarmupQuestions(', start);
  check('A-0 웜업 핸들러 구간을 앵커로 잘라 냈다', start > 0 && end > start,
        'start=' + start + ' end=' + end);
  const H = start > 0 && end > start ? INDEX.slice(start, end) : '';

  check('A-1 [교정] 절을 시스템 프롬프트에 주입한다',
        /sys\s*\+=\s*'\\n'\s*\+\s*WARMUP_CORRECTION_RULE\s*;/.test(H));
  /* ⚠️ 웜업 프롬프트의 [형식] 은 「평문으로만 써」 라고 말합니다 — JSON 지시와 정면으로
     부딪히므로, 어느 쪽이 이기는지 «프롬프트가 직접» 말해야 합니다. */
  check('A-1b 🔴 [출력형식] 이 [형식] 보다 우선한다고 프롬프트가 직접 말한다',
        /\[출력형식\][\s\S]{0,120}\[형식\][\s\S]{0,80}우선|우선[\s\S]{0,80}\[형식\]/.test(CORR),
        '');

  /* 🔴 이 검사가 이 하니스의 핵심이다.
     모델 출력이 JSON 이 된 뒤에도 «날것으로» 꺼내는 자리가 하나라도 남으면,
     그 경로만 조용히 중괄호 덩어리를 무너짐 게이트에 먹여 대화가 안전문구로 떨어진다. */
  /* takeWarmupReply «선언» 안의 추출은 정본이므로 세지 않는다. 그 밖에 하나라도 남으면 결함. */
  const HminusHelper = H.replace(/const takeWarmupReply[\s\S]*?\n    \};\n/, '');
  const rawPicks = HminusHelper.match(/\(\s*\w+\s*&&\s*\(\s*\w+\.response\s*\|\|\s*\w+\.result/g) || [];
  check('A-2 모델 출력을 날것으로 꺼내는 자리가 0건 (전부 takeWarmupReply 를 지난다)',
        rawPicks.length === 0, '남은 자리 ' + rawPicks.length + '건');

  /* ⚠️ 주석을 벗기고 «코드만» 센다. 안 그러면 주석에 적힌 takeWarmupReply() 가 함께 세어져
     «코드는 한 글자도 안 고치고 주석 괄호만 떼도 FAIL» 이 난다(함정 대조가 실측으로 잡았다). */
  const code = H.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '');
  const takes = (code.match(/takeWarmupReply\(/g) || []).length;
  const commits = (code.match(/commitFix\(\)/g) || []).length;
  const runs = (code.match(/await runWarmup\(/g) || []).length;
  /* ⚠️ 모델을 부르는 «자리» 는 runWarmup 하나여야 한다 — 첫 호출에만 폴백을 두었더니
     나머지 네 경로가 그 보호를 못 받았다(2026-09-08 하니스가 잡음). */
  const rawRuns = (code.match(/env\.AI\.run\(WARMUP_MODEL/g) || []).length;
  check('A-3 답장을 뽑는 경로마다 추출을 지난다', runs > 0 && takes === runs,
        'runWarmup ' + runs + '회 · takeWarmupReply ' + takes + '회');
  check('A-3b 채택한 답장마다 교정을 확정한다 (버려진 재시도의 교정이 남지 않는다)',
        commits === runs, 'commitFix ' + commits + '회 · runWarmup ' + runs + '회');
  /* ⚠️ «몇 개인가» 로 못 박지 않는다 — 물어야 할 것은 «어디에 있는가» 다.
     runWarmup 의 몸통을 중괄호 짝으로 잘라, 그 «밖» 에 env.AI.run 이 없는지 본다. */
  const rwStart = code.indexOf('const runWarmup');
  let rwBody = '';
  if (rwStart >= 0) {
    const ob = code.indexOf('{', code.indexOf('=>', rwStart));
    for (let i = ob, d = 0; i < code.length; i++) {
      if (code[i] === '{') d++;
      else if (code[i] === '}' && --d === 0) { rwBody = code.slice(ob, i + 1); break; }
    }
  }
  const rawOutside = (code.replace(rwBody, '').match(/env\.AI\.run\(WARMUP_MODEL/g) || []).length;
  check('A-3d 모델을 부르는 자리는 runWarmup 몸통 «안» 뿐 (폴백이 전 경로에 걸린다)',
        rwBody.length > 40 && /env\.AI\.run\(WARMUP_MODEL/.test(rwBody) && rawOutside === 0,
        'runWarmup 몸통 ' + rwBody.length + '자 · 몸통 밖 env.AI.run ' + rawOutside + '회');
  check('A-3c 답장을 버리면 그 교정도 버린다', /rawFix = null;/.test(code));

  /* 🔴 2026-09-08 실사고 — 교정 카드가 «한 번도 안 떴습니다».
     JSON 을 «말로만» 시켰고(같은 모델에 response_format 을 쓰는 곳이 이미 여덟 곳 있었는데),
     프롬프트는 [형식] 「평문으로만 써」 와 정면으로 부딪히고 있었습니다.
     실패 방향은 안전했지만 «조용해서» 아무도 못 봤습니다 — 그래서 셋을 못 박습니다. */
  const viaOpts = (code.match(/warmupAIOpts\(/g) || []).length;
  check('A-8 🔴 모든 AI 호출이 JSON 모드를 지난다 (response_format 을 말로만 시키지 않는다)',
        /response_format\s*=\s*\{\s*type:\s*'json_object'\s*\}/.test(code) && rawRuns > 0 && viaOpts === rawRuns,
        'env.AI.run ' + rawRuns + '회 · warmupAIOpts ' + viaOpts + '회');
  check('A-8b 모델이 그 옵션을 거절하면 한 번 끄고 다시 부른다 (선례: api-sales-hr.ts)',
        /warmupRF\s*=\s*false/.test(code) && /catch\s*\(rfErr/.test(code));
  /* 🔴 «거절되면 다시 부른다» 만 검사하면, 429·타임아웃까지 재시도하는 결함이 그대로
     통과합니다(함정 대조 실측 — 가드를 지워도 초록이었습니다). CLAUDE.md 「제약이 거부될 때…」
     — **«다른 오류는 재시도 «안» 한다» 를 짝으로**. 판정 함수를 오려 내 «실제로 돌립니다». */
  const rfmSrc = (code.match(/const isRfRejection[\s\S]*?\n    \};/) || [''])[0];
  let isRf = null;
  try { isRf = new Function('"use strict";' + rfmSrc.replace(/const isRfRejection = \(e: any\): boolean =>/, 'const isRfRejection = (e) =>') + ' return isRfRejection;')(); } catch { isRf = null; }
  check('A-8b-1 그 판정을 소스에서 오려 내 돌릴 수 있다 (전제)', typeof isRf === 'function');
  if (typeof isRf === 'function') {
    const YES = ['response_format is not supported', 'Unrecognized request argument: response_format',
                 'invalid json_object', 'AiError: 400 Bad Request — json schema'];
    /* ⚠️ 앞 넷은 «긍정 목록에 안 걸려서» 저절로 false 가 됩니다 — 그것만 두면
       «먼저 거르는» 줄을 통째로 지워도 초록입니다(실측). 뒤 셋처럼 **두 낱말이 겹치는**
       메시지를 반드시 섞으세요 — 그때만 «어느 쪽이 이기는가» 가 실제로 검사됩니다. */
    const NO  = ['429 Too Many Requests', 'Error: request timed out',
                 'The operation was aborted', '500 Internal Server Error',
                 'AiError: 400 Bad Request — rate limit exceeded, retry later',
                 'Error 500: unsupported upstream (capacity exceeded)',
                 'timed out while validating response_format'];
    check('A-8b-2 제약 거절이면 다시 부른다', YES.every((m) => isRf(new Error(m)) === true),
          YES.filter((m) => isRf(new Error(m)) !== true).join(' | ') || '4/4');
    check('A-8b-3 🔴 429·타임아웃·5xx 는 다시 부르지 않는다 (JSON 모드가 조용히 꺼지면 회귀가 되살아난다)',
          NO.every((m) => isRf(new Error(m)) === false),
          NO.filter((m) => isRf(new Error(m)) !== false).join(' | ') || '7/7');
    check('A-8b-4 그 가드를 실제로 호출한다 (선언만 두고 안 쓰면 무의미)',
          /!warmupRF\s*\|\|\s*!isRfRejection\(/.test(code));
  }
  check('A-8c 모델이 평문을 주면 로그로 남긴다 (다시 조용해지지 않게)',
        /warmupPlain\+\+/.test(code) && /no JSON/.test(H));
  /* ⚠️ «빈 응답» 을 «평문» 으로 세면, 그 로그를 보러 온 사람이 「프롬프트가 안 먹는다」로
     읽고 엉뚱한 곳을 고칩니다(다른 사실을 한 숫자로 뭉치지 말 것). */
  check('A-8c-2 «빈 응답» 은 «평문» 과 갈라 센다',
        /if \(!parsed\.reply\) warmupEmpty\+\+/.test(code) && /else if \(!parsed\.json\) warmupPlain\+\+/.test(code));
  const capM = INDEX.match(/const WARMUP_MAX_TOKENS = (\d+)/);
  const cap = capM ? Number(capM[1]) : 0;
  /* ⚠️ 선언만 보면 «호출부만 200 으로 되돌리는» 변이가 그대로 통과합니다(실측).
     실제 호출 옵션이 그 상수를 쓰는지, 그리고 숫자를 다시 적지 않았는지 함께 봅니다. */
  check('A-9 교정이 같은 예산에 들어가므로 토큰 상한을 올렸다 (200 은 잘림 위험)',
        cap >= 300 && /max_tokens:\s*WARMUP_MAX_TOKENS/.test(code) && !/max_tokens:\s*\d/.test(code),
        'WARMUP_MAX_TOKENS=' + (cap || '?') + ' · 호출부 숫자 하드코딩 ' + ((code.match(/max_tokens:\s*\d/g) || []).length) + '건');

  /* 🔴 2026-09-08 실사고 — 이 자리가 «[object Object]» 의 두 번째 입구였다.
     `r.result` 는 «응답 객체»(`{response: …}`)라 그대로 넘기면 정본이 문자열로 굳힌다.
     저장소의 다른 다섯 곳이 전부 `r?.response ?? r?.result?.response` 로 읽는다.
     ⚠️ «그 함수를 부르는가» 로는 못 잡는다 — «무엇을 넘기는가» 를 본다. */
  {
    const argM = code.match(/parseWarmupOutput\(([^;]*?)\);/);
    const arg = argM ? argM[1] : '';
    check('A-10 🔴 모델 응답에서 «글자» 를 꺼내 넘긴다 (응답 객체를 통째로 넘기지 않는다)',
          /\.response/.test(arg) && !/\bresult\s*(\|\||\?\?|\))/.test(arg),
          '인자: ' + (arg.trim() || '(못 찾음)'));
  }

  check('A-4 검증을 «반드시» 지난다 — 모델이 준 fix 를 그대로 응답에 싣지 않는다',
        /verifyWarmupFix\(\s*rawFix\s*,\s*studentInput\s*\)/.test(H) && !/fix:\s*rawFix/.test(H));

  check('A-5 응답에 검증·게이트를 통과한 것만 싣는다', /fix:\s*showFix\s*,\s*repeat:\s*offerRepeat/.test(H));

  check('A-6 게이트가 던져도 대화가 죽지 않는다 (통째로 try/catch)',
        /try\s*\{[\s\S]*verifyWarmupFix[\s\S]*?\}\s*catch/.test(H));

  check('A-7 교정 메모는 히스토리와 같은 6시간 — 발화를 저장하지 않는다',
        /'warmupfix:'\s*\+\s*sessionId/.test(H) && /expirationTtl:\s*6\s*\*\s*3600/.test(H));
}

// ═══════════ B. 정본을 실제로 돌린다 ═══════════
console.log('\nB. 정본 실행 (node 타입 제거 — 컴파일 없이 진짜로 돌린다)');
{
  const tmp = mkdtempSync(join(tmpdir(), 'wfx-'));
  const fixImp = (s) => s.replace(/from '\.\/([\w-]+)'/g, "from './$1.ts'");
  writeFileSync(join(tmp, 'warmup-correction.ts'), fixImp(readFileSync(join(SRC, 'warmup-correction.ts'), 'utf8')));
  writeFileSync(join(tmp, 'english-only.ts'), fixImp(readFileSync(join(SRC, 'english-only.ts'), 'utf8')));
  const runner = `
import { parseWarmupOutput, verifyWarmupFix, decideWarmupFixShow, warmupShouldOfferRepeat } from './warmup-correction.ts';
const out = [];
const t = (name, ok, extra) => out.push([name, !!ok, extra == null ? '' : String(extra)]);

// ── ① parseWarmupOutput — 파싱이 깨져도 학생에게 중괄호가 안 보인다 ──
{
  const good = JSON.stringify({ reply: 'Nice! What did you do?', fix: { was: 'I go', now: 'I went', why_ko: '어제 일이라 went 야', tag: 'past_tense', severity: 'minor' } });
  const p = parseWarmupOutput(good);
  t('B-1 정상 JSON 에서 reply 와 fix 를 꺼낸다', p.reply === 'Nice! What did you do?' && p.fix && p.fix.was === 'I go');

  const fenced = '\\u0060\\u0060\\u0060json\\n' + good + '\\n\\u0060\\u0060\\u0060';
  t('B-2 코드펜스로 감싸도 읽는다', parseWarmupOutput(fenced).reply === 'Nice! What did you do?');

  const plain = parseWarmupOutput('Hi! How are you today?');
  t('B-3 평문이면 그대로 reply (옛 동작으로 안전하게 떨어진다)', plain.reply === 'Hi! How are you today?' && plain.fix === null);

  const broken = parseWarmupOutput('{"reply":"Great job!","fix":{oops}');
  t('B-4 JSON 이 깨져도 reply 만 건져 낸다', broken.reply === 'Great job!' && broken.fix === null);

  /* 🔴 함정 대조가 잡은 진짜 결함 — max_tokens 안에 교정까지 들어가므로 «잘림» 이 가장 흔한
     실패 모양인데, 잘리면 정의상 닫는 중괄호가 없다. 옛 코드는 그때 원문을 그대로 내보냈다. */
  {
    const cut = '{"reply":"Oh, you went to school yesterday! What did you do there?","fix":{"was":"I go to sch';
    const c = parseWarmupOutput(cut);
    t('B-4b 🔴 잘린 JSON 에서도 reply 를 건져 낸다', c.reply === 'Oh, you went to school yesterday! What did you do there?', c.reply.slice(0, 40));
    t('B-4c 🔴 잘려도 중괄호가 학생 화면으로 안 샌다', !c.reply.includes('{') && !c.reply.includes('"reply"'));
    const cutEarly = parseWarmupOutput('{"reply":"Oh, you went to sch');
    t('B-4d reply 자체가 잘리면 빈 문자열 (딸꾹질 문구가 받는다)', cutEarly.reply === '', JSON.stringify(cutEarly.reply));
    const prefixed = parseWarmupOutput('Here you go: {"reply":"Nice!","fix":');
    t('B-4e JSON 앞에 말이 붙어도 중괄호가 안 샌다', !prefixed.reply.includes('{'), JSON.stringify(prefixed.reply).slice(0, 50));
  }
  const hopeless = parseWarmupOutput('{"nope": 1}');
  t('B-5 못 읽으면 빈 문자열 (잘린 경우는 B-4b~e 가 따로 본다)', hopeless.reply === '' && hopeless.fix === null, JSON.stringify(hopeless.reply));

  /* 🔴 2026-09-08 실사고 — Workers AI 는 response_format(json_object) 일 때 response 를
     «이미 파싱된 객체» 로 주기도 한다. String(객체) 는 "[object Object]" 이고 그 글자에는
     중괄호가 없어서 위 안전망을 전부 비켜 가 학생 말풍선과 TTS 로 그대로 나갔다.
     ⚠️ 문자열만 넣어 보는 검사로는 원리상 못 잡는다 — «객체를 실제로 넣어» 본다. */
  {
    const objIn = { reply: 'Nice! What did you do?', fix: { was: 'I go', now: 'I went', why_ko: '어제 일이라 went 야', tag: 'past_tense', severity: 'minor' } };
    const po = parseWarmupOutput(objIn);
    t('B-7 🔴 이미 파싱된 «객체» 로 와도 reply 를 꺼낸다', po.reply === 'Nice! What did you do?' && po.fix && po.fix.was === 'I go', JSON.stringify(po.reply));
    t('B-7b 🔴 어떤 모양으로 와도 "[object Object]" 를 학생에게 안 보낸다',
      [objIn, { response: 'hi' }, { nope: 1 }, [{ reply: 'x' }], [1, 2], { reply: '' }, { reply: 123 },
       /* 🔴 이 둘이 빠져 있어서 검사 «이름» 이 실제 보장보다 넓었습니다 — 안전망이 «입력 글자»
          에 걸려 있으면 객체 분기가 그보다 앞이라 이 둘이 그대로 통과합니다(실측). */
       { reply: '[object Object]' }, { reply: 'Hi [object Object] there' }]
        .every(v => !/\\[object /.test(parseWarmupOutput(v).reply)),
      JSON.stringify([{ response: 'hi' }, [{ reply: 'x' }]].map(v => parseWarmupOutput(v).reply)));
    t('B-7c 객체인데 reply 가 없으면 빈 문자열 (딸꾹질 문구가 받는다)',
      parseWarmupOutput({ nope: 1 }).reply === '' && parseWarmupOutput({ response: 'hi' }).reply === '');
    /* ⚠️ «객체를 막는다» 만 두면 «전부 빈 문자열» 도 통과한다 — 위 B-7 이 그 짝이다.
       그리고 문자열 경로가 죽지 않았는지도 함께 본다(B-1~B-6 이 그 짝). */
    t('B-7e 🔴 fix 칸에만 그 글자가 있으면 답장은 살린다 (안전망은 «reply» 에 건다)',
      parseWarmupOutput({ reply: 'Nice work!', fix: { was: 'a', now: 'b', why_ko: '[object Object]', tag: 'other', severity: 'minor' } }).reply === 'Nice work!',
      JSON.stringify(parseWarmupOutput({ reply: 'Nice work!', fix: { why_ko: '[object Object]' } }).reply));
    t('B-7d 마지막 안전망: 문자열 안에 굳어 버린 "[object Object]" 도 안 내보낸다',
      parseWarmupOutput('[object Object]').reply === '' &&
      parseWarmupOutput('Sure! [object Object]').reply === '');
  }

  t('B-6 빈 응답은 빈 응답', parseWarmupOutput('').reply === '' && parseWarmupOutput(null).reply === '');
  t('B-6b 🔴 «JSON 이었는가» 를 돌려준다 (모델이 평문을 주는 것을 볼 수 있어야 한다)',
    parseWarmupOutput(good).json === true && parseWarmupOutput('Hi! How are you?').json === false);
}

// ── ② verifyWarmupFix — 모델을 믿지 않는다 ──
{
  const said = 'I go to school yesterday';
  const ok = verifyWarmupFix({ was: 'I go to school yesterday', now: 'I went to school yesterday', why_ko: '어제 일이라 went 를 써', tag: 'past_tense', severity: 'minor' }, said);
  t('B-7 제대로 된 교정은 통과한다 («못 잡는다» 만 검사하면 헛돈다)', ok && ok.now === 'I went to school yesterday' && ok.tag === 'past_tense');

  t('B-8 🔴 was 가 학생 원문에 없으면 버린다 (지어낸 교정)',
    verifyWarmupFix({ was: 'I have a cat', now: 'I have two cats', why_ko: '복수야', tag: 'plural', severity: 'minor' }, said) === null);

  t('B-9 was 와 now 가 같으면 교정이 아니다',
    verifyWarmupFix({ was: 'I go to school', now: 'i go to school', why_ko: '같아', tag: 'other', severity: 'minor' }, said) === null);

  t('B-10 why_ko 가 비면 버린다',
    verifyWarmupFix({ was: 'I go', now: 'I went', why_ko: '', tag: 'past_tense', severity: 'minor' }, said) === null);

  t('B-11 why_ko 가 한국어가 아니면 버린다',
    verifyWarmupFix({ was: 'I go', now: 'I went', why_ko: 'use past tense', tag: 'past_tense', severity: 'minor' }, said) === null);

  t('B-12 교정문에 한글이 섞이면 버린다 (영어 TTS 가 그대로 읽는다)',
    verifyWarmupFix({ was: 'I go', now: 'I went 갔어', why_ko: '과거형', tag: 'past_tense', severity: 'minor' }, said) === null);

  t('B-13 통째로 새 문장을 지어내면 버린다 (낱말이 안 겹침)',
    verifyWarmupFix({ was: 'I go', now: 'Pizza tastes wonderful', why_ko: '더 좋아', tag: 'other', severity: 'minor' }, said) === null);

  const unknownTag = verifyWarmupFix({ was: 'I go', now: 'I went', why_ko: '과거형이야', tag: '내맘대로', severity: '이상함' }, said);
  t('B-13b 형태가 바뀌는 교정은 통과한다 (낱말 겹침만 보면 묻힌다)',
    !!verifyWarmupFix({ was: "I don't went", now: "I didn't go", why_ko: '과거 부정은 didn\u2019t go 예요', tag: 'verb_form', severity: 'major' }, "I don't went to school"));
  t('B-13c 그래도 통째로 다른 문장은 여전히 막힌다',
    verifyWarmupFix({ was: 'I like it', now: 'Do you want to play soccer with me', why_ko: '이렇게 말해요', tag: 'other', severity: 'minor' }, 'I like it') === null);
  t('B-14 모르는 tag·severity 는 안전한 기본값으로 (버리지는 않는다)',
    unknownTag && unknownTag.tag === 'other' && unknownTag.severity === 'minor');

  t('B-15 fix 가 없으면(null) 조용히 없음', verifyWarmupFix(null, said) === null && verifyWarmupFix({}, said) === null);

  t('B-15b 낱말 조각은 통과 못 한다 (부분문자열이 아니라 낱말 경계)',
    verifyWarmupFix({ was: 'o to sch', now: 'o to schoo', why_ko: '이렇게 써', tag: 'other', severity: 'minor' }, 'I go to school') === null);
  t('B-15c 곱슬 아포스트로피가 섞여도 대조가 어긋나지 않는다',
    !!verifyWarmupFix({ was: 'I don\u2019t went', now: 'I didn\u2019t go', why_ko: '과거형은 didn\u2019t go 예요', tag: 'verb_form', severity: 'major' }, "I don't went to school"));
  t('B-16 학생 원문이 비면 아무것도 통과 못 한다',
    verifyWarmupFix({ was: 'I go', now: 'I went', why_ko: '과거형', tag: 'past_tense', severity: 'minor' }, '') === null);

  const mk = (w, n) => ({ was: w, now: n, why_ko: '이렇게 써', tag: 'other', severity: 'minor' });
  t('B-17 짧은 문장의 진짜 교정도 통과한다 (게이트가 너무 조이면 기능이 안 뜬다)',
    !!verifyWarmupFix(mk('me hungry', 'I am hungry'), 'me hungry') &&
    !!verifyWarmupFix(mk('I like apple', 'I like apples'), 'I like apple'));
}

// ── ③ decideWarmupFixShow — «언제 보여 줄 것인가» ──
{
  const F = (sev, tag) => ({ was: 'x', now: 'y', why_ko: '이유', tag: tag || 'past_tense', severity: sev });

  const a = decideWarmupFixShow(F('major'), null, 5);
  t('B-18 뜻이 달라지는 오류(major)는 바로 보여 준다', !!a.show);

  const b = decideWarmupFixShow(F('minor'), null, 5);
  t('B-19 작은 실수(minor)는 처음엔 안 보여 준다 — 매 턴 고치면 말문이 막힌다', b.show === null);
  t('B-20 그래도 «틀린 것» 자체는 센다 (안 세면 두 번째가 영영 안 온다)', b.memo.tags.past_tense === 1);

  const c = decideWarmupFixShow(F('minor'), b.memo, 7);
  t('B-21 같은 실수가 두 번째면 그때 보여 준다', !!c.show && c.memo.tags.past_tense === 2);

  const d = decideWarmupFixShow(F('major'), c.memo, 8);
  t('B-22 바로 앞 턴에 고쳐 줬으면 이번 턴은 쉰다 (연달아 고치지 않는다)', d.show === null);

  const e = decideWarmupFixShow(F('major'), c.memo, 9);
  t('B-23 한 턴 띄우면 다시 고쳐 준다', !!e.show);

  const z = decideWarmupFixShow(null, c.memo, 20);
  t('B-24 교정이 없으면 메모도 안 늘어난다', z.show === null && z.memo.tags.past_tense === 2);
}

// ── ④ warmupShouldOfferRepeat — 「따라 말해 보기」 ──
{
  const F = { was: 'x', now: 'y', why_ko: '이유', tag: 'past_tense', severity: 'major' };
  const memo = { tags: {}, lastShownTurn: 0, lastRepeatTurn: 0, shown: 0 };
  t('B-25 첫 교정에는 따라 말하기를 붙인다', warmupShouldOfferRepeat(F, memo, 4) === true);
  t('B-26 바로 다음 교정에는 안 붙인다 (3턴에 한 번)', warmupShouldOfferRepeat(F, memo, 5) === false);
  t('B-27 세 턴 지나면 다시 붙는다', warmupShouldOfferRepeat(F, memo, 7) === true);
  t('B-28 교정이 없으면 따라 말하기도 없다', warmupShouldOfferRepeat(null, memo, 30) === false);
}
process.stdout.write('@@JSON@@' + JSON.stringify(out));
`;
  writeFileSync(join(tmp, 'run.mjs'), runner);
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
  rmSync(tmp, { recursive: true, force: true });
  const marker = (r.stdout || '').indexOf('@@JSON@@');
  if (r.status !== 0 || marker < 0) {
    check('B-0 정본 실행', false, '종료코드 ' + r.status);
    console.log((r.stderr || '').slice(0, 900));
  } else {
    check('B-0 정본 실행', true);
    for (const [name, ok, extra] of JSON.parse(r.stdout.slice(marker + 8))) check(name, ok, extra);
  }
}

// ═══════════ C. 화면 배선 ═══════════
console.log('\nC. 화면 배선 (warmup.html)');
{
  const W = readFileSync(join(PUB, 'warmup.html'), 'utf8');
  check('C-1 서버가 준 fix 를 그린다', /showFixCard\(\s*d\.fix\s*,\s*d\.repeat\s*\)/.test(W));
  /* ⚠️ «선언» 이 함께 매치되면 호출을 전부 지워도 통과한다 — 이 저장소에서 세 번째 밟은 함정이다.
     선언은 정확히 1개, «부르는 곳» 은 2곳 이상(보낼 때 + 그릴 때)이어야 한다. */
  const decl = (W.match(/function fixCardClear\(\)/g) || []).length;
  const calls = (W.replace(/function fixCardClear\(\)/g, '').match(/fixCardClear\(\)/g) || []).length;
  check('C-2 보낼 때 이전 교정 카드를 걷는다 (선언 1개 · 부르는 곳 2곳 이상)',
        decl === 1 && calls >= 2, '선언 ' + decl + ' · 호출 ' + calls);
  check('C-3 서버가 «교정 없음» 이면 아무것도 안 그린다',
        /if\(!fix \|\| !fix\.was \|\| !fix\.now\) return;/.test(W));
  /* ⛔ 학생·모델이 만든 «값» 에 data-ko/data-en 을 달면 i18n 엔진이 textContent 를 통째로
     갈아끼워 문장이 사라진다. 라벨에만 달아야 한다(CLAUDE.md 2장). */
  const fixBlock = W.slice(W.indexOf('function showFixCard('), W.indexOf('function fixSpeakThenMic('));
  /* ⚠️ 「_fixLabel(v,…)」 한 모양만 보면 v.setAttribute('data-ko', …) 로 직접 달았을 때 통과한다.
     값을 만드는 그 줄을 «잘라서» data-ko/data-en 이 아예 없는지 본다. */
  const mkStart = fixBlock.indexOf('var mk = function(');
  const mkEnd = fixBlock.indexOf('card.appendChild(mk(', mkStart);
  const mkBody = mkStart >= 0 && mkEnd > mkStart ? fixBlock.slice(mkStart, mkEnd) : '';
  check('C-4-0 값을 만드는 블록을 잘라 냈다 (전제)', mkBody.length > 120, mkBody.length + '자');
  check('C-4 was/now 를 담는 칸에는 data-ko/data-en 을 안 단다',
        mkBody.length > 120 && !/data-ko|data-en|_fixLabel\(\s*v\b/.test(mkBody) && /v\.textContent\s*=\s*val;/.test(mkBody));
  check('C-5 따라 말하기는 서버가 켜 줄 때만 그린다', /if\(offerRepeat\)\{/.test(fixBlock));
  check('C-6 소리가 끝난 뒤 마이크를 연다 (안전망 포함)',
        /function fixSpeakThenMic/.test(W) && /classList\.contains\('playing'\)/.test(W) && /15000/.test(W));
  check('C-7 교정 카드 색이 «대답 보기»(초록)·«질문 추천»(노랑)과 다르다',
        /\.fix-card\{[\s\S]*?rgba\(56,189,248/.test(W));
}

console.log('\n──────── 결과: PASS ' + pass + ' · FAIL ' + fail + ' ────────');
process.exit(fail ? 1 : 0);
