// 🔁 Whisper 반복 환각(「oah, oah, oah …」) 거르기 — 2026-10-02 사장님 제보
//   판정 함수를 실제로 돌리고, 서버 배선(turbo·폴백 둘 다)과 화면 안내를 함께 본다.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const P = (p) => path.join(ROOT, 'cloudflare-deploy', p);
let pass = 0, fail = 0;
const ok = (name, cond, info = '') => { if (cond) { pass++; console.log('  ✅ ' + name); } else { fail++; console.log('  ❌ FAIL ' + name + (info ? ' — ' + info : '')); } };

const { isSttRepeatLoop: f } = await import('file://' + P('src/stt-loop.ts').replace(/\\/g, '/'));
console.log('\n[ ① 반복 환각은 잡는다 ]');
ok('사장님 화면 그대로(oah, × 60)', f('oah, '.repeat(60)));
ok('두 낱말 되풀이(oh yeah …)', f('oh yeah '.repeat(12)));
ok('한자 한 글자 되풀이', f('好'.repeat(30)));
ok('같은 낱말 6번 연달아', f('the the the the the the'));
console.log('\n[ ② 진짜 말은 안 잡는다 (짝) ]');
ok('no no no no (4번)', !f('no no no no'));
ok('I like it × 3', !f('I like it. I like it. I like it.'));
ok('평범한 문장', !f('Yes, I like coffee very much.'));
ok('평범한 중국어', !f('我喜欢吃苹果和香蕉'));
ok('긴 나열 문장', !f('I like pizza and I like chicken and I like cake too'));
ok('빈 값·null 에 안 죽는다', !f('') && !f(null) && !f(undefined));

console.log('\n[ ③ 배선 ]');
const G = readFileSync(P('src/api-games.ts'), 'utf8');
ok('api-games 가 정본을 import 한다', /import \{ isSttRepeatLoop \} from '\.\/stt-loop'/.test(G));
ok('turbo 결과를 거른다', /if \(ttRaw && isSttRepeatLoop\(ttRaw\)\)/.test(G));
ok('구 whisper 폴백도 거른다 (짝)', /if \(isSttRepeatLoop\(baseText\)\)/.test(G));
ok('거르면 text 를 비워서 돌려준다', (G.match(/text: '', dropped: 'repeat_loop'/g) || []).length === 2);
const H = readFileSync(P('public/warmup.html'), 'utf8');
ok('웜업이 «들렸는데 빈 글자» 를 사람에게 말한다', /if\(!said && heard && !errored\) addMsg\(/.test(H));
ok('오류 안내와 겹쳐 두 번 말하지 않는다 (짝)', /errored=true; var r = info && info\.reason;/.test(H));

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
