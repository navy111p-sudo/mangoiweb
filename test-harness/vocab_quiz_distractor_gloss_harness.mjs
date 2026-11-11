// AI 단어 퀴즈 오답 보기에 «문장»(안내문)이 새지 않는가 — 2026-11-09 사장님 화면 실사고.
// 정본 isShortGloss(src/korean-vocab.ts)를 오려 내 실제로 돌리고, gen-quiz 가 오답 풀에 그것을 쓰는지 본다.
import { readFileSync } from 'node:fs';
const root = new URL('../cloudflare-deploy/src/', import.meta.url);
const kv = readFileSync(new URL('korean-vocab.ts', root), 'utf8');
const ml = readFileSync(new URL('api-games-microlearn.ts', root), 'utf8');
let pass = 0, fail = 0;
const ok = (n, c) => { if (c) { pass++; console.log('  ✅', n); } else { fail++; console.log('  ❌ FAIL', n); } };

const i = kv.indexOf('export function isShortGloss(');
ok('정본 isShortGloss 가 있다', i >= 0);
let fn = null;
if (i >= 0) {
  const open = kv.indexOf('{', kv.indexOf(')', i));
  let d = 0, j = open;
  for (; j < kv.length; j++) { if (kv[j] === '{') d++; else if (kv[j] === '}') { d--; if (!d) break; } }
  const body = kv.slice(open + 1, j);
  try { fn = new Function('value', body); } catch (e) { console.log('  compile error', e.message); }
}
ok('정본을 오려 냈다', typeof fn === 'function');
const run = (v) => { try { return fn(v); } catch { return 'ERR'; } };
const BAD = [
  '휴대폰·태블릿·PC 모두 돼요. 크롬(Chrome)이나 엣지(Edge)를 추천해요. 앱 설치는 필요 없어요.',
  '이 문장은 정말로 아주 길어서 단어 뜻으로는 쓸 수 없는 안내 문장입니다',
  '정말요?', '잘했어!', '첫 줄\n둘째 줄', '',
];
const GOOD = ['더 크다', '학교', '책', '~에 대해 걱정하다', '상자', '풍미가 풍부한', '(돈을) 쓰다'];
for (const b of BAD) ok('막는다: ' + JSON.stringify(b).slice(0, 30), run(b) === false);
for (const g of GOOD) ok('통과: ' + g, run(g) === true);

// 배선: gen-quiz 오답 풀이 그 판정을 실제로 쓰는가(주석 벗긴 사본)
const live = ml.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const m = live.match(/const pool = \[\.\.\.distractors, \.\.\.myDistractors\]\.filter\(([^;]*)\);/);
ok('gen-quiz 오답 풀을 찾았다', !!m);
ok('오답 풀이 isShortGloss 로 거른다', !!m && /isShortGloss\(\s*d\s*\)/.test(m[1]) && !/false\s*&&|\|\|\s*true/.test(m[1]));
ok('정답 보기에는 걸지 않는다(학생 뜻 존중)', !/isShortGloss\(\s*w\.korean/.test(live));
ok('import 가 있다', /import \{[^}]*isShortGloss[^}]*\} from '\.\/korean-vocab'/.test(ml));

console.log(`결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
