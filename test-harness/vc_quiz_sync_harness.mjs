/**
 * 🙋 수업 안 복습퀴즈 «잇기» — 강사 Shas 5-b·5-c
 *
 *   5-b. "학생 화면에는 보기가 보이고 클릭할 수 있지만, 강사 화면에는 학생이 선택한
 *        답안이 표시되지 않습니다."
 *   5-c. "답을 고르고 Next 를 누르면 학생 화면에서는 퀴즈가 사라지지만, 강사 화면에는
 *        그대로 남아 동기화가 깨집니다."
 *
 * [뿌리] 강사와 학생이 «각자 다른 퀴즈» 를 풀고 있었다. 양쪽 다 rqvAuto() 로 자기
 *   교재·레벨에 맞는 퀴즈를 따로 받아왔고(AI 출제라 같은 조건이어도 다를 수 있다),
 *   서로를 잇는 메시지가 한 줄도 없었다. «동기화가 깨졌다» 가 아니라 애초에 없었다.
 *
 * [설계 결정 — 되돌리면 안 되는 것]
 *   · 강사가 퀴즈를 «정한다»(quiz-share, id 만) — 학생이 보내면 반 전체 퀴즈를 갈아치우므로
 *     서버가 강사 전용으로 막는다(교재 갈아치우기와 같은 구멍).
 *   · 학생을 강사와 같은 «문항» 에 묶지 않는다 — 묶으면 학생이 스스로 못 넘겨
 *     LEN ① 「학생이 퀴즈를 못 넘긴다」를 반대 방향으로 재현한다. 같은 «퀴즈», 진도는 각자.
 *   · 학생 현황 띠는 #rqv-body «밖» — renderQ() 가 body 를 통째로 다시 그리므로
 *     안에 넣으면 강사가 문항을 넘길 때마다 현황이 지워진다.
 *
 * 실행: node test-harness/vc_quiz_sync_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');
const x8   = readFileSync(join(PUB, 'js', 'idx-x8.js'), 'utf8');
/* 🪤 (2026-08-23) idx-main.js 를 «홈» 과 «수업»(idx-main-vc.js) 으로 갈랐다.
   여기서 보는 것은 «수업 화면의 행동» 이라 절반이 다른 파일로 옮겨갔다 —
   한 파일만 읽으면 «기능이 사라졌다» 고 오판한다. 둘을 이어서 본다. */
const main = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8') + '\n' + readFileSync(join(PUB, 'js', 'idx-main-vc.js'), 'utf8');
const html = readFileSync(join(PUB, 'index.html'), 'utf8');
let ts = '';
try { ts = readFileSync(join(ROOT, 'cloudflare-deploy', 'src', 'video-call-room.ts'), 'utf8'); } catch(_) {}

let pass = 0, fail = 0;
const failures = [];
const check = (n, c, d) => {
  if (c) { pass++; console.log('  ✅ ' + n); }
  else { fail++; failures.push(n + (d ? ' — ' + d : '')); console.log('  ❌ ' + n + (d ? '\n       ' + d : '')); }
};
const body = (src, start, end) => {
  const s = src.indexOf(start);
  if (s < 0) return '';
  const e = src.indexOf(end, s + start.length);
  return e > s ? src.slice(s, e) : src.slice(s, s + 4000);
};

console.log('\n════════ 복습퀴즈 강사↔학생 잇기 (Shas 5-b·5-c) ════════\n');

