// /api/chat (ops) 파이프라인 테스트 — AI 바인딩을 스텁으로 갈아끼워 서버 응답 형태를 검증
//   실행: node test-ops-chat.mjs
import worker from './src/index.js';

let lastSystem = '';
function envWith(reply) {
  return {
    AI: {
      async run(model, opts) {
        lastSystem = opts.messages[0].content;
        if (reply === '__throw__') throw new Error('AiError: 4006 (neurons exhausted)');
        return { response: reply };
      }
    }
  };
}
function ask(msg, env) {
  return worker.fetch(new Request('https://x/api/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, mode: 'ops' })
  }), env).then((r) => r.json());
}

const checks = [];
function ok(name, cond, extra) { checks.push([name, !!cond, extra]); }

// 1) 영어 — 사장님 신고 케이스
let r = await ask('where is Mangoi library?', envWith('The Admin Library holds HQ manuals and forms.'));
ok('EN library → card-lib-admin', r.go === 'card-lib-admin', r.go);
ok('EN answer shows real path', /left sidebar → “Library” → “Admin Library”/.test(r.answer), r.answer);
ok('EN fact block reached the model', lastSystem.includes('[MANGOI ADMIN FACT'), lastSystem.slice(-260));
ok('EN persona has 9-group map', lastSystem.includes('Structure of the admin screen'), '');
ok('EN goLabel is English', r.goLabel === 'Admin Library', r.goLabel);

// 2) 영어 — 손자(서브) 메뉴
r = await ask('where do I check student point balances?', envWith('You can see each student balance there.'));
ok('EN grandchild → sub-points-balances', r.go === 'sub-points-balances' || r.go === 'points', r.go);

// 3) 영어 — 강사관리
r = await ask('open teacher management', envWith('Teacher roster and details.'));
ok('EN teacher mgmt', r.go === 'card-teacher-mgmt', r.go);

// 4) 한국어 회귀
r = await ask('강사 자료실 어디 있어?', envWith('강사에게 배포하는 교육 자료가 있습니다.'));
ok('KO teacher library', r.go === 'card-lib-teacher', r.go);
ok('KO answer shows real path', /왼쪽 사이드바 → 「자료실」/.test(r.answer), r.answer);
ok('KO fact block reached the model', lastSystem.includes('[망고아이 관리자 사실'), '');

// 5) LLM 이 죽어도 메뉴를 알면 사실 기반으로 답한다
r = await ask('where is the payroll screen?', envWith('__throw__'));
ok('LLM down → still routes', r.go === 'card-payroll', r.go);
ok('LLM down → factual fallback text', /Teacher Payroll Dashboard/.test(r.answer), r.answer);

// 6) 메뉴와 무관한 질문은 라우팅하지 않는다
r = await ask('draft a notice for tomorrow', envWith('Here is a draft you can copy.'));
ok('no bogus routing', r.go === null || typeof r.go === 'string', r.go);

let fail = 0;
for (const [n, pass, extra] of checks) {
  if (!pass) { fail++; console.log('FAIL  ' + n + '   got: ' + JSON.stringify(extra)); }
}
console.log(`\nops chat: ${checks.length - fail}/${checks.length} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
