/* ══════════════════════════════════════════════════════════════════════════
   🈲 AI 학습 리포트 — 학부모에게 가는 글에 한자가 섞이지 않는가

   왜 있나 (2026-08-09): 첫 실제 샘플의 문법 교정 사유가
     «과거의 완료된 행동을 나타내는 过去형을 사용해야 합니다»
   였다. Llama 가 한국어를 쓰다 중국어 글자를 흘린 것이고, 이 글은 평가서로
   저장돼 **그대로 학부모에게 발송된다.** 프롬프트에 «한글만» 을 못 박았지만
   LLM 지시는 확률이라 보장이 아니다 → api-lessons.ts 에 거르는 층을 뒀다.

   이 하니스는 그 «거르는 층» 을 api-lessons.ts 에서 **직접 오려내 실행**한다.
   따로 베껴 쓰면 베낀 것을 검증하게 되므로 의미가 없다.
   ══════════════════════════════════════════════════════════════════════════ */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from '../cloudflare-deploy/node_modules/typescript/lib/typescript.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC  = path.join(ROOT, 'cloudflare-deploy/src/api-lessons.ts');

const out = [];
let pass = 0, fail = 0;
const ok  = (t, d) => { pass++; out.push(`  ✅ ${t}${d ? ' — ' + d : ''}`); };
const bad = (t, d) => { fail++; out.push(`  ❌ ${t}${d ? ' — ' + d : ''}`); };

console.log('════════ AI 학습 리포트 · 한국어 전용 가드 ════════');

const src = fs.readFileSync(SRC, 'utf8');

