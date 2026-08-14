/* ═══════════════════════════════════════════════════════════════
   vc_review_quiz_class_block_harness.mjs
   사장님 방침 (2026-08-14):
     「복습퀴즈는 학생이 «혼자» 하는 거야. 수업시간에 하는 게 아니야.」
     「수업시간에 복습퀴즈 켜면 "수업시간에는 안됩니다." 를 영어와 한국어로 적절한 곳에」

   이 하니스가 지키는 것 — 규칙이 조용히 되돌아가지 않게 한다:
     ① 수업 중 판정이 게임·웜업과 «같은 기준» 인가 (참가자 2명 이상 + 수업 화면 안)
     ② 강사·학생을 가리지 않고 막는가 (시간의 문제이지 사람의 문제가 아니다)
     ③ 차단 문구가 한/영 둘 다인가
     ④ 도구 바까지 감추는가 (남기면 「🤖 이 수업 맞춤 퀴즈」 가 차단 화면 위에서 그대로 눌린다)
     ⑤ 이미 열어 둔 학생도 강사가 들어오면 즉시 잠기는가 (updateUserCount)
     ⑥ 받는 쪽(quiz-share)도 막는가 — 옛 캐시를 문 강사 화면이 학생을 끌어들이는 길
     ⑦ ⛔ 수업 «밖» 혼자 풀기는 한 글자도 안 바뀌었는가 (그것이 복습퀴즈의 정본 경로다)
   ═══════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');
const main = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8');
const html = readFileSync(join(PUB, 'index.html'), 'utf8');

let pass = 0, fail = 0;
const failures = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ❌ ' + n + (d ? '\n       ' + d : '')); }
};

console.log('\n════════ 복습퀴즈는 수업시간에 열리지 않는다 ════════\n');

/* ── ① 판정 ─────────────────────────────────────────────── */
console.log('▶ ① 수업 중 판정 — 게임·웜업과 같은 기준인가');
const s = main.indexOf('function _rqvClassBlocked()');
const e = main.indexOf('function _rqvRenderBlocked()', s);
const blk = s >= 0 && e > s ? main.slice(s, e) : '';
check('_rqvClassBlocked 를 찾았다', blk.length > 60);

if (blk.length > 60) {
  /* 판정식을 실제로 실행한다 — «있다» 가 아니라 «그렇게 동작한다» 를 값으로 확인 */
  const run = (inCall, count) => {
    const sandbox = {
      document: { body: { classList: { contains: (c) => c === 'vc-in-call' ? inCall : false } } },
      _gameIsClassActive: () => count >= 2,
    };
    vm.createContext(sandbox);
    vm.runInContext(blk + '\nthis.__out = _rqvClassBlocked();', sandbox, { timeout: 2000 });
    return sandbox.__out;
  };
  check('수업 화면 + 2명 → 막는다', run(true, 2) === true);
  check('수업 화면 + 3명 → 막는다', run(true, 3) === true);
  check('수업 화면인데 «혼자» → 안 막는다 (수업 전·후)', run(true, 1) === false,
        '혼자 남았으면 수업이 아니다 — 게임·웜업과 같은 규칙');
  check('⛔ 수업 화면 «밖» 은 절대 안 막는다 (학생 사이드바 단독 풀기)', run(false, 5) === false,
        '이걸 막으면 복습퀴즈의 정본 경로가 통째로 죽는다');
}

/* ── ② 사람을 가리지 않는가 ──────────────────────────────── */
console.log('\n▶ ② 강사·학생을 가리지 않는가 (시간의 문제이지 사람의 문제가 아니다)');
check('⛔ 역할(vcMyRole·isStaff)로 예외를 두지 않았다',
      !/vcMyRole|IsStaff|isTeacher/i.test(blk),
      '강사만 열리게 두면 강사가 수업 중에 열어 학생을 끌어들이는 길(quiz-share)이 남는다');

/* ── ③ 문구 한/영 ────────────────────────────────────────── */
console.log('\n▶ ③ 「수업시간에는 안 됩니다」 가 한/영 둘 다인가');
const rs = main.indexOf('function _rqvRenderBlocked()');
const re = main.indexOf('function _rqvClearBlocked()', rs);
const rblk = rs >= 0 && re > rs ? main.slice(rs, re) : '';
check('_rqvRenderBlocked 를 찾았다', rblk.length > 200);
check('한국어 — «수업시간에는 안 됩니다»', /수업시간에는 안 됩니다/.test(rblk), '사장님이 지정한 문구');
check('영어 — «Not available during class»', /Not available during class/.test(rblk));
check('왜 안 되는지 한국어로 설명한다 (혼자 · 수업 후)', /수업이 끝난 뒤 학생이 혼자/.test(rblk));
check('왜 안 되는지 영어로도 설명한다', /alone after class/.test(rblk));
check('어디서 열면 되는지 알려 준다 (한/영)',
      /수업이 끝나면 학생 화면/.test(rblk) && /After class ends/.test(rblk),
      '막기만 하고 길을 안 알려 주면 문의가 그대로 남는다');
check('data-ko / data-en 을 짝으로 단다 (i18n 스윕 대상)',
      (rblk.match(/data-ko="/g) || []).length >= 3 && (rblk.match(/data-en="/g) || []).length >= 3);
