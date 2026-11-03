// 복습퀴즈(BTS/SIU·중국어) 결과 «획득 포인트» 칸이 서버가 준 점수를 «+N» 으로 끝내는가 (2026-11-03)
// — 한국어판: countUp 이 애니메이션 끝에 «+» 를 잃던 것 · 중국어판: 칸이 영원히 «+0» 이던 것.
import { readFileSync } from 'node:fs';
const KO = process.env.RQ_KO || 'cloudflare-deploy/public/review-quiz.html';
const CN = process.env.RQ_CN || 'cloudflare-deploy/public/review-quiz-cn.html';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('✅ ' + m); } else { fail++; console.log('❌ FAIL ' + m); } };
const ko = readFileSync(KO, 'utf8'), cn = readFileSync(CN, 'utf8');

// ① 한국어판: countUp 을 오려 내 가짜 시계로 끝까지 돌림
const i = ko.indexOf('function countUp(');
let body = '';
if (i >= 0) { let d = 0, j = ko.indexOf('{', i); for (let k = j; k < ko.length; k++) { if (ko[k] === '{') d++; else if (ko[k] === '}') { d--; if (!d) { body = ko.slice(i, k + 1); break; } } } }
ok(body.length > 0, '① countUp 을 오려 냈다');
const call = (ko.match(/countUp\(document\.getElementById\('rvPts'\)[^;]*;/) || [''])[0];
ok(!!call, '① rvPts 를 countUp 으로 채우는 줄이 있다');
for (const awarded of [30, 0, '20']) {
  const el = { textContent: '+0' };
  try {
    const t = { n: 0 };
    const fn = new Function('document', 'performance', 'requestAnimationFrame', 'r',
      body + '\n' + call);
    const q = [];
    fn({ getElementById: () => el }, { now: () => 0 }, (cb) => q.push(cb), { awarded });
    let now = 0; while (q.length && now < 5000) { now += 100; q.shift()(now); }
  } catch (e) { el.textContent = 'ERR ' + e.message; }
  ok(el.textContent === '+' + Number(awarded), '① 한국어판 끝 글자 = «+' + Number(awarded) + '» (실제 «' + el.textContent + '»)');
}
// 다른 countUp 호출(점수 등)은 «+» 를 안 붙인다 — 짝
const others = (ko.match(/countUp\([^;]*;/g) || []).filter(s => !s.includes('rvPts'));
ok(others.length > 0 && others.every(s => !/'\+'\s*\)\s*;/.test(s)), '① 점수 등 다른 countUp 에는 «+» 가 안 붙는다');

// ② 중국어판: 결과 템플릿이 서버 awarded 를 쓴다
const m = cn.match(/id="rvPts">([^<]*)</);
ok(!!m, '② 중국어판 rvPts 칸이 있다');
ok(!!m && !/^\+0$/.test(m[1]), '② 중국어판 칸이 «+0» 고정이 아니다');
for (const awarded of [30, 0, undefined]) {
  let out = '';
  try { out = new Function('r', "return '" + m[1] + "';")({ awarded }); } catch (e) { out = 'ERR'; }
  ok(out === '+' + (Number(awarded) || 0), '② 중국어판 awarded=' + awarded + ' → «' + out + '»');
}
console.log(`\n결과: PASS ${pass} / FAIL ${fail}`);
if (fail) process.exit(1);
