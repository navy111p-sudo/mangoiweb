import { fileURLToPath } from 'node:url';
// 2026-10-18 — 콩글리시 대조표 (개선안 2순위 ⑦)
//   src/konglish.ts 를 타입만 벗겨 실제로 돌리고, AI 친구(api-ai.ts)가 «모델 교정이 없을 때만» 표를 쓰는지 봅니다.
//   짝: «잡는다» 옆에 «뜻이 둘인 맞는 영어는 안 잡는다».
import fs from 'node:fs';
import path from 'node:path';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = path.resolve(path.dirname(fileURLToPath(new URL(import.meta.url))), '..');
const P = (rel, env) => fs.readFileSync(process.env[env] || path.join(ROOT, rel), 'utf8');
const SRC = P('cloudflare-deploy/src/konglish.ts', 'KG_SRC');
const AI = P('cloudflare-deploy/src/api-ai.ts', 'AI_SRC').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const check = (n, c, x) => { if (c) { pass++; console.log('  ✅ ' + n); } else { fail++; console.log('  ❌ FAIL ' + n + (x !== undefined ? ' ' + JSON.stringify(x) : '')); } };

let K = null;
try {
  const js = stripTypeScriptTypes(SRC).replace(/^import .*$/gm, '').replace(/^export\s+/gm, '');
  K = new Function(js + '\nreturn { KONGLISH, findKonglish, konglishFix, konglishPromptLine };')();
} catch (e) { check('모듈 실행', false, e.message); }
check('모듈을 실제로 실행했다(전제)', !!K);

if (K) {
  const hit = (s) => K.findKonglish(s);
  const yes = [
    ['I lost my handphone.', 'handphone', 'cell phone'],
    ['My hand phones are old', 'hand phones', 'cell phones'],
    ['We did eye shopping at the mall.', 'eye shopping', 'window shopping'],
    ['I took a selca!', 'selca', 'selfie'],
    ['Where is the hotchkiss?', 'hotchkiss', 'stapler'],
    ['My uncle is a gagman.', 'gagman', 'comedian'],
    ['I run on a running machine.', 'running machine', 'treadmill'],
    ['Give me the remocon', 'remocon', 'remote control'],
    ['I need a sharp pencil', 'sharp pencil', 'mechanical pencil'],
    ['Plug it into the concent.', 'concent', 'outlet'],
    ['Fighting!', 'Fighting!', 'You can do it!'],
    ['Good luck. Fighting!!', 'Fighting!!', 'You can do it!'],
    ['fighting', 'fighting', 'You can do it!'],
    ['I post on SNS every day', 'SNS', 'social media'],
  ];
  for (const [s, was, now] of yes) {
    const h = hit(s);
    check(`잡는다: «${s}» → ${now}`, h && h.was === was && h.now === now, h);
  }
  const no = [
    'I was fighting with my brother.',      // 싸움 — 맞는 영어
    'We had a meeting at school.',          // 회의 — 맞는 영어
    'I wrote it in my notebook.',           // 공책 — 맞는 영어
    'The fox is cunning.',                  // 교활한 — 맞는 영어
    'Can I have one piece of cake?',        // 한 조각 — 맞는 영어
    'The service was great.',
    'My phone is new.',
    'He is a handsome man.',                // «hand» 로 시작하지만 handphone 아님
    'I like concerts.',                     // concent 와 철자 비슷
    'I went shopping with my eye doctor.',
    '',
  ];
  for (const s of no) check(`짝: 안 잡는다 «${s}»`, hit(s) === null, hit(s));
  check('던지지 않는다(문자열 아님)', K.findKonglish(null) === null && K.findKonglish(42) === null && K.konglishFix(undefined) === null);

  const f = K.konglishFix('I lost my handphone.');
  check('교정 카드 모양 — was·now·why_ko·tag·severity', f && f.was === 'handphone' && f.now === 'cell phone' && /[가-힣]/.test(f.why_ko) && f.tag === 'word_choice' && f.severity === 'major', f);
  check('교정 «now» 에는 한글이 없다(아이가 따라 쓰는 말)', K.KONGLISH.every(([, right]) => !/[가-힣]/.test(right)));
  check('왜(why) 는 전부 한국어로 채워져 있다', K.KONGLISH.every(([, , why]) => /[가-힣]/.test(why) && why.length > 10));
  const line = K.konglishPromptLine('Fighting!');
  check('프롬프트 한 줄 — 자연스러운 말을 담는다', /You can do it!/.test(line) && /do not lecture/.test(line), line);
  check('프롬프트 짝: 없으면 빈 문자열', K.konglishPromptLine('I like dogs.') === '');
  check('표 설명에 CJK 홑낫표가 없다', !/[「」]/.test(K.KONGLISH.map(r => r[2]).join('')));
}

