#!/usr/bin/env node
/* 🧑 AI 가 학생을 아이디로 부르지 않는가 — 2026-11-01 「Yay, ysyt01!」 제보
   EN: The AI must call a student by name, never by login ID.

   ① 정본 src/student-call-name.ts 를 «실제로 돌려» 답을 본다(문자열 검사 아님).
      «이름이 나온다» 와 «아이디는 안 나온다» 를 짝으로 둔다 — 한쪽만 보면 «항상 빈 값» 이나
      «항상 english_name» 같은 엉터리 수리도 통과한다.
   ② api-ai.ts 의 AI 영어친구가 그 정본을 «실제로 쓰는가»(옛 english_name 직접 사용으로 되돌리지 않았나).
*/
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = resolve(ROOT, 'cloudflare-deploy/src');
const rd = p => readFileSync(p, 'utf8');

let pass = 0, fail = 0;
const ok = (cond, label) => { if (cond) { pass++; console.log('  ✅ ' + label); } else { fail++; console.log('  ❌ ' + label); } };

/* 정본 로드 */
const js = stripTypeScriptTypes(rd(resolve(SRC, 'student-call-name.ts')));
const mod = await import('data:text/javascript;base64,' + Buffer.from(js).toString('base64'));
const { studentCallName, scrubLoginId, looksLikeLoginId, isLatinName } = mod;

console.log('① 학생을 부를 이름 — 정본을 실제로 돌림');
ok(studentCallName({ english_name: 'Amy', korean_name: '김민서' }, 'ysyt01') === 'Amy', '영어 이름이 있으면 영어 이름');
ok(studentCallName({ english_name: '', korean_name: '김민서' }, 'ysyt01') === '김민서', '영어 이름이 비면 한글 이름');
ok(studentCallName({ english_name: 'ysyt01', korean_name: '김민서' }, 'ysyt01') === '김민서', '영어 이름 칸에 아이디 → 한글 이름 (사고 형태)');
ok(studentCallName({ english_name: 'YSYT01', korean_name: '' }, 'ysyt01') === '', '대소문자만 다른 아이디도 이름이 아니다');
ok(studentCallName({ english_name: 'ysyt01', korean_name: 'ysyt01' }, 'ysyt01') === '', '두 칸 다 아이디면 빈 값 (아이디로 폴백 금지)');
ok(studentCallName({ english_name: 'lt18', korean_name: '' }, 'abc') === '', '다른 아이디 모양 값(lt18)도 버린다');
ok(studentCallName(null, 'ysyt01') === '', '학생 행이 없으면 빈 값');
ok(studentCallName({ english_name: '  Mary   Jane ', korean_name: '' }, 'x') === 'Mary Jane', '공백 정리');
ok(studentCallName({ english_name: 'A'.repeat(60) }, 'x').length === 40, '40자로 자름');
ok(studentCallName({ english_name: '', korean_name: '김민서' }, 'x', { latinOnly: true }) === '', 'AI 영어친구(latinOnly): 한글 이름만 있으면 빈 값(답장의 한글은 지워진다)');
ok(studentCallName({ english_name: 'Amy', korean_name: '김민서' }, 'x', { latinOnly: true }) === 'Amy', 'latinOnly: 로마자 이름은 그대로');
ok(studentCallName({ english_name: 'ysyt01', korean_name: '김민서' }, 'ysyt01', { latinOnly: true }) === '', 'latinOnly: 사고 형태(아이디+한글) → 이름 없이');
ok(isLatinName("Mary-Jane O'Neil") && !isLatinName('김민서') && !isLatinName('Amy김'), '로마자 이름 판정');
ok(looksLikeLoginId('abc01') && looksLikeLoginId('민서01') && !looksLikeLoginId('Amy') && !looksLikeLoginId('김민서'), '아이디 모양 판정');

console.log('② 지난 대화 속 아이디 지우기');
ok(scrubLoginId('Yay, ysyt01! Nice sentence!', 'ysyt01', 'Amy') === 'Yay, Amy! Nice sentence!', '답장 속 아이디 → 이름');
ok(scrubLoginId('Hi YSYT01.', 'ysyt01', 'friend') === 'Hi friend.', '대소문자 무시');
ok(scrubLoginId('ysyt012 is here', 'ysyt01', 'Amy') === 'ysyt012 is here', '더 긴 낱말의 일부는 안 건드림');
ok(scrubLoginId('Great job!', 'ysyt01', 'Amy') === 'Great job!', '아이디가 없으면 그대로');
ok(scrubLoginId('a.b says hi', 'a.b', 'X') === 'X says hi' && scrubLoginId('axb says hi', 'a.b', 'X') === 'axb says hi', '아이디 속 정규식 글자를 그대로 비교');

