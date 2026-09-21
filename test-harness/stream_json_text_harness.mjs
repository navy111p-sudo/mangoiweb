/* 스트리밍 JSON 본문 추출 (A-1a) — 생 JSON 이 학생 화면으로 새지 않는가.
 *
 * [왜 있나 — 2026-09-11]
 * 답변을 스트리밍으로 흘리려면 모델이 JSON 모드로 주는 «부분 JSON» 조각을 다뤄야 합니다.
 * 이 저장소는 그 자리에서 사고를 두 번 냈습니다 — 잘린 JSON 이 말풍선에 그대로(2026-09-08),
 * 파싱된 객체가 "[object Object]" 로(같은 날 저녁). 그래서 서버가 방패가 됩니다.
 *
 * 이 검사는 정본을 **실제로 돌립니다.** 그리고 스트리밍 파서의 핵심 계약인
 * **«어디서 쪼개 넣어도 같은 답»** 을 모든 분할 지점으로 전수 확인합니다
 * (문자열 검사로는 원리상 못 봅니다 — 함수도 값도 다 «있고» 틀린 것은 «무슨 답이 나오는가» 뿐).
 */
import { readFileSync } from 'node:fs';

const TS = readFileSync(new URL('../cloudflare-deploy/src/stream-json-text.ts', import.meta.url), 'utf8');

let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? ' — ' + extra : '')); }
};

