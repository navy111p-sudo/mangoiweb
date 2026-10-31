// game_oneshot_coverage_harness.mjs — 🏆 «첫 시도 100점이면 바로 통과» 전 게임 적용 가드 (2026-08-13)
//
//   [무슨 일이 있었나]
//   원장님 제안으로 «첫 시도에 100점이면 남은 회차 없이 통과» 를 넣고, 학생·학부모 안내문까지
//   만들어 배포했다. 그런데 **학생이 가장 먼저 만나는 괴물게임(space-monster)** 에는
//   그 기능이 아예 없었다. 원장님이 직접 해 보고 «점수 없이 무조건 3번 말해야 한다» 고 제보.
//
//   실측으로 드러난 것 — 적용 목록에서 빠진 게임이 셋이었다:
//     · space-monster : 드릴에 **마이크가 없었다**(SpeechRecognition 0회) → 채점 자체가 불가능
//     · tank-battle   : 마이크는 있는데 정확도(0~1)를 안 재고 3회 고정
//     · wordfighter   : 복습2는 1회 판정인데 복습3이 «듣기 3번 탭» 고정
//
//   안내문에 적힌 것과 화면이 달랐다. 이 하니스가 그 어긋남을 막는다.
//
//   지키는 것:
//     ① 따라 말하기 드릴이 있는 게임은 **전부** 100점 임계값을 가진다
//     ② «첫 시도» 판정은 성공 횟수가 아니라 **시도 횟수**로 한다
//        (구조선에서 실제로 났던 결함 — 세 번 틀리고 네 번째 100점에도 보너스가 붙었다)
//     ③ 괴물게임의 드릴은 마이크 없는 옛 경로가 **유일한 길이 되면 안 된다**

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = dirname(fileURLToPath(import.meta.url));
const PUB = join(__dir, '../cloudflare-deploy/public');

let pass = 0, fail = 0;
function check(name, cond, extra = '') {
  if (cond) { pass++; console.log('  ✅ ' + name); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}
const read = (f) => (existsSync(join(PUB, f)) ? readFileSync(join(PUB, f), 'utf8') : '');

console.log('════════ 🏆 첫 시도 100점 원샷 통과 — 전 게임 적용 가드 ════════');

/* ── ① 따라 말하기 드릴이 있는 게임은 전부 100점 임계값을 가진다 ──────────────
   0.98 = 「100점」의 기준. 이 숫자가 없으면 원샷 판정을 할 수가 없다. */
const DRILL_GAMES = [
  'student-game-space-monster.html',   // 괴물게임 — 허브의 첫 게임
  'student-game-tank-battle.html',
  'student-game-wordfighter.html',
  'student-game-rescue-voyage.html',
  'student-game-tetris.html',
  'student-game-language-ace.html',
  'student-game-grammar-pizza.html',
  'student-game-p38-3d.html',
  'student-game-shooter.html',
  'english-mastery-suite.html',
];
for (const f of DRILL_GAMES) {
  const s = read(f);
  check(`① ${f} — 파일이 있다`, s.length > 0);
  if (!s) continue;
  check(`① ${f} — 100점 임계값(0.98)이 있다`, /0\.98/.test(s),
    '이 게임만 «무조건 3번» 이 되면 안내문과 화면이 어긋난다');
}

/* ── ② «첫 시도» 는 시도 횟수로 판정한다 (성공 횟수로 세면 안 된다) ────────────
   done(성공)만 보면 세 번 틀리고 네 번째에 100점을 받아도 원샷 보너스가 붙는다. */
const TRIES_GAMES = [
  ['student-game-tank-battle.html', /SP\.tries\s*===\s*1/],
  ['student-game-wordfighter.html', /_wfTries\s*===\s*1/],
  ['student-game-rescue-voyage.html', /speakMission\.tries\s*===\s*1/],
];
for (const [f, re] of TRIES_GAMES) {
  const s = read(f);
  check(`② ${f} — 첫 시도를 «시도 횟수» 로 판정한다`, re.test(s),
    '성공 횟수(done)로 세면 여러 번 틀린 뒤의 100점도 원샷이 된다');
}

/* ── ③ 괴물게임: 마이크 없는 옛 드릴이 유일한 경로면 안 된다 ────────────────── */
const sm = read('student-game-space-monster.html');
check('③ 괴물게임 — 채점 경로(speakDrill)가 있다', /function speakDrill\s*\(/.test(sm));
check('③ 괴물게임 — speakDrill 이 실제로 마이크를 연다',
  /function speakDrill[\s\S]{0,900}?MangoiVoice\.record/.test(sm));
check('③ 괴물게임 — speakDrill 이 정확도로 채점한다',
  /function speakDrill[\s\S]{0,900}?MangoiScore\.grade/.test(sm));
check('③ 괴물게임 — 마이크 없는 옛 드릴은 «폴백» 으로만 남는다',
  /function speakDrill[\s\S]{0,1200}?legacyDrill\(\)/.test(sm),
  '100점이 아니거나 마이크가 없으면 예전 3회 훈련을 그대로 해야 한다');
{
  // 옛 경로가 호출되는 곳 중, speakDrill 바깥(= 사이클 실패 분기)에 남아 있으면 안 된다
  const outside = (sm.match(/(?:!r\.ran|!window\.MangoiCycle|catch\s*\(\s*\)\s*=>)\s*\{?\s*legacyDrill\(\)/g) || []).length;
  check('③ 괴물게임 — 사이클 실패 분기가 speakDrill 로 간다', outside === 0,
    `옛 드릴로 직행하는 분기가 ${outside}곳 남아 있다`);
}

/* ── ④ 안내문이 약속한 문구가 실제 코드에 있다 ────────────────────────────── */
check('④ 괴물게임에 원샷 보너스 안내가 있다', /원샷|퍼펙트/.test(sm));
check('④ 탱크배틀에 원샷 보너스 안내가 있다', /원샷|퍼펙트/.test(read('student-game-tank-battle.html')));
check('④ 워드파이터에 원샷 보너스 안내가 있다', /원샷|퍼펙트/.test(read('student-game-wordfighter.html')));

console.log('──────────────────────────────────────────');
console.log(`총 ${pass + fail}건 중 ✅ ${pass} 통과 / ❌ ${fail} 실패`);
process.exit(fail ? 1 : 0);
