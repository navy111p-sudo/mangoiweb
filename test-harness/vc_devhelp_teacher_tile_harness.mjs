/**
 * 🎛 장치 도우미가 «강사 타일에도» 붙는가 — 재택 강사 지원 (2026-08-12 강사 요청)
 *
 *   "if possible so we can assist the homebased teachers if something is wrong with
 *    their camera or headsets. The device helper should display both on student and
 *    teacher side."
 *
 * [무엇이 문제였나] vcAddDevBtn 이 vcBoxIsStudent 로 «학생 박스에만» 🎛 를 붙였다.
 *   재택 강사의 카메라·헤드셋이 고장나도 관리자·다른 강사가 도와줄 입구가 없었다.
 *   응답 쪽(device-list-req 수신)은 원래 역할 제한이 없어서, 버튼만 열면 끝이었다.
 *
 * ⚠️ 되돌리면 안 되는 것
 *   · 서버의 «보내는 쪽 강사·관리자 전용» 게이트 — 이걸 풀면 학생이 남의 장치를 바꾼다.
 *   · 내 타일(vc-local-box) 제외 — 자기 장치는 하단 독의 장치 메뉴로 바꾼다.
 *   · 별(칭찬) 버튼은 여전히 학생 전용 — 🎛 만 전체로 넓힌 것이다.
 *
 * 실행: node test-harness/vc_devhelp_teacher_tile_harness.mjs
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PUB = process.env.MANGOI_PUB || join(ROOT, 'cloudflare-deploy', 'public');
/* 🪤 (2026-08-23) idx-main.js 를 «홈» 과 «수업»(idx-main-vc.js) 으로 갈랐다.
   여기서 보는 것은 «수업 화면의 행동» 이라 절반이 다른 파일로 옮겨갔다 —
   한 파일만 읽으면 «기능이 사라졌다» 고 오판한다. 둘을 이어서 본다. */
const js = readFileSync(join(PUB, 'js', 'idx-main.js'), 'utf8') + '\n' + readFileSync(join(PUB, 'js', 'idx-main-vc.js'), 'utf8');
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

console.log('\n════════ 🎛 장치 도우미 — 강사 타일에도 (재택 강사 지원) ════════\n');

console.log('▶ 버튼이 어디에 붙는가');
const attach = body(js, 'function vcAddDevBtn(box, uid) {', '\n}');
check('vcAddDevBtn 을 찾았다', attach.length > 300);
check('학생 박스 제한(vcBoxIsStudent)이 사라졌다', !/vcBoxIsStudent/.test(attach),
      '이게 남아 있으면 강사 타일에는 영영 안 붙는다');
check('내 타일(vc-local-box)에는 붙이지 않는다', /vc-local-box/.test(attach),
      '자기 장치는 하단 독에서 바꾼다 — 자기에게 원격 도우미는 무의미');
check('보는 사람은 여전히 강사·관리자만', /vcIsStaffNow/.test(attach),
      '학생 화면에 이 버튼이 보이면 안 된다');
check('툴팁이 «학생» 이 아니라 «참가자» 를 말한다',
      /이 참가자의 카메라/.test(attach) && /participant's camera/.test(attach));

console.log('\n▶ 역할이 늦게 확정돼도 붙는가 (두 번째 부착 경로)');
check('늦은 부착 루프에서 🎛 는 학생 체크 «밖» 에 있다',
      /if \(uid\) \{ try \{ vcAddDevBtn\(box, uid\); \} catch\(e\)\{\} \}\s*\n\s*if \(uid && vcBoxIsStudent\(box\)\)/.test(js),
      '학생 체크 안이면 강사 타일은 역할이 늦게 정해질 때 버튼을 못 받는다');
check('⛔ 별(칭찬) 버튼은 여전히 학생 전용이다',
      /if \(uid && vcBoxIsStudent\(box\)\) \{\s*\n\s*vcAddStarButton/.test(js),
      '강사에게 칭찬 별을 주면 포인트 체계가 꼬인다');

console.log('\n▶ 도움받는 쪽 안내가 역할에 맞는가');
/* ⚠️ 이 case 는 «targetUserId 가드의 break» 가 먼저 나온다 — 거기서 자르면 토스트를 놓친다.
   다음 case 까지 통째로 본다. */
const recv = body(js, "case 'device-list-req': {", "case 'device-set':");
check('강사가 도움받을 때는 «다른 강사·관리자가»', /다른 강사·관리자가 장치 설정을 함께/.test(recv) &&
      /A staff member is checking your device/.test(recv));
check('학생이 도움받을 때는 예전 그대로 «선생님이»', /선생님이 장치 설정을 도와주고 있어요/.test(recv) &&
      /Your teacher is helping/.test(recv));

console.log('\n▶ 패널 문구가 중립이 됐는가');
check('제목 폴백: 학생 → 참가자', /'장치 도우미 — ' \+ \(name \|\| '참가자'\)/.test(js) &&
      /'Device Helper — ' \+ \(name \|\| 'Participant'\)/.test(js));
check('요청·응답 문구에 «학생» 고정이 안 남았다',
      !/학생 장치 목록을 요청했어요/.test(js) && !/학생 기기에 바로 적용/.test(js) &&
      !/이 학생 기기는 스피커/.test(js));

console.log('\n▶ ⛔ 서버 게이트 회귀 확인');
check('device-* 3종은 여전히 «보내는 쪽 강사·관리자 전용»',
      /case 'device-fix':\s*\n\s*case 'device-list-req':\s*\n\s*case 'device-set': \{/.test(ts) &&
      /dfRole !== 'teacher' && dfRole !== 'admin'/.test(ts),
      '이게 풀리면 학생이 남의 카메라·마이크를 원격으로 바꾼다');
check('응답(device-list·device-set-result)은 일반 릴레이 그대로',
      /case 'device-list':/.test(ts) && /case 'device-set-result':/.test(ts));

console.log('\n──────────────────────────────────────────');
console.log(`  ✅ PASS ${pass}    ❌ FAIL ${fail}`);
if (failures.length) { console.log('\n  실패 목록:'); failures.forEach(f => console.log('   - ' + f)); }
console.log('──────────────────────────────────────────\n');
process.exit(fail ? 1 : 0);
