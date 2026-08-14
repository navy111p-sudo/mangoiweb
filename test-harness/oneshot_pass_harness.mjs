// oneshot_pass_harness.mjs — 발음 «원샷 원킬» 규칙이 8개 게임에서 유지되는가 (2026-08-13)
//
//   원장님 제안(의정부 미보영): 고정 3회 반복 대신, 첫 시도에서 100점이면 즉시 통과+보상.
//   목적은 «몇 번 했나»가 아니라 «한 번을 얼마나 잘했나»로 학생의 집중을 옮기는 것이다.
//
//   이 하니스가 지키는 3가지 — 하나만 무너져도 제안의 의도가 사라진다:
//     ① 100점 기준선(0.98/98)이 있다            — 없으면 «대충 통과»로 되돌아간다
//     ② «첫 시도»를 성공·실패 모두로 센다        — 성공만 세면 3번 틀리고 4번째에 100점을
//                                                  받아도 «원샷»으로 오판정해 보너스를 준다
//     ③ 고정 3회 듣기 강제가 없다                — 되살아나면 잘하는 학생이 다시 횟수만 채운다
//
//   ⚠️ 게임마다 판정에 쓰는 변수 이름이 다르다(각 게임이 독립 파일이라 그렇다).
//      그래서 «대충 이런 이름이 있나»로 검사하면 오탐이 난다 — 실제로 그렇게 짰다가
//      멀쩡한 게임 3개를 결함으로 잘못 잡았다. 각 게임의 **실제 판정식**을 적어 둔다.
//      게임의 판정 방식을 바꾸면 여기 기대식도 함께 고쳐야 한다(그게 이 하니스의 요점이다).

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '..', 'cloudflare-deploy', 'public');

/* 각 게임의 실제 구현을 그대로 적는다.
     perfect  : 100점 즉시통과 판정식
     firstTry : «첫 시도인가»를 판정하는 근거 (성공·실패 모두 세는 카운터)
     bothPaths: 그 카운터가 성공 분기 **밖에서** 증가하는지 확인하는 패턴
     noFixed3 : 되살아나면 안 되는 «고정 3회» 패턴 (있으면 실패) */
const GAMES = [
  { name: '문법 피자 마스터', file: 'student-game-grammar-pizza.html',
    perfect:  /sc\s*>=\s*PERFECT_SC/,
    firstTry: /speakAttempts\s*<=\s*1/,
    bothPaths:[/speakAttempts\+\+;\s*speakSuccess\(_pzBest\)/, /speakAttempts\+\+;\s*_pzFail\(\)/],
    noFixed3: [/listenCount\s*>=\s*3\s*\)\s*\{\s*\$\('btn-listen'\)\.disabled\s*=\s*true;\s*\$\('btn-speak'\)\.disabled\s*=\s*false/] },

  { name: '문장 풍선 (허브)', file: 'student-games.html',
    perfect:  /sc\s*>=\s*_BSENT_PERFECT/,
    firstTry: /finish\(rep\s*<=\s*1\)/,
    bothPaths:[/rep\+\+/],                       // nextRep 이 성공·실패 무관하게 매 시도 증가
    noFixed3: [/_BSENT_LISTEN\s*=\s*3/] },

  { name: '슈팅 + 말하기', file: 'student-game-shooter.html',
    perfect:  /lastSpeakAcc\s*>=\s*SPEAK_PERFECT/,
    firstTry: /_speakTries\s*<=\s*1/,
    bothPaths:[/if\(pass\)\{\s*\n?\s*_speakTries\+\+/, /\}\s*else\s*\{\s*\n?\s*_speakTries\+\+/],
    noFixed3: [] },

  { name: '낚시 (mastery-suite)', file: 'english-mastery-suite.html',
    perfect:  /accuracy\s*:\s*\(matched\?1:0\)\)\s*>=\s*SPEAK_PERFECT|>=\s*SPEAK_PERFECT/,
    firstTry: /_speakTries\s*<=\s*1/,
    bothPaths:[/if\(pass\)\{\s*\n?\s*_speakTries\+\+/, /\}\s*else\s*\{\s*\n?\s*_speakTries\+\+/],
    noFixed3: [] },

  { name: 'P-38 3D 조종석', file: 'student-game-p38-3d.html',
    perfect:  /_spAcc\s*>=\s*SP_PERFECT/,
    firstTry: /G\.pronTry\s*===\s*SP\.tryBase\s*\+\s*1/,
    // G.pronTry++ 가 if(ok) 보다 앞 — 성공·실패 모두 센다
    bothPaths:[/G\.pronTry\+\+;\s*\n\s*document\.getElementById\('spHeard'\)/],
    noFixed3: [/SP\.listen\s*>=\s*3/] },

  { name: 'P-38 라이트닝', file: 'student-game-language-ace.html',
    perfect:  /_spAcc\s*>=\s*SP_PERFECT/,
    firstTry: /SP\.done\s*===\s*1/,
    // SP.done++ 은 무조건, SP.ok++ 만 조건부 — 성공·실패 모두 센다
    bothPaths:[/SP\.done\+\+;\s*if\(ok\)\s*SP\.ok\+\+/],
    noFixed3: [/speakTimes\([^)]*,\s*3\s*,/] },

  { name: '단어 테트리스', file: 'student-game-tetris.html',
    perfect:  /SPK\.best\s*>=\s*98/,
    firstTry: /SPK\.attempt\s*<=\s*1/,
    // spkAfter() 는 성공·실패·인식실패 모든 경로에서 불린다
    bothPaths:[/function spkAfter\(\)\{\s*mic\.disabled=false;\s*SPK\.attempt\+\+/],
    noFixed3: [/if\(n<3\)\s*setTimeout/] },

  { name: '망고 구조선', file: 'student-game-rescue-voyage.html',
    perfect:  /_spAcc\s*>=\s*SP_PERFECT/,
    firstTry: /speakMission\.tries\s*===\s*1/,
    // tries++ 가 onresult 맨 위 — ok 를 계산하기 전이라 성공·실패 모두 센다
    bothPaths:[/rec\.onresult=function\(ev\)\{\s*\n\s*var ok=false, heard='';\s*\n\s*speakMission\.tries\+\+/],
    noFixed3: [] },
];

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}

for (const g of GAMES) {
  const s = readFileSync(join(PUB, g.file), 'utf8');
  console.log('\n▶ ' + g.name);
  check('100점 즉시통과 판정이 있다', g.perfect.test(s), String(g.perfect));
  check('«첫 시도»를 가려낸다', g.firstTry.test(s), String(g.firstTry));
  const both = g.bothPaths.every(re => re.test(s));
  check('시도 횟수를 성공·실패 모두 센다', both,
        g.bothPaths.filter(re => !re.test(s)).map(String).join(' , '));
  const revived = g.noFixed3.filter(re => re.test(s));
  check('고정 3회 강제가 되살아나지 않았다', revived.length === 0, revived.map(String).join(' , '));
}

console.log('\n' + '═'.repeat(60));
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}   (게임 ${GAMES.length}개)`);
console.log('═'.repeat(60));
process.exit(fail ? 1 : 0);