console.log('③ AI 영어친구가 정본을 실제로 쓰는가');
const api = rd(resolve(SRC, 'api-ai.ts'));
const start = api.indexOf("path === '/api/ai/chat-friend'");
const block = api.slice(start, start + 60000);
ok(start > 0, 'chat-friend 라우트를 찾음');
ok(/callName\s*=\s*studentCallName\(\s*st\s*,\s*uid\s*,\s*\{\s*latinOnly:\s*true\s*\}\s*\)/.test(block), '이름을 studentCallName(st, uid, { latinOnly: true }) 로 만든다');
ok(/const sname = callName;/.test(block), '프롬프트 이름(sname)이 그 값이다');
ok(!/String\(st\?\.english_name\s*\|\|/.test(block), '옛 english_name 직접 사용으로 되돌리지 않았다');
ok(/scrubLoginId\(h\.content,\s*uid,/.test(block), '지난 답장 속 아이디를 지운 사본을 모델에 준다');
ok(/Never call them by (any|a) username or login ID/.test(block), '프롬프트가 아이디로 부르지 말라고 말한다');
ok(/\belse parts\.push\(`You do not know their name[^`]*never make up a name/.test(block), '이름이 없으면 «이름 없이·지어내지 말 것» 지시가 살아 있다(샌드박스 앵무새는 지시를 안 읽어 이것만은 여기서 본다)');

console.log('④ 무작위 1만 건 — 정본과 «독립 오라클» 대조(씨앗 고정)');
{
  let seed = 424242;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const pick = a => a[Math.floor(rnd() * a.length)];
  const L = 'abcdefghijklmnopqrstuvwxyz';
  const word = () => Array.from({ length: 1 + Math.floor(rnd() * 7) }, () => pick(L)).join('');
  const mkUid = () => pick([() => word() + Math.floor(rnd() * 100), () => 'lt' + Math.floor(rnd() * 999), () => word(), () => word() + '.' + word(), () => word() + '_' + Math.floor(rnd() * 9)])();
  const vary = s => pick([s, s.toUpperCase(), ' ' + s + ' ', s[0] ? s[0].toUpperCase() + s.slice(1) : s]);
  const val = uid => pick([() => vary(uid), () => pick(['Amy', 'Mary Jane', "O'Neil", 'Leo', 'Ann-Marie']), () => pick(['김민서', '박지우']), () => '', () => null, () => undefined, () => word() + Math.floor(rnd() * 99), () => 'Amy' + '김', () => '  ' + pick(['Amy', 'Noah']) + '   x', () => 'A'.repeat(45)])();
  const oracle = (uid, en, ko, latin) => {
    for (const v of [en, ko]) {
      const n = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, 40).trim();
      if (!n || n.toLowerCase() === String(uid).trim().toLowerCase()) continue;
      if (/[0-9]/.test(n) && /[A-Za-z가-힣]/.test(n)) continue;
      if (latin && !/^[A-Za-z][A-Za-z .'-]*$/.test(n)) continue;
      return n;
    }
    return '';
  };
  const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let bad = 0, leak = 0, scrubBad = 0, first = null;
  for (let i = 0; i < 10000; i++) {
    const uid = mkUid(), en = val(uid), ko = val(uid), latin = rnd() < 0.5;
    const got = studentCallName({ english_name: en, korean_name: ko }, uid, { latinOnly: latin });
    const want = oracle(uid, en, ko, latin);
    if (got !== want) { bad++; if (!first) first = { uid, en, ko, latin, got, want }; }
    if (got && got.toLowerCase() === uid.toLowerCase()) leak++;
    // 지운 뒤에는 아이디 낱말이 남지 않는다(대체어가 아이디를 품지 않는 한)
    const line = `Yay, ${vary(uid).trim()}! I like ${uid}.`;
    const out = scrubLoginId(line, uid, 'Amy');
    if (uid.length >= 3 && new RegExp('(^|[^A-Za-z0-9_])' + esc(uid) + '(?![A-Za-z0-9_])', 'i').test(out)) { scrubBad++; if (!first) first = { uid, line, out }; }
  }
  ok(bad === 0, `정본 = 독립 오라클 (1만 건, 불일치 ${bad})` + (first ? ' ' + JSON.stringify(first) : ''));
  ok(leak === 0, `아이디가 이름으로 나온 경우 0 (실측 ${leak})`);
  ok(scrubBad === 0, `지난 답장에서 아이디가 남은 경우 0 (실측 ${scrubBad})`);
}

console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
