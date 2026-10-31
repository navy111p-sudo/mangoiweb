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
/* (2026-08-07 갱신) 처음엔 문자만 보냈는데, 강사 대부분이 필리핀이라 한국 문자로는 안 닿는다.
   지금은 이메일 1순위 · 한국 번호일 때만 문자 — 검사도 그 정책을 지킨다(아래 ⑤ 참조). */
check('결석 감지 시 강사에게 알린다 (이메일 또는 한국 문자)',
  /sendEmail\(env as any, \{/.test(sweepCode) && /sendPlainSms\(env, tc\.phone,/.test(sweepCode));
check('학부모 모드 스위치와 무관하게 보낸다 (강사에겐 기본)',
  !/parentMode[\s\S]{0,240}?(sendEmail|sendPlainSms\(env, tc\.phone)/.test(sweepCode));
check('세션당 1회만 (이미 기록된 건은 위 dup 검사가 거른다)',
  /FROM class_no_show WHERE room_id = \? AND missing_role = 'student'/.test(sweep));
check('문구가 «얼마나 기다렸는지 + 다음에 뭘 할지» 를 준다',
  /아직 입장하지 않았어요/.test(sweep) && /10분 더 기다려 주시고/.test(sweep));
check('한/영 둘 다 (강사 다수가 필리핀)', /has not joined yet/.test(sweep));

console.log('\n[ ② 못 보낼 땐 «조용히» 넘기지 않는다 ]');
check('못 보낸 이유를 상세에 남긴다', /detail\.teacher_sms = why;/.test(sweepCode));
check('운영자 요약에 «못 보냄 + 이유» 를 싣는다 (원부 빈칸이 보이게)',
  /ownerLines\.push\(`  ⚠ 강사 «\$\{tc\.name \|\| c\.teacher_id\}» 에게 못 보냄/.test(sweep));
/* 🪤 위 검사는 «push 하는 코드가 있는가» 만 본다. 2026-09-06 에 운영자 문자를 기본 OFF 로
   바꾸자 그 배열이 **아무 데도 안 가게** 됐는데도 초록불이었다 — 「조용히 넘기지 않는다」가
   그대로 「조용히 넘긴다」가 된 것을 검사가 못 봤다. 물어야 할 것은 «닿는 곳이 있는가» 다. */
check('그 줄이 «사람이 보는 곳» 에 실제로 닿는다 (문자가 꺼져 있어도)',
  /unsent_lines: ownerLines\.slice/.test(sweepCode));
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
  /FROM teachers WHERE CAST\(id AS TEXT\) = \?/.test(sweep)
  && /FROM teacher_profiles\s*\n?\s*WHERE \(phone IS NOT NULL/.test(sweep));
check('전화가 없어도 이메일만 있으면 후보로 본다 (필리핀 강사 상당수가 그렇다)',
  /OR \(email IS NOT NULL AND email <> ''\)/.test(sweep));

console.log('\n[ ④ ⛔ 엉뚱한 강사에게 보내지 않는다 ]');
check('낱말 경계로만 맞춘다 (부분일치 금지 — Anna ⊄ HANNAH)',
  /words\(a\)\.indexOf\(target\) >= 0 \|\| words\(target\)\.indexOf\(a\) >= 0/.test(sweep));
check('후보가 여럿이면 아무에게도 안 보낸다', /else if \(hits\.length > 1\) out\.why = 'ambiguous'/.test(sweep));
check('정확히 한 명일 때만 보낸다', /if \(hits\.length === 1\)/.test(sweep));
check('조회가 실패해도 «아무에게나» 보내지 않는다', /catch \(e: any\) \{ out\.why = 'lookup_failed'/.test(sweep));

console.log('\n[ ⑤ 🌏 강사 대부분이 필리핀 — 한국 문자로는 못 닿는다 ]');
/* 실측(2026-08-07): 프로필 전화 22건 중 **21건이 필리핀 09xx**, 한국 번호 0건.
   SOLAPI 클라이언트에 국제 발송 처리가 없고, 카카오 알림톡은 «한국 번호» 기반이라
   kakao_id 로는 못 보낸다 → 지금 자동으로 닿는 국제 수단은 **이메일뿐**. */
const idx = rd('../cloudflare-deploy/src/index.ts');
const tct = rd('../cloudflare-deploy/public/js/adm-tcontact.js');
check('이메일이 1순위다 (필리핀 번호엔 문자가 안 간다)',
  /if \(tc\.email\) \{[\s\S]{0,400}?sendEmail\(/.test(sweepCode));
check('문자는 «한국 번호일 때만»', /else if \(tc\.phone && isKr\(tc\.phone\)\)/.test(sweepCode));
check('해외번호뿐이면 사유를 남긴다 (조용히 안 넘어감)',
  /phone_is_overseas_no_email/.test(sweepCode));
check('이메일 본문에 이름을 이스케이프해 넣는다', /escapeHtmlAbs/.test(sweepCode));
check('메일도 한/영 둘 다', /bodyKo/.test(sweepCode) && /bodyEn/.test(sweepCode));

console.log('\n[ ⑥ 📇 강사 연락처 연결 화면 ]');
check('사람이 정한 연결을 «이름 추측보다 먼저» 쓴다',
  /linked_teacher_id[\s\S]{0,200}?out\.why = \(out\.email \|\| out\.phone\) \? 'linked'/.test(sweepCode));
check('API 가 있다 (GET 목록 · POST 연결/해제)',
  /path === '\/api\/admin\/teacher-contacts'/.test(api) && /linked_teacher_id = \? , updated_at|linked_teacher_id = \?, updated_at/.test(api));
check('⛔ 원부·계정 행을 고치지 않는다 (프로필의 연결 컬럼에만 쓴다)',
  !/UPDATE teachers SET/.test(api.slice(api.indexOf("path === '/api/admin/teacher-contacts'"), api.indexOf("path === '/api/admin/teacher-contacts'") + 6000)));
check('🔒 교사에게는 막혀 있다 (동료 연락처 = 개인정보)',
  /'\/api\/admin\/teacher-contacts'/.test(idx));
check('화면이 «자동 알림이 실제로 가는지» 를 행마다 보여준다',
  /reach_by/.test(api) && /reachBadge/.test(tct));
check('알림 못 가는 강사를 맨 위로 올린다 (이 화면의 목적)',
  /if \(ra !== rb\) return ra - rb/.test(tct));
check('연결해도 이메일이 없으면 그 자리에서 말해 준다 (연결만 하고 안심 금지)',
  /if \(!j\.reachable\)/.test(tct) && /자동 알림은 아직 못 갑니다/.test(tct));
check('후보도 낱말 경계로만 (Anna ⊄ HANNAH)', /wordsOf\(a\)\.indexOf\(target\) >= 0/.test(api));

console.log('\n[ ⑦ 📵 운영자 요약 문자는 기본 OFF (2026-09-06 사장님 지시) ]');
/* [왜] 수업 시간대마다 「🚨 결석 위험 1건 · … (+15분 미입장)」 문자가 사장님 폰으로 계속 왔다.
   [무엇을 껐나] «운영자에게 문자로 알리는 것» 하나뿐이다 — 감지·기록·강사 알림은 그대로다.
   ⛔ OWNER_ALERT_PHONE 자체를 지우는 것으로 풀면 안 된다: 결제·환불·이상로그인·사이트 장애·
      방 갈림 감시견이 **같은 번호**를 쓴다. 그래서 이 알림 하나만 KV 스위치로 끈다. */
const iOwnerGate = sweepCode.indexOf('if (ownerMode)');
const iOwnerSend = sweepCode.indexOf('sendPlainSms(env, ownerPhone');
const iNoShowLog = sweepCode.indexOf('INSERT INTO class_no_show');
check('스위치가 있고, 명시적으로 켤 때만 켜진다 (없으면 OFF)',
  /get\('absent_alert_owner_send'\)\) === 'on'/.test(sweepCode));
check('KV 조회가 실패해도 «안 보내는» 쪽으로 떨어진다 (let ownerMode = false)',
  /let ownerMode = false;[\s\S]{0,200}?catch \{\}/.test(sweepCode));
check('꺼져 있으면 운영자 문자에 «닿기 전에» 멈춘다',
  iOwnerGate >= 0 && iOwnerSend >= 0 && iOwnerGate < iOwnerSend);
check('멈출 때 조용히 넘어가지 않는다 (사유를 남긴다)',
  /skipped: 'owner_send_off'/.test(sweepCode));
check('감지·기록은 그대로다 — class_no_show 기록이 스위치보다 앞이다',
  iNoShowLog >= 0 && iOwnerGate >= 0 && iNoShowLog < iOwnerGate);
/* 🪤 이 검사를 «앞 N자» 로 쓰면 안 된다 — 처음엔 `ownerMode[\s\S]{0,400}?sendEmail` 이었는데,
   강사 알림 블록을 `if (!dry && ownerMode)` 로 바꿔 **스위치가 강사 알림까지 삼키게** 만들어도
   실측 거리가 759자(메일)·1,486자(문자)라 창 밖이어서 38/38 전부 초록이었다.
   하필 이 PR 이 가장 크게 약속한 것(「강사 알림은 그대로」)을 지키는 검사였다.
   ✅ 규칙서대로 **중괄호 짝으로 «감싸는 블록» 을 함수 경계까지 거슬러 올라가** 조건을 모은다. */
function enclosingConds(src, needle) {
  const at = src.indexOf(needle);
  const fnStart = src.indexOf('export async function runAbsentStudentSweep');
  if (at < 0 || fnStart < 0 || at < fnStart) return null;   // 못 찾으면 «모름» — 통과시키지 않는다
  const conds = [];
  let depth = 0;
  for (let i = at; i > fnStart; i--) {
    const ch = src[i];
    if (ch === '}') depth++;
    else if (ch === '{') {
      if (depth === 0) {
        const head = src.slice(Math.max(fnStart, i - 300), i);   // 그 `{` 를 여는 헤더 줄
        conds.push(head.slice(head.lastIndexOf('\n') + 1));
      } else depth--;
    }
  }
  return conds;
}
const condMail = enclosingConds(sweepCode, 'sendEmail(env as any');
const condSms  = enclosingConds(sweepCode, 'sendPlainSms(env, tc.phone');
const condOwn  = enclosingConds(sweepCode, 'sendPlainSms(env, ownerPhone');
check('전제: 감싸는 블록을 실제로 찾았다 (못 찾으면 아래 검사가 헛돈다)',
  Array.isArray(condMail) && condMail.length > 0 && Array.isArray(condSms) && condSms.length > 0);
check('강사 알림은 이 스위치와 무관하다 (감싸는 블록 어디에도 ownerMode 가 없다)',
  !!condMail && !!condSms && !condMail.some(c => /ownerMode/.test(c)) && !condSms.some(c => /ownerMode/.test(c)));
/* «막는다» 만 보면 전부 막는 코드도 통과한다 — «제대로 막는가» 를 짝으로 둔다. */
check('반대로 운영자 문자는 그 스위치가 실제로 감싼다',
  !!condOwn && condOwn.some(c => /ownerMode/.test(c)));
check('다시 켜는 방법이 코드에 적혀 있다', /absent_alert_owner_send/.test(sweep) && /배포 없이/.test(sweep));
/* 🪤 호출부 주석이 사실과 어긋나면 다음 사람이 그것을 믿습니다 — 실제로 이 커밋 직전까지
   index.ts 가 「기본 = 안전 모드(운영자 문자 + 기록만)」이라고 **정반대**를 말하고 있었습니다.
   범위는 «길이» 가 아니라 그 주석 블록의 시작~호출 사이로 자릅니다. */
const iCallHead = idx.indexOf('// 🚨 결석 위험 자동 알림');
const iCall = idx.indexOf('runAbsentStudentSweep(env as any)');
const callNote = (iCallHead >= 0 && iCall > iCallHead) ? idx.slice(iCallHead, iCall) : '';
check('전제: 호출부 주석 블록을 실제로 찾았다', callNote.length > 0);
check('호출부 주석이 «운영자 문자가 기본» 이라고 말하지 않는다',
  !!callNote && !/운영자 문자 \+ 기록만/.test(callNote));
check('호출부 주석이 두 스위치를 모두 알려준다',
  !!callNote && /absent_alert_owner_send/.test(callNote) && /absent_alert_parent_send/.test(callNote));

console.log('\n─────────────────────────────────────────────');
console.log(`  통과 ${PASS} · 실패 ${FAIL}`);
if (FAIL) { console.log('  실패 항목:'); FAILS.forEach(f => console.log('   · ' + f)); }
console.log('─────────────────────────────────────────────');
process.exit(FAIL ? 1 : 0);