check('🌐 지금 언어를 직접 한 번 맞춘다 (스윕이 이미 지나갔을 수 있다)',
      /getLang\(\) === 'en'/.test(rblk) && /data-ko\]\[data-en\]/.test(rblk),
      '만들어지는 시점이 스윕보다 늦으면 영어 강사에게 한국어가 남는다');

/* ── ④ 도구 바까지 감추는가 ───────────────────────────────── */
console.log('\n▶ ④ 퀴즈 본문·현황·도구 바를 함께 감추는가');
['rqv-body', 'rqv-live', 'rqv-tools'].forEach((id) => {
  check('«' + id + '» 을 감춘다', new RegExp("'" + id + "'").test(rblk));
});
check('도구 바에 id 가 실제로 붙어 있다 (index.html)', /id="rqv-tools"/.test(html),
      'id 가 없으면 위 코드가 조용히 아무것도 안 한다 — 「🤖 맞춤 퀴즈」 버튼이 그대로 눌린다');
check('되돌릴 때 «우리가 감춘 것만» 되돌린다',
      /dataset\.rqvHidden === '1'/.test(main),
      '무조건 되돌리면 rqv-live(현황 있을 때만 뜨는 띠)가 빈 초록 띠로 남는다');
check('rqv-live 는 되돌릴 때도 닫아 둔다', /\(id === 'rqv-live'\) \? 'none' : ''/.test(main));

/* ── ⑤ 이미 열어 둔 화면도 잠기는가 ────────────────────────── */
console.log('\n▶ ⑤ 이미 열어 둔 학생도 강사가 들어오면 즉시 잠기는가');
const uc = main.slice(main.indexOf('function updateUserCount(count)'),
                      main.indexOf('function updateUserCount(count)') + 2200);
check('updateUserCount 가 복습퀴즈 탭도 함께 본다', /tab-review-quiz/.test(uc),
      '탭을 «여는 순간» 만 보면 미리 열어 둔 학생은 수업이 시작돼도 계속 푼다');
check('열려 있으면 막고, 아니면 푼다', /_rqvClassBlocked\(\)\) _rqvRenderBlocked\(\)/.test(uc) &&
      /else _rqvClearBlocked\(\)/.test(uc));
check('게임·웜업과 같은 자리에서 처리한다 (규칙이 흩어지지 않게)',
      /_warmupStudentBlocked/.test(uc) && /_gameRenderBlocked/.test(uc));

/* ── ⑥ 받는 쪽도 막는가 ───────────────────────────────────── */
console.log('\n▶ ⑥ quiz-share 를 받는 쪽에서도 막는가 (두 번째 방어선)');
const qsIdx = main.indexOf("case 'quiz-share':");
const qsBlk = qsIdx >= 0 ? main.slice(qsIdx, qsIdx + 800) : '';
check('quiz-share 수신부를 찾았다', qsBlk.length > 100);
check('수업 중이면 받아도 무시한다', /_rqvClassBlocked\(\)\) break;/.test(qsBlk),
      '탭 입구만 막으면, 옛 캐시를 문 강사 화면에서 날아온 quiz-share 가 학생을 끌어들인다');
check('그 가드가 rqvOnClassMsg «앞» 에 있다',
      qsBlk.indexOf('_rqvClassBlocked') < qsBlk.indexOf('rqvOnClassMsg'),
      '뒤에 두면 이미 퀴즈가 열린 뒤다');

/* ── ⑦ 수업 밖은 그대로인가 ───────────────────────────────── */
console.log('\n▶ ⑦ ⛔ 수업 밖 혼자 풀기는 예전과 똑같은가');
const x8 = readFileSync(join(PUB, 'js', 'idx-x8.js'), 'utf8');
check('수업 밖에서는 아무 메시지도 보내지 않는다 (그대로)',
      /if \(!rqvInClass\(\)\) return;/.test(x8));
check('차단 코드가 idx-x8(퀴즈 본체)을 건드리지 않았다',
      !/_rqvClassBlocked/.test(x8),
      '퀴즈 본체는 «수업 화면» 을 몰라야 한다 — 학생 사이드바에서도 같은 파일을 쓴다');

/* ── ⑧ 캐시 ──────────────────────────────────────────────── */
console.log('\n▶ ⑧ 캐시 — 같은 주소에 다른 내용이 실리지 않는가');
const vMain = /idx-main\.js\?v=(\d+)/.exec(html);
const vX8 = /idx-x8\.js\?v=(\d+)/.exec(html);
check('idx-main.js 에 ?v= 가 붙어 있다', !!vMain && Number(vMain[1]) >= 24, vMain && vMain[1]);
check('idx-x8.js 에 ?v= 가 붙어 있다', !!vX8 && Number(vX8[1]) >= 7, vX8 && vX8[1]);

console.log('\n──────────────────────────────────────────');
console.log('  ' + (fail ? '❌' : '✅') + ' PASS ' + pass + '    ❌ FAIL ' + fail);
console.log('──────────────────────────────────────────\n');
if (fail) { failures.forEach((f) => console.log('   · ' + f)); process.exit(1); }