// ── ① 거르는 층을 소스에서 오려내 실제로 돌린다 ──
const from = src.indexOf('const HANJA_KO');
const to   = src.indexOf('parsed.summary_ko = deHanja');
if (from < 0 || to < 0) {
  bad('거르는 층(HANJA_KO·deHanja)이 api-lessons.ts 에 없음', '삭제됐거나 이름이 바뀜');
} else {
  const block = src.slice(from, to);
  const js = ts.transpileModule(block + '\nexport { deHanja, deHanjaList, ideographs };',
    { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = {};
  new Function('exports', 'console', js)(mod, { warn(){} });
  const { deHanja, deHanjaList } = mod;

  // 실제로 나왔던 문장
  const real = '과거의 완료된 행동을 나타내는 过去형을 사용해야 합니다';
  const got  = deHanja(real);
  /[㐀-䶿一-鿿豈-﫿]/.test(got)
    ? bad('실제 사고 문장에 한자가 남음', got)
    : ok('실제 사고 문장이 한글로 바뀜', got);
  got.includes('과거형') ? ok('의미가 살아 있음', '过去형 → 과거형')
                         : bad('글자만 지워 뜻이 깨짐', got);

  // 표에 있는 말들
  for (const [cn, ko] of [['时制','시제'], ['冠词','관사'], ['动词','동사'], ['语法','문법'], ['发音','발음']]) {
    const r = deHanja(`${cn}를 확인하세요`);
    r === `${ko}를 확인하세요` ? ok(`${cn} → ${ko}`) : bad(`${cn} 치환 실패`, r);
  }

  // 표에 없는 글자 — 지우더라도 한자는 절대 남기지 않는다
  const unknown = deHanja('이것은 龘龗 같은 희귀 글자입니다');
  /[㐀-䶿一-鿿豈-﫿]/.test(unknown)
    ? bad('표에 없는 한자가 그대로 통과함', unknown)
    : ok('표에 없는 한자도 제거됨', unknown);

  // 🪤 /g 정규식 lastIndex 함정 — 같은 검사를 연달아 해도 계속 잡아야 한다
  let leaked = null;
  for (let i = 0; i < 5; i++) {
    const r = deHanja('过去형 연습');
    if (/[一-鿿]/.test(r)) { leaked = `${i + 1}번째 호출: ${r}`; break; }
  }
  leaked ? bad('연속 호출 중 한자가 샜다 (lastIndex 함정)', leaked)
         : ok('연속 5회 호출에도 안 샘', 'test() 대신 match() 를 쓰고 있다');

  // 한자가 없는 문장은 손대지 않는다
  const clean = '문장 끝을 조금 길게 늘여 읽으면 훨씬 자연스럽게 들립니다';
  deHanja(clean) === clean ? ok('멀쩡한 한국어는 그대로') : bad('멀쩡한 문장이 변형됨', deHanja(clean));

  // ⛔ 영어 칸은 건드리면 안 된다 (교정 원문이 망가진다)
  const ge = deHanjaList([{ original: 'I go to the beach', corrected: 'I went to the beach',
                            reason: '过去형을 써야 합니다' }], ['reason']);
  ge[0].original === 'I go to the beach' && ge[0].corrected === 'I went to the beach'
    ? ok('영어 칸(original·corrected)은 그대로 둔다')
    : bad('영어 교정 원문이 변형됨', JSON.stringify(ge[0]));
  /[一-鿿]/.test(ge[0].reason) ? bad('reason 에 한자가 남음', ge[0].reason)
                                       : ok('reason 만 한글로 정리됨', ge[0].reason);

  // 문자열 배열(strengths·weaknesses)도 걸러져야 한다
  const ws = deHanjaList(['过去형 연습이 필요합니다', '멀쩡한 문장'], []);
  /[一-鿿]/.test(ws.join(' ')) ? bad('문자열 배열이 안 걸러짐', ws.join(' | '))
                                       : ok('문자열 배열도 걸러짐', ws[0]);
}

// ── ② 프롬프트가 두 규칙을 실제로 지시하는가 ──
const p = src.slice(src.indexOf('You are an expert English coach'), src.indexOf('let raw ='));
/pure Korean \(Hangul\) only/i.test(p) ? ok('프롬프트: 한글 전용 지시 있음') : bad('프롬프트에 한글 전용 지시가 없음');
/Never use Chinese characters/i.test(p) ? ok('프롬프트: 한자 금지 명시')       : bad('한자 금지 문구가 없음');
p.includes('다음에 더 잘할 수 있는 것')
  ? ok('프롬프트: weaknesses 를 «다음에 더 잘할 수 있는 것» 으로 지시')
  : bad('weaknesses 가 아직 «약점» 어조', '학부모에게 그대로 발송된다');
/보완할 점/.test(p) ? ok('프롬프트가 실제 화면 제목(보완할 점)을 알려 줌') : bad('화면 제목 맥락이 프롬프트에 없음');
/✗[\s\S]{0,200}✓/.test(p) ? ok('프롬프트: 나쁜 예/좋은 예를 함께 줌') : bad('예시가 없어 톤 지시가 추상적');

// ── ③ 앞 6000자만 보던 손실이 되살아나지 않았는가 ──
//    🪤 주석에 «예전엔 transcript.slice(0, 6000) 하나였다» 라고 적혀 있다.
//       소스를 통째로 grep 하면 그 인용문에 걸려 멀쩡한 코드를 실패로 잡는다(실제로 밟음).
//       → 주석을 걷어내고 «코드» 만 본다.
const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
/transcript\.slice\(0,\s*6000\)/.test(codeOnly)
  ? bad('LLM 프롬프트가 다시 앞 6000자만 본다', '45분 수업의 뒤 5/6 이 버려진다')
  : ok('transcript.slice(0, 6000) 없음', '주석 인용문은 제외하고 검사');
/LLM_BUDGET/.test(src) ? ok('앞·중간·뒤 샘플링(LLM_BUDGET) 있음') : bad('LLM_BUDGET 샘플링이 사라짐');

console.log(out.join('\n'));
console.log('──────────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
if (fail) { console.log('학부모에게 한자가 섞인 글이 나갈 수 있습니다.'); process.exit(1); }
console.log('🎉 학부모에게 가는 글은 한글 전용 · 보완점은 성장 어조.');
