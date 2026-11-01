/*!
 * ✏️ tense_backfill_harness — 과거형 자동 보완 회귀 감시 (2026-10-31, 제안서 D안)
 *
 * 왜 문자열 검사로는 모자란가:
 *   결함은 «함수가 있는가» 가 아니라 «무슨 답이 나오는가» 로만 드러난다.
 *   그래서 A절은 정본 tense-backfill.ts 를 실제로 돌려 답을 대조한다.
 *   B절은 배선(index.ts · api-ai.ts)이 «모델 fix 가 없을 때만» 보완을 쓰는지 본다.
 */
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'cloudflare-deploy', 'src');
let pass = 0, fail = 0;
const check = (name, ok, extra) => {
  if (ok) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};

console.log('════════ ✏️ 과거형 자동 보완 ════════');

// ═══════════ A. 정본을 실제로 돌려 답을 맞춘다 ═══════════
console.log('\nA. 정본 backfillPastTenseFix 의 답');
{
  const src = readFileSync(join(SRC, 'tense-backfill.ts'), 'utf8');
  const tmp = mkdtempSync(join(tmpdir(), 'tb-'));
  writeFileSync(join(tmp, 'tb.ts'), src);
  writeFileSync(join(tmp, 'run.mjs'),
    `import { backfillPastTenseFix as f } from './tb.ts';\n` +
    `const cases = ${JSON.stringify([
      'I play soccer yesterday', 'I go to school yesterday', 'I eat pizza yesterday',
      'She cry last night.', 'We watch movie last week', 'He play basketball yesterday!',
      "I didn't play yesterday", 'I play soccer every day', 'I have pizza yesterday',
      'I studied yesterday', 'I played soccer yesterday', 'I flied yesterday', '', '안녕 yesterday',
      'I play piano tomorrow', 'I go to school tomorrow.', 'He play basketball next week', 'She plays piano tomorrow',
      'We cook dinner next Monday', 'I will play piano tomorrow', 'I am playing piano tomorrow',
      'I want to play piano tomorrow', 'I like piano tomorrow', 'I played piano tomorrow', 'I play piano today',
      'You go to park tomorrow', 'It rain tomorrow', 'I eat pizza tomorrow',
    ])};\n` +
    `console.log(JSON.stringify(cases.map(s => [s, f(s)])));\n`);
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', join(tmp, 'run.mjs')], { encoding: 'utf8' });
  rmSync(tmp, { recursive: true, force: true });
  let rows = [];
  try { rows = JSON.parse(r.stdout.trim().split('\n').pop()); } catch {}
  const get = (s) => (rows.find(x => x[0] === s) || [])[1];
  check('A-0 정본을 실행했다 (결과 행 28개)', rows.length === 28, (r.stderr || '').slice(0, 200));
  // 🔮 미래: 「현재형 + tomorrow/next 〇〇」 → will + 원형 (tag 는 verb_form)
  check('A-13 play piano tomorrow → will play (미래 핵심 사례)', get('I play piano tomorrow')?.now === 'I will play piano tomorrow');
  check('A-14 go → will go (to 가 있어도 장소 전치사라 막지 않는다)', get('I go to school tomorrow.')?.now === 'I will go to school tomorrow.');
  check('A-15 He play … next week → He will play (-s 없는 3인칭)', get('He play basketball next week')?.now === 'He will play basketball next week');
  check('A-16 She plays → She will play (-s 제거)', get('She plays piano tomorrow')?.now === 'She will play piano tomorrow');
  check('A-17 next Monday 도 미래 표현', get('We cook dinner next Monday')?.now === 'We will cook dinner next Monday');
  check('A-18 이미 will 이면 안 건드린다', get('I will play piano tomorrow') === null);
  check('A-19 진행형(am playing)은 안 건드린다', get('I am playing piano tomorrow') === null);
  check('A-20 want to 는 올바른 문장이라 안 건드린다', get('I want to play piano tomorrow') === null);
  check('A-21 like 는 상태 동사라 뜻을 바꾸지 않도록 안 건드린다', get('I like piano tomorrow') === null);
  check('A-22 과거형 + tomorrow 는 미래 보완 대상이 아니다', get('I played piano tomorrow') === null);
  check('A-23 today 는 미래 표현이 아니다', get('I play piano today') === null);
  check('A-24 It rain tomorrow 는 It 의 -s 없는 형도 안 건드린다 (rain 은 표에 없음)', get('It rain tomorrow') === null);
  check('A-25 eat → will eat (불규칙 원형)', get('I eat pizza tomorrow')?.now === 'I will eat pizza tomorrow');
  check('A-1 play → played (첫 턴, 핵심 사례)', get('I play soccer yesterday')?.now === 'I played soccer yesterday');
  check('A-2 go → went (to 가 있어도 막지 않는다)', get('I go to school yesterday')?.now === 'I went to school yesterday');
  check('A-3 eat → ate (불규칙)', get('I eat pizza yesterday')?.now === 'I ate pizza yesterday');
  check('A-4 cry → cried (y 앞 자음: ied)', get('She cry last night.')?.now === 'She cried last night.');
  check('A-5 과거 표현 밖의 문장은 안 건드린다', get('I play soccer every day') === null);
  check('A-6 부정문은 안 건드린다 (맞바꿈: 놓치는 쪽)', get("I didn't play yesterday") === null);
  check('A-7 조동사 have 가 있으면 안 건드린다', get('I have pizza yesterday') === null);
  check('A-8 이미 과거형이면 안 건드린다', get('I played soccer yesterday') === null);
  check('A-9 표에 없는 동사는 안 건드린다 (지어내지 않는다)', get('I flied yesterday') === null);
  check('A-10 빈 입력·한글 섞임은 null', get('') === null && get('안녕 yesterday') === null);
  const ok = rows.filter(x => x[1]).every(x => ['past_tense', 'verb_form'].includes(x[1].tag) && x[1].was !== x[1].now && /[가-힣]/.test(x[1].why_ko) && x[1].why_ko.length <= 200);
  check('A-11 모든 답은 과거(past_tense)·미래(verb_form) 태그·서로 다름·한글 설명·200자 이하', ok);
  check('A-12 was 는 학생 원문 그대로 (끝 문장부호 포함)', get('He play basketball yesterday!')?.was === 'He play basketball yesterday!');
}