/* 타입 제거는 «이름» 이 아니라 «자리» 로 — 정본에 새 타입이 생겨도 검사가 사라지지 않게. */
const js = TS
  .replace(/^export type [\s\S]*?^};$/gm, '')
  .replace(/:\s*Record<string,\s*string>/g, '')
  .replace(/:\s*JsonTextTap(?=\s*[{;])/g, '')
  .replace(/:\s*\{ out: string\[\]; rest: string \}/g, '')
  .replace(/\(key:\s*string\)/g, '(key)')
  .replace(/\(chunk:\s*string\)\s*:\s*string/g, '(chunk)')
  .replace(/\(buf:\s*string,\s*maxRun\s*=\s*160\)/g, '(buf, maxRun = 160)')
  .replace(/let state:\s*'seek' \| 'in' \| 'end'/g, 'let state')
  .replace(/const out:\s*string\[\]/g, 'const out')
  .replace(/^export /gm, '');

let M = null;
try {
  M = await import('data:text/javascript;base64,' +
    Buffer.from(js + '\nexport { createJsonTextTap, takeSentences };').toString('base64'));
} catch (e) { ok('정본을 오려 내 실행할 수 있다', false, String(e && e.message)); }
ok('정본을 오려 내 실행할 수 있다 (전제)', !!(M && M.createJsonTextTap && M.takeSentences));

if (M) {
const { createJsonTextTap, takeSentences } = M;

/** 문자열을 조각 목록으로 넣고 나온 글자를 모읍니다. */
function run(parts, key = 'reply') {
  const tap = createJsonTextTap(key);
  let got = '';
  for (const p of parts) got += tap.push(p);
  return { got, tap };
}
/** 모든 «한 곳 분할» 로 쪼개 넣어도 같은 답인지. */
function everySplit(whole, key = 'reply') {
  const base = run([whole], key).got;
  for (let i = 1; i < whole.length; i++) {
    const r = run([whole.slice(0, i), whole.slice(i)], key).got;
    if (r !== base) return { okAll: false, at: i, base, r };
  }
  return { okAll: true, base };
}

console.log('\n① 본문만 나오는가 — JSON 구조 문자는 «구조적으로» 못 나옵니다');

const j1 = '{"reply":"Hi! How are you today?","fix":{"was":"I go","now":"I went"}}';
const r1 = run([j1]);
ok('reply 본문을 그대로 꺼낸다', r1.got === 'Hi! How are you today?', JSON.stringify(r1.got));
ok('중괄호가 안 나온다', !/[{}]/.test(r1.got));
ok('키 이름(fix·was·now)이 안 나온다', !/\b(fix|was|now|reply)\b/.test(r1.got));
ok('값이 닫히면 ended', r1.tap.ended());

console.log('\n② 어디서 쪼개 넣어도 같은 답 (전수)');

for (const [label, s] of [
  ['평범한 답', j1],
  ['이스케이프 따옴표', '{"reply":"She said \\"hi\\" to me.","fix":null}'],
  ['줄바꿈·탭', '{"reply":"Line one.\\nLine two.\\tEnd.","fix":null}'],
  ['유니코드 이스케이프', '{"reply":"Caf\\u00e9 time!","fix":null}'],
  ['앞에 다른 키', '{"level":"S3","reply":"Second key works.","fix":null}'],
  ['공백 많음', '{  "reply"  :  "Spaced out." , "fix": null }'],
]) {
  const e = everySplit(s);
  ok(`전수 분할 — ${label}`, e.okAll, e.okAll ? '' : `분할 ${e.at}: ${JSON.stringify(e.r)} ≠ ${JSON.stringify(e.base)}`);
}

console.log('\n③ 이스케이프가 제대로 풀리는가');
ok('\\" → 따옴표', run(['{"reply":"say \\"hi\\" ok","x":1}']).got === 'say "hi" ok');
ok('\\n → 줄바꿈', run(['{"reply":"a\\nb","x":1}']).got === 'a\nb');
ok('\\u00e9 → é', run(['{"reply":"Caf\\u00e9","x":1}']).got === 'Café');
/* 조각 경계에서 잘린 이스케이프를 그대로 내보내면 깨진 글자가 됩니다. */
ok('조각 경계에서 잘린 \\uXXXX 도 온전하다', run(['{"reply":"Caf\\u0', '0e9 ok","x":1}']).got === 'Café ok');
ok('조각 경계에서 잘린 \\" 도 온전하다', run(['{"reply":"a\\', '" b","x":1}']).got === 'a" b');

console.log('\n④ 속지 않는가');
/* 값 «안» 에 키와 같은 글자가 있어도 그것을 키로 오인하면 본문이 잘립니다. */
const tricky = '{"topic":"about \\"reply\\" words","reply":"Real answer here.","fix":null}';
/* ⚠️ 위 fixture 는 «이스케이프된» 따옴표라 키 탐색 분기를 한 번도 안 탑니다 —
   변이시험에서 「값 밖에서도 내보내기」가 그대로 통과해 드러났습니다(2026-09-11).
   배열 안의 같은 이름은 뒤에 «:» 가 아니라 «,» 가 와서 그 분기를 실제로 지납니다. */
const arrKey = '{"tags":["reply","fix"],"reply":"Real answer here.","x":1}';
ok('값 안의 같은 글자에 안 속는다', run([tricky]).got === 'Real answer here.', JSON.stringify(run([tricky]).got));
ok('전수 분할에서도 안 속는다', everySplit(tricky).okAll);
ok('배열 안의 같은 키 이름에 안 속는다', run([arrKey]).got === 'Real answer here.', JSON.stringify(run([arrKey]).got));
ok('그때도 JSON 구조 문자가 안 나온다', !/[{}[\]":,]/.test(run([arrKey]).got), JSON.stringify(run([arrKey]).got));
ok('배열 fixture 도 전수 분할에서 같은 답', everySplit(arrKey).okAll);
/* 모델이 평문을 주면 «아무것도» 안 나와야 부르는 쪽이 폴백을 압니다. */
const plainR = run(['Hello, I am just plain text with no JSON at all.']);
ok('평문이면 한 글자도 안 내보낸다', plainR.got === '', JSON.stringify(plainR.got));
ok('평문이면 found() 가 거짓 (폴백 신호)', !plainR.tap.found());
/* 잘린 스트림(닫는 따옴표가 영영 안 옴) — 있는 데까지는 내보내되 ended 는 거짓 */
const cut = run(['{"reply":"This got cut off mid']);
ok('잘린 스트림도 있는 데까지 내보낸다', cut.got === 'This got cut off mid');
ok('잘린 스트림은 ended 가 거짓', !cut.tap.ended());

console.log('\n⑤ 문장 단위로 자르는가 — ⛔ 토큰 단위 합성은 소리가 깨집니다');
const t1 = takeSentences('Hello there. How are you? I am fine! And then');
ok('완성된 문장만 꺼낸다', JSON.stringify(t1.out) === JSON.stringify(['Hello there.', 'How are you?', 'I am fine!']), JSON.stringify(t1.out));
ok('덜 끝난 꼬리는 남긴다', t1.rest.trim() === 'And then', JSON.stringify(t1.rest));
ok('소수점에서 안 자른다', takeSentences('It costs 3.14 dollars today').out.length === 0);
ok('약어에서 안 자른다', takeSentences('Mr. Kim is here').out.length === 0);
ok('닫는 따옴표를 문장에 포함한다', takeSentences('She said "hi." Then left.').out[0] === 'She said "hi."',
   JSON.stringify(takeSentences('She said "hi." Then left.').out));
/* 문장부호가 영영 안 오는 답에서 한 문장도 못 내보내면 스트리밍이 통째로 헛돕니다. */
const longNoPunct = 'word '.repeat(60);
const t2 = takeSentences(longNoPunct);
ok('문장부호가 없어도 길어지면 내보낸다', t2.out.length === 1, JSON.stringify(t2.out.length));
ok('그때 낱말 가운데를 자르지 않는다', t2.out.length === 1 && /word$/.test(t2.out[0]), JSON.stringify(t2.out[0] || '').slice(-20));
/* 자른 것 + 남은 것 = 원본 (글자를 잃지 않는가) */
const src = 'One. Two! Three? Leftover tail';
const t3 = takeSentences(src);
ok('자른 것과 남은 것을 합치면 원본과 같다',
   (t3.out.join(' ') + ' ' + t3.rest.trim()).replace(/\s+/g, ' ').trim() === src.replace(/\s+/g, ' ').trim());
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
