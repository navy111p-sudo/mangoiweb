/* ══════════════════════════════════════════════════════════════════════
   🚨 결석 감지 → «기다리는 강사» 에게 알린다  (2026-08-07 실사고에서 나옴)

   [무슨 일이 있었나] 8/7 18:00 레벨테스트(#854, 강사 MAIMAI, 학생 paul710619).
     · 18:01 강사 입장 → 18:45 퇴장. 4번 재입장하며 **빈 방을 30분** 지켰다.
     · 18:15 시스템이 결석을 감지했지만 **기록만** 했다(notified_push=0, kakao=0).
     · 강사에게는 한 마디도 안 갔다 — 언제까지 기다려야 하는지, 우리가 알고는 있는지조차
       알 수 없었다. 학생은 끝내 입장 0회.

   [이 하니스가 지키는 것]
     ① 강사에게 실제로 «간다»
     ② 못 보낼 땐 조용히 넘기지 않고 운영자 요약에 이유를 싣는다(원부 빈칸이 보이게)
     ③ ⛔ 오염된 `assigned_teacher_phone` 을 쓰지 않는다 — 실측으로 다른 사람 번호였다
     ④ ⛔ 이름 부분일치로 엉뚱한 강사에게 보내지 않는다 (Anna → HANNAH 사고)
   ══════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const HERE = dirname(fileURLToPath(import.meta.url));
const rd = (p) => readFileSync(join(HERE, p), 'utf8');

let PASS = 0, FAIL = 0; const FAILS = [];
function check(name, cond) {
  if (cond) PASS++; else { FAIL++; FAILS.push(name); }
  console.log(`  ${cond ? '✅' : '❌'} ${name}`);
}

const sweep = rd('../cloudflare-deploy/src/absent-sweep.ts');
const api = rd('../cloudflare-deploy/src/api-admin.ts');

/* 🪤 «이 이름을 쓰지 마라» 류 검사는 **주석을 걷어내고** 봐야 한다.
   안 그러면 «왜 쓰면 안 되는지» 적어 둔 주석 자체에 걸려 실패한다(실제로 걸렸다).
   같은 함정을 t.html 「로그인 요구 금지」 가드에서도 한 번 밟았다. */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const sweepCode = stripComments(sweep);

console.log('\n🚨 결석 감지 → 강사 알림\n');
console.log('[ ① 기다리는 사람에게 실제로 간다 ]');
check('담당 강사 연락처를 찾는 함수가 있다', /async function findTeacherContact/.test(sweep));
check('결석 감지 시 강사에게 문자를 보낸다', /const tr = await sendPlainSms\(env, tc\.phone, tmsg\)/.test(sweep));
check('학부모 모드 스위치와 무관하게 보낸다 (강사에겐 기본)',
  !/parentMode[\s\S]{0,200}?sendPlainSms\(env, tc\.phone/.test(sweep));
check('세션당 1회만 (이미 기록된 건은 위 dup 검사가 거른다)',
  /FROM class_no_show WHERE room_id = \? AND missing_role = 'student'/.test(sweep));
check('문구가 «얼마나 기다렸는지 + 다음에 뭘 할지» 를 준다',
  /아직 입장하지 않았어요/.test(sweep) && /10분 더 기다려 주시고/.test(sweep));
check('한/영 둘 다 (강사 다수가 필리핀)', /Student has not joined yet/.test(sweep));

console.log('\n[ ② 못 보낼 땐 «조용히» 넘기지 않는다 ]');
check('못 보낸 이유를 상세에 남긴다', /detail\.teacher_sms = tc\.why/.test(sweep));
check('운영자 요약에 «못 보냄 + 이유» 를 싣는다 (원부 빈칸이 보이게)',
  /ownerLines\.push\(`  ⚠ 강사 «\$\{tc\.name \|\| c\.teacher_id\}» 에게 못 보냄/.test(sweep));
check('기록에 «누가 기다렸는지» 를 남긴다 (예전엔 teacher_name 이 null 이었다)',
  /teacherNameForLog/.test(sweep) && !/'student', c\.user_id \|\| null, name, null,/.test(sweep));

console.log('\n[ ③ ⛔ 오염된 연락처를 쓰지 않는다 ]');
/* 실측(2026-08-07):
     신청 #13 «Teacher Maimai» → 저장된 번호·메일이 **Teacher Kaye** 것
     신청 #15 «Teacher Maimai» → 프로필은 연락처가 빈데 **제3자** 번호가 들어 있음
   이 컬럼으로 발송하면 엉뚱한 강사에게 간다. */
check('⛔ absent-sweep 이 assigned_teacher_phone 을 쓰지 않는다 (주석 제외한 «코드»에서)',
  !/assigned_teacher_phone/.test(sweepCode));
check('그 이유가 코드에 적혀 있다 (다음 사람이 다시 쓰지 않게)',
  /assigned_teacher_phone/.test(sweep) && /Teacher Kaye 의 것/.test(sweep));
check('그 컬럼은 여전히 «발송에 쓰이지 않는다» (저장·초기화만)',
  !/sendPlainSms\([^)]*assigned_teacher_phone/.test(api) && !/sendEmail\([^)]*assigned_teacher_email/.test(api));
check('연락처는 원부(teachers) → 프로필 이름 매칭으로 찾는다',
  /FROM teachers WHERE CAST\(id AS TEXT\) = \?/.test(sweep) && /FROM teacher_profiles WHERE phone IS NOT NULL/.test(sweep));

console.log('\n[ ④ ⛔ 엉뚱한 강사에게 보내지 않는다 ]');
check('낱말 경계로만 맞춘다 (부분일치 금지 — Anna ⊄ HANNAH)',
  /words\(a\)\.indexOf\(target\) >= 0 \|\| words\(target\)\.indexOf\(a\) >= 0/.test(sweep));
check('후보가 여럿이면 아무에게도 안 보낸다', /else if \(hits\.length > 1\) out\.why = 'ambiguous'/.test(sweep));
check('정확히 한 명일 때만 보낸다', /if \(hits\.length === 1\)/.test(sweep));
check('조회가 실패해도 «아무에게나» 보내지 않는다', /catch \(e: any\) \{ out\.why = 'lookup_failed'/.test(sweep));

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