// ═══════════ B. 배선 — 모델 fix 가 «없을 때만» 보완, 중국어는 제외 ═══════════
console.log('\nB. 서버 배선');
{
  const INDEX = readFileSync(join(SRC, 'index.ts'), 'utf8');
  const API_AI = readFileSync(join(SRC, 'api-ai.ts'), 'utf8');
  const a = INDEX.indexOf('const verified = verifyWarmupFix(rawFix || (ctxLang');
  check('B-1 index.ts 웜업 경로: 모델 fix 우선, 없을 때만 보완', a > 0);
  check('B-2 index.ts 웜업 경로: 중국어는 보완을 쓰지 않는다', a > 0 && INDEX.slice(a, a + 200).includes("ctxLang === 'zh' ? null"));
  check('B-3 api-ai.ts AI 친구 경로: 모델 fix 를 먼저 검증하고, 그게 안 되면 보완을 쓴다',
    API_AI.includes('verifyWarmupFix(rawFix, msg) || verifyWarmupFix(backfillPastTenseFix(msg), msg)'));
  check('B-4 보완 함수를 두 파일 모두 import', INDEX.includes("from './tense-backfill'") && API_AI.includes("from './tense-backfill'"));
  check('B-5 「모델 fix 를 덮어쓰지 않는다」: 보완이 rawFix 앞에 오지 않는다',
    !INDEX.includes('backfillPastTenseFix(studentInput) || rawFix') && !API_AI.includes('backfillPastTenseFix(msg) || rawFix'));
  check('B-6 카드 미표시 원인을 로그에 남긴다 (발화·교정 문장은 싣지 않음)',
    INDEX.includes("console.warn('[warmup-fix] no card:'") && !/console\.warn\('\[warmup-fix\][^;]*studentInput/.test(INDEX));
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
process.exit(fail ? 1 : 0);