console.log('▶ 같은 퀴즈를 푸는가 (quiz-share)');
const startQ = body(x8, 'function startQuiz(quiz, generated){', '\n  }');
check('강사가 퀴즈를 열면 방에 알린다', /rqvSend\('quiz-share'/.test(startQ));
check('강사만 보낸다 (학생 수신이 재방송하지 않는다 = 루프 없음)',
      /rqvIsStaff\(\)\s*&&\s*quiz/.test(startQ),
      '학생 수신 → startQuiz → 또 방송 → 또 수신… 루프가 된다');
check('id 만 보낸다 — 문항 전체를 싣지 않는다', /\{ id: quiz\.id/.test(startQ) && !/questions:/.test(startQ),
      '학생은 같은 API 로 받을 수 있다. 문항을 실으면 회선을 먹는다');
check('새 퀴즈를 열면 앞 퀴즈의 학생 현황을 지운다', /live = \{\}; rqvLiveRender\(\)/.test(startQ),
      '남으면 옛 답이 새 문항 옆에 붙어 보인다');
const onMsg = body(x8, 'window.rqvOnClassMsg = function', '\n  };');
check('학생이 받으면 같은 퀴즈를 연다', /rqvOpen\(d\.id\)/.test(onMsg));
check('이미 같은 퀴즈면 다시 열지 않는다', /String\(st\.quiz\.id\) === String\(d\.id\)/.test(onMsg),
      '강사가 탭을 들락거릴 때마다 학생 퀴즈가 처음으로 되돌아간다');
check('자동 출제가 공유를 덮어쓰지 않는다', /st\.loadedOnce = true;[\s\S]{0,80}rqvOpen\(d\.id\)/.test(onMsg),
      '학생의 rqvOnEnter 가 나중에 돌면 자기 퀴즈로 갈아탄다');

console.log('\n▶ 5-b 학생의 선택이 강사에게 보이는가 (quiz-pick)');
check('현황 띠가 있다 (#rqv-live)', /id="rqv-live"/.test(html));
check('띠는 #rqv-body «밖» 에 있다', html.indexOf('id="rqv-live"') < html.indexOf('id="rqv-body"'),
      'renderQ 가 body 를 통째로 다시 그려서 안에 넣으면 매번 지워진다');
check('객관식 선택(rqvPick)이 알린다', /window\.rqvPick = function\(k\)\{[^\n]*rqvReportPick\(\)/.test(x8));
check('쓰기(st_setText)가 알린다', /window\.st_setText = function\(v\)\{[^\n]*rqvReportPick\(\)/.test(x8));
check('말하기(rqvMic 결과)가 알린다', /rqvReportPick\(\);\s*\/\/ 🙋 말하기/.test(x8));
check('문항 이동(rqvMove)도 알린다', /window\.rqvMove = function\(d\)\{[^\n]*rqvReportPick\(\)/.test(x8),
      '강사가 «어디까지 갔는지» 를 봐야 5-c 의 어긋남을 눈치챈다');
const report = body(x8, 'function rqvReportPick(){', '\n  }');
check('강사 자신은 보내지 않는다', /if \(rqvIsStaff\(\)/.test(report));
check('사람이 읽을 글자(A. apple)로 보낸다', /ABC\[a\] \+ '\. '/.test(report),
      '번호만 보내면 문항이 다른 강사 화면에서 읽을 수 없다');
check('글자 길이를 자른다', /slice\(0, 80\)/.test(report));
const liveR = body(x8, 'function rqvLiveRender(){', '\n  }');
check('학생 화면에는 현황을 띄우지 않는다', /!rqvIsStaff\(\) \|\| !ids\.length/.test(liveR),
      '다른 학생의 답이 학생에게 보이면 베낀다');
check('학생이 넣은 값은 esc() 를 거친다', /esc\(s\.name/.test(liveR) && /esc\(s\.text\)/.test(liveR),
      '이름·답이 그대로 HTML 이 되면 안 된다');

console.log('\n▶ 5-c 학생의 제출·이탈이 강사에게 보이는가 (quiz-done)');
/* 거리 정규식 대신 «quit 없는 quiz-done 호출에 score 가 있는가» 를 본다 —
   {0,N} 은 옳은 리팩터에도 깨진다(이 하니스 모음의 반복 교훈) */
check('제출하면 알린다 (점수 포함)',
      x8.split("rqvSend('quiz-done'").slice(1).some(seg => {
        const call = seg.slice(0, seg.indexOf(');'));
        return !/quit: true/.test(call) && /score/.test(call);
      }));
check('그만두기도 알린다 (quit)', /rqvSend\('quiz-done'[\s\S]{0,120}quit: true/.test(x8),
      '학생 화면에서만 퀴즈가 사라지는 순간 — 이게 5-c 그 자체');
check('강사 화면에 제출 완료·이탈이 구분돼 보인다',
      /제출 완료/.test(liveR) && /그만뒀어요/.test(liveR) && /submitted/.test(liveR));

console.log('\n▶ 배선과 안전');
check('idx-main 소켓이 세 메시지를 x8 로 넘긴다',
      /case 'quiz-share':\s*\n\s*case 'quiz-pick':\s*\n\s*case 'quiz-done':/.test(main) &&
      /rqvOnClassMsg/.test(main));
check('서버가 quiz-pick·quiz-done 을 릴레이한다',
      /case 'quiz-pick':/.test(ts) && /case 'quiz-done':/.test(ts),
      'switch 에 없으면 Unknown message type 으로 버려진다 — pdf-drawlock 전례');
check('⛔ quiz-share 는 서버에서 강사 전용이다',
      /case 'quiz-share':\s*\n\s*case 'device-fix':/.test(ts),
      '아무나 보내면 학생이 반 전체 퀴즈를 갈아치운다(교재와 같은 구멍)');
check('수업 밖 혼자 풀기는 예전과 똑같다 (아무것도 안 보냄)',
      /if \(!rqvInClass\(\)\) return;/.test(x8),
      '학생 사이드바 단독 퀴즈에 수업 코드가 끼어들면 안 된다');
check('수신한 남의 답은 강사만 그린다', /if \(!rqvIsStaff\(\) \|\| !d\.uid\) return;/.test(onMsg));
check('⛔ 학생의 「다음」 가드는 그대로다 (답 없이 못 넘어감)',
      /st\.answers\[i\]==null\|\|st\.answers\[i\]===''\?'disabled':''/.test(x8.replace(/\s/g, '')),
      '잇기를 만들다 LEN ① 수정을 되돌리면 안 된다');

console.log('\n──────────────────────────────────────────');
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('──────────────────────────────────────────\n');
process.exit(fail ? 1 : 0);