// ── 배선: AI 친구 ──
{
  check('AI 친구가 모듈을 불러온다', /import \{ konglishFix, konglishPromptLine \} from '\.\/konglish'/.test(AI));
  /* 🎚️ (2026-11-03) 규칙 보완(과거형·콩글리시 표)의 정본이 friend-correction-flow.ts 의 deterministicFriendFix 로
     옮겨 갔다(미리듣기 문과 교정 판정이 «같은 한 벌» 을 보게). 식은 `모델 교정 || turnPlan.detFix || 균형 다시 묻기`. */
  const FLOW = P('cloudflare-deploy/src/friend-correction-flow.ts', 'FLOW_SRC');
  const m = AI.match(/const verified = (.+);\n/);
  check('모델 교정이 «먼저», 규칙 보완(turnPlan.detFix)은 그 뒤(||)', !!m && /^verifyWarmupFix\(rawFix, msg\)\s*\|\|\s*turnPlan\.detFix\b/.test(m[1].trim()), m && m[1]);
  const dm = FLOW.match(/export function deterministicFriendFix\(msg: string\): WarmupFix \| null \{\s*try \{\s*return (.+);/);
  check('규칙 보완 정본: 과거형 보완 → 콩글리시 표 순서', !!dm && /^verifyWarmupFix\(backfillPastTenseFix\(msg\), msg\)\s*\|\|\s*konglishFix\(msg\)$/.test(dm[1].trim()), dm && dm[1]);
  check('계획(turnPlan)이 그 정본을 쓴다', /detFix = deterministicFriendFix\(msg\)/.test(FLOW) && /const turnPlan = planFriendTurn\(/.test(AI));
  // 두 식을 실제로 평가 — 모델 교정이 있으면 표를 안 쓴다 / 없으면 표를 쓴다
  // 2026-10-31: 과거형 보완(tense-backfill)이 식에 끼었다 — 정본을 실제로 불러 넘긴다
  const TB_SRC = fs.readFileSync(path.join(ROOT, 'cloudflare-deploy/src/tense-backfill.ts'), 'utf8');
  const backfillPastTenseFix = new Function(stripTypeScriptTypes(TB_SRC).replace(/^export\s+/gm, '') + '\nreturn backfillPastTenseFix;')();
  if (m && dm) {
    const AsyncFn = Object.getPrototypeOf(async function () {}).constructor;
    const ev = async (model) => {
      const msg = 'I lost my handphone.';
      const detFix = new Function('verifyWarmupFix', 'konglishFix', 'backfillPastTenseFix', 'msg', 'return ' + dm[1])(() => model, K ? K.konglishFix : () => null, backfillPastTenseFix, msg);
      return new AsyncFn('verifyWarmupFix', 'turnPlan', 'recheckP', 'waitRecheck', 'rawFix', 'msg', 'return ' + m[1])(() => model, { detFix }, null, async () => null, null, msg);
    };
    const mine = { was: 'go', now: 'went', tag: 'past_tense', severity: 'major', why_ko: 'x' };
    check('식 실행: 모델 교정이 있으면 그것', (await ev(mine)) === mine);
    const r = await ev(null);
    check('식 실행 짝: 모델 교정이 없으면 표의 교정', !!r && r.now === 'cell phone', r);
  }
  check('프롬프트 한 줄을 만든다', /const konglishCtx = konglishPromptLine\(msg\);/.test(AI));
  check('그 줄이 시스템 프롬프트에 실린다', /\$\{mistakeCtx\}\$\{konglishCtx\}\nRules:/.test(AI));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
